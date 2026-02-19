// ─── Subdirectory Targeting (PRD §8.5) ────────────────────────────────────────
//
// Available across all input methods. Filters collected files to only those
// within the user-specified subdirectory path.

/**
 * Normalizes a subdirectory path for consistent comparison:
 * - Converts backslashes to forward slashes
 * - Strips leading and trailing slashes
 */
function normalizeSubdir(subdir: string): string {
  return subdir.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/**
 * Filters a list of collected files to only those within the targeted
 * subdirectory. Returns the original list unmodified if subdir is empty.
 *
 * Works with any object that has a `relativePath` string field, so it
 * can be called before or after the full CollectedFile type is defined
 * by the scan engine.
 *
 * @example
 *   filterBySubdirectory(files, "src/api")
 *   // keeps "src/api/route.ts", "src/api/utils/helper.ts"
 *   // drops  "src/components/Button.tsx", "README.md"
 */
export function filterBySubdirectory<T extends { relativePath: string }>(
  files: T[],
  subdir: string,
): T[] {
  const normalized = normalizeSubdir(subdir);
  if (!normalized) return files;

  const prefix = normalized + "/";

  return files.filter((file) => {
    const filePath = file.relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    return filePath === normalized || filePath.startsWith(prefix);
  });
}

/**
 * Returns true if at least one collected file lives under the given
 * subdirectory path. Used to validate user input before committing to a scan.
 */
export function subdirExists<T extends { relativePath: string }>(
  files: T[],
  subdir: string,
): boolean {
  return filterBySubdirectory(files, subdir).length > 0;
}
