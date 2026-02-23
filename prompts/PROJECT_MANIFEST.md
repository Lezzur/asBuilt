## Output Format: PROJECT_MANIFEST

Produce a dense, technically precise markdown document optimized for AI agent consumption. AI coding assistants (Claude Code, Cursor, GitHub Copilot) will ingest this as their primary project context. Density and precision are features — this is a reference document, not a narrative.

### Mandatory Document Structure

The document MUST contain these sections IN THIS ORDER. Do not skip, reorder, or rename sections.

```
# PROJECT_MANIFEST_{Project Name}
---
document_type: project_manifest
standard_version: "1.0"
project: {Project Name}
generated_by: as_built
generated_at: {date}
---
> This document is optimized for AI agent consumption.

## Table of Contents
(auto-generated from sections below)

## 1. Project Overview
## 2. Tech Stack & Dependencies
## 3. Architecture
## 4. Directory Map
## 5. Data Model
## 6. API Surface
## 7. Core Modules
## 8. Authentication & Authorization
## 9. Configuration & Environment
## 10. Conventions
## 11. Integration Points
## 12. Error Handling
## 13. Current State
## 14. Change History
## 15. Security Notes
## 16. Terminology
```

### Section Requirements

**§1 Project Overview** — 3-5 sentences. What this project does, its core purpose, and its primary output. No marketing language. State facts.

**§2 Tech Stack & Dependencies** — Table format (4 columns required):
| Category | Technology | Version | Purpose |
Use exact versions from package.json/requirements.txt/etc.

**§3 Architecture** — Describe the overall pattern. Include a text-based flow diagram of the primary data path:
```
User Input → API Route → Service Layer → Database
                      ↳ Background Job → LLM → Output
```
List all architectural layers and how they interact.

**§4 Directory Map** — For each top-level directory, a one-line description of its contents. For important directories, list key files with one-line descriptions.

**§5 Data Model** — For each database collection/table:
- Field name, type, purpose, constraints.
- Relationships to other collections/tables.
- Use TypeScript interface notation or equivalent.

**§6 API Surface** — For each endpoint, use H3 heading with structured fields:

### `METHOD /path` — Brief description
- **Auth**: required | public
- **Params**: `{ key: type }`
- **Body**: `{ key: type }`
- **Response**: `{ key: type }`
- **Errors**: 400 (why), 401 (why), 404 (why)
- **File**: `path/to/route.ts`

**§7 Core Modules** — For each module (file or directory that contains business logic), use H3 heading with structured fields:

### `module-name`
- **Purpose**: one sentence
- **Exports**: `functionName(param: Type): ReturnType`
- **Dependencies**: what it imports and from where
- **Used by**: which modules consume this one
Key behavior notes (side effects, async patterns, state mutations).

**§8 Authentication & Authorization** — Auth mechanism, token format, storage, validation flow. Permission model. Protected vs. public routes.

**§9 Configuration & Environment** — Table of all environment variables:
| Variable | Required | Default | Description |
Plus build commands, dev server setup, deployment config.

**§10 Conventions** — Analyze the codebase and document:
- **Naming patterns**: file naming (kebab-case, camelCase, etc.), variable/function naming conventions, component naming.
- **File organization**: how code is grouped (by feature, by layer, by domain).
- **Import patterns**: absolute vs relative imports, barrel files, path aliases.
- **Shared utilities**: common helpers, shared types, reusable patterns.
- **Code style**: formatting rules, linter config, TypeScript strictness.

**§11 Integration Points** — Cross-module dependency mapping. For each significant integration:
| Module A | Module B | Interface | Direction | Blast Radius | Notes |
Document which modules depend on each other, through what interface, and what breaks if one changes.

**§12 Error Handling** — Retry strategies, error boundaries, fallback patterns, user-facing error messages. Cite specific files.

**§13 Current State** — Structured into subsections:
- **Working**: Features that are fully implemented and functional.
- **Issues**: Known bugs or problems.
- **TODOs**: All TODO/FIXME/HACK comments with file paths and line numbers.
- **Dead Code**: Imported but unused, defined but unreferenced.

**§14 Change History** — For the initial scan, write:
```
| Date | Change | Author |
|------|--------|--------|
| {date} | Initial scan — baseline established | as_built |
```

**§15 Security Notes** — Secrets handling, encryption, data privacy patterns. Flag any concerns.

**§16 Terminology** — Project-specific terms with definitions.

### Formatting Rules for Agent Output
- ALWAYS include file paths in the format `path/to/file.ts:lineNumber` when referencing code.
- Use code blocks (```) for interfaces, schemas, config objects, function signatures.
- Use tables for structured data (dependencies, env vars, API endpoints).
- Prefer explicit over implicit: write `userId: string (Firebase Auth UID, used as document ID)` not just `userId: string`.
- Cross-reference between sections: "See §5 Data Model for the full schema" or "Defined in §7 Core Modules > auth.ts".
- Every section must have content. If not applicable, write "N/A — [reason]".
