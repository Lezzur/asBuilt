/**
 * Suite-ready auth configuration for baryapps.
 *
 * Each app in the baryapps suite provides its own SuiteAuthConfig
 * to customize auth behavior (routes, providers, session settings)
 * without modifying the core auth modules.
 *
 * Usage:
 *   import { configureSuiteAuth, getSuiteAuthConfig } from "@/lib/auth/suite/config";
 *   configureSuiteAuth({ appName: "as_built", ... });
 */

export interface OAuthProviderConfig {
  /** OAuth provider name. */
  name: string;
  /** API route that initiates the OAuth flow. */
  initiateRoute: string;
  /** API route that handles the OAuth callback. */
  callbackRoute: string;
  /** API route to disconnect the provider. */
  disconnectRoute?: string;
  /** Scopes to request. */
  scopes: string[];
}

export interface SuiteAuthConfig {
  /** The app name within the baryapps suite. */
  appName: string;

  /** Login page path (default: "/login"). */
  loginRoute: string;

  /** Post-login redirect path (default: "/"). */
  homeRoute: string;

  /** Routes that do not require authentication. */
  publicRoutes: string[];

  /** Session cookie name (default: "__session"). */
  sessionCookieName: string;

  /** Session cookie max age in seconds (default: 7 days). */
  sessionMaxAge: number;

  /** OAuth providers enabled for this app. */
  oauthProviders: OAuthProviderConfig[];

  /** Whether email/password auth is enabled (default: true). */
  emailPasswordEnabled: boolean;

  /** Whether to store user profile in Firestore on signup (default: true). */
  createUserDocument: boolean;

  /** Firestore collection name for user documents (default: "users"). */
  usersCollection: string;
}

const DEFAULT_CONFIG: SuiteAuthConfig = {
  appName: "baryapps",
  loginRoute: "/login",
  homeRoute: "/",
  publicRoutes: ["/login", "/api/auth"],
  sessionCookieName: "__session",
  sessionMaxAge: 60 * 60 * 24 * 7, // 7 days
  oauthProviders: [],
  emailPasswordEnabled: true,
  createUserDocument: true,
  usersCollection: "users",
};

let _config: SuiteAuthConfig = { ...DEFAULT_CONFIG };

/**
 * Configure the suite auth module for this app.
 * Call once at app initialization (e.g., in layout.tsx or _app.tsx).
 */
export function configureSuiteAuth(
  overrides: Partial<SuiteAuthConfig>,
): SuiteAuthConfig {
  _config = { ...DEFAULT_CONFIG, ...overrides };
  return _config;
}

/**
 * Get the current suite auth configuration.
 */
export function getSuiteAuthConfig(): Readonly<SuiteAuthConfig> {
  return _config;
}
