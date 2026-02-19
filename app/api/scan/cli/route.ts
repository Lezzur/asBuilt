/**
 * POST /api/scan/cli — CLI-specific scan endpoint (PRD §17, §18)
 *
 * Accepts pre-collected files from the asbuilt-cli tool as a JSON payload.
 * Unlike the web endpoint which receives raw uploads, the CLI reads files
 * locally, applies filtering, and sends only the relevant file contents.
 *
 * This avoids the overhead of uploading/downloading through Cloud Storage
 * for CLI-initiated scans — files go directly from the JSON payload to a
 * temp directory for the scan engine.
 *
 * Auth: Firebase ID token from the CLI's stored auth token (~/.asbuilt/config.json).
 *
 * Payload shape:
 * {
 *   projectName: string;
 *   provider: "gemini" | "claude" | "openai";
 *   tier?: "default" | "premium";
 *   subdirectory?: string;
 *   files: Array<{ relativePath: string; content: string; sizeBytes: number }>;
 *   prd?: { filename: string; content: string } | null;
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth/server";
import { createScan } from "@/lib/db/scans";
import { savePrdContent } from "@/lib/db/scans";
import { incrementScanCount, updateLastActive } from "@/lib/db/users";
import { getModelId } from "@/lib/llm/provider";
import { processScan } from "@/lib/scan/process";
import type {
  LlmProvider,
  LlmTier,
  CreateScanInput,
} from "@/lib/types";

// Background function timeout
export const maxDuration = 300;

// ─── Request body types ─────────────────────────────────────────────────────

interface CliFileEntry {
  relativePath: string;
  content: string;
  sizeBytes: number;
}

interface CliPrdAttachment {
  filename: string;
  content: string;
}

interface CliScanRequest {
  projectName: string;
  provider: LlmProvider;
  tier?: LlmTier;
  subdirectory?: string | null;
  files: CliFileEntry[];
  prd?: CliPrdAttachment | null;
}

// ─── Validation ─────────────────────────────────────────────────────────────

const VALID_PROVIDERS: LlmProvider[] = ["gemini", "claude", "openai"];
const VALID_TIERS: LlmTier[] = ["default", "premium"];
const MAX_PAYLOAD_FILES = 20_000;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB

function validateCliPayload(body: unknown): {
  valid: true;
  data: CliScanRequest;
} | {
  valid: false;
  error: string;
} {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  // projectName
  if (typeof b.projectName !== "string" || !b.projectName.trim()) {
    return { valid: false, error: "projectName is required and must be a non-empty string" };
  }

  // provider
  if (!VALID_PROVIDERS.includes(b.provider as LlmProvider)) {
    return {
      valid: false,
      error: `Invalid provider. Expected one of: ${VALID_PROVIDERS.join(", ")}`,
    };
  }

  // tier (optional, defaults to "default")
  const tier = b.tier ?? "default";
  if (!VALID_TIERS.includes(tier as LlmTier)) {
    return {
      valid: false,
      error: `Invalid tier. Expected one of: ${VALID_TIERS.join(", ")}`,
    };
  }

  // subdirectory (optional)
  if (b.subdirectory !== undefined && b.subdirectory !== null && typeof b.subdirectory !== "string") {
    return { valid: false, error: "subdirectory must be a string or null" };
  }

  // files
  if (!Array.isArray(b.files) || b.files.length === 0) {
    return { valid: false, error: "files must be a non-empty array" };
  }

  if (b.files.length > MAX_PAYLOAD_FILES) {
    return { valid: false, error: `Too many files (${b.files.length}). Maximum is ${MAX_PAYLOAD_FILES}.` };
  }

  let totalBytes = 0;
  for (let i = 0; i < b.files.length; i++) {
    const f = b.files[i] as Record<string, unknown>;
    if (typeof f.relativePath !== "string" || !f.relativePath) {
      return { valid: false, error: `files[${i}].relativePath is required` };
    }
    if (typeof f.content !== "string") {
      return { valid: false, error: `files[${i}].content must be a string` };
    }
    const sizeBytes = typeof f.sizeBytes === "number" ? f.sizeBytes : Buffer.byteLength(f.content, "utf-8");
    totalBytes += sizeBytes;
  }

  if (totalBytes > MAX_TOTAL_BYTES) {
    return {
      valid: false,
      error: `Total payload size exceeds 100 MB limit (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`,
    };
  }

  // prd (optional)
  if (b.prd !== undefined && b.prd !== null) {
    const prd = b.prd as Record<string, unknown>;
    if (typeof prd.filename !== "string" || typeof prd.content !== "string") {
      return { valid: false, error: "prd must have 'filename' (string) and 'content' (string)" };
    }
  }

  return {
    valid: true,
    data: {
      projectName: (b.projectName as string).trim(),
      provider: b.provider as LlmProvider,
      tier: tier as LlmTier,
      subdirectory: (b.subdirectory as string | null) || null,
      files: b.files as CliFileEntry[],
      prd: (b.prd as CliPrdAttachment | null) ?? null,
    },
  };
}

// ─── POST handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Authenticate ──
  const user = await verifyAuthToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Parse & validate JSON body ──
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request: expected JSON body" },
      { status: 400 },
    );
  }

  const validation = validateCliPayload(body);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { data } = validation;
  const prdAttached = data.prd !== null;

  // ── 3. Create scan record ──
  const llmModel = getModelId(data.provider, data.tier ?? "default");

  const scanInput: CreateScanInput = {
    userId: user.uid,
    projectName: data.projectName,
    source: "cli",
    sourceRef: data.projectName,
    subdirectory: data.subdirectory ?? null,
    llmProvider: data.provider,
    llmModel,
    llmTier: data.tier ?? "default",
    prdAttached,
  };

  let scanRecord;
  try {
    scanRecord = await createScan(scanInput);
  } catch (err) {
    console.error("[POST /api/scan/cli] Failed to create scan record:", err);
    return NextResponse.json(
      { error: "Failed to create scan. Please try again." },
      { status: 500 },
    );
  }

  const scanId = scanRecord.scanId;

  // ── 4. Save PRD content if attached ──
  if (prdAttached && data.prd) {
    try {
      // CLI sends PRD content already extracted as text — no need for
      // format-specific extraction. The CLI handles .md/.txt directly
      // and could pre-extract .pdf/.docx on the client side.
      // However, if a filename is provided, we use extractPrdText for
      // .pdf/.docx support in case the CLI sends raw bytes as base64.
      await savePrdContent(scanId, data.prd.content);
    } catch (err) {
      console.error("[POST /api/scan/cli] PRD extraction error:", err);
      // Non-fatal: continue without PRD
    }
  }

  // ── 5. Fire background processing ──
  try {
    await incrementScanCount(user.uid);
    await updateLastActive(user.uid);
  } catch {
    // Non-fatal: scan can still proceed
  }

  const backgroundPromise = runCliBackgroundScan(scanId, user.uid, data);

  const g = globalThis as Record<string, unknown>;
  if (typeof g.waitUntil === "function") {
    (g.waitUntil as (p: Promise<unknown>) => void)(backgroundPromise);
  } else {
    backgroundPromise.catch((err) => {
      console.error("[POST /api/scan/cli] Background processing error:", err);
    });
  }

  // ── 6. Return scan ID ──
  return NextResponse.json(
    {
      scanId,
      status: "pending",
      message: "Scan initiated. Poll GET /api/scan/[id] for progress.",
    },
    { status: 202 },
  );
}

// ─── Background processing for CLI scans ────────────────────────────────────

async function runCliBackgroundScan(
  scanId: string,
  userId: string,
  data: CliScanRequest,
): Promise<void> {
  try {
    const os = await import("os");
    const fs = await import("fs/promises");
    const path = await import("path");

    // Write CLI-provided files to a temp directory
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `asbuilt-cli-${scanId}-`));

    try {
      // Write files to temp directory
      for (const file of data.files) {
        const filePath = path.join(tmpDir, file.relativePath);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content, "utf-8");
      }

      // Resolve PRD content
      let prdContent: string | null = null;
      if (data.prd) {
        prdContent = data.prd.content;
      }

      // Run the core scan pipeline
      await processScan({
        scanId,
        userId,
        projectRoot: tmpDir,
        projectName: data.projectName,
        provider: data.provider,
        tier: data.tier ?? "default",
        subdirectory: data.subdirectory,
        prdContent,
      });
    } finally {
      // Clean up temp directory
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (err) {
    console.error(`[cli-background] Scan ${scanId} fatal error:`, err);
    const { updateScanStatus } = await import("@/lib/db/scans");
    await updateScanStatus(
      scanId,
      "failed",
      err instanceof Error ? err.message : "CLI background processing failed",
    );
  }
}
