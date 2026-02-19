import { readFileSync } from "fs";
import { join } from "path";
import type { CollectedFile } from "./collect";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PromptInput {
  /** Collected and filtered project files. */
  files: CollectedFile[];
  /** Full directory tree (for structural context). */
  tree: string[];
  /** Name of the project being scanned. */
  projectName: string;
  /** Whether a PRD was attached for drift analysis. */
  prdAttached: boolean;
  /** Raw PRD content (only present if prdAttached is true). */
  prdContent?: string | null;
}

// ─── Template loading ────────────────────────────────────────────────────────

const PROMPTS_DIR = join(process.cwd(), "prompts");

function loadTemplate(filename: string): string {
  return readFileSync(join(PROMPTS_DIR, filename), "utf-8");
}

// ─── System preamble ────────────────────────────────────────────────────────

const SYSTEM_PREAMBLE = `You are as_built, an expert code analysis engine that produces structured documentation from source code. You are methodical, precise, and exhaustive.

Core principles:
- **Document what IS, not what should be.** You describe the actual codebase, not aspirational or planned behavior.
- **Evidence-based only.** Every claim must trace to a specific file, function, config value, or code pattern. If you cannot find evidence, say so explicitly.
- **Flag uncertainty.** When something is ambiguous, mark it as "[UNCERTAIN]" and explain what you could not determine. Never guess or fabricate.
- **Be thorough.** Omissions are worse than verbosity. A developer or AI agent relying on your output must not be surprised by undocumented behavior.
- **Respect scope.** Only analyze the files provided. Do not reference external documentation, README claims, or package descriptions unless corroborated by the actual code.`;

// ─── Analysis instructions ──────────────────────────────────────────────────

const ANALYSIS_INSTRUCTIONS = `## Analysis Instructions

Analyze the provided codebase systematically. For every area below, extract concrete evidence from the code. If a section is not applicable (e.g., no monetization logic exists), state that explicitly rather than omitting the section.

### 1. Directory Structure & File Organization
- Map the top-level directory layout and what each directory contains.
- Identify organizational patterns (feature-based, layer-based, domain-based).
- Note any unconventional structure choices and their likely rationale.

### 2. Architecture, Tech Stack & Design Decisions
- List every framework, library, and language in use with version numbers from dependency manifests.
- Identify the architectural pattern (MVC, serverless, monolith, microservices, event-driven, etc.).
- Document design patterns in use (Repository, Factory, Observer, Middleware, etc.).
- Note runtime requirements (Node version, Python version, etc.) from configs or engine fields.

### 3. Core Functions, Methods & Modules
- For each major module: its purpose, public API surface, key functions with signatures.
- Trace the primary data flow: entry point → processing → output.
- Document inter-module dependencies (A imports B, B depends on C).
- Identify the critical path — the most important code paths for the app's core purpose.

### 4. App Outputs
- What does this application produce? (UI screens, API responses, files, reports, emails, etc.)
- For each output: what triggers it, what data it contains, who consumes it, and in what format.
- Document any generated artifacts (PDFs, exports, logs, build outputs).

### 5. Inferred Target Users
- Based on UI text, auth flows, feature set, and domain language — who is this built for?
- Identify user roles, platforms, and primary use cases.
- Note any multi-tenancy, role-based access, or user segmentation.

### 6. Inputs & Dependencies
- All external data sources: APIs, databases, file uploads, third-party services.
- All environment variables referenced in the code (name, where used, purpose).
- User input points: forms, CLI arguments, file uploads, URL parameters.
- Third-party integrations: SDKs, webhooks, OAuth providers.

### 7. Assumptions & Constraints
- Hardcoded values that encode assumptions (timeouts, limits, magic numbers).
- Platform constraints (Vercel limits, browser-only features, OS-specific code).
- Deliberate exclusions or simplifications (comments like "v2", "future", "TODO").

### 8. Data Model & State
- Database schemas, collections, tables — with field types and relationships.
- State management approach (React context, Redux, Zustand, server state, etc.).
- Data validation rules (Zod schemas, TypeScript interfaces enforced at runtime).
- Persistence: what is stored permanently, what is transient, what is cached.

### 9. Error & Edge Case Handling
- Error boundaries, try/catch patterns, and how errors propagate.
- Retry logic, fallback strategies, graceful degradation.
- User-facing error messages and their triggers.
- Validation: where inputs are validated, what is rejected, what passes through.

### 10. Current State & Completeness
- Features that are fully implemented and functional.
- Features that are stubbed, partially built, or behind feature flags.
- TODO/FIXME/HACK comments and what they indicate.
- Dead code: imported but unused, defined but unreferenced.

### 11. Monetization Signals
- Payment integrations (Stripe, PayPal, etc.) — endpoints, webhook handlers, pricing logic.
- Tier/plan gating, feature flags tied to subscription levels.
- If no monetization exists, state this explicitly.

### 12. Potential Extensions
- Natural next features suggested by the architecture (e.g., auth system ready for OAuth but only using email).
- Extension points: plugin systems, middleware chains, adapter patterns.
- Technical debt that would need resolving before scaling.

### 13. Security & Sensitive Data
- Authentication mechanism (JWT, sessions, OAuth, API keys) and its implementation.
- Authorization: how permissions are checked, where guards are placed.
- Secrets management: how API keys, tokens, and credentials are stored and accessed.
- Data privacy: what user data is collected, stored, and how it is protected.
- **CRITICAL**: Flag any .env files, hardcoded secrets, or credentials in the codebase.

### 14. Configuration & Environment Setup
- Required environment variables with descriptions.
- Setup steps to run the project locally (from dependency install to running dev server).
- Build and deployment configuration.
- External service setup requirements (databases, API accounts, etc.).

### 15. Domain-Specific Terminology
- Project-specific naming conventions (what does "scan" mean in this context? what is a "drift"?).
- Abbreviations and acronyms used in code or comments.
- Business domain language that a new developer would need to understand.`;

