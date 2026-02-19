import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
// Edge middleware — runs at the edge, not in Node.js runtime

export function middleware(request: NextRequest): NextResponse | undefined {
  return authMiddleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
