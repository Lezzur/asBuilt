/**
 * Zip Upload Handler — PRD §8.1
 *
 * Responsibilities:
 *  - Validate and upload a .zip buffer to Firebase Cloud Storage.
 *  - Extract a zip buffer into CollectedFile[] for the scan engine.
 *  - Download and extract a previously-uploaded zip from storage.
 *
 * The background function (scan engine) calls downloadAndExtractZip after the
 * POST /api/scan endpoint has called uploadZipToStorage and returned the scan ID.
 */

import * as unzipper from "unzipper";
import { getAdminStorage } from "../firebase-admin";
import type { CollectedFile, UploadResult } from "./types";
import { tryDecodeUtf8 } from "./utils";

const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB — PRD §8.1, §23

export async function uploadZipToStorage(
  buffer: Buffer,
  scanId: string,
): Promise<UploadResult> {
  if (buffer.length > MAX_SIZE_BYTES) {
    throw new Error(
      `Upload exceeds 100 MB limit (received ${(buffer.length / 1024 / 1024).toFixed(1)} MB)`,
    );
  }

  const storagePath = `uploads/${scanId}/source.zip`;

  await getAdminStorage()
    .bucket()
    .file(storagePath)
    .save(buffer, { contentType: "application/zip", metadata: { scanId } });

  return { storagePath, sizeBytes: buffer.length };
}

/**
 * Downloads the zip from Firebase Storage and extracts it.
 * Called by the background function during scan processing.
 */
export async function downloadAndExtractZip(
  scanId: string,
): Promise<CollectedFile[]> {
  const storagePath = `uploads/${scanId}/source.zip`;
  const [buffer] = await getAdminStorage()
    .bucket()
    .file(storagePath)
    .download();
  return extractZipBuffer(buffer);
}

/**
 * Pure extraction function: buffer → CollectedFile[].
 * Binary files and empty entries are silently skipped.
 * A common root folder (e.g., "my-project/") is automatically stripped so all
 * returned paths are relative to the project root.
 */
export async function extractZipBuffer(
  buffer: Buffer,
): Promise<CollectedFile[]> {
  const directory = await unzipper.Open.buffer(buffer);

  const fileEntries = directory.files.filter((e) => e.type !== "Directory");
  const rawPaths = fileEntries.map((e) => e.path.replace(/\\/g, "/"));
  const rootPrefix = detectCommonRoot(rawPaths);

  const files: CollectedFile[] = [];

  for (const entry of fileEntries) {
    const rawPath = entry.path.replace(/\\/g, "/");
    const relativePath = rootPrefix ? rawPath.slice(rootPrefix.length) : rawPath;
    if (!relativePath) continue;

    const contentBuf = await entry.buffer();
    const content = tryDecodeUtf8(contentBuf);
    if (content === null) continue;

    files.push({ relativePath, content, sizeBytes: contentBuf.length });
  }

  return files;
}

/**
 * If every file shares the same top-level folder (common zip packaging convention),
 * return that prefix so it can be stripped.
 * e.g., ["my-app/src/index.ts", "my-app/package.json"] → "my-app/"
 */
function detectCommonRoot(paths: string[]): string {
  if (paths.length === 0) return "";
  const firstComponents = paths.map((p) => p.split("/")[0]);
  const unique = new Set(firstComponents);
  if (unique.size === 1 && paths.every((p) => p.includes("/"))) {
    return [...unique][0] + "/";
  }
  return "";
}
