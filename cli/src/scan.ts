/**
 * Scan command — full async flow (PRD §18.4, §18.6)
 *
 * 1. Collect files from local directory using shared filter logic
 * 2. Upload payload to POST /api/scan/cli
 * 3. Poll GET /api/scan/[id] for progress, display live terminal updates
 * 4. Download results when complete and save to output directory
 */

import { readFile } from "fs/promises";
import { writeFile, mkdir } from "fs/promises";
import { basename, resolve, join } from "path";
import ora, { type Ora } from "ora";
import { getValidToken } from "./auth.js";
import { getApiUrl, loadProjectConfig, type ProjectConfig } from "./config.js";
import { collectFiles } from "./collect.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScanOptions {
  model?: string;
  premium?: boolean;
  prd?: string;
  output?: string;
  subdir?: string;
}

interface ScanResponse {
  scanId: string;
  status: string;
  message: string;
}

interface ScanRecord {
  scanId: string;
  status: "pending" | "processing" | "completed" | "failed";
  progressLog: string[];
  outputManifestMd: string;
  /** @deprecated Fallback for older API responses. Use outputManifestMd. */
  outputAgentMd?: string;
  outputHumanMd: string;
  outputDriftMd: string | null;
  projectName: string;
  prdAttached: boolean;
  errorMessage: string | null;
  fileCount: number;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

type LlmProvider = "gemini" | "claude" | "openai";

// ─── Provider mapping ───────────────────────────────────────────────────────

const PROVIDER_ALIASES: Record<string, LlmProvider> = {
  gemini: "gemini",
  claude: "claude",
  anthropic: "claude",
  openai: "openai",
  gpt: "openai",
};

function resolveProvider(model?: string): LlmProvider {
  if (!model) return "gemini";
  const key = model.toLowerCase();
  const provider = PROVIDER_ALIASES[key];
  if (!provider) {
    const valid = Object.keys(PROVIDER_ALIASES).join(", ");
    throw new Error(`Unknown model "${model}". Valid options: ${valid}`);
  }
  return provider;
}

// ─── Merge options with .asbuiltrc ──────────────────────────────────────────

function mergeOptions(
  cliOpts: ScanOptions,
  projectConfig: ProjectConfig,
): ScanOptions {
  return {
    model: cliOpts.model ?? projectConfig.model,
    premium: cliOpts.premium ?? projectConfig.premium ?? false,
    prd: cliOpts.prd,
    output: cliOpts.output ?? projectConfig.output,
    subdir: cliOpts.subdir ?? projectConfig.subdir,
  };
}

// ─── Main scan flow ─────────────────────────────────────────────────────────

export async function runScan(
  targetPath: string,
  options: ScanOptions,
): Promise<void> {
  const projectRoot = resolve(targetPath);
  const projectName = basename(projectRoot);

  // Load and merge project config
  const projectConfig = await loadProjectConfig(projectRoot);
  const opts = mergeOptions(options, projectConfig);

  const provider = resolveProvider(opts.model);
  const tier = opts.premium ? "premium" : "default";
  const outputDir = opts.output ? resolve(opts.output) : projectRoot;

  // ── 1. Authenticate ──
  let token: string;
  const authSpinner = ora("Authenticating...").start();
  try {
    token = await getValidToken();
    authSpinner.succeed("Authenticated");
  } catch (err) {
    authSpinner.fail(err instanceof Error ? err.message : "Authentication failed");
    process.exit(1);
  }

  // ── 2. Collect files ──
  const collectSpinner = ora("Collecting files...").start();
  let files: Awaited<ReturnType<typeof collectFiles>>;
  try {
    files = await collectFiles(projectRoot, opts.subdir);
  } catch (err) {
    collectSpinner.fail("Failed to collect files");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (files.files.length === 0) {
    collectSpinner.fail("No files found after filtering");
    process.exit(1);
  }

  const sizeMb = (files.totalSizeBytes / 1024 / 1024).toFixed(1);
  collectSpinner.succeed(
    `Collected ${files.files.length} files (${sizeMb} MB)` +
    (files.excludedCount > 0 ? ` — ${files.excludedCount} excluded` : ""),
  );

  // ── 3. Read PRD if specified ──
  let prd: { filename: string; content: string } | null = null;
  if (opts.prd) {
    const prdSpinner = ora("Reading PRD...").start();
    try {
      const prdPath = resolve(opts.prd);
      const prdContent = await readFile(prdPath, "utf-8");
      prd = { filename: basename(prdPath), content: prdContent };
      prdSpinner.succeed(`PRD loaded: ${basename(prdPath)}`);
    } catch (err) {
      prdSpinner.fail(`Failed to read PRD: ${opts.prd}`);
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  // ── 4. Upload to API ──
  const apiUrl = await getApiUrl();
  const uploadSpinner = ora("Uploading to as_built...").start();

  const payload = {
    projectName,
    provider,
    tier,
    subdirectory: opts.subdir || null,
    files: files.files.map((f) => ({
      relativePath: f.relativePath,
      content: f.content,
      sizeBytes: f.sizeBytes,
    })),
    prd,
  };

  let scanResponse: ScanResponse;
  try {
    const response = await fetch(`${apiUrl}/api/scan/cli`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const msg = (errorBody as { error?: string }).error ?? `HTTP ${response.status}`;
      throw new Error(msg);
    }

    scanResponse = (await response.json()) as ScanResponse;
    uploadSpinner.succeed("Uploaded — scan initiated");
  } catch (err) {
    uploadSpinner.fail("Upload failed");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // ── 5. Poll for progress ──
  const scanId = scanResponse.scanId;
  const result = await pollScanProgress(apiUrl, token, scanId);

  if (!result) {
    process.exit(1);
  }

  // ── 6. Save results to output directory ──
  const saveSpinner = ora("Saving results...").start();
  try {
    await mkdir(outputDir, { recursive: true });

    const written: string[] = [];

    const manifestContent = result.outputManifestMd || result.outputAgentMd;
    if (manifestContent) {
      const manifestSlug = projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const manifestPath = join(outputDir, `PROJECT_MANIFEST_${manifestSlug}.md`);
      await writeFile(manifestPath, manifestContent, "utf-8");
      written.push(manifestPath);
    }

    if (result.outputHumanMd) {
      const humanPath = join(outputDir, "AS_BUILT_HUMAN.md");
      await writeFile(humanPath, result.outputHumanMd, "utf-8");
      written.push(humanPath);
    }

    if (result.outputDriftMd) {
      const driftPath = join(outputDir, "PRD_DRIFT.md");
      await writeFile(driftPath, result.outputDriftMd, "utf-8");
      written.push(driftPath);
    }

    saveSpinner.succeed("Scan complete!");

    // Print output file paths
    console.log("");
    for (const path of written) {
      console.log(`  -> ${path}`);
    }

    // Print browser link
    console.log(`\nView in browser: ${apiUrl}/scans/${scanId}`);
  } catch (err) {
    saveSpinner.fail("Failed to save results");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// ─── Polling ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes

async function pollScanProgress(
  apiUrl: string,
  token: string,
  scanId: string,
): Promise<ScanRecord | null> {
  const spinner = ora("Waiting for analysis to start...").start();
  const startTime = Date.now();
  let lastLogIndex = 0;

  while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
    // Refresh token if needed (long scans can exceed 1hr)
    let currentToken: string;
    try {
      currentToken = await getValidToken();
    } catch {
      currentToken = token;
    }

    let scan: ScanRecord;
    try {
      const response = await fetch(`${apiUrl}/api/scan/${scanId}`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });

      if (!response.ok) {
        throw new Error(`Poll failed: HTTP ${response.status}`);
      }

      scan = (await response.json()) as ScanRecord;
    } catch (err) {
      // Transient network error — retry
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    // Display new progress log entries
    if (scan.progressLog && scan.progressLog.length > lastLogIndex) {
      const newEntries = scan.progressLog.slice(lastLogIndex);
      for (const entry of newEntries) {
        spinner.text = entry;
      }
      lastLogIndex = scan.progressLog.length;
    }

    // Check terminal states
    if (scan.status === "completed") {
      spinner.succeed("Analysis complete");
      return scan;
    }

    if (scan.status === "failed") {
      spinner.fail(`Scan failed: ${scan.errorMessage || "Unknown error"}`);
      return null;
    }

    // Update spinner for non-terminal states
    if (scan.status === "processing" && lastLogIndex === 0) {
      spinner.text = "Analyzing...";
    }

    await sleep(POLL_INTERVAL_MS);
  }

  spinner.fail("Scan timed out after 10 minutes");
  return null;
}

// ─── History command ────────────────────────────────────────────────────────

export interface HistoryOptions {
  limit?: number;
}

interface ScanSummary {
  scanId: string;
  projectName: string;
  source: string;
  status: string;
  llmProvider: string;
  llmTier: string;
  fileCount: number;
  createdAt: string;
  completedAt: string | null;
}

export async function showHistory(options: HistoryOptions): Promise<void> {
  const token = await getValidToken();
  const apiUrl = await getApiUrl();
  const limit = options.limit ?? 20;

  const spinner = ora("Fetching scan history...").start();

  try {
    const response = await fetch(
      `${apiUrl}/api/scans?limit=${limit}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as { scans: ScanSummary[]; count: number };
    spinner.stop();

    if (data.scans.length === 0) {
      console.log("No scans found.");
      return;
    }

    // Print table header
    console.log("");
    console.log(
      padRight("Project", 25) +
      padRight("Status", 12) +
      padRight("Provider", 10) +
      padRight("Files", 8) +
      padRight("Date", 20),
    );
    console.log("-".repeat(75));

    for (const scan of data.scans) {
      const date = scan.createdAt
        ? new Date(scan.createdAt).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })
        : "—";

      const statusIcon =
        scan.status === "completed" ? "ok" :
        scan.status === "failed" ? "FAIL" :
        scan.status === "processing" ? "..." :
        "pending";

      console.log(
        padRight(truncate(scan.projectName, 23), 25) +
        padRight(statusIcon, 12) +
        padRight(scan.llmProvider, 10) +
        padRight(String(scan.fileCount), 8) +
        padRight(date, 20),
      );
    }

    console.log(`\n${data.count} scan(s) total`);
  } catch (err) {
    spinner.fail("Failed to fetch history");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

function truncate(str: string, maxLen: number): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + "\u2026";
}
