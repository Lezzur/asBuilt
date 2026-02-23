/**
 * PRD drift analysis — prompt construction for comparing a PRD
 * against the actual codebase analysis.
 *
 * This module handles the case where drift analysis is run as a
 * separate LLM call (e.g., when the combined prompt would exceed
 * context limits, or for higher-quality dedicated analysis).
 *
 * In the default v1 flow, drift is included in the main prompt
 * (see prompt.ts). This module is used for standalone drift analysis
 * or as a fallback when the main prompt didn't produce drift output.
 *
 * The drift prompt template is loaded from prompts/DRIFT_STANDALONE.md.
 */

import { readFileSync } from "fs";
import { join } from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DriftPromptInput {
  projectName: string;
  /** The raw PRD content provided by the user. */
  prdContent: string;
  /** The already-generated PROJECT_MANIFEST (the codebase analysis). */
  agentMd: string;
  /** Optional: directory tree for additional context. */
  tree?: string[];
}

// ─── Template loading ─────────────────────────────────────────────────────────

const PROMPTS_DIR = join(process.cwd(), "prompts");

function loadDriftTemplate(): string {
  return readFileSync(join(PROMPTS_DIR, "DRIFT_STANDALONE.md"), "utf-8");
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Builds a standalone drift analysis prompt from a PRD and an
 * already-generated codebase analysis.
 *
 * Use this when:
 * - The combined prompt (analysis + drift) exceeds context limits.
 * - The main scan didn't produce a drift section and you need a retry.
 * - You want higher-quality drift analysis via a dedicated call.
 */
export function buildDriftPrompt(input: DriftPromptInput): string {
  const { projectName, prdContent, agentMd, tree } = input;
  const date = new Date().toISOString().split("T")[0];

  const template = loadDriftTemplate()
    .replace(/\{projectName\}/g, projectName)
    .replace(/\{date\}/g, date);

  const sections: string[] = [template];

  // Add directory tree if available
  if (tree && tree.length > 0) {
    sections.push(
      "",
      "## Project Directory Structure",
      "",
      "```",
      tree.join("\n"),
      "```",
    );
  }

  // Add PRD content
  sections.push(
    "",
    "## Original PRD Document",
    "",
    "Read this document section by section. Extract every discrete requirement, feature, and specification.",
    "",
    "===BEGIN_PRD===",
    prdContent,
    "===END_PRD===",
  );

  // Add codebase analysis
  sections.push(
    "",
    "## Codebase Analysis (PROJECT_MANIFEST)",
    "",
    "This is the ground truth of what was actually built. Search this document for evidence of each PRD requirement.",
    "",
    "===BEGIN_ANALYSIS===",
    agentMd,
    "===END_ANALYSIS===",
  );

  // Final instruction
  sections.push(
    "",
    "## Final Instruction",
    "",
    "Now produce the complete PRD_DRIFT.md document following the structure defined above. Account for EVERY section and requirement in the PRD. Output ONLY the PRD_DRIFT.md document — no preamble, no commentary.",
  );

  return sections.join("\n");
}
