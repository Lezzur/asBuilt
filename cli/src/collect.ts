/**
 * Local file collection and filtering for CLI scans.
 *
 * Mirrors the server-side filter logic from lib/scan/filter.ts and
 * lib/scan/collect.ts. The CLI collects files locally, applies the
 * same exclusion rules, and sends only relevant content to the API.
 */

import { readdir, readFile, stat } from "fs/promises";
import { basename, extname, join, relative } from "path";
import ignore, { type Ignore } from "ignore";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CollectedFile {
  relativePath: string;
  content: string;
  sizeBytes: number;
  highSignal: boolean;
}

export interface CollectionResult {
  files: CollectedFile[];
  excludedCount: number;
  totalSizeBytes: number;
}

// ─── Hard-blocked patterns ──────────────────────────────────────────────────

const HARD_BLOCKED_NAMES = new Set([".env"]);
const HARD_BLOCKED_PREFIX = ".env.";

function isHardBlocked(filename: string): boolean {
  if (HARD_BLOCKED_NAMES.has(filename)) return true;
  if (filename.startsWith(HARD_BLOCKED_PREFIX)) return true;
  return false;
}

// ─── Excluded directories ───────────────────────────────────────────────────

const EXCLUDED_DIRS = new Set([
  "node_modules", "bower_components", ".pnp", ".yarn", "vendor",
  ".git", ".svn", ".hg", ".fossil",
  "dist", "build", "out", ".next", ".nuxt", ".output", ".svelte-kit",
  "target", "bin", "obj", "__pycache__", ".pytest_cache", ".mypy_cache",
  ".ruff_cache", "coverage", ".nyc_output", "htmlcov", ".tox",
  ".venv", "venv", "env", ".virtualenv", ".conda",
  ".idea", ".vscode", ".vs", ".settings",
  ".DS_Store",
  ".docker", ".terraform", ".serverless", ".vercel", ".firebase",
  "tmp", "temp", ".cache", ".parcel-cache", ".turbo",
]);

// ─── Excluded extensions ────────────────────────────────────────────────────

const EXCLUDED_EXTENSIONS = new Set([
  ".exe", ".dll", ".so", ".dylib", ".o", ".obj", ".a", ".lib",
  ".class", ".jar", ".war", ".ear", ".pyc", ".pyo", ".pyd", ".wasm",
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".svg",
  ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm",
  ".mp3", ".wav", ".ogg", ".flac", ".aac",
  ".ttf", ".otf", ".woff", ".woff2", ".eot",
  ".zip", ".tar", ".gz", ".bz2", ".rar", ".7z", ".tgz",
  ".sqlite", ".sqlite3", ".db", ".mdb", ".accdb",
  ".map", ".min.js", ".min.css",
  ".pem", ".key", ".crt", ".cer", ".p12", ".pfx", ".jks",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".sketch", ".fig", ".psd", ".ai",
  ".log",
]);

const EXCLUDED_COMPOUND_EXTENSIONS = [".js.map", ".css.map"];
const EXCLUDED_SUFFIXES = [".bundle.js", ".chunk.js"];

// ─── Lock files ─────────────────────────────────────────────────────────────

const LOCK_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "Pipfile.lock", "poetry.lock", "composer.lock",
  "Gemfile.lock", "Cargo.lock", "go.sum",
]);

// ─── Excluded filenames ─────────────────────────────────────────────────────

const EXCLUDED_FILENAMES = new Set([
  ".eslintcache", ".stylelintcache", "Thumbs.db",
  "Desktop.ini", "ehthumbs.db", ".DS_Store",
  ".project", ".classpath",
]);

function isEditorTempFile(filename: string): boolean {
  return filename.endsWith(".swp") || filename.endsWith(".swo") || filename.endsWith("~");
}

function isEggInfoDir(name: string): boolean {
  return name.endsWith(".egg-info");
}

// ─── Large data files ───────────────────────────────────────────────────────

const LARGE_DATA_EXTENSIONS = new Set([".csv", ".xml"]);
const CONFIG_JSON_NAMES = new Set([
  "package.json", "tsconfig.json", "jsconfig.json", "composer.json",
  ".eslintrc.json", ".prettierrc.json", "firebase.json", "vercel.json",
]);
const SIZE_THRESHOLD = 1_048_576; // 1MB

// ─── High-signal files ──────────────────────────────────────────────────────

const HIGH_SIGNAL_NAMES = new Set([
  "package.json", "requirements.txt", "setup.py", "setup.cfg",
  "pyproject.toml", "Cargo.toml", "go.mod", "Gemfile",
  "composer.json", "build.gradle", "pom.xml", "CMakeLists.txt", "Makefile",
  "tsconfig.json", "jsconfig.json", "Dockerfile", "vercel.json",
  "netlify.toml", "fly.toml", "firebase.json", ".firebaserc",
  "README.md", "CHANGELOG.md", "CONTRIBUTING.md",
]);

