// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedOutput {
  agentMd: string;
  humanMd: string;
  driftMd: string | null;
  /** Whether the output was only partially parsed (some sections missing). */
  partial: boolean;
  /** Parsing warnings for incomplete or malformed sections. */
  warnings: string[];
  /** Which sections were successfully recovered. */
  recoveredSections: string[];
  /** Which sections are missing from the output. */
  missingSections: string[];
}

// ─── Delimiters (must match prompt.ts) ───────────────────────────────────────

const DELIMITERS = {
  agent: {
    start: "===BEGIN_AGENT_OUTPUT===",
    end: "===END_AGENT_OUTPUT===",
  },
  human: {
    start: "===BEGIN_HUMAN_OUTPUT===",
    end: "===END_HUMAN_OUTPUT===",
  },
  drift: {
    start: "===BEGIN_DRIFT_OUTPUT===",
    end: "===END_DRIFT_OUTPUT===",
  },
} as const;

// ─── Section extraction ──────────────────────────────────────────────────────

interface SectionExtraction {
  content: string | null;
  /** True if the start delimiter was found but the end delimiter was missing (truncated). */
  truncated: boolean;
}

function extractSection(
  text: string,
  startDelimiter: string,
  endDelimiter: string,
): SectionExtraction {
  const startIdx = text.indexOf(startDelimiter);
  if (startIdx === -1) return { content: null, truncated: false };

  const contentStart = startIdx + startDelimiter.length;
  const endIdx = text.indexOf(endDelimiter, contentStart);

  if (endIdx === -1) {
    // End delimiter missing — take everything after start delimiter.
    // This handles the case where the LLM was cut off mid-response.
    const salvaged = text.slice(contentStart).trim();
    return { content: salvaged || null, truncated: true };
  }

  return { content: text.slice(contentStart, endIdx).trim(), truncated: false };
}

// ─── Fallback: attempt extraction without delimiters ─────────────────────────

/**
 * When the LLM ignores our delimiter instructions (it happens), try to
 * extract sections by looking for the document headers we asked for.
 */
function extractByHeaders(text: string): {
  agent: string | null;
  human: string | null;
  drift: string | null;
} {
  const agentHeaderPattern = /^#\s+AS_BUILT_AGENT\.md/m;
  const humanHeaderPattern = /^#\s+AS_BUILT_HUMAN\.md/m;
  const driftHeaderPattern = /^#\s+PRD_DRIFT\.md/m;

  const agentMatch = agentHeaderPattern.exec(text);
  const humanMatch = humanHeaderPattern.exec(text);
  const driftMatch = driftHeaderPattern.exec(text);

  // Build a sorted list of all found section start positions
  const sections: { type: "agent" | "human" | "drift"; start: number }[] = [];
  if (agentMatch) sections.push({ type: "agent", start: agentMatch.index });
  if (humanMatch) sections.push({ type: "human", start: humanMatch.index });
  if (driftMatch) sections.push({ type: "drift", start: driftMatch.index });
  sections.sort((a, b) => a.start - b.start);

  const result: Record<string, string | null> = {
    agent: null,
    human: null,
    drift: null,
  };

  for (let i = 0; i < sections.length; i++) {
    const current = sections[i];
    const nextStart = i + 1 < sections.length ? sections[i + 1].start : text.length;
    result[current.type] = text.slice(current.start, nextStart).trim();
  }

  return {
    agent: result.agent,
    human: result.human,
    drift: result.drift,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parses the raw LLM output into separate documents.
 *
 * Strategy:
 * 1. Try delimiter-based extraction first (most reliable).
 * 2. Fall back to header-based extraction if delimiters are missing.
 * 3. If nothing works, treat the entire response as the agent output
 *    and flag as partial.
 *
 * Truncation detection: When a start delimiter is found but the end
 * delimiter is missing, the section is flagged as truncated and the
 * available content is salvaged (PRD §21: partial output salvaging).
 */
export function parseLlmOutput(
  rawOutput: string,
  expectDrift: boolean,
): ParsedOutput {
  const warnings: string[] = [];
  let anyTruncated = false;

  // ── Attempt 1: Delimiter-based extraction ──
  const agentExtraction = extractSection(
    rawOutput,
    DELIMITERS.agent.start,
    DELIMITERS.agent.end,
  );
  const humanExtraction = extractSection(
    rawOutput,
    DELIMITERS.human.start,
    DELIMITERS.human.end,
  );
  const driftExtraction = expectDrift
    ? extractSection(
        rawOutput,
        DELIMITERS.drift.start,
        DELIMITERS.drift.end,
      )
    : { content: null, truncated: false };

  let agentMd = agentExtraction.content;
  let humanMd = humanExtraction.content;
  let driftMd = driftExtraction.content;

  // Track truncation across all sections
  if (agentExtraction.truncated) {
    warnings.push("AS_BUILT_AGENT.md section was truncated (end delimiter missing). Partial content salvaged.");
    anyTruncated = true;
  }
  if (humanExtraction.truncated) {
    warnings.push("AS_BUILT_HUMAN.md section was truncated (end delimiter missing). Partial content salvaged.");
    anyTruncated = true;
  }
  if (driftExtraction.truncated) {
    warnings.push("PRD_DRIFT.md section was truncated (end delimiter missing). Partial content salvaged.");
    anyTruncated = true;
  }

  // ── Attempt 2: Header-based fallback ──
  if (!agentMd || !humanMd) {
    warnings.push(
      "Delimiter-based parsing failed. Attempting header-based extraction.",
    );
    const headerExtracted = extractByHeaders(rawOutput);

    if (!agentMd && headerExtracted.agent) {
      agentMd = headerExtracted.agent;
    }
    if (!humanMd && headerExtracted.human) {
      humanMd = headerExtracted.human;
    }
    if (expectDrift && !driftMd && headerExtracted.drift) {
      driftMd = headerExtracted.drift;
    }
  }

  // ── Attempt 3: Last resort — whole response as agent output ──
  if (!agentMd && !humanMd) {
    warnings.push(
      "Could not extract individual sections. Using entire response as agent output.",
    );
    agentMd = rawOutput.trim();
  }

  // Build recovery/missing metadata
  const recoveredSections: string[] = [];
  const missingSections: string[] = [];

  // Determine partial status
  let partial = anyTruncated;
  if (!agentMd) {
    warnings.push("AS_BUILT_AGENT.md section is missing from output.");
    missingSections.push("AS_BUILT_AGENT.md");
    partial = true;
    agentMd = "";
  } else {
    recoveredSections.push("AS_BUILT_AGENT.md");
  }
  if (!humanMd) {
    warnings.push("AS_BUILT_HUMAN.md section is missing from output.");
    missingSections.push("AS_BUILT_HUMAN.md");
    partial = true;
    humanMd = "";
  } else {
    recoveredSections.push("AS_BUILT_HUMAN.md");
  }
  if (expectDrift && !driftMd) {
    warnings.push(
      "PRD_DRIFT.md section is missing despite PRD being attached.",
    );
    missingSections.push("PRD_DRIFT.md");
    partial = true;
  } else if (driftMd) {
    recoveredSections.push("PRD_DRIFT.md");
  }

  return {
    agentMd,
    humanMd,
    driftMd: driftMd ?? null,
    partial,
    warnings,
    recoveredSections,
    missingSections,
  };
}
