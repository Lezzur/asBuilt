import { generateText, type LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LlmProvider, LlmTier, TokenUsage } from "@/lib/types";

// ─── Model configuration ─────────────────────────────────────────────────────

interface ModelConfig {
  default: string;
  premium: string;
}

const MODEL_MAP: Record<LlmProvider, ModelConfig> = {
  gemini: {
    default: "gemini-2.5-flash",
    premium: "gemini-3.1-pro-preview",
  },
  claude: {
    default: "claude-sonnet-4-5-20250514",
    premium: "claude-opus-4-20250514",
  },
  openai: {
    default: "gpt-4o-mini",
    premium: "gpt-4o",
  },
};

/**
 * Returns the specific model ID for a given provider and tier.
 */
export function getModelId(provider: LlmProvider, tier: LlmTier): string {
  return MODEL_MAP[provider][tier];
}

// ─── LLM Error classification (PRD §21) ─────────────────────────────────────

export type LlmErrorCode =
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "SERVER_ERROR"
  | "AUTH_ERROR"
  | "INVALID_REQUEST"
  | "CONTENT_FILTER"
  | "CONTEXT_LENGTH"
  | "UNKNOWN";

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly retryable: boolean;
  readonly provider: LlmProvider;
  readonly statusCode?: number;

  constructor(
    message: string,
    code: LlmErrorCode,
    provider: LlmProvider,
    statusCode?: number,
  ) {
    super(message);
    this.name = "LlmError";
    this.code = code;
    this.provider = provider;
    this.statusCode = statusCode;
    this.retryable = code === "RATE_LIMIT" || code === "TIMEOUT" || code === "SERVER_ERROR";
  }
}

/**
 * Classifies a raw error from the Vercel AI SDK into a structured LlmError
 * with a retryable flag for the retry logic.
 */
function classifyError(err: unknown, provider: LlmProvider): LlmError {
  const message = err instanceof Error ? err.message : String(err);
  const lowerMsg = message.toLowerCase();

  // Extract HTTP status code from error message or properties
  const statusCode =
    (err as Record<string, unknown>)?.statusCode as number | undefined ??
    (err as Record<string, unknown>)?.status as number | undefined ??
    extractStatusFromMessage(message);

  // Rate limiting (429)
  if (
    statusCode === 429 ||
    lowerMsg.includes("rate limit") ||
    lowerMsg.includes("rate_limit") ||
    lowerMsg.includes("too many requests") ||
    lowerMsg.includes("quota")
  ) {
    return new LlmError(
      `Rate limited by ${provider}. ${message}`,
      "RATE_LIMIT",
      provider,
      429,
    );
  }

  // Timeout errors
  if (
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("timed out") ||
    lowerMsg.includes("deadline exceeded") ||
    lowerMsg.includes("econnreset") ||
    lowerMsg.includes("socket hang up")
  ) {
    return new LlmError(
      `Request to ${provider} timed out. ${message}`,
      "TIMEOUT",
      provider,
      statusCode,
    );
  }

  // Authentication errors (401, 403) — not retryable
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    lowerMsg.includes("unauthorized") ||
    lowerMsg.includes("forbidden") ||
    lowerMsg.includes("invalid api key") ||
    lowerMsg.includes("invalid_api_key") ||
    lowerMsg.includes("authentication")
  ) {
    return new LlmError(
      `Authentication failed for ${provider}. Check your API key. ${message}`,
      "AUTH_ERROR",
      provider,
      statusCode ?? 401,
    );
  }

  // Content filter / safety (not retryable)
  if (
    lowerMsg.includes("content filter") ||
    lowerMsg.includes("content_filter") ||
    lowerMsg.includes("safety") ||
    lowerMsg.includes("blocked")
  ) {
    return new LlmError(
      `Content was filtered by ${provider}. ${message}`,
      "CONTENT_FILTER",
      provider,
      statusCode,
    );
  }

  // Context length exceeded (not retryable)
  if (
    lowerMsg.includes("context length") ||
    lowerMsg.includes("context_length") ||
    lowerMsg.includes("maximum context") ||
    lowerMsg.includes("token limit") ||
    lowerMsg.includes("too long")
  ) {
    return new LlmError(
      `Context window exceeded for ${provider}. ${message}`,
      "CONTEXT_LENGTH",
      provider,
      statusCode ?? 400,
    );
  }

  // Bad request (400) — not retryable
  if (statusCode === 400 || lowerMsg.includes("bad request") || lowerMsg.includes("invalid")) {
    return new LlmError(
      `Invalid request to ${provider}. ${message}`,
      "INVALID_REQUEST",
      provider,
      400,
    );
  }

  // Server errors (500, 502, 503) — retryable
  if (statusCode && statusCode >= 500) {
    return new LlmError(
      `${provider} server error (${statusCode}). ${message}`,
      "SERVER_ERROR",
      provider,
      statusCode,
    );
  }

  return new LlmError(message, "UNKNOWN", provider, statusCode);
}

function extractStatusFromMessage(msg: string): number | undefined {
  const match = /\b(4\d{2}|5\d{2})\b/.exec(msg);
  return match ? parseInt(match[1], 10) : undefined;
}

// ─── Provider factory ────────────────────────────────────────────────────────

function createLanguageModel(
  provider: LlmProvider,
  tier: LlmTier,
  apiKey?: string,
): LanguageModel {
  const modelId = getModelId(provider, tier);

  switch (provider) {
    case "gemini": {
      const google = createGoogleGenerativeAI({
        apiKey: apiKey || process.env.GEMINI_API_KEY,
      });
      return google(modelId);
    }
    case "claude": {
      const anthropic = createAnthropic({
        apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      });
      return anthropic(modelId);
    }
    case "openai": {
      const openai = createOpenAI({
        apiKey: apiKey || process.env.OPENAI_API_KEY,
      });
      return openai(modelId);
    }
  }
}

// ─── Generation interface ────────────────────────────────────────────────────

export interface LlmRequest {
  provider: LlmProvider;
  tier: LlmTier;
  prompt: string;
  /** Optional user-provided API key (v2+). Falls back to server env vars. */
  apiKey?: string;
}

export interface LlmResponse {
  text: string;
  tokenUsage: TokenUsage;
  modelId: string;
  /** The LLM's finish reason — "stop" is normal, "length" means output was truncated. */
  finishReason: string;
}

/**
 * Sends a prompt to the selected LLM provider via the Vercel AI SDK
 * and returns the generated text with token usage metadata.
 *
 * Throws a structured LlmError on failure, with a `retryable` flag
 * so the caller can decide whether to retry or fail fast.
 */
export async function generateWithLlm(
  request: LlmRequest,
): Promise<LlmResponse> {
  const model = createLanguageModel(
    request.provider,
    request.tier,
    request.apiKey,
  );
  const modelId = getModelId(request.provider, request.tier);

  try {
    const result = await generateText({
      model,
      prompt: request.prompt,
      maxOutputTokens: 65_536,
    });

    const inputTokens = result.usage?.inputTokens ?? 0;
    const outputTokens = result.usage?.outputTokens ?? 0;

    return {
      text: result.text,
      tokenUsage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      modelId,
      finishReason: result.finishReason ?? "unknown",
    };
  } catch (err) {
    throw classifyError(err, request.provider);
  }
}
