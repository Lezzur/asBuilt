import { getSuiteAuthConfig } from "./config";

/**
 * Creates config-aware session cookie helpers.
 *
 * Returns set/clear functions that use the cookie name and max-age
 * from the suite auth config, so each baryapps app can customize
 * session behavior without modifying the cookie logic.
 *
 * Usage:
 *   const { setSession, clearSession } = createSessionHelpers();
 *   setSession(idToken);
 */
export function createSessionHelpers() {
  const config = getSuiteAuthConfig();

  function setSession(idToken: string): void {
    document.cookie = `${config.sessionCookieName}=${idToken}; path=/; max-age=${config.sessionMaxAge}; SameSite=Lax; Secure`;
  }

  function clearSession(): void {
    document.cookie = `${config.sessionCookieName}=; path=/; max-age=0`;
  }

  return { setSession, clearSession };
}
