# as_built — Default Scan Ignore List

**Suite:** baryapps  
**Companion to:** as_built PRD v1.2 Final  
**Date:** February 2026

---

## Purpose

This file defines the default files, directories, and patterns that as_built excludes from scanning. These are files that add noise without meaningful signal for code analysis. The ignore system works in layers: these defaults apply first, then any project `.gitignore` rules are respected on top.

---

## Directories Always Excluded

### Package managers & dependencies
- `node_modules/`
- `bower_components/`
- `.pnp/`
- `.yarn/`
- `vendor/` (PHP/Ruby/Go)
- `packages/*/node_modules/`

### Version control
- `.git/`
- `.svn/`
- `.hg/`
- `.fossil`

### Build outputs & compiled files
- `dist/`
- `build/`
- `out/`
- `.next/`
- `.nuxt/`
- `.output/`
- `.svelte-kit/`
- `target/` (Rust/Java)
- `bin/` (Go/C)
- `obj/` (C#/.NET)
- `__pycache__/`
- `*.egg-info/`
- `.pytest_cache/`
- `.mypy_cache/`
- `.ruff_cache/`
- `coverage/`
- `.nyc_output/`
- `htmlcov/`
- `.tox/`

### Virtual environments
- `.venv/`
- `venv/`
- `env/`
- `.env/` (the directory, not .env files)
- `.virtualenv/`
- `.conda/`

### IDE & editor files
- `.idea/`
- `.vscode/`
- `.vs/`
- `*.swp`
- `*.swo`
- `*~`
- `.project`
- `.classpath`
- `.settings/`

### OS files
- `.DS_Store`
- `Thumbs.db`
- `Desktop.ini`
- `ehthumbs.db`

### Container & infrastructure
- `.docker/`
- `.terraform/`
- `.serverless/`
- `.vercel/`
- `.firebase/`

### Temporary & cache
- `tmp/`
- `temp/`
- `.cache/`
- `.parcel-cache/`
- `.turbo/`
- `.eslintcache`
- `.stylelintcache`

---

## Files by Extension Always Excluded

### Lock files (dependency-pinning, not architecture-relevant)
- `package-lock.json`
- `yarn.lock`
- `pnpm-lock.yaml`
- `Pipfile.lock`
- `poetry.lock`
- `composer.lock`
- `Gemfile.lock`
- `Cargo.lock`
- `go.sum`

### Binary & compiled files
- `*.exe`, `*.dll`, `*.so`, `*.dylib`
- `*.o`, `*.obj`, `*.a`, `*.lib`
- `*.class`, `*.jar`, `*.war`, `*.ear`
- `*.pyc`, `*.pyo`, `*.pyd`
- `*.wasm`

### Media files (images, video, audio)
- `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.bmp`, `*.ico`, `*.webp`
- `*.svg` (excluded by default; SVGs in component libraries may be relevant but are usually numerous and noisy)
- `*.mp4`, `*.avi`, `*.mov`, `*.wmv`, `*.flv`, `*.webm`
- `*.mp3`, `*.wav`, `*.ogg`, `*.flac`, `*.aac`
- `*.ttf`, `*.otf`, `*.woff`, `*.woff2`, `*.eot`

### Archives
- `*.zip`, `*.tar`, `*.gz`, `*.bz2`, `*.rar`, `*.7z`
- `*.tgz`

### Database files
- `*.sqlite`, `*.sqlite3`, `*.db`
- `*.mdb`, `*.accdb`

### Large data files
- `*.csv` (over 1MB)
- `*.json` (over 1MB, except package.json and config files)
- `*.xml` (over 1MB)
- `*.log`
- `*.sql` (migration files ARE included; database dumps are excluded)

### Sourcemaps & minified/bundled files
- `*.map`
- `*.js.map`
- `*.css.map`
- `*.min.js`
- `*.min.css`
- `*.bundle.js`
- `*.chunk.js`

### Certificates & secrets
- `*.pem`, `*.key`, `*.crt`, `*.cer`
- `*.p12`, `*.pfx`
- `*.jks`

### Documents & design files
- `*.pdf`
- `*.doc`, `*.docx`, `*.xls`, `*.xlsx`, `*.ppt`, `*.pptx`
- `*.sketch`, `*.fig`, `*.psd`, `*.ai`

### Environment files (HARD BLOCK)
- `.env`
- `.env.*` (all env variants)
- **NEVER sent to LLM under any circumstances. This rule cannot be overridden.**

---

## Files Always INCLUDED (High-Signal)

These files are always included because they carry critical architectural information:

### Dependency manifests
- `package.json`
- `requirements.txt`, `setup.py`, `setup.cfg`, `pyproject.toml`
- `Cargo.toml`
- `go.mod`
- `Gemfile`
- `composer.json`
- `build.gradle`, `pom.xml`
- `CMakeLists.txt`
- `Makefile`

### Configuration files
- `tsconfig.json`, `jsconfig.json`
- `next.config.*`, `nuxt.config.*`, `vite.config.*`, `webpack.config.*`
- `tailwind.config.*`, `postcss.config.*`
- `.eslintrc.*`, `.prettierrc.*`
- `Dockerfile`, `docker-compose.*`
- `vercel.json`, `netlify.toml`, `fly.toml`
- `firebase.json`, `.firebaserc`
- `prisma/schema.prisma`
- `drizzle.config.*`
- `.github/workflows/*.yml` (CI/CD config)

### Documentation in repo
- `README.md`, `README.*`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `docs/**/*.md`

---

## Notes

1. The `.gitignore` file in the project root is always respected. If a file matches `.gitignore`, it is excluded even if it's on the "always included" list above.
2. `.env` files are NEVER sent to the LLM, even if the user explicitly tries to include them. This is a hard security rule.
3. The size threshold for large files (CSV, JSON, XML) is 1MB. Files over this threshold are excluded to conserve context window space.
4. For v2, users will be able to customize this list (add/remove patterns).