const HIGH_SIGNAL_PREFIXES = [
  "next.config", "nuxt.config", "vite.config", "webpack.config",
  "tailwind.config", "postcss.config", ".eslintrc", ".prettierrc",
  "docker-compose", "drizzle.config",
];

function isHighSignal(filename: string, relativePath: string): boolean {
  if (HIGH_SIGNAL_NAMES.has(filename)) return true;
  for (const prefix of HIGH_SIGNAL_PREFIXES) {
    if (filename.startsWith(prefix)) return true;
  }
  if (/^\.github\/workflows\/.*\.yml$/.test(relativePath)) return true;
  if (relativePath === "prisma/schema.prisma") return true;
  if (/^docs\/.*\.md$/.test(relativePath)) return true;
  return false;
}

// ─── Filter check ───────────────────────────────────────────────────────────

interface FilterResult {
  included: boolean;
  highSignal: boolean;
}

function checkFile(
  relativePath: string,
  sizeBytes: number,
  gitignore: Ignore | null,
  subdir: string | null,
): FilterResult {
  const filename = basename(relativePath);
  const ext = extname(filename).toLowerCase();

  if (isHardBlocked(filename)) return { included: false, highSignal: false };

  if (subdir) {
    if (!relativePath.startsWith(subdir + "/") && relativePath !== subdir) {
      return { included: false, highSignal: false };
    }
  }

  if (gitignore && gitignore.ignores(relativePath)) {
    return { included: false, highSignal: false };
  }

  if (LOCK_FILES.has(filename)) return { included: false, highSignal: false };
  if (EXCLUDED_FILENAMES.has(filename)) return { included: false, highSignal: false };
  if (isEditorTempFile(filename)) return { included: false, highSignal: false };

  for (const compoundExt of EXCLUDED_COMPOUND_EXTENSIONS) {
    if (filename.endsWith(compoundExt)) return { included: false, highSignal: false };
  }
  for (const suffix of EXCLUDED_SUFFIXES) {
    if (filename.endsWith(suffix)) return { included: false, highSignal: false };
  }

  if (EXCLUDED_EXTENSIONS.has(ext)) return { included: false, highSignal: false };

  if (LARGE_DATA_EXTENSIONS.has(ext) && sizeBytes > SIZE_THRESHOLD) {
    return { included: false, highSignal: false };
  }
  if (ext === ".json" && sizeBytes > SIZE_THRESHOLD && !CONFIG_JSON_NAMES.has(filename)) {
    return { included: false, highSignal: false };
  }
  if (ext === ".sql" && sizeBytes > SIZE_THRESHOLD) {
    return { included: false, highSignal: false };
  }

  return { included: true, highSignal: isHighSignal(filename, relativePath) };
}

// ─── Directory walker ───────────────────────────────────────────────────────

async function walkDirectory(
  dirPath: string,
  projectRoot: string,
  gitignore: Ignore | null,
  subdir: string | null,
  files: CollectedFile[],
  stats: { excluded: number },
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const relPath = relative(projectRoot, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name) || isEggInfoDir(entry.name)) continue;
      await walkDirectory(fullPath, projectRoot, gitignore, subdir, files, stats);
    } else if (entry.isFile()) {
      let fileStat;
      try {
        fileStat = await stat(fullPath);
      } catch {
        stats.excluded++;
        continue;
      }

      const result = checkFile(relPath, fileStat.size, gitignore, subdir);
      if (!result.included) {
        stats.excluded++;
        continue;
      }

      let content: string;
      try {
        content = await readFile(fullPath, "utf-8");
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

// ─── Public API ─────────────────────────────────────────────────────────────

export async function collectFiles(
  projectRoot: string,
  subdirectory?: string | null,
): Promise<CollectionResult> {
  // Load .gitignore if present
  let gitignore: Ignore | null = null;
  try {
    const gitignorePath = join(projectRoot, ".gitignore");
    const content = await readFile(gitignorePath, "utf-8");
    gitignore = ignore().add(content);
  } catch {
    // No .gitignore
  }

  const subdir = subdirectory?.replace(/^\/+|\/+$/g, "") || null;
  const files: CollectedFile[] = [];
  const stats = { excluded: 0 };

  await walkDirectory(projectRoot, projectRoot, gitignore, subdir, files, stats);

  // Sort: high-signal first, then alphabetical
  files.sort((a, b) => {
    if (a.highSignal && !b.highSignal) return -1;
    if (!a.highSignal && b.highSignal) return 1;
    return a.relativePath.localeCompare(b.relativePath);
  });

  const totalSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);

  return { files, excludedCount: stats.excluded, totalSizeBytes };
}
