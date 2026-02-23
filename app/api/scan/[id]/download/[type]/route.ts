import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/server";
import { getScan } from "@/lib/db/scans";
import { generatePdf } from "@/lib/pdf/generate";

type DownloadType = "manifest-md" | "agent-md" | "human-md" | "human-pdf" | "drift-md";
type RouteContext = { params: Promise<{ id: string; type: string }> };

const VALID_TYPES: DownloadType[] = ["manifest-md", "agent-md", "human-md", "human-pdf", "drift-md"];

function isValidType(value: string): value is DownloadType {
  return VALID_TYPES.includes(value as DownloadType);
}

/**
 * GET /api/scan/[id]/download/[type]
 *
 * Streams the requested output as a downloadable file.
 *
 * type values:
 *   manifest-md → PROJECT_MANIFEST_<slug>.md (text/markdown)
 *   agent-md    → alias for manifest-md (backward compat)
 *   human-md    → AS_BUILT_HUMAN.md  (text/markdown)
 *   human-pdf   → AS_BUILT_HUMAN.pdf (application/pdf)
 *   drift-md    → PRD_DRIFT.md       (text/markdown, only if PRD was attached)
 */
export const GET = withAuth<RouteContext>(async (request, user, context) => {
  const { id, type } = await context.params;

  if (!isValidType(type)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const scan = await getScan(id);
  if (!scan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (scan.userId !== user.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (scan.status !== "completed" && scan.status !== "partial") {
    return NextResponse.json(
      { error: "Scan outputs are not yet available" },
      { status: 409 }
    );
  }

  const slug = scan.projectName.replace(/[^a-z0-9]+/gi, "_").toLowerCase();

  switch (type) {
    case "manifest-md":
    case "agent-md": {
      return new NextResponse(scan.outputManifestMd, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="PROJECT_MANIFEST_${slug}.md"`,
        },
      });
    }

    case "human-md": {
      return new NextResponse(scan.outputHumanMd, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${slug}_AS_BUILT_HUMAN.md"`,
        },
      });
    }

    case "drift-md": {
      if (!scan.prdAttached || !scan.outputDriftMd) {
        return NextResponse.json(
          { error: "No PRD drift report available for this scan" },
          { status: 404 }
        );
      }
      return new NextResponse(scan.outputDriftMd, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${slug}_PRD_DRIFT.md"`,
        },
      });
    }

    case "human-pdf": {
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generatePdf(scan.outputHumanMd);
      } catch (err) {
        console.error("[download/human-pdf] PDF generation failed:", err);
        return NextResponse.json(
          { error: "PDF generation failed. Please try downloading the markdown version." },
          { status: 500 }
        );
      }

      return new NextResponse(pdfBuffer.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${slug}_AS_BUILT_HUMAN.pdf"`,
          "Content-Length": String(pdfBuffer.byteLength),
        },
      });
    }
  }
});
