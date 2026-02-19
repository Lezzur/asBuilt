import { collectFiles, type CollectionResult } from "./collect";
import { assemblePrompt, estimateTokenCount } from "./prompt";
import { checkContextLimit } from "./token-counter";
import { parseLlmOutput } from "./parse-output";
import { buildDriftPrompt } from "./drift";
import {
  generateWithLlm,
  LlmError,
  type LlmResponse,
} from "@/lib/llm/provider";
import {
  appendProgressLog,
  updateScanStatus,
  saveScanOutputs,
  getScan,
} from "@/lib/db/scans";
import { updateLastActive } from "@/lib/db/users";
import type {
  LlmProvider,
  LlmTier,
  ScanOutputPayload,
  ScanStatus,
  TokenUsage,
} from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProcessScanInput {
  scanId: string;
  userId: string;
  projectRoot: string;
  projectName: string;
  provider: LlmProvider;
  tier: LlmTier;
  subdirectory?: string | null;
  prdContent?: string | null;
  /** Optional user-provided API key (v2+). */
  apiKey?: string;
}

// ─── Retry with exponential backoff (PRD §21) ────────────────────────────────

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 2_000;

/**
 * Retry wrapper with exponential backoff that respects error classification.
 * Non-retryable LlmErrors (auth, invalid request, content filter) fail immediately.
 * Retryable errors (rate limit, timeout, server error) are retried up to MAX_RETRIES times.
 * Each retry attempt is logged to the scan progress log.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  scanId: string,
  label: string,
  retries = MAX_RETRIES,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // If it's a classified LLM error that's not retryable, fail immediately
      if (err instanceof LlmError && !err.retryable) {
        await log(
          scanId,
          `✗ ${label} failed (${err.code}): ${err.message}`,
        );
        throw err;
      }

      if (attempt < retries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        const delaySec = (delay / 1000).toFixed(0);
        const errorCode = err instanceof LlmError ? err.code : "UNKNOWN";
        await log(
          scanId,
          `⚠ ${label} attempt ${attempt + 1}/${retries + 1} failed (${errorCode}). Retrying in ${delaySec}s...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

// ─── Progress logging helper ─────────────────────────────────────────────────

async function log(scanId: string, message: string): Promise<void> {
  await appendProgressLog(scanId, message);
}

// ─── Token usage merging ─────────────────────────────────────────────────────

function mergeTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

// ─── Main scan processor ─────────────────────────────────────────────────────

/**
 * Executes the full scan lifecycle:
 * 1. Collect and filter project files
 * 2. Assemble the LLM prompt
 * 3. Send to LLM (with retry)
 * 4. Parse the output into separate documents
 * 5. Handle drift analysis (retry if needed)
 * 6. Save results to Firestore
 *
 * This function is designed to run inside a Vercel background function
 * (up to 300s on Pro plan, no limit locally).
 */
