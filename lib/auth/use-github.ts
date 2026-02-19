"use client";

import { useCallback } from "react";
import { useAuth } from "./context";

/**
 * Hook for managing the GitHub OAuth connection.
 * Handles the browser redirect flow by setting a uid cookie
 * before redirecting so the callback can identify the user.
 */
export function useGitHub() {
  const { user, getIdToken } = useAuth();

  const connect = useCallback(async () => {
    if (!user) {
      throw new Error("Must be logged in to connect GitHub");
    }

    // Store uid in a short-lived cookie so the callback can identify the user
    // (the redirect flow loses the Authorization header).
    document.cookie = `github_oauth_uid=${user.uid}; path=/; max-age=600; SameSite=Lax; Secure`;

    // Redirect to the OAuth initiation endpoint
    window.location.href = "/api/auth/github";
  }, [user]);

  const disconnect = useCallback(async () => {
    const token = await getIdToken();
    if (!token) {
      throw new Error("Must be logged in to disconnect GitHub");
    }

    const response = await fetch("/api/auth/github/disconnect", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error ?? "Failed to disconnect GitHub");
    }
  }, [getIdToken]);

  return { connect, disconnect };
}
