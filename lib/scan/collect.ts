import { readdir, readFile, stat } from "fs/promises";
import { join, relative } from "path";
import { createFileFilter, type FileFilter } from "./filter";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CollectedFile {
  /** Path relative to the project root (forward-slash separated). */
  relativePath: string;
  /** Raw file content as UTF-8 string. */
  content: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** Whether this file is high-signal (config, manifest, docs). */
  highSignal: boolean;
}

export interface CollectionResult {
  /** All files that passed filtering. */
  files: CollectedFile[];
  /** Directory tree as a flat list of relative paths (all files, not just included). */
  tree: string[];
  /** Number of files that were scanned but excluded by filters. */
  excludedCount: number;
  /** Total size of included files in bytes. */
  totalSizeBytes: number;
}

export interface CollectOptions {
  /** Absolute path to the project root directory. */
  projectRoot: string;
  /** Optional subdirectory within the project to scope the scan. */
  subdirectory?: string | null;
}

// ─── Directory walker ────────────────────────────────────────────────────────

async function walkDirectory(
  dirPath: string,
  projectRoot: string,
  filter: FileFilter,
  files: CollectedFile[],
  tree: string[],
  stats: { excluded: number },
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    // Permission denied or other read error — skip this directory
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const relPath = relative(projectRoot, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (!filter.shouldEnterDirectory(entry.name)) {
        continue;
      }
      tree.push(relPath + "/");
      await walkDirectory(fullPath, projectRoot, filter, files, tree, stats);
    } else if (entry.isFile()) {
      tree.push(relPath);

      let fileStat;
      try {
        fileStat = await stat(fullPath);
      } catch {
        stats.excluded++;
        continue;
      }

      const result = filter.check(relPath, fileStat.size);
      if (!result.included) {
        stats.excluded++;
        continue;
      }

      // Read file content — skip binary/unreadable files gracefully
      let content: string;
      try {
        content = await readFile(fullPath, "utf-8");
        // Quick binary check: if there are null bytes in the first 8KB, skip
        if (content.slice(0, 8192).includes("\0")) {
          stats.excluded++;
          continue;
        }
      } catch {
        stats.excluded++;
        continue;
      }

      files.push({
        relativePath: relPath,
        content,
        sizeBytes: fileStat.size,
        highSignal: result.highSignal,
      });
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Collects all files from a project directory, applying the full filter
 * pipeline (default ignores, .gitignore, subdirectory targeting, hard blocks).
 *
 * Returns files sorted with high-signal files first, then alphabetically.
 */
export async function collectFiles(
  options: CollectOptions,
): Promise<CollectionResult> {
  const { projectRoot, subdirectory } = options;

  const filter = await createFileFilter({ projectRoot, subdirectory });

  const files: CollectedFile[] = [];
  const tree: string[] = [];
  const stats = { excluded: 0 };

  await walkDirectory(projectRoot, projectRoot, filter, files, tree, stats);

  // Sort: high-signal files first, then alphabetical by path
  files.sort((a, b) => {
    if (a.highSignal && !b.highSignal) return -1;
    if (!a.highSignal && b.highSignal) return 1;
    return a.relativePath.localeCompare(b.relativePath);
  });

  const totalSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);

  return {
    files,
    tree: tree.sort(),
    excludedCount: stats.excluded,
    totalSizeBytes,
  };
}
