// ─── Token Count Estimation (PRD §10.5, §21, §23) ─────────────────────────────
//
// Pre-submission check: estimate whether assembled prompt content will fit
// within the selected provider's context window before calling the LLM.
//
// Uses a character-based approximation (~4 chars/token) — accurate to ±20%
// for mixed code/prose, which is sufficient for a go/no-go pre-flight check.

import type { LlmProvider, LlmTier } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Characters-per-token ratio. Conservative; slightly overestimates. */
const CHARS_PER_TOKEN = 4;

/**
 * Warn the user when utilization crosses this threshold (85%).
 * Leaves headroom for the completion tokens the LLM writes back.
 */
const WARN_THRESHOLD = 0.85;

/**
 * Context window sizes by provider + tier (in tokens).
 * Update these when providers release new model generations.
 *
 * Sources (Feb 2026):
 *   Gemini 2.5 Flash / Pro  — 1 000 000 tokens
 *   Claude Sonnet / Opus    —   200 000 tokens
 *   GPT-4o-mini / GPT-4o    —   128 000 tokens
 */
const CONTEXT_WINDOWS: Record<LlmProvider, Record<LlmTier, number>> = {
  gemini: {
    default: 1_000_000, // Gemini 2.5 Flash
    premium: 1_000_000, // Gemini 2.5 Pro
  },
  claude: {
    default: 200_000, // Claude Sonnet (latest)
    premium: 200_000, // Claude Opus (latest)
  },
  openai: {
    default: 128_000, // GPT-4o-mini
    premium: 128_000, // GPT-4o
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenEstimate {
  estimatedTokens: number;
  contextWindow: number;
  /** 0–1 fraction of context window consumed by the prompt */
  utilizationRatio: number;
  /** True when over the 85% safety threshold — warn the user */
  isNearLimit: boolean;
  /** True when estimated tokens exceed 100% — scan will very likely fail */
  exceedsLimit: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Estimates the token count of a string using a character-based approximation.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Returns the context window size (tokens) for a given provider + tier.
 */
export function getContextWindow(provider: LlmProvider, tier: LlmTier): number {
  return CONTEXT_WINDOWS[provider][tier];
}

/**
 * Pre-flight check: compares estimated prompt token count against the selected
 * provider's context window and returns a structured result.
 *
 * Call this after assembling the full prompt (instructions + file contents)
 * but before dispatching to the LLM. If `exceedsLimit` is true, surface the
 * PRD §21 guidance: suggest Gemini or subdirectory targeting.
 *
 * @param content  Fully assembled prompt string
 * @param provider LLM provider selected for this scan
 * @param tier     "default" (Sonnet-tier) or "premium" (Opus-tier)
 */
export function checkContextLimit(
  content: string,
  provider: LlmProvider,
  tier: LlmTier,
): TokenEstimate {
  const estimatedTokens = estimateTokens(content);
  const contextWindow = getContextWindow(provider, tier);
  const utilizationRatio = estimatedTokens / contextWindow;

  return {
    estimatedTokens,
    contextWindow,
    utilizationRatio,
    isNearLimit: utilizationRatio >= WARN_THRESHOLD,
    exceedsLimit: utilizationRatio >= 1,
  };
}
