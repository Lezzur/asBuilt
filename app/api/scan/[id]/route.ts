import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/server";
import { getScan, deleteScan } from "@/lib/db/scans";
import { updateLastActive } from "@/lib/db/users";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/scan/[id] — polling endpoint for scan status, progress log, and results. */
export const GET = withAuth<RouteContext>(async (request, user, context) => {
  const { id } = await context.params;

  const scan = await getScan(id);
  if (!scan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (scan.userId !== user.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await updateLastActive(user.uid);
  return NextResponse.json({ scan });
});

/** DELETE /api/scan/[id] — permanently removes a scan record. */
export const DELETE = withAuth<RouteContext>(async (request, user, context) => {
  const { id } = await context.params;

  const scan = await getScan(id);
  if (!scan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (scan.userId !== user.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteScan(id, user.uid);
  return new NextResponse(null, { status: 204 });
});
