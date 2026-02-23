import { NextRequest, NextResponse } from "next/server";

const PUBLIC_ROUTES = ["/login", "/api/", "/cli-auth", "/docs"];
const AUTH_ROUTE = "/login";
const HOME_ROUTE = "/";

export function middleware(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;

  // Allow public routes, static assets, and API auth routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_ROUTES.some((route) => pathname.startsWith(route))
  ) {
    return undefined;
  }

  const sessionCookie = request.cookies.get("__session");

  // No session → redirect to login
  if (!sessionCookie?.value) {
    const loginUrl = new URL(AUTH_ROUTE, request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Has session cookie but trying to access login → redirect home
  if (pathname === AUTH_ROUTE) {
    return NextResponse.redirect(new URL(HOME_ROUTE, request.url));
  }

  return undefined;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
