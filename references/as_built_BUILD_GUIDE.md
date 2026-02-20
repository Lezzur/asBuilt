# as_built — Build Guide & Model Assignments

**Suite:** baryapps  
**Companion to:** as_built PRD v1.2 Final  
**Date:** February 2026

---

## Model Selection Philosophy

**Opus 4.6** — Use when the task involves: designing systems from scratch, writing complex business logic, orchestrating multiple services, handling edge cases with nuance, prompt engineering, or making architectural tradeoffs.

**Sonnet 4.5** — Use when the task involves: implementing well-known patterns (CRUD, auth flows, UI components), writing boilerplate, configuration, styling, documentation, or tasks where the approach is standard and well-documented.

**Cost consideration:** Opus is significantly more expensive per token. Using Sonnet for the ~60% of work that is pattern-based keeps costs down while reserving Opus for the ~40% that genuinely benefits from deeper reasoning.

---

## 1. Project Scaffolding & Configuration

| Task | PRD Section | Complexity | Model |
|------|------------|-----------|-------|
| Next.js project init (App Router + TypeScript) | 5, 21 | Low — standard setup | **Sonnet 4.5** |
| Tailwind CSS + shadcn/ui setup | 5 | Low — documented process | **Sonnet 4.5** |
| Firebase project config (Auth + Firestore + Storage) | 5, 21 | Low — standard config | **Sonnet 4.5** |
| Environment variable setup (.env.example) | 21.1 | Low — copy from PRD | **Sonnet 4.5** |
| Vercel project config (vercel.json, cron config) | 21.3 | Low — standard config | **Sonnet 4.5** |
| ESLint, Prettier, TypeScript config | 5 | Low — standard config | **Sonnet 4.5** |

## 2. Authentication

| Task | PRD Section | Complexity | Model |
|------|------------|-----------|-------|
| Firebase Auth setup (email/password) | 13.1 | Low — well-documented pattern | **Sonnet 4.5** |
| Auth context provider + hooks | 13.1 | Low — standard React pattern | **Sonnet 4.5** |
| Protected route middleware | 13.1 | Low — standard Next.js pattern | **Sonnet 4.5** |
| GitHub OAuth flow (initiate + callback) | 8.3, 13, 17 | Medium — multi-step OAuth with token storage | **Opus 4.6** |
| Suite-ready auth module design (extractable for baryapps) | 13.4 | Medium — needs forethought on abstraction | **Opus 4.6** |

## 3. Database & Data Model

| Task | PRD Section | Complexity | Model |
|------|------------|-----------|-------|
| Firestore collections setup (users, scans) | 12.1 | Low — direct from PRD schema | **Sonnet 4.5** |
| Firestore security rules | 12, 19 | Medium — needs careful permission logic | **Opus 4.6** |
| API key encryption module (AES-256 encrypt/decrypt) | 10.3 | Medium — security-critical, must be correct | **Opus 4.6** |
| Scan history management (100-scan cap, auto-delete oldest) | 12.2 | Low — simple FIFO logic | **Sonnet 4.5** |
| Firebase Cloud Storage lifecycle rules (1hr auto-delete) | 12.2, 19.3 | Low — config-based | **Sonnet 4.5** |

## 4. Core Scan Engine

| Task | PRD Section | Complexity | Model |
|------|------------|-----------|-------|
| File collection pipeline (read files, build tree) | 6.1, 8 | Medium — needs smart traversal and filtering | **Opus 4.6** |
| File filter system (.gitignore respect, default excludes) | 8, 18.6, 20 | Medium — many edge cases in ignore patterns | **Opus 4.6** |
| Subdirectory targeting logic | 8.5 | Low — path filtering | **Sonnet 4.5** |
| Token count estimation (pre-submission check) | 10.5, 21 | Low — simple tokenizer call | **Sonnet 4.5** |
| Prompt assembly (scan instructions template + file contents) | 11 | High — this is the core IP of the product | **Opus 4.6** |
| LLM abstraction layer (provider interface + adapters) | 10.3, 10.4 | Medium — needs clean abstraction design | **Opus 4.6** |
| Vercel AI SDK integration (Gemini, Claude, OpenAI adapters) | 10.1, 10.4 | Medium — three providers, unified interface | **Opus 4.6** |
| Background function processing (scan lifecycle) | 6.2 | High — async processing, status management, error recovery | **Opus 4.6** |
| Output parsing (split LLM response into separate documents) | 9 | Medium — structured extraction from LLM output | **Opus 4.6** |
| PRD drift analysis (prompt + comparison logic) | 9.4, 11 | High — complex prompt engineering | **Opus 4.6** |

## 5. Input Method Handlers

