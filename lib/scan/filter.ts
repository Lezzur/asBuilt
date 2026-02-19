import ignore, { type Ignore } from "ignore";
import { readFile } from "fs/promises";
import { basename, extname, join, relative } from "path";

// ─── Hard-blocked patterns (.env files are NEVER sent to LLM) ────────────────

const HARD_BLOCKED_NAMES = new Set([".env"]);
const HARD_BLOCKED_PREFIX = ".env.";

function isHardBlocked(filename: string): boolean {
  if (HARD_BLOCKED_NAMES.has(filename)) return true;
  if (filename.startsWith(HARD_BLOCKED_PREFIX)) return true;
  return false;
}

// ─── Default excluded directories ────────────────────────────────────────────

const EXCLUDED_DIRS = new Set([
  // Package managers & dependencies
  "node_modules",
  "bower_components",
  ".pnp",
  ".yarn",
  "vendor",
  // Version control
  ".git",
  ".svn",
  ".hg",
  ".fossil",
  // Build outputs
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  "target",
  "bin",
  "obj",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "coverage",
  ".nyc_output",
  "htmlcov",
  ".tox",
  // Virtual environments
  ".venv",
  "venv",
  "env",
  ".virtualenv",
  ".conda",
  // IDE & editor
  ".idea",
  ".vscode",
  ".vs",
  ".settings",
  // OS
  ".DS_Store",
  // Infrastructure & cache
  ".docker",
  ".terraform",
  ".serverless",
  ".vercel",
  ".firebase",
  "tmp",
  "temp",
  ".cache",
  ".parcel-cache",
  ".turbo",
]);

// ─── Default excluded file extensions ────────────────────────────────────────

const EXCLUDED_EXTENSIONS = new Set([
  // Lock files (handled by name below)
  // Binary & compiled
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".o",
  ".obj",
  ".a",
  ".lib",
  ".class",
  ".jar",
  ".war",
  ".ear",
  ".pyc",
  ".pyo",
  ".pyd",
  ".wasm",
  // Media
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".svg",
  ".mp4",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".mp3",
  ".wav",
  ".ogg",
  ".flac",
  ".aac",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".eot",
  // Archives
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".rar",
  ".7z",
  ".tgz",
  // Database
  ".sqlite",
  ".sqlite3",
  ".db",
  ".mdb",
  ".accdb",
  // Sourcemaps & minified
  ".map",
  ".min.js",
  ".min.css",
  // Certificates & secrets
  ".pem",
  ".key",
  ".crt",
  ".cer",
  ".p12",
  ".pfx",
  ".jks",
  // Documents & design
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".sketch",
  ".fig",
  ".psd",
  ".ai",
  // Log files
  ".log",
]);

// Compound extensions that need special matching
const EXCLUDED_COMPOUND_EXTENSIONS = [".js.map", ".css.map"];
const EXCLUDED_SUFFIXES = [".bundle.js", ".chunk.js"];

// ─── Lock files (by exact name) ──────────────────────────────────────────────

const LOCK_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Pipfile.lock",
  "poetry.lock",
  "composer.lock",
  "Gemfile.lock",
  "Cargo.lock",
  "go.sum",
]);

// ─── Cache/lint files by name ────────────────────────────────────────────────

const EXCLUDED_FILENAMES = new Set([
  ".eslintcache",
  ".stylelintcache",
  "Thumbs.db",
  "Desktop.ini",
  "ehthumbs.db",
  ".DS_Store",
  ".project",
  ".classpath",
]);

// ─── Editor swap/backup patterns ─────────────────────────────────────────────

function isEditorTempFile(filename: string): boolean {
  return (
    filename.endsWith(".swp") ||
    filename.endsWith(".swo") ||
    filename.endsWith("~")
  );
}

// ─── Egg-info directory pattern ──────────────────────────────────────────────

function isEggInfoDir(name: string): boolean {
  return name.endsWith(".egg-info");
}

// ─── Large data file extensions (excluded above 1MB threshold) ───────────────

const LARGE_DATA_EXTENSIONS = new Set([".csv", ".xml"]);

// JSON files over 1MB are excluded unless they're config files
const CONFIG_JSON_NAMES = new Set([
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "composer.json",
  ".eslintrc.json",
  ".prettierrc.json",
  "firebase.json",
  "vercel.json",
]);

const SIZE_THRESHOLD = 1_048_576; // 1MB

// ─── High-signal files (always included) ─────────────────────────────────────

const HIGH_SIGNAL_NAMES = new Set([
  // Dependency manifests
  "package.json",
  "requirements.txt",
  "setup.py",
  "setup.cfg",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "Gemfile",
  "composer.json",
  "build.gradle",
  "pom.xml",
  "CMakeLists.txt",
  "Makefile",
  // Config files
  "tsconfig.json",
  "jsconfig.json",
  "Dockerfile",
  "vercel.json",
  "netlify.toml",
  "fly.toml",
  "firebase.json",
  ".firebaserc",
  // Documentation
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
]);

const HIGH_SIGNAL_PREFIXES = [
  "next.config",
  "nuxt.config",
  "vite.config",
  "webpack.config",
  "tailwind.config",
  "postcss.config",
  ".eslintrc",
  ".prettierrc",
  "docker-compose",
  "drizzle.config",
];

