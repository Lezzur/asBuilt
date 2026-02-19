"use client";

/**
 * /cli-auth — Browser-side of the CLI login flow (PRD §18.3)
 *
 * Flow:
 * 1. CLI opens browser to /cli-auth?callback=http://127.0.0.1:<port>/callback
 * 2. User signs in or signs up on this page
 * 3. On success, this page POSTs the Firebase auth tokens to the callback URL
 * 4. CLI captures the tokens and stores them locally
 *
 * The callback URL is validated to only allow localhost origins (127.0.0.1)
 * to prevent token exfiltration to arbitrary hosts.
 */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { getClientAuth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileCode2, Loader2, Terminal, CheckCircle2, XCircle } from "lucide-react";

type Mode = "signin" | "signup";
type FlowState = "auth" | "sending" | "success" | "error";

function isLocalhostCallback(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost"
    );
  } catch {
    return false;
  }
}

export default function CliAuthPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callback");
  const { user, signInWithEmail, signUpWithEmail } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flowState, setFlowState] = useState<FlowState>("auth");

  // Validate callback URL
  const validCallback = callbackUrl && isLocalhostCallback(callbackUrl);

  // If user is already logged in, send tokens immediately
  const sendTokens = useCallback(async () => {
    if (!validCallback || !callbackUrl) return;

    setFlowState("sending");

    try {
      const firebaseAuth = getClientAuth();
      const currentUser = firebaseAuth.currentUser;
      if (!currentUser) {
        throw new Error("No authenticated user");
      }

      const idToken = await currentUser.getIdToken(true);
      // Access the stsTokenManager for refresh token
      const userJson = currentUser.toJSON() as Record<string, unknown>;
      const stsManager = userJson.stsTokenManager as Record<string, unknown> | undefined;
      const refreshToken = (stsManager?.refreshToken as string) ?? "";
      const apiKey = firebaseAuth.app.options.apiKey ?? "";

      // POST tokens to CLI's localhost callback
      const params = new URLSearchParams({
        idToken,
        refreshToken,
        email: currentUser.email ?? "",
        uid: currentUser.uid,
        expiresIn: "3600",
        apiKey,
      });

      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!response.ok) {
        throw new Error(`CLI callback returned ${response.status}`);
      }

      setFlowState("success");
    } catch (err) {
      console.error("[cli-auth] Token handoff failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send credentials to CLI",
      );
      setFlowState("error");
    }
  }, [validCallback, callbackUrl]);

  // Auto-send if user is already authenticated
  useEffect(() => {
    if (user && validCallback && flowState === "auth") {
      sendTokens();
    }
  }, [user, validCallback, flowState, sendTokens]);

  // No callback URL or invalid
  if (!callbackUrl || !validCallback) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Invalid Request
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This page is used by the asbuilt CLI for authentication. Run{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                asbuilt login
              </code>{" "}
              from your terminal to start the login flow.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (flowState === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
            <h2 className="text-lg font-semibold">Authenticated</h2>
            <p className="text-sm text-muted-foreground">
              You can close this tab and return to your terminal.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sending state
  if (flowState === "sending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Sending credentials to CLI...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Auth form
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, displayName || undefined);
      }
      // After successful auth, useEffect will trigger sendTokens
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Authentication failed";
      setError(
        msg
          .replace("Firebase: ", "")
          .replace(/\(auth\/.*\)\.?/, "")
          .trim(),
      );
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <FileCode2 className="h-7 w-7" />
            <span className="font-mono text-2xl font-semibold">as_built</span>
          </div>
          <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Terminal className="h-3.5 w-3.5" />
            <span>CLI Authentication</span>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {mode === "signin" ? "Sign in" : "Create account"}
            </CardTitle>
            <CardDescription>
              Sign in to connect your terminal to as_built.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="displayName">Name</Label>
                  <Input
                    id="displayName"
                    type="text"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={
                    mode === "signup" ? "At least 6 characters" : "********"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              {mode === "signin" ? (
                <>
                  No account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                    }}
                    className="text-foreground underline underline-offset-2 hover:no-underline"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                    }}
                    className="text-foreground underline underline-offset-2 hover:no-underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
