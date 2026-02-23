/**
 * POST /api/scan — Initiate a scan (PRD §6.2, §17)
 *
 * Orchestrates the full scan initiation flow:
 *  1. Authenticate the request (Firebase ID token).
 *  2. Parse + validate the multipart form payload.
 *  3. Create a pending scan record in Firestore.
 *  4. Upload source files to Cloud Storage for the background function.
 *  5. Extract PRD text if a PRD file was attached.
 *  6. Kick off the background processing function.
 *  7. Return the scan ID immediately so the client can start polling.
 *
 * Input methods supported:
 *  - zip: single .zip file
 *  - folder: multiple files with relative paths (webkitdirectory)
 *  - github: GitHub repo URL (fetched via user's OAuth token)
 *
 * The background function (processScan) handles file collection, prompt
 * assembly, LLM call, output parsing, and cleanup. This route never blocks
 * on LLM processing.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { verifyAuthToken } from "@/lib/auth/server";
import { createScan } from "@/lib/db/scans";
import { savePrdContent } from "@/lib/db/scans";
import { incrementScanCount, updateLastActive } from "@/lib/db/users";
import { getModelId } from "@/lib/llm/provider";
import { uploadZipToStorage } from "@/lib/input/zip-handler";
import { uploadFolderToStorage } from "@/lib/input/folder-handler";
import {
  parseGitHubUrl,
  getUserGitHubToken,
  fetchAndUploadGitHubRepo,
  GitHubInputError,
  GitHubAuthError,
  GitHubNotFoundError,
  GitHubRateLimitError,
} from "@/lib/input/github-handler";
import { extractPrdText } from "@/lib/input/prd-handler";
import { processScan } from "@/lib/scan/process";
import { deleteScanUploads } from "@/lib/input/cleanup";
import type {
  ScanSource,
  LlmProvider,
  LlmTier,
  CreateScanInput,
} from "@/lib/types";
import type { FolderFileEntry } from "@/lib/input/types";

// Vercel background function: extend timeout to 300s on Pro plan.
// Locally there is no limit.
export const maxDuration = 300;


// ─── Validation helpers ─────────────────────────────────────────────────────

const VALID_SOURCES: ScanSource[] = ["zip", "folder", "github"];
const VALID_PROVIDERS: LlmProvider[] = ["gemini", "claude", "openai"];
const VALID_TIERS: LlmTier[] = ["default", "premium"];
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

function isValidSource(v: unknown): v is ScanSource {
  return typeof v === "string" && VALID_SOURCES.includes(v as ScanSource);
}

function isValidProvider(v: unknown): v is LlmProvider {
  return typeof v === "string" && VALID_PROVIDERS.includes(v as LlmProvider);
}

function isValidTier(v: unknown): v is LlmTier {
  return typeof v === "string" && VALID_TIERS.includes(v as LlmTier);
}

// ─── POST handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Authenticate ──
  const user = await verifyAuthToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid request: expected multipart/form-data" },
      { status: 400 },
    );
  }

  // ── 2. Parse & validate form fields ──
  const source = formData.get("source") as string | null;
  const provider = formData.get("provider") as string | null;
  const tier = (formData.get("tier") as string | null) ?? "default";
  let projectName = (formData.get("projectName") as string | null)?.trim() || null;
  const subdirectory = (formData.get("subdirectory") as string | null) || null;
  const githubUrl = formData.get("githubUrl") as string | null;
  const githubBranch = (formData.get("githubBranch") as string | null) || undefined;

  if (!isValidSource(source)) {
    return NextResponse.json(
      { error: `Invalid source. Expected one of: ${VALID_SOURCES.join(", ")}` },
      { status: 400 },
    );
  }

  if (!isValidProvider(provider)) {
    return NextResponse.json(
      { error: `Invalid provider. Expected one of: ${VALID_PROVIDERS.join(", ")}` },
      { status: 400 },
    );
  }

  if (!isValidTier(tier)) {
    return NextResponse.json(
      { error: `Invalid tier. Expected one of: ${VALID_TIERS.join(", ")}` },
      { status: 400 },
    );
  }

  // ── Source-specific validation ──
  if (source === "github" && !githubUrl) {
    return NextResponse.json(
      { error: "githubUrl is required when source is 'github'" },
      { status: 400 },
    );
  }

  if (source === "zip") {
    const zipFile = formData.get("file") as File | null;
    if (!zipFile) {
      return NextResponse.json(
        { error: "A .zip file is required when source is 'zip'" },
        { status: 400 },
      );
    }
    if (zipFile.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `Upload exceeds 100 MB limit (received ${(zipFile.size / 1024 / 1024).toFixed(1)} MB)` },
        { status: 413 },
      );
    }
  }

  if (source === "folder") {
    const files = formData.getAll("files") as File[];
    if (!files.length) {
      return NextResponse.json(
        { error: "At least one file is required when source is 'folder'" },
        { status: 400 },
      );
    }
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `Upload exceeds 100 MB limit (received ${(totalSize / 1024 / 1024).toFixed(1)} MB)` },
        { status: 413 },
      );
    }
  }

  // ── 3. Create scan record ──
  const llmModel = getModelId(provider, tier as LlmTier);

  // Infer project name from source if not provided
  if (!projectName) {
    if (source === "github" && githubUrl) {
      // Extract "repo" from "https://github.com/owner/repo"
      const segments = githubUrl.replace(/\/+$/, "").split("/").filter(Boolean);
      projectName = segments[segments.length - 1]?.replace(/\.git$/, "") || "Untitled Project";
    } else if (source === "zip") {
      const zipFile = formData.get("file") as File | null;
      projectName = zipFile?.name.replace(/\.zip$/i, "") || "Untitled Project";
    } else if (source === "folder") {
      const files = formData.getAll("files") as File[];
      const firstPath = files[0]?.webkitRelativePath || files[0]?.name || "";
      projectName = firstPath.split("/")[0] || "Untitled Project";
    } else {
      projectName = "Untitled Project";
    }
  }

  // Determine sourceRef for the record
  let sourceRef = "";
  if (source === "github") {
    sourceRef = githubUrl!;
  } else if (source === "zip") {
    const zipFile = formData.get("file") as File;
    sourceRef = zipFile.name;
  } else if (source === "folder") {
    sourceRef = projectName;
  }

  // Check for PRD attachment
  const prdFile = formData.get("prd") as File | null;
  const prdAttached = prdFile !== null && prdFile.size > 0;

  const scanInput: CreateScanInput = {
    userId: user.uid,
    projectName,
    source,
    sourceRef,
    subdirectory,
    llmProvider: provider,
    llmModel,
    llmTier: tier as LlmTier,
    prdAttached,
  };

  let scanRecord;
  try {
    scanRecord = await createScan(scanInput);
  } catch (err) {
    console.error("[POST /api/scan] Failed to create scan record:", err);
    return NextResponse.json(
      { error: "Failed to create scan. Please try again." },
      { status: 500 },
    );
  }

  const scanId = scanRecord.scanId;

  // ── 4. Upload source files + extract PRD (async, pre-background) ──
  try {
    // Upload source files to Cloud Storage
    if (source === "zip") {
      const zipFile = formData.get("file") as File;
      const buffer = Buffer.from(await zipFile.arrayBuffer());
      await uploadZipToStorage(buffer, scanId);
    } else if (source === "folder") {
      const files = formData.getAll("files") as File[];
      const paths = formData.getAll("paths") as string[];

      const entries: FolderFileEntry[] = await Promise.all(
        files.map(async (file, i) => ({
          relativePath: paths[i] || file.name,
          buffer: Buffer.from(await file.arrayBuffer()),
        })),
      );

      await uploadFolderToStorage(entries, scanId);
    } else if (source === "github") {
      const ref = parseGitHubUrl(githubUrl!);
      if (githubBranch) ref.branch = githubBranch;

      const token = await getUserGitHubToken(user.uid);
      const result = await fetchAndUploadGitHubRepo(ref, token, scanId);

      if (result.sizeWarning) {
        // Log but don't block — the scan will proceed
        console.warn(
          `[POST /api/scan] Large repo: ${ref.owner}/${ref.repo} (${result.repoSizeKb} KB)`,
        );
      }
    }

    // Extract PRD text if attached
    if (prdAttached && prdFile) {
      const prdBuffer = Buffer.from(await prdFile.arrayBuffer());
      const prdText = await extractPrdText(prdBuffer, prdFile.name);
      await savePrdContent(scanId, prdText);
    }

    // Increment user's scan count
    await incrementScanCount(user.uid);
    await updateLastActive(user.uid);

  } catch (err) {
    // Upload/preparation failed — clean up and mark scan as failed
    console.error("[POST /api/scan] Pre-processing error:", err);

    // Best-effort cleanup
    try {
      await deleteScanUploads(scanId);
    } catch { /* ignore cleanup errors */ }

    // Map known error types to user-friendly messages
    const errorResponse = mapInputError(err);
    try {
      const { updateScanStatus } = await import("@/lib/db/scans");
      await updateScanStatus(scanId, "failed", errorResponse.message);
    } catch { /* best-effort status update */ }

    return NextResponse.json(
      { error: errorResponse.message, code: errorResponse.code, scanId },
      { status: errorResponse.status },
    );
  }

  // ── 5. Fire background processing (non-blocking) ──
  // Schedule the scan to run after the response is sent using Next.js after().
  // This keeps the serverless function alive on Vercel while the LLM processes.
  after(async () => {
    try {
      await runBackgroundScan(scanId, user.uid, source, {
        projectName,
        provider,
        tier: tier as LlmTier,
        subdirectory,
        prdAttached,
      });
    } catch (err) {
      console.error("[POST /api/scan] Background processing error:", err);
    }
  });

  // ── 6. Return scan ID immediately ──
  return NextResponse.json(
    {
      scanId,
      status: "pending",
      message: "Scan initiated. Poll GET /api/scan/[id] for progress.",
    },
    { status: 202 },
  );
}

