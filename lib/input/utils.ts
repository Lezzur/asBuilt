/**
 * Attempts to decode a Buffer as UTF-8 text.
 * Returns null if the buffer appears to be a binary file (>10% non-printable bytes).
 * The scan engine's ignore-list filter handles extension-based exclusions; this is
 * a safety net for binary files that slip through (e.g., no extension).
 */
export function tryDecodeUtf8(buf: Buffer): string | null {
  if (buf.length === 0) return "";
  const content = buf.toString("utf-8");
  const nonPrintable = (content.match(/[\x00-\x08\x0E-\x1F\x7F]/g) ?? [])
    .length;
  if (nonPrintable / content.length > 0.1) return null;
  return content;
}