// ─── Drift wrapper section ──────────────────────────────────────────────────

const DRIFT_WRAPPER_SECTION = `After ===END_HUMAN_OUTPUT===, also include:

===BEGIN_DRIFT_OUTPUT===
(The complete PRD_DRIFT.md document goes here.
Include all sections from Summary through Alignment Score.
Do not truncate or summarize — write the full document.)
===END_DRIFT_OUTPUT===`;

// ─── File content formatting ─────────────────────────────────────────────────

function formatFileBlock(file: CollectedFile): string {
  return `--- FILE: ${file.relativePath} (${file.sizeBytes} bytes) ---
${file.content}
--- END FILE ---`;
}

function formatDirectoryTree(tree: string[]): string {
  return tree.join("\n");
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Assembles the full prompt for the LLM from collected project files
 * and scan configuration. This is the core prompt engineering of as_built.
 *
 * Output format templates are loaded from the prompts/ directory
 * (AS_BUILT_AGENT.md, AS_BUILT_HUMAN.md, PRD_DRIFT.md, OUTPUT_FORMAT.md).
 */
export function assemblePrompt(input: PromptInput): string {
  const { files, tree, projectName, prdAttached, prdContent } = input;

  const date = new Date().toISOString().split("T")[0];

  // Load output format templates from .md files
  const agentFormat = loadTemplate("AS_BUILT_AGENT.md");
  const humanFormat = loadTemplate("AS_BUILT_HUMAN.md");
  const outputWrapper = loadTemplate("OUTPUT_FORMAT.md");

  const outputFormats = [agentFormat, humanFormat];
  if (prdAttached && prdContent) {
    const driftFormat = loadTemplate("PRD_DRIFT.md");
    outputFormats.push(driftFormat);
  }

  const formattedWrapper = outputWrapper
    .replace("{drift_section}", prdAttached && prdContent ? DRIFT_WRAPPER_SECTION : "")
    .replace(/\{date\}/g, date)
    .replace(/\{Project Name\}/g, projectName);

  const formattedOutputFormats = outputFormats
    .join("\n\n")
    .replace(/\{date\}/g, date)
    .replace(/\{Project Name\}/g, projectName);

  // Build the sections
  const sections: string[] = [
    SYSTEM_PREAMBLE,
    "",
    `# Project: ${projectName}`,
    `# Scan Date: ${date}`,
    `# Files Analyzed: ${files.length}`,
    "",
    ANALYSIS_INSTRUCTIONS,
    "",
    formattedOutputFormats,
    "",
    formattedWrapper,
  ];

  // Add PRD content if attached
  if (prdAttached && prdContent) {
    sections.push(
      "",
      "## Attached PRD Document",
      "",
      "The following is the original PRD for this project. Use it for the drift analysis.",
      "",
      "===BEGIN_PRD===",
      prdContent,
      "===END_PRD===",
    );
  }

  // Add directory tree
  sections.push(
    "",
    "## Project Directory Structure",
    "",
    "```",
    formatDirectoryTree(tree),
    "```",
  );

  // Add file contents — high-signal files first (already sorted by collect)
  sections.push(
    "",
    "## Project File Contents",
    "",
    `The following ${files.length} files have been selected for analysis.`,
    `High-signal files (configs, manifests, docs) appear first.`,
    "",
  );

  for (const file of files) {
    const tag = file.highSignal ? " [HIGH-SIGNAL]" : "";
    sections.push(formatFileBlock(file) + tag);
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Rough token count estimation for pre-submission checks.
 * Uses the ~4 characters per token heuristic as a conservative estimate.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
