import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/server";
import { listScanSummaries } from "@/lib/db/scans";
import { updateLastActive } from "@/lib/db/users";

/**
 * GET /api/scans — returns the authenticated user's scan history.
 *
 * Query params:
 *   limit  — max results to return (1–100, default 100)
 *
 * Response: { scans: ScanSummary[], count: number }
 */
export const GET = withAuth<object>(async (request, user) => {
  const { searchParams } = new URL(request.url);
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit
    ? Math.max(1, Math.min(100, parseInt(rawLimit, 10)))
    : 100;

  const [scans] = await Promise.all([
    listScanSummaries(user.uid, limit),
    updateLastActive(user.uid),
  ]);

  return NextResponse.json({ scans, count: scans.length });
});
