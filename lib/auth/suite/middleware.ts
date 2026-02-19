import { NextRequest, NextResponse } from "next/server";
import { getSuiteAuthConfig } from "./config";

/**
 * Creates a config-aware auth middleware for the baryapps suite.
 *
 * Reads routes, cookie name, and redirect targets from the suite
 * config so each app can customize auth behavior without editing
 * the middleware function itself.
 *
 * Usage in middleware.ts:
 *   export function middleware(request: NextRequest) {
 *     return createSuiteMiddleware()(request);
 *   }
 */
export function createSuiteMiddleware() {
  return function suiteAuthMiddleware(
    request: NextRequest,
  ): NextResponse | undefined {
    const config = getSuiteAuthConfig();
    const { pathname } = request.nextUrl;

    // Allow static assets
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/favicon")
    ) {
      return undefined;
    }

    // Allow configured public routes
    if (
      config.publicRoutes.some((route) => pathname.startsWith(route))
    ) {
      return undefined;
    }

    const sessionCookie = request.cookies.get(config.sessionCookieName);

    // No session → redirect to login
    if (!sessionCookie?.value) {
      const loginUrl = new URL(config.loginRoute, request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Has session but accessing login → redirect home
    if (pathname === config.loginRoute) {
      return NextResponse.redirect(new URL(config.homeRoute, request.url));
    }

    return undefined;
  };
}
