/**
 * PRD Upload Handler — PRD §8.6
 *
 * Extracts plain text from uploaded PRD documents.
 * Supported formats: .md, .txt, .pdf, .docx
 *
 * The extracted text is stored in the scan record (Firestore prdContent field)
 * and passed to the LLM alongside the codebase for drift analysis (PRD_DRIFT.md).
 */

import mammoth from "mammoth";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
) => Promise<{ text: string }>;
import path from "path";

const SUPPORTED_EXTENSIONS = [".md", ".txt", ".pdf", ".docx"] as const;
type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

/**
 * Extracts plain text from a PRD file buffer.
 *
 * @param buffer  - Raw file bytes.
 * @param filename - Original filename; extension determines the parser.
 * @returns Extracted UTF-8 text.
 * @throws If the file format is unsupported or parsing fails.
 */
export async function extractPrdText(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const ext = path.extname(filename).toLowerCase() as SupportedExtension;

  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error(
      `Unsupported PRD format: "${ext}". Supported formats: ${SUPPORTED_EXTENSIONS.join(", ")}`,
    );
  }

  switch (ext) {
    case ".md":
    case ".txt":
      return buffer.toString("utf-8");

    case ".pdf":
      return extractPdf(buffer);

    case ".docx":
      return extractDocx(buffer);
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