function isHighSignal(filename: string, relativePath: string): boolean {
  if (HIGH_SIGNAL_NAMES.has(filename)) return true;
  for (const prefix of HIGH_SIGNAL_PREFIXES) {
    if (filename.startsWith(prefix)) return true;
  }
  // CI/CD workflows
  if (relativePath.match(/^\.github\/workflows\/.*\.yml$/)) return true;
  // Prisma schema
  if (relativePath === "prisma/schema.prisma") return true;
  // Docs markdown
  if (relativePath.match(/^docs\/.*\.md$/)) return true;
  return false;
}

// ─── Core filter logic ───────────────────────────────────────────────────────

export interface FilterOptions {
  /** Absolute path to the project root. */
  projectRoot: string;
  /** Optional subdirectory to scope the scan to (relative to projectRoot). */
  subdirectory?: string | null;
}

export interface FilterResult {
  included: boolean;
  /** Reason for exclusion (undefined if included). */
  reason?: string;
  /** Whether this file is considered high-signal. */
  highSignal: boolean;
}

export interface FileFilter {
  /** Check whether a relative path should be included or excluded. */
  check(relativePath: string, sizeBytes: number): FilterResult;
  /** Check whether a directory name should be descended into. */
  shouldEnterDirectory(dirName: string): boolean;
}

/**
 * Creates a file filter that respects:
 * 1. Hard-blocked .env files (absolute, cannot be overridden)
 * 2. Default ignore patterns from the as_built PRD
 * 3. Project .gitignore rules
 * 4. Subdirectory targeting
 * 5. High-signal file prioritization
 */
export async function createFileFilter(
  options: FilterOptions,
): Promise<FileFilter> {
  const { projectRoot, subdirectory } = options;

  // Load .gitignore if present
  let gitignore: Ignore | null = null;
  try {
    const gitignorePath = join(projectRoot, ".gitignore");
    const content = await readFile(gitignorePath, "utf-8");
    gitignore = ignore().add(content);
  } catch {
    // No .gitignore — that's fine
  }

  // If there's a subdirectory, normalize it
  const subdir = subdirectory?.replace(/^\/+|\/+$/g, "") || null;

  return {
    shouldEnterDirectory(dirName: string): boolean {
      // Never enter excluded directories
      if (EXCLUDED_DIRS.has(dirName)) return false;
      if (isEggInfoDir(dirName)) return false;
      return true;
    },

    check(relativePath: string, sizeBytes: number): FilterResult {
      const filename = basename(relativePath);
      const ext = extname(filename).toLowerCase();

      // ── 1. Hard block: .env files are NEVER allowed ──
      if (isHardBlocked(filename)) {
        return {
          included: false,
          reason: "hard-blocked (.env)",
          highSignal: false,
        };
      }

      // ── 2. Subdirectory targeting ──
      if (subdir) {
        if (
          !relativePath.startsWith(subdir + "/") &&
          relativePath !== subdir
        ) {
          return {
            included: false,
            reason: `outside subdirectory: ${subdir}`,
            highSignal: false,
          };
        }
      }

      // ── 3. .gitignore check ──
      if (gitignore && gitignore.ignores(relativePath)) {
        return {
          included: false,
          reason: ".gitignore",
          highSignal: false,
        };
      }

      // ── 4. Lock files ──
      if (LOCK_FILES.has(filename)) {
        return {
          included: false,
          reason: "lock file",
          highSignal: false,
        };
      }

      // ── 5. Excluded filenames ──
      if (EXCLUDED_FILENAMES.has(filename)) {
        return {
          included: false,
          reason: "excluded filename",
          highSignal: false,
        };
      }

      // ── 6. Editor temp files ──
      if (isEditorTempFile(filename)) {
        return {
          included: false,
          reason: "editor temp file",
          highSignal: false,
        };
      }

      // ── 7. Compound extensions (.js.map, .css.map) ──
      for (const compoundExt of EXCLUDED_COMPOUND_EXTENSIONS) {
        if (filename.endsWith(compoundExt)) {
          return {
            included: false,
            reason: `excluded extension: ${compoundExt}`,
            highSignal: false,
          };
        }
      }

      // ── 8. Bundle/chunk suffixes ──
      for (const suffix of EXCLUDED_SUFFIXES) {
        if (filename.endsWith(suffix)) {
          return {
            included: false,
            reason: `excluded suffix: ${suffix}`,
            highSignal: false,
          };
        }
      }

      // ── 9. Excluded extensions ──
      if (EXCLUDED_EXTENSIONS.has(ext)) {
        return {
          included: false,
          reason: `excluded extension: ${ext}`,
          highSignal: false,
        };
      }

      // ── 10. Large data files (>1MB threshold) ──
      if (LARGE_DATA_EXTENSIONS.has(ext) && sizeBytes > SIZE_THRESHOLD) {
        return {
          included: false,
          reason: `data file over 1MB (${(sizeBytes / 1_048_576).toFixed(1)}MB)`,
          highSignal: false,
        };
      }

      // JSON: over 1MB excluded unless it's a config file
      if (
        ext === ".json" &&
        sizeBytes > SIZE_THRESHOLD &&
        !CONFIG_JSON_NAMES.has(filename)
      ) {
        return {
          included: false,
          reason: `JSON file over 1MB (${(sizeBytes / 1_048_576).toFixed(1)}MB)`,
          highSignal: false,
        };
      }

      // SQL: migration files included, dumps (>1MB) excluded
      if (ext === ".sql" && sizeBytes > SIZE_THRESHOLD) {
        return {
          included: false,
          reason: `SQL file over 1MB (likely a dump)`,
          highSignal: false,
        };
      }

      // ── 11. Determine high-signal status ──
      const highSignal = isHighSignal(filename, relativePath);

      return { included: true, highSignal };
    },
  };
}