// ─── Background scan runner ─────────────────────────────────────────────────

async function runBackgroundScan(
  scanId: string,
  userId: string,
  source: ScanSource,
  opts: {
    projectName: string;
    provider: LlmProvider;
    tier: LlmTier;
    subdirectory: string | null;
    prdAttached: boolean;
  },
): Promise<void> {
  try {
    // Determine prdContent if a PRD was attached
    let prdContent: string | null = null;
    if (opts.prdAttached) {
      const { getScan } = await import("@/lib/db/scans");
      const scan = await getScan(scanId);
      prdContent = scan?.prdContent ?? null;
    }

    // The processScan function handles:
    //  - Downloading files from Cloud Storage
    //  - File collection + filtering
    //  - Prompt assembly
    //  - LLM call (with retry)
    //  - Output parsing
    //  - Saving results to Firestore
    //  - Status updates (processing → completed/failed)
    //
    // NOTE: processScan uses collectFiles which expects a local directory path.
    // For cloud-stored files, we need to download them first to a temp dir.
    // This is handled by the source-specific download functions.

    const os = await import("os");
    const fs = await import("fs/promises");
    const path = await import("path");

    // Create a temporary directory for the scan files
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `asbuilt-${scanId}-`));

    try {
      // Download files from Cloud Storage to the temp directory
      let downloadedFiles;
      if (source === "zip") {
        const { downloadAndExtractZip } = await import("@/lib/input/zip-handler");
        downloadedFiles = await downloadAndExtractZip(scanId);
      } else if (source === "folder" || source === "github") {
        const { downloadFolderFiles } = await import("@/lib/input/folder-handler");
        downloadedFiles = await downloadFolderFiles(scanId);
      } else {
        throw new Error(`Unsupported source type: ${source}`);
      }

      // Write files to the temp directory so collectFiles can traverse them
      for (const file of downloadedFiles) {
        const filePath = path.join(tmpDir, file.relativePath);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content, "utf-8");
      }

      // Run the core scan pipeline
      await processScan({
        scanId,
        userId,
        projectRoot: tmpDir,
        projectName: opts.projectName,
        provider: opts.provider,
        tier: opts.tier,
        subdirectory: opts.subdirectory,
        prdContent,
      });
    } finally {
      // Clean up: remove temp directory and Cloud Storage uploads
      await Promise.allSettled([
        fs.rm(tmpDir, { recursive: true, force: true }),
        deleteScanUploads(scanId),
      ]);
    }
  } catch (err) {
    // Last-resort error handler — processScan has its own try/catch
    // but this catches download/temp-dir errors
    console.error(`[background] Scan ${scanId} fatal error:`, err);
    const { updateScanStatus } = await import("@/lib/db/scans");
    await updateScanStatus(
      scanId,
      "failed",
      err instanceof Error ? err.message : "Background processing failed",
    );
  }
}

// ─── Error mapping ──────────────────────────────────────────────────────────

interface ErrorResponse {
  message: string;
  code: string;
  status: number;
}

function mapInputError(err: unknown): ErrorResponse {
  if (err instanceof GitHubInputError) {
    return { message: err.message, code: err.code, status: 400 };
  }
  if (err instanceof GitHubAuthError) {
    return { message: err.message, code: err.code, status: 401 };
  }
  if (err instanceof GitHubNotFoundError) {
    return { message: err.message, code: err.code, status: 404 };
  }
  if (err instanceof GitHubRateLimitError) {
    return { message: err.message, code: err.code, status: 429 };
  }

  const message =
    err instanceof Error ? err.message : "An unexpected error occurred during upload processing.";

  return { message, code: "UPLOAD_ERROR", status: 500 };
}
