/**
 * GitHub Repo Fetcher — PRD §8.3
 *
 * Fetches repository contents via the GitHub API using the user's stored
 * OAuth token (encrypted in Firestore). Supports:
 *  - Public and private repos (via OAuth)
 *  - Branch selection (defaults to repo's default branch)
 *  - Repo size pre-check with warning threshold
 *  - Rate limit awareness with clear error messaging
 *  - Storage upload for background processing
 *  - Returns CollectedFile[] matching the zip/folder handler contract
 */

import { getAdminDb, getAdminStorage } from "../firebase-admin";
import { decrypt } from "../crypto";
import type { CollectedFile } from "./types";
import { tryDecodeUtf8 } from "./utils";

const GITHUB_API = "https://api.github.com";

/** Repos larger than this (in KB) trigger a size warning. */
const SIZE_WARNING_THRESHOLD_KB = 200_000; // ~200 MB

/** Maximum depth for recursive tree fetch. Safety net against runaway repos. */
const MAX_FILES = 20_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubRepoRef {
  owner: string;
  repo: string;
  branch?: string;
}

export interface GitHubFetchResult {
  files: CollectedFile[];
  branch: string;
  sizeWarning: boolean;
  repoSizeKb: number;
  truncated: boolean;
}

interface GitHubRepoMeta {
  default_branch: string;
  size: number; // KB
  private: boolean;
  full_name: string;
}

interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

interface GitHubTreeResponse {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// URL Parsing
// ---------------------------------------------------------------------------

/**
 * Parses a GitHub URL into owner/repo/branch components.
 * Accepts formats:
 *  - https://github.com/owner/repo
 *  - https://github.com/owner/repo/tree/branch-name
 *  - github.com/owner/repo
 *  - owner/repo
 */
export function parseGitHubUrl(input: string): GitHubRepoRef {
  let cleaned = input.trim().replace(/\/+$/, "");

  // Strip protocol and host
  cleaned = cleaned
    .replace(/^https?:\/\//i, "")
    .replace(/^github\.com\//i, "");

  // Strip .git suffix
  cleaned = cleaned.replace(/\.git$/, "");

  const segments = cleaned.split("/").filter(Boolean);

  if (segments.length < 2) {
    throw new GitHubInputError(
      `Invalid GitHub URL: expected "owner/repo" format, got "${input}"`,
    );
  }

  const owner = segments[0];
  const repo = segments[1];

  // If URL contains /tree/branch-name, extract branch
  let branch: string | undefined;
  if (segments[2] === "tree" && segments.length > 3) {
    branch = segments.slice(3).join("/"); // branch names can contain slashes
  }

  return { owner, repo, branch };
}

// ---------------------------------------------------------------------------
// Token Retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieves and decrypts the GitHub OAuth token for the given user.
 * Throws GitHubAuthError if no token is stored.
 */
export async function getUserGitHubToken(uid: string): Promise<string> {
  const userDoc = await getAdminDb().collection("users").doc(uid).get();

  if (!userDoc.exists) {
    throw new GitHubAuthError("User not found");
  }

  const encryptedToken = userDoc.data()?.githubAccessToken;
  if (!encryptedToken) {
    throw new GitHubAuthError(
      "GitHub not connected. Please connect your GitHub account in Settings.",
    );
  }

  return decrypt(encryptedToken);
}

// ---------------------------------------------------------------------------
// GitHub API Helpers
// ---------------------------------------------------------------------------

async function githubFetch<T>(
  path: string,
  token: string,
): Promise<T> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const resetAt = response.headers.get("x-ratelimit-reset");

    if (response.status === 401 || response.status === 403) {
      if (remaining === "0" && resetAt) {
        const resetDate = new Date(parseInt(resetAt, 10) * 1000);
        throw new GitHubRateLimitError(
          `GitHub API rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}.`,
          resetDate,
        );
      }
      throw new GitHubAuthError(
        "GitHub authentication failed. Your token may have been revoked. " +
          "Please reconnect GitHub in Settings.",
      );
    }

    if (response.status === 404) {
      throw new GitHubNotFoundError(
        "Repository not found. It may not exist, or your GitHub account " +
          "may not have access to this private repository.",
      );
    }

    throw new GitHubApiError(
      `GitHub API error: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Core Fetch Logic
// ---------------------------------------------------------------------------

/**
 * Fetches repository metadata (default branch, size, etc.).
 */
async function fetchRepoMeta(
  ref: GitHubRepoRef,
  token: string,
): Promise<GitHubRepoMeta> {
  return githubFetch<GitHubRepoMeta>(
    `/repos/${ref.owner}/${ref.repo}`,
    token,
  );
}

/**
 * Fetches the full recursive file tree for a branch.
 * Uses the Git Trees API with ?recursive=1 for a single request.
 */
async function fetchTree(
  ref: GitHubRepoRef,
  branch: string,
  token: string,
): Promise<GitHubTreeResponse> {
  return githubFetch<GitHubTreeResponse>(
    `/repos/${ref.owner}/${ref.repo}/git/trees/${branch}?recursive=1`,
    token,
  );
}

/**
 * Fetches a single file's raw content from GitHub.
 * Uses the raw media type to avoid base64 decoding overhead.
 */
async function fetchFileContent(
  ref: GitHubRepoRef,
  path: string,
  sha: string,
  token: string,
): Promise<Buffer> {
  const url = `${GITHUB_API}/repos/${ref.owner}/${ref.repo}/git/blobs/${sha}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    // Non-critical: skip files we can't fetch rather than failing the whole scan
    console.error(`Failed to fetch ${path}: ${response.status}`);
    return Buffer.alloc(0);
  }

  return Buffer.from(await response.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches all text files from a GitHub repository.
 *
 * Flow:
 *  1. Fetch repo metadata (default branch, size)
 *  2. Fetch full recursive tree for the target branch
 *  3. Filter to blob entries only
 *  4. Fetch file contents in parallel batches
 *  5. Decode as UTF-8, skip binary files
 *  6. Return CollectedFile[] matching the zip/folder handler contract
 */
export async function fetchGitHubRepo(
  ref: GitHubRepoRef,
  token: string,
): Promise<GitHubFetchResult> {
  // 1. Repo metadata
  const meta = await fetchRepoMeta(ref, token);
  const branch = ref.branch || meta.default_branch;
  const sizeWarning = meta.size > SIZE_WARNING_THRESHOLD_KB;

  // 2. Recursive tree
  const tree = await fetchTree(ref, branch, token);

  // 3. Filter to blobs (files only)
  let blobs = tree.tree.filter((e) => e.type === "blob");

  // Enforce file count safety limit
  let truncated = tree.truncated;
  if (blobs.length > MAX_FILES) {
    blobs = blobs.slice(0, MAX_FILES);
    truncated = true;
  }

  // 4. Fetch contents in parallel batches to avoid overwhelming the API
  const BATCH_SIZE = 30;
  const files: CollectedFile[] = [];

  for (let i = 0; i < blobs.length; i += BATCH_SIZE) {
    const batch = blobs.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (entry) => {
        const buf = await fetchFileContent(ref, entry.path, entry.sha, token);
        if (buf.length === 0) return null;

        const content = tryDecodeUtf8(buf);
        if (content === null) return null;

        return {
          relativePath: entry.path,
          content,
          sizeBytes: buf.length,
        } satisfies CollectedFile;
      }),
    );

    for (const f of results) {
      if (f) files.push(f);
    }
  }

  return {
    files,
    branch,
    sizeWarning,
    repoSizeKb: meta.size,
    truncated,
  };
}

/**
 * Fetches a GitHub repo and uploads its files to Firebase Cloud Storage
 * for background processing. Mirrors the pattern used by zip/folder handlers.
 *
 * Called by the API route; the background function later calls
 * downloadGitHubFiles to retrieve them.
 */
export async function fetchAndUploadGitHubRepo(
  ref: GitHubRepoRef,
  token: string,
  scanId: string,
): Promise<{ fileCount: number; branch: string; sizeWarning: boolean; repoSizeKb: number; truncated: boolean }> {
  const result = await fetchGitHubRepo(ref, token);

  const bucket = getAdminStorage().bucket();

  // Upload in parallel batches
  const BATCH_SIZE = 30;
  for (let i = 0; i < result.files.length; i += BATCH_SIZE) {
    const batch = result.files.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (file) => {
        const storagePath = `uploads/${scanId}/files/${file.relativePath}`;
        await bucket
          .file(storagePath)
          .save(Buffer.from(file.content, "utf-8"), { metadata: { scanId } });
      }),
    );
  }