| Task | PRD Section | Complexity | Model |
|------|------------|-----------|-------|
| Zip upload handler (receive, extract, process, delete) | 8.1 | Low — standard file handling | **Sonnet 4.5** |
| Folder upload handler (webkitdirectory) | 8.2 | Low — similar to zip, browser API | **Sonnet 4.5** |
| GitHub repo fetcher (clone/API fetch via OAuth) | 8.3 | Medium — GitHub API, branch selection, error handling | **Opus 4.6** |
| PRD upload handler (text extraction from .md/.txt/.pdf/.docx) | 8.6 | Medium — multi-format text extraction | **Sonnet 4.5** |
| Temporary file cleanup (immediate + lifecycle safety net) | 19.2, 19.3 | Low — delete calls + config | **Sonnet 4.5** |

## 6. API Routes

| Task | PRD Section | Complexity | Model |
|------|------------|-----------|-------|
| POST /api/scan (initiate scan, trigger background function) | 17 | High — orchestrates entire scan flow | **Opus 4.6** |
| GET /api/scan/[id] (status polling endpoint) | 17 | Low — simple Firestore read | **Sonnet 4.5** |
| GET /api/scans (list user scans, paginated) | 17 | Low — standard query | **Sonnet 4.5** |
| GET /api/scan/[id]/download/[type] (download outputs) | 17 | Medium — includes PDF generation | **Sonnet 4.5** |
| DELETE /api/scan/[id] (delete scan) | 17 | Low — standard delete | **Sonnet 4.5** |
| POST /api/scan/cli (CLI-specific endpoint) | 17, 18 | Medium — auth token validation, payload handling | **Opus 4.6** |
| GET/PATCH /api/user/settings | 17 | Low — standard CRUD | **Sonnet 4.5** |
| GitHub OAuth routes (initiate + callback) | 17 | Medium — covered in Auth section | **Opus 4.6** |

## 7. PDF Generation

| Task | PRD Section | Complexity | Model |
|------|------------|-----------|-------|
| md-to-pdf setup with @sparticuz/chromium for Vercel | 9.3 | Medium — needs good library config | **Sonnet 4.5** |
| PDF generation with TOC and page numbers | 9.3 | Medium — CSS/config for structure | **Sonnet 4.5** |

## 8. Frontend — Pages & Components

| Task | PRD Section | Complexity | Model |
|------|------------|-----------|-------|
| Login page | 16.1 | Low — Firebase Auth UI | **Sonnet 4.5** |
| Dashboard page (scan history list, reminder banner, quick-scan CTA) | 16.1 | Medium — multiple dynamic components | **Sonnet 4.5** |
| New Scan page (input tabs, provider/tier picker, PRD upload, subdir field) | 16.1, 16.3 | Medium — multi-step form with conditional fields | **Sonnet 4.5** |
| Scan Processing screen (live log + progress bar) | 16.2 | Medium — real-time polling with good UX | **Sonnet 4.5** |
| Scan Detail page (view results, download buttons, metadata) | 16.1 | Low — display + download links | **Sonnet 4.5** |
| Settings page (reminders, API keys, GitHub connection) | 16.1 | Low — standard form | **Sonnet 4.5** |
| Documentation pages (/docs) | 15, 16.1 | Low — static content with markdown rendering | **Sonnet 4.5** |
| Development reminder banner component | 14.2 | Low — conditional banner UI | **Sonnet 4.5** |
| Overall UI design system and layout | 16.4 | Medium — sets visual tone for entire app | **Sonnet 4.5** |

## 9. CLI Companion (asbuilt-cli)

| Task | PRD Section | Complexity | Model |
|------|------------|-----------|-------|
| CLI project setup (npm package, bin config) | 18.1, 18.2 | Low — standard npm package scaffolding | **Sonnet 4.5** |
| Browser-based auth flow (login command → localhost callback) | 18.3 | High — tricky browser-to-CLI token handoff | **Opus 4.6** |
| Token storage (~/.asbuilt/config.json) | 18.3 | Low — file read/write | **Sonnet 4.5** |
| File collection + filtering (shared logic with web app) | 18.6 | Low — reuse from core engine | **Sonnet 4.5** |
| .asbuiltrc config file parsing and merge with CLI flags | 18.5 | Low — JSON parse + merge | **Sonnet 4.5** |
| Scan command (upload, poll, download results) | 18.4, 18.6 | Medium — full async flow with progress display | **Opus 4.6** |
| Terminal progress output (spinners, status updates) | 18.7 | Low — use ora or similar library | **Sonnet 4.5** |
| Update notification (update-notifier) | 18.2 | Low — library integration | **Sonnet 4.5** |
| History command | 18.4 | Low — API call + table display | **Sonnet 4.5** |

