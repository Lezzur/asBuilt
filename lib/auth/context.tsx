"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import { getClientAuth } from "@/lib/firebase";
import type { AuthContextValue, AuthUser } from "./types";
import { mapFirebaseUser } from "./types";
import { setSessionCookie, clearSessionCookie } from "./session";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const firebaseAuth = getClientAuth();
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (firebaseUser) => {
        setUser(firebaseUser ? mapFirebaseUser(firebaseUser) : null);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("[auth] state change error:", err.message);
        setError(err.message);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const credential = await signInWithEmailAndPassword(
          getClientAuth(),
          email,
          password,
        );
        const idToken = await credential.user.getIdToken();
        setSessionCookie(idToken);
        setUser(mapFirebaseUser(credential.user));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Sign in failed";
        setError(message);
        throw err;
      }
    },
    [],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      setError(null);
      try {
        const credential = await createUserWithEmailAndPassword(
          getClientAuth(),
          email,
          password,
        );
        if (displayName) {
          await updateProfile(credential.user, { displayName });
        }
        const idToken = await credential.user.getIdToken();
        setSessionCookie(idToken);

        // Create the Firestore user document so downstream features
        // (settings, GitHub OAuth, scans) can find the user record.
        await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ displayName: displayName ?? "" }),
        });

        setUser(mapFirebaseUser(credential.user));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Sign up failed";
        setError(message);
        throw err;
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    setError(null);
    try {
      clearSessionCookie();
      await firebaseSignOut(getClientAuth());
      setUser(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Sign out failed";
      setError(message);
      throw err;
    }
  }, []);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    const currentUser = getClientAuth().currentUser;
    if (!currentUser) return null;
    return currentUser.getIdToken();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      getIdToken,
    }),
    [user, loading, error, signInWithEmail, signUpWithEmail, signOut, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
