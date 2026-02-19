import { getLaunchOptions } from "./chromium";
import { injectToc } from "./toc";

/**
 * Converts markdown content to a PDF buffer.
 *
 * Features:
 *  - Table of contents auto-generated from H2/H3 headings, injected after the H1 title
 *  - Page numbers in the footer (current / total)
 *  - A4 format with clean typography
 *  - Serverless-compatible: uses @sparticuz/chromium on Vercel
 */
export async function generatePdf(markdownContent: string): Promise<Buffer> {
  const { mdToPdf } = await import("md-to-pdf");

  const [launchOptions, markdownWithToc] = await Promise.all([
    getLaunchOptions(),
    Promise.resolve(injectToc(markdownContent)),
  ]);

  const result = await mdToPdf(
    { content: markdownWithToc },
    {
      pdf_options: {
        format: "A4",
        margin: { top: "20mm", right: "20mm", bottom: "25mm", left: "20mm" },
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="font-size:10px;width:100%;text-align:center;color:#888;font-family:-apple-system,sans-serif;">' +
          '<span class="pageNumber"></span> / <span class="totalPages"></span>' +
          "</div>",
        printBackground: true,
      },
      css: `
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1a1a; font-size: 14px; }
        h1 { page-break-before: always; font-size: 2em; border-bottom: 2px solid #e0e0e0; padding-bottom: 0.3em; margin-top: 0; }
        h1:first-of-type { page-break-before: avoid; }
        h2 { font-size: 1.5em; border-bottom: 1px solid #e8e8e8; padding-bottom: 0.2em; margin-top: 1.75em; }
        h3 { font-size: 1.2em; margin-top: 1.5em; }
        h4 { font-size: 1.05em; margin-top: 1.25em; }
        code { background: #f4f4f4; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.875em; font-family: 'Courier New', Courier, monospace; }
        pre { background: #f4f4f4; padding: 1em; border-radius: 4px; overflow-x: auto; page-break-inside: avoid; }
        pre code { background: none; padding: 0; }
        table { border-collapse: collapse; width: 100%; margin: 1em 0; page-break-inside: avoid; }
        th, td { border: 1px solid #ddd; padding: 0.5em 0.75em; text-align: left; }
        th { background: #f0f0f0; font-weight: 600; }
        tr:nth-child(even) { background: #fafafa; }
        blockquote { border-left: 4px solid #e0e0e0; margin: 0.5em 0; padding: 0.5em 1em; color: #555; }
        a { color: #0070f3; text-decoration: none; }
        ul, ol { padding-left: 1.5em; }
        li { margin: 0.2em 0; }
        p { margin: 0.75em 0; }
        hr { border: none; border-top: 1px solid #e0e0e0; margin: 1.5em 0; }
      `,
      launch_options: launchOptions,
    }
  );

  if (!result.content) {
    throw new Error("PDF generation produced no content");
  }

  return result.content;
}