## 10. Development Reminder System

| Task | PRD Section | Complexity | Model |
|------|------------|-----------|-------|
| Vercel Cron job setup (daily trigger) | 14.1 | Low — config + simple function | **Sonnet 4.5** |
| Reminder check logic (lastActiveAt vs frequency threshold) | 14.1 | Low — date math | **Sonnet 4.5** |
| Resend email integration (send reminder emails) | 14.1 | Low — API call with template | **Sonnet 4.5** |
| Email template (motivational nudge with dashboard link) | 14.1 | Low — simple HTML email | **Sonnet 4.5** |
| Dashboard reminder banner (conditional display) | 14.2 | Low — covered in frontend section | **Sonnet 4.5** |
| User settings for reminders (toggle, frequency) | 14.3 | Low — covered in settings page | **Sonnet 4.5** |

## 11. Prompt Engineering

| Task | PRD Section | Complexity | Model |
|------|------------|-----------|-------|
| Agent output prompt template (AS_BUILT_AGENT.md) | 9.1, 9.5, 11 | High — core product quality depends on this | **Opus 4.6** |
| Human output prompt template (AS_BUILT_HUMAN.md) | 9.2, 9.5, 11 | High — must produce clear, accessible docs | **Opus 4.6** |
| PRD drift prompt template (PRD_DRIFT.md) | 9.4, 11 | High — complex comparison reasoning | **Opus 4.6** |
| Output format instructions (ensure parseable, structured response) | 9, 11 | High — reliability of output parsing depends on this | **Opus 4.6** |

## 12. User Documentation

| Task | PRD Section | Complexity | Model |
|------|------------|-----------|-------|
| Getting Started guide | 15.1 | Low — clear technical writing | **Sonnet 4.5** |
| Input method guides (zip, folder, GitHub, CLI) | 15.2 | Low — step-by-step instructions | **Sonnet 4.5** |
| CLI documentation | 15.3 | Low — command reference + examples | **Sonnet 4.5** |
| Output explanation docs | 15.4 | Low — describe each document type | **Sonnet 4.5** |
| FAQ and troubleshooting | 15.5 | Low — anticipate common issues | **Sonnet 4.5** |

## 13. Error Handling & Edge Cases

| Task | PRD Section | Complexity | Model |
|------|------------|-----------|-------|
| LLM retry logic (exponential backoff, 2 retries) | 21 | Medium — needs reliable async error handling | **Opus 4.6** |
| Partial output salvaging (incomplete LLM response) | 21 | High — graceful degradation from unpredictable input | **Opus 4.6** |
| Client-side upload validation (size, format) | 21 | Low — standard validation | **Sonnet 4.5** |
| Context window exceeded handling (pre-check + user guidance) | 21 | Medium — token estimation + UX messaging | **Sonnet 4.5** |
| GitHub error handling (auth, 404, rate limits) | 21 | Low — mapped error responses | **Sonnet 4.5** |

---

## Summary

### Model Distribution

| Model | Task Count | Percentage | Typical Work |
|-------|-----------|-----------|-------------|
| Opus 4.6 | 22 tasks | ~37% | Core engine, prompt engineering, architecture, complex integrations |
| Sonnet 4.5 | 38 tasks | ~63% | UI, config, standard patterns, CRUD, documentation, boilerplate |

### Recommended Build Order

| Phase | What to Build | Why This Order |
|-------|--------------|---------------|
| 1 | Project scaffolding + Firebase config + Auth | Foundation everything else depends on |
| 2 | Data model (Firestore collections + security rules) | Needed before any features can store data |
| 3 | Core scan engine (file collection, prompt assembly, LLM integration) | The heart of the product; validate it works before building around it |
| 4 | Prompt templates (agent, human, drift) | Core product quality; iterate until outputs are strong |
| 5 | Zip upload + folder upload handlers | Simplest input methods; lets you test end-to-end |
| 6 | Background processing + status polling | Required for production-like scan flow |
| 7 | API routes (scan, download, settings) | Wire up the backend endpoints |
| 8 | Frontend pages (dashboard, new scan, scan detail, settings) | Build the UI once the backend works |
| 9 | PDF generation | Enhancement to existing output |
| 10 | GitHub repo input (OAuth + fetcher) | Adds input method once core flow is solid |
| 11 | CLI companion | Can be built independently once API exists |
| 12 | Development reminder system (cron + Resend + banner) | Nice-to-have; can come last |
| 13 | User documentation | Write after features are stable |
| 14 | Error handling hardening + edge cases | Polish pass across the whole app |
