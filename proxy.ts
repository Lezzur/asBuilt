import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
// Edge proxy — runs at the edge, not in Node.js runtime

export function proxy(request: NextRequest): NextResponse | undefined {
  return authMiddleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
