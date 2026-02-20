# as_built — Product Requirements Document

**Suite:** baryapps  
**Version:** 1.2 — Final  
**Date:** February 2026  
**Status:** All design decisions resolved. Build-ready.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Product Overview](#3-product-overview)
4. [Target Users](#4-target-users)
5. [Tech Stack](#5-tech-stack)
6. [Architecture](#6-architecture)
7. [Core Features (v1)](#7-core-features-v1)
8. [Input Methods](#8-input-methods)
9. [Output Specification](#9-output-specification)
10. [LLM Integration](#10-llm-integration)
11. [Scan Instructions (Prompt Engine)](#11-scan-instructions-prompt-engine)
12. [Data Model](#12-data-model)
13. [Authentication & API Key Management](#13-authentication--api-key-management)
14. [Development Reminder System](#14-development-reminder-system)
15. [User Documentation](#15-user-documentation)
16. [UI/UX Specification](#16-uiux-specification)
17. [API Specification](#17-api-specification)
18. [CLI Companion](#18-cli-companion)
19. [File Handling & Privacy](#19-file-handling--privacy)
20. [Default Scan Ignore List](#20-default-scan-ignore-list)
21. [Error Handling](#21-error-handling)
22. [Configuration & Environment](#22-configuration--environment)
23. [Limits & Constraints](#23-limits--constraints)
24. [Version Roadmap](#24-version-roadmap)
25. [Resolved Design Decisions](#25-resolved-design-decisions)

---

## 1. Executive Summary

as_built is a web application (part of the baryapps suite) that accepts a codebase and produces comprehensive, AI-generated documentation describing what has actually been built. It solves the universal problem of documentation drift — the gap between what a PRD describes and what the code actually does after weeks or months of development.

The tool generates two primary outputs: an agent-optimized technical reference (AS_BUILT_AGENT.md) designed to give AI coding assistants full project context, and a human-readable overview (AS_BUILT_HUMAN.md / PDF with table of contents and page numbers) that any stakeholder can understand. An optional third output (PRD_DRIFT.md) compares the current build against an original PRD to surface deviations.

v1 is a personal tool with authentication in place. v2 introduces public access with a Stripe payment layer. v3 integrates as_built into the baryapps collection with shared auth and billing.

All design decisions have been resolved. This document is build-ready.

---

## 2. Problem Statement

Software projects evolve during development. Features get added, cut, or changed. Architecture decisions shift. The original PRD becomes a historical artifact that no longer reflects reality. This creates several problems:

- Onboarding new developers or AI agents requires manual walkthroughs of the codebase.
- Stakeholders lose visibility into what was actually built versus what was planned.
- Developers themselves lose track of the full picture as projects grow.
- Handing off a project to a new team or AI agent requires significant context-building effort.

as_built eliminates this by generating an accurate, structured snapshot of the project as it exists right now, directly from the code.

---

## 3. Product Overview

| Field | Value |
|-------|-------|
| Product Name | as_built |
| Suite | baryapps |
| Type | Web application with CLI companion |
| Deployment | Git → Vercel (Pro plan for production; local dev has no limits) |
| Database/Auth | Firebase (Firestore + Firebase Auth) |
| Email Service | Resend |
| PDF Generation | md-to-pdf (Puppeteer-based, free, high-quality output) |
| Core Function | Accept a codebase, analyze it via LLM, produce structured documentation |
| Domain | [placeholder — TBD] |

---

## 4. Target Users

### 4.1 Primary: Solo Developers & Small Teams

Developers who work on multiple projects and need a quick way to generate or refresh documentation. They often context-switch between projects and need to re-orient themselves or bring in AI assistance.

### 4.2 Secondary: Technical Leads & Engineering Managers

People who need to understand the current state of a project without reading every file. They want a high-level overview they can skim to make decisions.

### 4.3 Tertiary: Non-Technical Stakeholders

Product managers, founders, and business stakeholders who need to understand what an engineering team has built, described in plain language they can follow.

### 4.4 AI Agents

AI coding assistants (Claude Code, Cursor, GitHub Copilot, etc.) that need structured project context before performing work. The AS_BUILT_AGENT.md output is specifically optimized for this use case.

---

## 5. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js (App Router) + TypeScript | Native Vercel support, SSR/CSR flexibility, API routes built-in |
| Styling | Tailwind CSS + shadcn/ui | Rapid development, professional appearance, accessible components |
| Backend API | Next.js API Routes + Background Functions | Co-located with frontend, serverless on Vercel, background functions for long LLM calls |
| Database | Firebase Firestore | Document-based (maps well to scan records), generous free tier |
| Authentication | Firebase Auth | Simple setup, supports multiple auth providers, suite-ready |
| File Storage | Firebase Cloud Storage | Temporary upload processing with lifecycle auto-deletion |
| LLM Integration | Vercel AI SDK | Unified API across Gemini, Claude, and OpenAI providers |
| PDF Generation | md-to-pdf | Free, Puppeteer-based, excellent output quality, supports TOC and page numbers |
| Email | Resend | Developer-friendly API, generous free tier, good deliverability |
| Hosting | Vercel (Pro plan for production) | Git-push deployment, edge network, 300s background functions |
| CLI | Node.js (npm package) | Cross-platform, same JS ecosystem, easy auth token management |
| GitHub Integration | GitHub OAuth | Clean UX for private repo access |

---

## 6. Architecture

### 6.1 High-Level Flow

1. User provides a codebase (zip upload, folder upload, GitHub repo URL, or CLI).
2. The server receives and temporarily stores the files.
3. File collection and filtering: noise files are excluded per the Default Scan Ignore List (Section 20). High-signal files are prioritized (entry points, configs, dependency manifests). For monorepos, only the specified subdirectory is scanned.
4. The filtered file contents are assembled into a structured prompt using the baked-in scan instructions template.
5. The prompt is sent to the user's selected LLM provider via a Vercel background function (up to 300 seconds).
6. The LLM returns the generated documentation.
7. The outputs are parsed, stored in Firestore, and the scan status is updated to completed.
8. The client (web or CLI) detects completion via polling and presents download links.
9. Temporary project files are immediately deleted.

### 6.2 Background Processing Architecture

LLM calls can take 30–120+ seconds, which exceeds standard Vercel serverless function limits. The architecture uses Vercel's background functions (available on the Pro plan, up to 300 seconds). For local development, there are no timeout limits.

- **POST /api/scan:** validates input, creates a scan record with status "pending," triggers the background function, and immediately returns the scan ID.
- **Background function:** performs file processing, prompt assembly, LLM call, output parsing, and writes results to Firestore. Updates status to "completed" or "failed."
- **Client polling:** the web UI and CLI poll GET /api/scan/[id] every 3–5 seconds until status changes from "processing."

### 6.3 Key Architectural Decisions

- **Stateless processing:** The app never retains user codebases. Files exist only in memory or temporary storage during processing, then are purged.
- **LLM abstraction layer:** A common interface wraps all LLM providers. Each provider has an adapter. Swapping or adding providers requires only a new adapter.
- **Prompt template baked in:** The scan instructions (what to analyze, how to structure output) are hardcoded in v1. This ensures consistent, high-quality output without requiring user configuration.
- **Suite-ready auth:** Firebase Auth is implemented in a way that can be extracted into a shared auth layer when baryapps materializes in v3.
- **Subdirectory targeting:** For monorepos or multi-project directories, users can specify a subdirectory path. Only that subtree is scanned.

---

## 7. Core Features (v1)

| Feature | Description | Priority |
|---------|-------------|----------|
| Full Project Scan | Analyze an entire codebase and generate structured documentation | P0 |
| Dual Output (Agent + Human) | Generate AS_BUILT_AGENT.md and AS_BUILT_HUMAN.md from a single scan | P0 |
| PDF Export (Enhanced) | Convert AS_BUILT_HUMAN.md to PDF with TOC and page numbers via md-to-pdf | P0 |
| PRD Drift Analysis | Optional PRD upload; generates PRD_DRIFT.md comparing plan vs. reality | P0 |
| Multi-Provider LLM | User selects Gemini, Claude, or OpenAI per scan; default and premium tiers | P0 |
| Zip Upload | Upload a .zip of a project for scanning | P0 |
| Folder Upload (Browser) | Select a local folder via browser directory picker | P0 |
| GitHub Repo Input (OAuth) | Provide a GitHub repo URL; app fetches via OAuth for private repos | P1 |
| Subdirectory Targeting | Specify a subdirectory for monorepo/multi-project scanning | P1 |
| CLI Companion | Command-line tool with .asbuiltrc config and update notifications | P1 |
| Scan History (100 scan limit) | View past scans with metadata; re-download outputs; capped at 100 per user | P0 |
| Firebase Auth | User authentication (personal use; public-ready for v2) | P0 |
| Development Reminders | Email (via Resend) + dashboard nudges if no scan activity in X days | P1 |
| User Documentation | In-app docs and guides for all features including CLI | P1 |
| Live Log Processing Screen | Real-time scan progress with live log messages and progress bar | P0 |

---

## 8. Input Methods

### 8.1 Zip Upload

User uploads a .zip file through the web interface. The server extracts it to temporary storage, runs the file collection/filtering pipeline, and processes. The zip and extracted files are deleted after processing. Maximum upload size: 100 MB.

### 8.2 Folder Upload (Browser)

Uses the browser's directory upload capability (webkitdirectory). The user selects a folder from their local machine. Files are streamed to the server. Functionally similar to zip upload from the server's perspective, but more convenient for the user.

### 8.3 GitHub Repository (OAuth)

User provides a GitHub repo URL. The app uses GitHub OAuth for authentication — the user authorizes as_built once, and it can then access their public and private repositories.

- OAuth flow: user clicks "Connect GitHub," authorizes via GitHub, token stored securely (encrypted).
- Branch selection: default to main/master, allow override.
- Subdirectory targeting: specify a path within the repo for monorepo support.
- Repo size check: warn before proceeding if repo is very large.
- Rate limits: handle GitHub API rate limits gracefully with clear user messaging.

### 8.4 CLI Companion

A globally-installed npm package (asbuilt-cli) that reads a local project directory, filters files, and uploads them to the as_built API. Supports .asbuiltrc config files. Full specification in Section 18.

### 8.5 Subdirectory Targeting

Available across all input methods. For zip/folder uploads, the user specifies a relative path after upload. For GitHub repos, the path is entered alongside the URL. For the CLI, pass a path argument or use --subdir. Only files within the targeted subdirectory are included in the scan.

### 8.6 Optional: PRD Upload

On any scan, the user may optionally attach a PRD document (.md, .txt, .pdf, .docx). When present, the scan generates an additional PRD_DRIFT.md output. This upload follows the same temporary-storage-then-delete pattern.

---

## 9. Output Specification

### 9.1 AS_BUILT_AGENT.md

A dense, technically precise markdown document optimized for AI agent consumption. Structured with consistent sections, explicit file paths, function signatures, data shapes, config keys, environment variables, and unambiguous component relationships. An AI agent reading this file should have a complete, current picture of the project.

### 9.2 AS_BUILT_HUMAN.md

A human-readable markdown document written in clear, plain language. Prioritizes narrative flow and comprehension. A non-developer stakeholder should be able to read this and understand what the app is, who it's for, and what it does.

### 9.3 AS_BUILT_HUMAN.pdf

A structured PDF conversion of AS_BUILT_HUMAN.md generated via md-to-pdf. Includes:

- Table of contents generated from markdown headings.
- Page numbers in the footer.
- Clean typography and formatting.

No branding or custom styling in v1. Generated server-side using md-to-pdf (Puppeteer-based; uses @sparticuz/chromium on Vercel for lightweight Chromium). PDF generation runs within the background function after LLM output is received.

### 9.4 PRD_DRIFT.md (Optional)

Generated only when a PRD is attached to a scan. Compares the original PRD against the actual codebase and documents:

- Features described in the PRD that are fully implemented.
- Features described in the PRD that are partially implemented or modified.
- Features described in the PRD that are missing or not started.
- Features present in the code that were not in the PRD (scope additions).
- Architectural or technical decisions that diverged from the PRD.

### 9.5 What Each Output Covers

All outputs should document the following areas (depth and style vary by output type):

- Directory structure and file organization
- Architecture, tech stack, and design decisions
- Core functions, methods, modules — what each does and how they interact
- App outputs — reports, files, data, UI screens, API responses (what, for whom, where used)
- Inferred target users — role, platform, use cases, situations
- Inputs and dependencies — data sources, uploads, APIs, user inputs, third-party integrations, env vars
- Assumptions and constraints — baked-in assumptions, known limitations, deliberate exclusions
- Data model and state — what's stored, tracked, or managed; persistence mechanism
- Error and edge case handling — failure modes, how they're surfaced or handled
- Current state and completeness — what's finished, in-progress, stubbed, or marked TODO
- Monetization signals — payment integrations, pricing logic, tiers, gating, licensing (or explicit absence)
- Potential extensions — natural next features, integrations, directions
- Security and sensitive data — API keys, auth flows, permissions, data privacy
- Configuration and environment setup — prerequisites, .env files, setup steps
- Domain-specific terminology — naming conventions, abbreviations, project-specific language

---

## 10. LLM Integration

### 10.1 Supported Providers & Model Tiers

Each provider offers a default (Sonnet-tier) model and an optional premium (Opus-tier) model. The default is optimized for speed and cost while delivering strong results for structured documentation generation. The premium option is available for users who want deeper analysis on complex codebases.

| Provider | Default Model (Sonnet-tier) | Premium Model (Opus-tier) | Key Advantage |
|----------|---------------------------|--------------------------|---------------|
| Google Gemini | Gemini 2.5 Flash (or latest equivalent) | Gemini 2.5 Pro (or latest equivalent) | Massive context window; ideal for larger codebases |
| Anthropic Claude | Claude Sonnet (latest) | Claude Opus (latest) | Strong structured output and document generation |
| OpenAI | GPT-4o-mini (or latest equivalent) | GPT-4o (or latest equivalent) | Broad general capability; widely familiar |

The app should always default to the latest Sonnet-tier equivalent for each provider. When models are updated by providers, the defaults should be updated accordingly. Users can opt into the premium tier on a per-scan basis via a toggle in the scan form or a CLI flag (--premium).

### 10.2 Why Sonnet-Tier as Default

For the specific task of analyzing code and producing structured documentation following a detailed prompt template, Sonnet-tier models perform nearly as well as Opus-tier. The baked-in prompt template does the heavy lifting by specifying exactly what to look for and how to structure the output. Sonnet excels at following detailed instructions precisely. This also keeps API costs significantly lower.

Opus-tier is reserved for cases where users have complex codebases with unusual architecture where deeper reasoning produces meaningfully better analysis.

### 10.3 API Key Management

| Version | Approach |
|---------|----------|
| v1 (personal) | API keys stored in server .env file. User does not manage keys. |
| v2 (public) | Users provide their own API keys via Settings. Keys encrypted at rest (AES-256) in Firestore. Decrypted only server-side at the moment of API call. Never sent to client or logged. |
| v3 (baryapps) | API keys stored once at baryapps platform level, shared across all tools. Same encryption model. Central settings page for key management. |

#### Security for User-Provided API Keys (v2+)

- AES-256 encryption at rest using a server-side key stored in environment variables.
- Decryption happens only server-side, only at the moment of an API call.
- Keys are never sent to the client, never logged, never included in error reports.
- Users can revoke/rotate their keys from settings at any time.
- Risk to communicate: if the platform were compromised, encrypted keys could be exposed. Mitigated with standard security practices and regular encryption key rotation.

### 10.4 Implementation

Use the Vercel AI SDK for a unified interface across all three providers. The user selects provider and tier per-scan from the web UI or via CLI flags (--model gemini, --premium).

### 10.5 Context Window Management (Future-Proofing)

- **Phase 1 (v1):** Concatenate all filtered files into a single prompt. Works for most personal projects.
- **Phase 2 (future):** For projects exceeding context limits, chunk by module/directory, summarize each chunk individually, then run a synthesis pass.

Design decision: keep file collection and LLM submission as separate pipeline stages so Phase 2 is a new submission strategy, not a rewrite.

---

## 11. Scan Instructions (Prompt Engine)

The scan instructions are the core prompt template that tells the LLM what to analyze and how to structure its output. In v1, this is hardcoded into the application.

- Walk the full directory structure.
- Read and analyze key files (entry points, configs, core modules, dependency manifests).
- Infer architecture, tech stack, and design decisions from the code.
- Document all areas listed in Section 9.5.
- Flag anything ambiguous or uncertain as an open question rather than guessing.

The prompt template includes separate output format instructions for the agent version (dense, precise, technical) and the human version (narrative, plain language, accessible). Both are generated from the same scan data.

When a PRD is attached, an additional prompt section instructs the LLM to compare the PRD against its analysis and produce the drift report.

**v2 enhancement:** Allow users to customize scan instructions — toggle sections on/off, add custom analysis prompts, adjust output depth.

---

## 12. Data Model

### 12.1 Firestore Collections

#### users

| Field | Type | Description |
|-------|------|-------------|
| uid | string | Firebase Auth UID (document ID) |
| email | string | User email |
| displayName | string | User display name |
| createdAt | timestamp | Account creation date |
| lastActiveAt | timestamp | Last scan or login timestamp |
| reminderFrequencyDays | number | Days between reminder emails (default: 3) |
| reminderEnabled | boolean | Whether development reminders are active |
| apiKeys | map (encrypted) | User-provided LLM API keys (encrypted AES-256; v2+) |
| githubAccessToken | string (encrypted) | GitHub OAuth token (encrypted) |
| scanCount | number | Total number of scans (for enforcing 100-scan limit) |

#### scans

| Field | Type | Description |
|-------|------|-------------|
| scanId | string | Auto-generated document ID |
| userId | string | Reference to users collection |
| projectName | string | Inferred or user-provided project name |
| source | string | Input method: zip \| folder \| github \| cli |
| sourceRef | string | GitHub URL, filename, or directory path |
| subdirectory | string \| null | Subdirectory path if targeting was used |
| llmProvider | string | gemini \| claude \| openai |
| llmModel | string | Specific model used (e.g., claude-sonnet-4.5) |
| llmTier | string | default \| premium |
| status | string | pending \| processing \| completed \| failed |
| progressLog | array of strings | Live log messages for processing screen |
| outputAgentMd | string (text) | Full content of AS_BUILT_AGENT.md |
| outputHumanMd | string (text) | Full content of AS_BUILT_HUMAN.md |
| outputDriftMd | string \| null | Full content of PRD_DRIFT.md (null if no PRD) |
| prdAttached | boolean | Whether a PRD was uploaded with this scan |
| prdContent | string \| null | Extracted text of uploaded PRD |
| fileCount | number | Number of files processed |
| tokenUsage | map | Prompt tokens, completion tokens, total tokens |
| createdAt | timestamp | Scan initiation time |
| completedAt | timestamp \| null | Scan completion time |
| errorMessage | string \| null | Error details if status is failed |

### 12.2 Storage Rules

- **Persisted:** Scan metadata and generated documentation (markdown text).
- **Never persisted:** User codebases and uploaded files. Deleted immediately after processing.
- **Temporary storage:** Firebase Cloud Storage with 1-hour auto-delete lifecycle rules.
- **History limit:** 100 scans per user. Oldest auto-deleted when limit reached.

---

## 13. Authentication & API Key Management

### 13.1 v1: Personal Use

Firebase Auth with email/password. No payment gating. LLM API keys in server .env.

### 13.2 v2: Public Release

Open registration. Stripe integration. Usage tiers. Users provide own LLM API keys (encrypted in Firestore).

### 13.3 v3: baryapps Collection

Shared baryapps auth layer. Shared Stripe. SSO. Platform-level API keys shared across tools.

### 13.4 Suite-Ready Design

- Encapsulate auth logic in a single, extractable module.
- User records extensible for baryapps-level fields.
- No as_built-specific logic in the auth flow.
- API key encryption module designed provider-agnostic and tool-agnostic from day one.

---

## 14. Development Reminder System

### 14.1 Email Reminders (via Resend)

A Vercel Cron job runs daily. Checks each user's lastActiveAt against reminderFrequencyDays. If threshold passed and reminderEnabled is true, sends a simple nudge email via Resend.

Email content: short, motivational, with a direct link to the dashboard. Example:

> *"It's been 4 days since your last scan. Your projects are waiting. Jump back in."*

No scan summaries in the email — just the nudge and a link.

### 14.2 Dashboard Reminder

When the user logs in after being inactive beyond their threshold, display a dismissable banner:

> *"Welcome back! It's been 5 days since your last scan on ProjectX. Ready to rescan?"*

### 14.3 User Controls

- Toggle reminders on/off in settings.
- Set frequency: 1, 2, 3, 5, or 7 days (default: 3).
- Requires verified email.

---

## 15. User Documentation

### 15.1 Getting Started Guide

- What as_built does and why.
- Running your first scan (walkthrough per input method).
- Understanding the output files.

### 15.2 Input Method Guides

- Zip upload, folder upload, GitHub repo (OAuth, branches, subdirs), CLI.

### 15.3 CLI Documentation

- Installation, auth, commands, flags, .asbuiltrc config, AI tool integration, troubleshooting.

### 15.4 Understanding Outputs

- Purpose and audience for each document type.
- Using AS_BUILT_AGENT.md with AI assistants.
- Interpreting PRD_DRIFT.md.

### 15.5 FAQ and Troubleshooting

---

## 16. UI/UX Specification

### 16.1 Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | /login | Firebase Auth login/registration |
| Dashboard | / | Scan history, reminder banner, quick-scan CTA |
| New Scan | /scan/new | Input tabs, provider/tier picker, subdirectory field, PRD upload |
| Scan Processing | /scan/[id]/processing | Live log with real-time status messages and progress bar |
| Scan Detail | /scan/[id] | View results, download outputs, metadata |
| Settings | /settings | Reminders, API keys (v2+), GitHub connection, account |
| Documentation | /docs | User guides, CLI docs, FAQ |

### 16.2 Scan Processing Screen (Live Log)

After the user initiates a scan, they are redirected to a processing screen that displays a live log of scan progress. The log updates in real-time via polling (every 3–5 seconds). A progress bar at the top shows overall completion.

Log messages correspond to processing stages:

- "Collecting files... 47 files found"
- "Filtering noise... 32 files remaining (182 KB)"
- "Assembling prompt... 45,000 tokens"
- "Sending to Claude Sonnet..."
- "Generating AS_BUILT_AGENT.md..."
- "Generating AS_BUILT_HUMAN.md..."
- "Generating PDF..."
- "Scan complete!"

If a PRD was attached, additional lines show drift analysis progress. On completion, a button appears to view results. On failure, the error is displayed with a retry option.

Implementation: the background function writes progress updates to the progressLog array on the scan document in Firestore. The client reads these on each poll.

### 16.3 New Scan Flow

1. User arrives at /scan/new.
2. Selects input method (tabs: Zip Upload | Folder Upload | GitHub Repo).
3. Provides the project via the selected method.
4. Optionally specifies a subdirectory path.
5. Selects LLM provider from dropdown. Toggle for premium tier.
6. Optionally attaches a PRD file.
7. Clicks "Scan."
8. Redirected to live log processing screen.
9. On completion, button to view Scan Detail page with downloads.

### 16.4 Design Principles

- Clean, minimal interface.
- First scan within 60 seconds of signing in.
- Responsive: desktop and tablet. Mobile low priority for v1.
- No landing page in v1 — the app itself is the product.

---

## 17. API Specification

Next.js API routes. All endpoints require Firebase Auth token (except auth routes).

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/scan | Initiate a scan (accepts zip, folder files, or GitHub URL + subdirectory + tier) |
| GET | /api/scan/[id] | Get scan status, progress log, and results (used for polling) |
| GET | /api/scans | List all scans for authenticated user (paginated, max 100) |
| GET | /api/scan/[id]/download/[type] | Download output (agent-md, human-md, human-pdf, drift-md) |
| DELETE | /api/scan/[id] | Delete a scan record |
| POST | /api/scan/cli | CLI-specific scan endpoint |
| GET | /api/user/settings | Get user settings |
| PATCH | /api/user/settings | Update user settings |
| GET | /api/auth/github | Initiate GitHub OAuth flow |
| GET | /api/auth/github/callback | GitHub OAuth callback |

---

## 18. CLI Companion

### 18.1 Overview

Lightweight Node.js CLI published to npm as asbuilt-cli.

### 18.2 Installation & Updates

```
npm install -g asbuilt-cli
```

The CLI uses manual updates (npm update -g asbuilt-cli). On launch, it checks for newer versions using the update-notifier library and displays a non-blocking message if an update is available:

> *"Update available: 1.0.0 → 1.1.0. Run npm update -g asbuilt-cli to update."*

### 18.3 Authentication

```
$ asbuilt login
```

Opens browser for auth → token stored in ~/.asbuilt/config.json.

### 18.4 Commands

| Command | Description |
|---------|-------------|
| asbuilt login | Authenticate with the web app |
| asbuilt scan [path] | Scan a project directory (defaults to .) |
| asbuilt scan . --model gemini | Specify LLM provider |
| asbuilt scan . --premium | Use premium (Opus-tier) model |
| asbuilt scan . --prd ./docs/PRD.md | Include PRD for drift analysis |
| asbuilt scan . --output ~/Desktop | Save results to specific directory |
| asbuilt scan . --subdir packages/api | Scan subdirectory only |
| asbuilt history | List recent scans |
| asbuilt logout | Clear stored credentials |

### 18.5 Config File (.asbuiltrc)

JSON file in project root for project-level defaults:

```json
{ "model": "gemini", "output": "./docs", "subdir": "packages/core", "premium": false }
```

CLI flags override .asbuiltrc values.

### 18.6 Terminal Output

```
$ asbuilt scan .
⏳ Collecting files... 47 files (182 KB)
⏳ Uploading to as_built...
⏳ Analyzing with Claude Sonnet...
✓ Scan complete!
  → ./AS_BUILT_AGENT.md
  → ./AS_BUILT_HUMAN.md
  → ./AS_BUILT_HUMAN.pdf
View in browser: https://[placeholder]/scans/abc123
```

### 18.7 AI Coding Tool Integration

Designed to be called from Claude Code, Cursor, etc. Example workflow:

- User: "Run an as_built scan on this project"
- Agent executes: `asbuilt scan .`
- Results land in project directory.
- User: "Read AS_BUILT_AGENT.md and use it as context."

---

## 19. File Handling & Privacy

### 19.1 Core Principle

as_built never stores user codebases. Project files exist only during active processing.

### 19.2 Processing Pipeline

1. Upload → temporary storage.
2. File filtering per Default Scan Ignore List (Section 20).
3. Prompt assembly.
4. LLM API call (background function).
5. Output storage (Firestore — markdown text only).
6. Immediate deletion of all project files.

### 19.3 Safety Net

Firebase Cloud Storage lifecycle rules auto-delete objects older than 1 hour.

### 19.4 What IS Stored

- Scan metadata and generated documentation.
- User settings and encrypted API keys/tokens.

### 19.5 Privacy Messaging

Prominent in UI: "Your code is never stored. Files are processed in memory and deleted immediately after your scan completes."

### 19.6 Hard Security Rule

.env files are NEVER sent to the LLM, regardless of user configuration or project structure. This rule cannot be overridden. This prevents accidental exposure of API keys and secrets.

---

## 20. Default Scan Ignore List

The following files, directories, and patterns are excluded from scanning by default. These defaults apply first, then the project's .gitignore is respected on top.

### 20.1 Directories Always Excluded

**Package managers & dependencies:** node_modules/, bower_components/, .pnp/, .yarn/, vendor/, packages/*/node_modules/

**Version control:** .git/, .svn/, .hg/

**Build outputs & compiled files:** dist/, build/, out/, .next/, .nuxt/, .output/, .svelte-kit/, target/, bin/, obj/, __pycache__/, *.egg-info/, .pytest_cache/, .mypy_cache/, .ruff_cache/, coverage/, .nyc_output/, htmlcov/, .tox/

**Virtual environments:** .venv/, venv/, env/, .virtualenv/, .conda/

**IDE & editor files:** .idea/, .vscode/, .vs/, *.swp, *.swo, *~

**OS files:** .DS_Store, Thumbs.db, Desktop.ini

**Infrastructure & cache:** .docker/, .terraform/, .serverless/, .vercel/, .firebase/, tmp/, temp/, .cache/, .parcel-cache/, .turbo/, .eslintcache

### 20.2 Files by Extension Always Excluded

**Lock files:** package-lock.json, yarn.lock, pnpm-lock.yaml, Pipfile.lock, poetry.lock, composer.lock, Gemfile.lock, Cargo.lock, go.sum

**Binary & compiled:** *.exe, *.dll, *.so, *.dylib, *.o, *.obj, *.a, *.lib, *.class, *.jar, *.war, *.pyc, *.pyo, *.wasm

**Media (images, video, audio, fonts):** *.png, *.jpg, *.jpeg, *.gif, *.bmp, *.ico, *.webp, *.svg, *.mp4, *.avi, *.mov, *.wmv, *.webm, *.mp3, *.wav, *.ogg, *.flac, *.ttf, *.otf, *.woff, *.woff2, *.eot

**Archives:** *.zip, *.tar, *.gz, *.bz2, *.rar, *.7z, *.tgz

**Database files:** *.sqlite, *.sqlite3, *.db, *.mdb

**Large data files (>1MB):** *.csv, *.json (except config files), *.xml, *.log

**Sourcemaps & minified:** *.map, *.js.map, *.css.map, *.min.js, *.min.css, *.bundle.js, *.chunk.js

**Certificates & secrets:** *.pem, *.key, *.crt, *.cer, *.p12, *.pfx, *.jks

**Documents & design files:** *.pdf, *.doc, *.docx, *.xls, *.xlsx, *.ppt, *.pptx, *.sketch, *.fig, *.psd

**Environment files (HARD BLOCK):** .env, .env.* — NEVER sent to LLM under any circumstances.

### 20.3 Files Always INCLUDED (High-Signal)

**Dependency manifests:** package.json, requirements.txt, setup.py, pyproject.toml, Cargo.toml, go.mod, Gemfile, composer.json, build.gradle, pom.xml, CMakeLists.txt, Makefile

**Configuration files:** tsconfig.json, next.config.*, vite.config.*, webpack.config.*, tailwind.config.*, Dockerfile, docker-compose.*, vercel.json, firebase.json, prisma/schema.prisma, drizzle.config.*, .github/workflows/*.yml

**Documentation:** README.md, CHANGELOG.md, CONTRIBUTING.md, docs/**/*.md

### 20.4 Notes

- Project .gitignore is always respected on top of these defaults.
- Large file threshold: 1MB for CSV, JSON, XML.
- v2 will allow users to customize this list.

---

## 21. Error Handling

| Scenario | Handling |
|----------|---------|
| LLM API failure | Retry 2x with exponential backoff. If all fail, mark scan failed. User can retry. |
| Malformed LLM output | Salvage partial output. Flag as partially completed. Allow re-run. |
| Upload too large (>100MB) | Client-side + server-side validation. Clear error with size limits. |
| Unsupported format | Display supported formats. Reject gracefully. |
| GitHub repo inaccessible | Specific errors: auth needed, 404, rate limited. Resolution steps. |
| Context window exceeded | Pre-check token count. Suggest Gemini (largest window) or subdirectory targeting. |
| Background function timeout (>300s) | Mark failed. Suggest Gemini or subdirectory targeting. |
| Scan history limit (100) | Notify user. Auto-delete oldest. Option to manage manually. |
| Firebase errors | Graceful degradation. Log. User-friendly messages. |

---

## 22. Configuration & Environment

### 22.1 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| NEXT_PUBLIC_FIREBASE_API_KEY | Firebase project API key | Yes |
| NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN | Firebase auth domain | Yes |
| NEXT_PUBLIC_FIREBASE_PROJECT_ID | Firebase project ID | Yes |
| FIREBASE_STORAGE_BUCKET | Firebase Cloud Storage bucket | Yes |
| FIREBASE_ADMIN_SERVICE_ACCOUNT | Firebase Admin SDK credentials (JSON) | Yes (server) |
| GEMINI_API_KEY | Google Gemini API key | Yes |
| ANTHROPIC_API_KEY | Anthropic Claude API key | Optional |
| OPENAI_API_KEY | OpenAI API key | Optional |
| RESEND_API_KEY | Resend email service API key | Yes |
| CRON_SECRET | Secret for Vercel Cron jobs | Yes |
| GITHUB_CLIENT_ID | GitHub OAuth app client ID | Yes |
| GITHUB_CLIENT_SECRET | GitHub OAuth app client secret | Yes |
| ENCRYPTION_KEY | AES-256 key for user API keys (v2+) | Yes (v2+) |

### 22.2 Local Development

1. Clone the repository.
2. Copy .env.example to .env.local and fill in values.
3. npm install.
4. Optional: firebase emulators:start for local Firestore/Auth.
5. npm run dev.
6. Access at http://localhost:3000.

No Vercel Pro plan needed for local development — there are no timeout limits locally.

### 22.3 Production Deployment

Vercel Pro plan ($20/month) required for 300-second background functions. Environment variables set in Vercel dashboard. Deployment is automatic via git push. @sparticuz/chromium required for serverless PDF generation.

---

## 23. Limits & Constraints

| Constraint | Value | Notes |
|-----------|-------|-------|
| Max upload size | 100 MB | Enforced client-side and server-side |
| Max scan history | 100 scans per user | Oldest auto-deleted |
| Background function timeout | 300 seconds | Vercel Pro; no limit locally |
| Supported languages | Any | LLM handles language-agnostic analysis |
| Supported PRD formats | .md, .txt, .pdf, .docx | Text extracted server-side |
| LLM context window | ~128K–1M tokens | Varies by provider; Gemini largest |
| Large file threshold | 1 MB | CSV/JSON/XML over 1MB excluded from scan |
| .env files | Hard blocked | Never sent to LLM |

---

## 24. Version Roadmap

### 24.1 v1 — Personal Tool

| Feature | Status |
|---------|--------|
| Web app (Next.js + Firebase + Vercel) | Build |
| Zip upload + folder upload + GitHub repo (OAuth) + CLI | Build |
| Subdirectory targeting | Build |
| LLM integration with default/premium tiers | Build |
| Background processing via Vercel background functions | Build |
| Dual output: AS_BUILT_AGENT.md + AS_BUILT_HUMAN.md | Build |
| PDF export with TOC + page numbers (md-to-pdf) | Build |
| PRD drift analysis (PRD_DRIFT.md) | Build |
| Live log processing screen with progress bar | Build |
| Scan history (100 limit) | Build |
| Firebase Auth | Build |
| Development reminders (Resend + dashboard) | Build |
| CLI with .asbuiltrc + update notifications | Build |
| User documentation | Build |
| Default scan ignore list | Build |
| Baked-in scan instructions | Build |

### 24.2 v2 — Public Release

| Feature | Status |
|---------|--------|
| Stripe payment integration + usage tiers | Build |
| Rate limiting | Build |
| User-provided API keys (encrypted) | Build |
| Google Drive as input source | Build |
| Customizable scan instructions | Build |
| Incremental scan mode (diff between two scans) | Build |
| Large codebase support (chunked analysis) | Build |
| Customizable ignore list | Build |
| Public registration + onboarding | Build |

### 24.3 v3 — baryapps Collection

| Feature | Status |
|---------|--------|
| Shared baryapps auth layer | Build |
| Shared Stripe billing | Build |
| Platform-level API keys (shared across tools) | Build |
| SSO across baryapps suite | Build |
| Cross-tool integrations | Build |
| Collection dashboard + user management | Build |

---

## 25. Resolved Design Decisions

All design questions have been resolved. This PRD is build-ready.

| Decision | Resolution | Rationale |
|----------|-----------|-----------|
| Serverless timeout | Vercel Pro (300s background functions); no limits locally | LLM calls take 30–120s+; background functions handle cleanly |
| Default LLM models | Sonnet-tier (latest) per provider; premium toggle for Opus-tier | Sonnet excels at structured output from detailed prompts; cheaper; Opus available when needed |
| API key management | v1: .env; v2: user keys encrypted (AES-256); v3: platform-level | Scales personal to platform without rewrites |
| GitHub auth | OAuth | Cleaner UX than PATs; authorize once |
| Email service | Resend | Developer-friendly, good deliverability, free tier |
| PDF generation | md-to-pdf (Puppeteer-based) | Free, high-quality, supports TOC + page numbers |
| PDF structure | TOC + page numbers, no branding | Professional without custom styling |
| Processing screen | Live log with progress bar | Real-time visibility; lightweight implementation |
| Monorepo handling | Subdirectory targeting across all input methods | User control without overcomplicating defaults |
| Max upload | 100 MB | Covers virtually all codebases |
| Scan history limit | 100 per user, oldest auto-deleted | Prevents unbounded growth |
| Suite name | baryapps | Working name for collection |
| CLI config | .asbuiltrc (JSON) in project root | Project-level defaults; team standardization |
| CLI updates | Manual (npm update) with update-notifier | Industry standard; no surprise breaking changes |
| Reminder emails | Simple nudge with dashboard link, no scan summaries | Non-annoying, actionable |
| Landing page | None for v1; app is the product | Ship faster; add marketing site in v2 |
| Domain | Placeholder — TBD | To be decided before production deployment |
| File ignore list | Comprehensive defaults (Section 20); .gitignore respected | Smart defaults cover most cases; v2 adds customization |
| .env handling | Hard-blocked — never sent to LLM | Security rule; prevents accidental secret exposure |