export async function processScan(input: ProcessScanInput): Promise<void> {
  const {
    scanId,
    userId,
    projectRoot,
    projectName,
    provider,
    tier,
    subdirectory,
    prdContent,
    apiKey,
  } = input;

  const expectDrift = Boolean(prdContent);

  try {
    // ── Mark as processing ──
    await updateScanStatus(scanId, "processing");

    // ── Step 1: Collect files ──
    await log(scanId, "Collecting files...");
    let collection: CollectionResult;
    try {
      collection = await collectFiles({ projectRoot, subdirectory });
    } catch (err) {
      throw new Error(
        `File collection failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const { files, tree, excludedCount, totalSizeBytes } = collection;

    if (files.length === 0) {
      throw new Error(
        "No files found after filtering. The project may be empty or fully excluded by ignore rules.",
      );
    }

    const sizeMB = (totalSizeBytes / 1_048_576).toFixed(1);
    await log(
      scanId,
      `Collecting files... ${files.length} files found (${excludedCount} excluded)`,
    );
    await log(
      scanId,
      `Filtering complete. ${files.length} files remaining (${sizeMB} MB)`,
    );

    // ── Step 2: Assemble prompt ──
    await log(scanId, "Assembling prompt...");
    const prompt = assemblePrompt({
      files,
      tree,
      projectName,
      prdAttached: expectDrift,
      prdContent,
    });

    const estimatedTokens = estimateTokenCount(prompt);
    await log(
      scanId,
      `Assembling prompt... ~${estimatedTokens.toLocaleString()} tokens`,
    );

    // ── Context window pre-check (PRD §21) ──
    const tokenCheck = checkContextLimit(prompt, provider, tier);
    if (tokenCheck.exceedsLimit) {
      const suggestion =
        provider !== "gemini"
          ? "Switch to Google Gemini (1M token context window) or"
          : "Use";
      throw new Error(
        `Context window exceeded: ~${estimatedTokens.toLocaleString()} tokens estimated, ` +
          `but ${provider}'s limit is ${tokenCheck.contextWindow.toLocaleString()} tokens. ` +
          `${suggestion} use subdirectory targeting to scan a smaller portion of the codebase.`,
      );
    }
    if (tokenCheck.isNearLimit) {
      await log(
        scanId,
        `⚠ Warning: prompt uses ~${(tokenCheck.utilizationRatio * 100).toFixed(0)}% of ${provider}'s context window. ` +
          `Consider switching to Gemini or targeting a subdirectory if the scan fails.`,
      );
    }

    // ── Step 3: Send to LLM ──
    const modelLabel = `${provider} (${tier})`;
    await log(scanId, `Sending to ${modelLabel}...`);

    let llmResponse: LlmResponse;
    try {
      llmResponse = await withRetry(
        () => generateWithLlm({ provider, tier, prompt, apiKey }),
        scanId,
        "LLM call",
      );
    } catch (err) {
      // Provide actionable error messages based on error classification
      if (err instanceof LlmError) {
        throw new Error(getUserFacingLlmMessage(err));
      }
      throw new Error(
        `LLM call failed after ${MAX_RETRIES + 1} attempts: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let totalTokenUsage = llmResponse.tokenUsage;
    await log(
      scanId,
      `LLM response received (${llmResponse.tokenUsage.totalTokens.toLocaleString()} tokens used)`,
    );

    // Check if the LLM output was truncated (hit max output tokens)
    const wasTruncated = llmResponse.finishReason === "length";
    if (wasTruncated) {
      await log(
        scanId,
        "⚠ LLM output was truncated (hit output token limit). Salvaging partial output.",
      );
    }

    // ── Step 4: Parse output ──
    await log(scanId, "Parsing output...");
    const parsed = parseLlmOutput(llmResponse.text, expectDrift);

    if (parsed.warnings.length > 0) {
      for (const warning of parsed.warnings) {
        await log(scanId, `⚠ ${warning}`);
      }
    }

    // ── Step 5: Handle drift analysis fallback ──
    // If PRD was attached but drift section is missing, run a dedicated drift call
    let driftMd = parsed.driftMd;
    if (expectDrift && !driftMd && parsed.agentMd) {
      await log(scanId, "Drift section missing. Running dedicated drift analysis...");

      try {
        const driftPrompt = buildDriftPrompt({
          projectName,
          prdContent: prdContent!,
          agentMd: parsed.agentMd,
          tree,
        });

        const driftResponse = await withRetry(
          () => generateWithLlm({ provider, tier, prompt: driftPrompt, apiKey }),
          scanId,
          "Drift analysis",
        );

        totalTokenUsage = mergeTokenUsage(
          totalTokenUsage,
          driftResponse.tokenUsage,
        );

        // The drift response should be the entire document
        driftMd = driftResponse.text.trim();
        await log(scanId, "Drift analysis complete.");
      } catch (err) {
        await log(
          scanId,
          `⚠ Drift analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Continue without drift — don't fail the entire scan
      }
    }

    if (parsed.agentMd) {
      await log(scanId, "Generating AS_BUILT_AGENT.md...");
    }
    if (parsed.humanMd) {
      await log(scanId, "Generating AS_BUILT_HUMAN.md...");
    }
    if (driftMd) {
      await log(scanId, "Generating PRD_DRIFT.md...");
    }

    // ── Step 6: Determine final status ──
    // A scan is "partial" when we got some output but it's incomplete.
    // This happens when the LLM was truncated or sections are missing.
    const isPartial = parsed.partial || wasTruncated;
    const finalStatus: ScanStatus = isPartial ? "partial" : "completed";

    if (isPartial) {
      const missing: string[] = [];
      if (!parsed.agentMd) missing.push("AS_BUILT_AGENT.md");
      if (!parsed.humanMd) missing.push("AS_BUILT_HUMAN.md");
      if (expectDrift && !driftMd) missing.push("PRD_DRIFT.md");

      const reason = wasTruncated
        ? "LLM output was truncated before completion"
        : "Some output sections could not be parsed";

      await log(
        scanId,
        `⚠ Scan partially completed: ${reason}.${missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : ""} You can re-run this scan to try again.`,
      );
    }

    // ── Step 7: Save results ──
    const payload: ScanOutputPayload = {
      outputAgentMd: parsed.agentMd,
      outputHumanMd: parsed.humanMd,
      outputDriftMd: driftMd ?? null,
      projectName,
      fileCount: files.length,
      tokenUsage: totalTokenUsage,
    };

    await saveScanOutputs(scanId, payload, finalStatus);
    await updateLastActive(userId);
    await log(
      scanId,
      isPartial ? "Scan partially complete. Partial results saved." : "Scan complete!",
    );
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error during scan";

    await updateScanStatus(scanId, "failed", errorMessage);
    await log(scanId, `✗ Scan failed: ${errorMessage}`);
  }
}

// ─── User-facing error messages ─────────────────────────────────────────────

function getUserFacingLlmMessage(err: LlmError): string {
  switch (err.code) {
    case "AUTH_ERROR":
      return `Authentication failed with ${err.provider}. Please check that the API key is valid.`;
    case "RATE_LIMIT":
      return `Rate limited by ${err.provider} after ${MAX_RETRIES + 1} attempts. Please wait a few minutes and try again.`;
    case "TIMEOUT":
      return `Request to ${err.provider} timed out after ${MAX_RETRIES + 1} attempts. Try using Gemini (largest context window) or targeting a subdirectory to reduce input size.`;
    case "SERVER_ERROR":
      return `${err.provider} is experiencing server issues after ${MAX_RETRIES + 1} attempts. Please try again later or switch to a different provider.`;
    case "CONTENT_FILTER":
      return `${err.provider} content filter blocked the request. The codebase may contain content that triggered safety filters.`;
    case "CONTEXT_LENGTH":
      return `The codebase exceeds ${err.provider}'s context window. Try Gemini (largest window at 1M tokens) or target a subdirectory.`;
    case "INVALID_REQUEST":
      return `Invalid request to ${err.provider}: ${err.message}`;
    default:
      return `LLM call failed after ${MAX_RETRIES + 1} attempts: ${err.message}`;
  }
}
