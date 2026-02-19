/**
 * baryapps suite auth — extractable auth module.
 *
 * This directory contains the configuration layer that makes the
 * auth module reusable across all baryapps suite applications.
 *
 * Core auth logic lives in the parent directory (lib/auth/):
 *   - context.tsx  — React AuthProvider + useAuth hook
 *   - server.ts    — Server-side token verification + withAuth HOF
 *   - middleware.ts — Edge middleware for route protection
 *   - session.ts   — Client-side session cookie management
 *   - types.ts     — Shared types (AuthUser, AuthState, etc.)
 *
 * This suite layer adds:
 *   - config.ts    — App-specific configuration (routes, providers, session)
 *   - middleware.ts — Config-aware middleware factory
 *   - session.ts   — Config-aware session helpers
 *
 * To use in a new baryapps app:
 *   1. Copy lib/auth/ into your project.
 *   2. Call configureSuiteAuth() with your app's settings.
 *   3. Use createSuiteMiddleware() in your Next.js middleware.
 *   4. Use <AuthProvider> and useAuth() as normal.
 */

export { configureSuiteAuth, getSuiteAuthConfig } from "./config";
export type { SuiteAuthConfig, OAuthProviderConfig } from "./config";
export { createSuiteMiddleware } from "./middleware";
export { createSessionHelpers } from "./session";
