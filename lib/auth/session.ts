"use client";

/**
 * Client-side session cookie management.
 * The __session cookie signals to edge middleware that a user is logged in.
 * Actual auth verification always happens server-side via Firebase Admin.
 */

const SESSION_COOKIE = "__session";

export function setSessionCookie(idToken: string): void {
  document.cookie = `${SESSION_COOKIE}=${idToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
}

export function clearSessionCookie(): void {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
}