  return {
    fileCount: result.files.length,
    branch: result.branch,
    sizeWarning: result.sizeWarning,
    repoSizeKb: result.repoSizeKb,
    truncated: result.truncated,
  };
}

/**
 * Downloads previously-stored GitHub files from Firebase Cloud Storage.
 * Called by the background function during scan processing.
 * Reuses the same storage layout as folder uploads (uploads/{scanId}/files/).
 */
export async function downloadGitHubFiles(
  scanId: string,
): Promise<CollectedFile[]> {
  const bucket = getAdminStorage().bucket();
  const prefix = `uploads/${scanId}/files/`;
  const [storageFiles] = await bucket.getFiles({ prefix });

  const files: CollectedFile[] = [];

  for (const storageFile of storageFiles) {
    const relativePath = storageFile.name.slice(prefix.length);
    if (!relativePath) continue;

    const [buf] = await storageFile.download();
    const content = tryDecodeUtf8(buf);
    if (content === null) continue;

    files.push({ relativePath, content, sizeBytes: buf.length });
  }

  return files;
}

// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------

export class GitHubInputError extends Error {
  readonly code = "GITHUB_INPUT_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "GitHubInputError";
  }
}

export class GitHubAuthError extends Error {
  readonly code = "GITHUB_AUTH_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "GitHubAuthError";
  }
}

export class GitHubNotFoundError extends Error {
  readonly code = "GITHUB_NOT_FOUND" as const;
  constructor(message: string) {
    super(message);
    this.name = "GitHubNotFoundError";
  }
}

export class GitHubRateLimitError extends Error {
  readonly code = "GITHUB_RATE_LIMIT" as const;
  readonly resetAt: Date;
  constructor(message: string, resetAt: Date) {
    super(message);
    this.name = "GitHubRateLimitError";
    this.resetAt = resetAt;
  }
}

export class GitHubApiError extends Error {
  readonly code = "GITHUB_API_ERROR" as const;
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "GitHubApiError";
    this.statusCode = statusCode;
  }
}
