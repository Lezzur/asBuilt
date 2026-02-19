/**
 * Folder Upload Handler — PRD §8.2
 *
 * Handles browser folder uploads using the webkitdirectory attribute.
 * The client sends files via FormData, preserving relative paths in each
 * File's name field (set from file.webkitRelativePath by the client).
 *
 * Responsibilities:
 *  - Convert raw file entries to CollectedFile[] in memory.
 *  - Upload folder files to Firebase Cloud Storage for background processing.
 *  - Download stored folder files back to CollectedFile[] for the scan engine.
 */

import { getAdminStorage } from "../firebase-admin";
import type { CollectedFile, FolderFileEntry } from "./types";
import { tryDecodeUtf8 } from "./utils";

/**
 * Converts pre-parsed folder file entries to CollectedFile[].
 * Binary files are silently skipped.
 * Called directly when files are processed in-memory (small uploads).
 */
export function collectFolderFiles(
  entries: FolderFileEntry[],
): CollectedFile[] {
  const files: CollectedFile[] = [];

  for (const entry of entries) {
    if (!entry.relativePath || entry.buffer.length === 0) continue;

    const relativePath = normalizePath(entry.relativePath);
    const content = tryDecodeUtf8(entry.buffer);
    if (content === null) continue;

    files.push({ relativePath, content, sizeBytes: entry.buffer.length });
  }

  return files;
}

/**
 * Uploads folder files to Firebase Cloud Storage at uploads/{scanId}/files/.
 * Called by the API route after receiving the FormData payload.
 * The background function later calls downloadFolderFiles to retrieve them.
 */
export async function uploadFolderToStorage(
  entries: FolderFileEntry[],
  scanId: string,
): Promise<void> {
  const bucket = getAdminStorage().bucket();

  await Promise.all(
    entries.map(async (entry) => {
      const relativePath = normalizePath(entry.relativePath);
      if (!relativePath) return;
      const storagePath = `uploads/${scanId}/files/${relativePath}`;
      await bucket
        .file(storagePath)
        .save(entry.buffer, { metadata: { scanId } });
    }),
  );
}

/**
 * Downloads all files for a scan from Firebase Cloud Storage.
 * Called by the background function during scan processing.
 */
export async function downloadFolderFiles(
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

function normalizePath(p: string): string {
  // Normalize backslashes and strip any leading slash
  return p.replace(/\\/g, "/").replace(/^\//, "");
}
