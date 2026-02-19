interface TocEntry {
  level: number;
  text: string;
}

function extractHeadings(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];

  for (const line of markdown.split("\n")) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) continue;

    const level = match[1].length;
    const text = match[2].trim();

    // Skip the document title (h1) and any existing TOC heading
    if (level === 1 || text.toLowerCase() === "table of contents") continue;

    entries.push({ level, text });
  }

  return entries;
}

function buildTocMarkdown(entries: TocEntry[]): string {
  if (entries.length === 0) return "";

  const lines = ["## Table of Contents", ""];

  for (const { level, text } of entries) {
    const indent = level === 3 ? "  " : "";
    lines.push(`${indent}- ${text}`);
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Injects a Table of Contents into markdown content.
 * The TOC is inserted after the first H1 heading (document title).
 * If no H1 is found, the TOC is prepended to the content.
 */
export function injectToc(markdown: string): string {
  const headings = extractHeadings(markdown);
  const toc = buildTocMarkdown(headings);

  if (!toc) return markdown;

  const lines = markdown.split("\n");

  // Find the first H1 line
  let h1Index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s+.+$/.test(lines[i])) {
      h1Index = i;
      break;
    }
  }

  if (h1Index === -1) {
    return toc + "\n" + markdown;
  }

  // Advance past any blank lines immediately following the H1
  let insertAfter = h1Index;
  while (insertAfter + 1 < lines.length && lines[insertAfter + 1].trim() === "") {
    insertAfter++;
  }

  return [...lines.slice(0, insertAfter + 1), "", toc, ...lines.slice(insertAfter + 1)].join("\n");
}
