/**
 * Temporary File Cleanup — PRD §19.2, §19.3
 *
 * Primary cleanup: programmatic deletion immediately after scan processing
 * completes (success or failure). This is the main mechanism.
 *
 * Safety-net: the Firebase Cloud Storage lifecycle rule in storage.lifecycle.json
 * auto-deletes anything under uploads/ older than 1 day in case programmatic
 * cleanup fails (e.g., function timeout, uncaught error).
 *
 * GCS lifecycle minimum granularity is 1 day — the programmatic delete achieves
 * the true "immediate after processing" guarantee the PRD requires.
 */

import { getAdminStorage } from "../firebase-admin";

/**
 * Deletes all temporary upload files for a scan from Firebase Cloud Storage.
 * Covers both zip uploads (uploads/{scanId}/source.zip) and folder uploads
 * (uploads/{scanId}/files/**).
 *
 * Should be called by the background function as the final step regardless of
 * whether the scan succeeded or failed.
 */
export async function deleteScanUploads(scanId: string): Promise<void> {
  await getAdminStorage()
    .bucket()
    .deleteFiles({ prefix: `uploads/${scanId}/` });
}

/**
 * Deletes a single file from Firebase Cloud Storage.
 * Silently succeeds if the file does not exist (idempotent).
 */
export async function deleteStorageFile(storagePath: string): Promise<void> {
  await getAdminStorage()
    .bucket()
    .file(storagePath)
    .delete({ ignoreNotFound: true });
}
