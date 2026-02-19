/**
 * Browser-based auth flow for CLI (PRD §18.3)
 *
 * Flow:
 * 1. CLI starts a temporary HTTP server on a random localhost port
 * 2. CLI opens the browser to the web app's /cli-auth page with a callback URL
 * 3. User logs in through the web app
 * 4. Web app redirects to localhost callback with auth token data
 * 5. CLI captures the token, stores it in ~/.asbuilt/config.json
 * 6. CLI shuts down the temporary server
 *
 * The token handoff uses a POST from the browser (via form redirect) containing
 * the Firebase ID token, refresh token, and user info. This avoids putting
 * sensitive tokens in URL query parameters.
 *
 * Token refresh: Firebase ID tokens expire after 1 hour. The CLI stores the
 * refresh token and uses the Firebase REST API to get a fresh ID token before
 * each API call.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { URL, URLSearchParams } from "url";
import open from "open";
import { saveAuth, getStoredAuth, clearAuth, getApiUrl } from "./config.js";
import type { StoredAuth } from "./config.js";

// Firebase token refresh endpoint
const FIREBASE_TOKEN_REFRESH_URL =
  "https://securetoken.googleapis.com/v1/token";

// ─── Login flow ─────────────────────────────────────────────────────────────

interface LoginResult {
  email: string;
  uid: string;
}

/**
 * Runs the full browser-based login flow.
 *
 * Starts a localhost server, opens the browser to the auth page,
 * waits for the callback with tokens, then stores them.
 */
export async function login(): Promise<LoginResult> {
  const apiUrl = await getApiUrl();

  return new Promise<LoginResult>((resolve, reject) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // ── Handle the callback POST from the browser ──
      if (req.method === "POST" && req.url === "/callback") {
        try {
          const body = await readBody(req);
          const params = new URLSearchParams(body);

          const idToken = params.get("idToken");
          const refreshToken = params.get("refreshToken");
          const email = params.get("email");
          const uid = params.get("uid");
          const expiresIn = params.get("expiresIn");
          const apiKey = params.get("apiKey");

          if (!idToken || !refreshToken || !uid || !apiKey) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(errorPage("Missing required auth parameters."));
            return;
          }

          const expiresAt =
            Date.now() + (parseInt(expiresIn || "3600", 10) - 60) * 1000;

          const auth: StoredAuth = {
            idToken,
            refreshToken,
            email: email || "",
            uid,
            expiresAt,
            apiKey,
          };

          await saveAuth(auth);

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(successPage(email || uid));

          // Shut down server after response is sent
          server.close();
          resolve({ email: email || "", uid });
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(errorPage("Failed to process authentication."));
          server.close();
          reject(err);
        }
        return;
      }

      // ── Handle the GET callback (fallback for query-param based flow) ──
      if (req.method === "GET" && req.url?.startsWith("/callback")) {
        try {
          const url = new URL(req.url, `http://localhost`);
          const idToken = url.searchParams.get("idToken");
          const refreshToken = url.searchParams.get("refreshToken");
          const email = url.searchParams.get("email");
          const uid = url.searchParams.get("uid");
          const expiresIn = url.searchParams.get("expiresIn");
          const apiKey = url.searchParams.get("apiKey");

          if (!idToken || !refreshToken || !uid || !apiKey) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(errorPage("Missing required auth parameters."));
            return;
          }

          const expiresAt =
            Date.now() + (parseInt(expiresIn || "3600", 10) - 60) * 1000;

          const auth: StoredAuth = {
            idToken,
            refreshToken,
            email: email || "",
            uid,
            expiresAt,
            apiKey,
          };

          await saveAuth(auth);

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(successPage(email || uid));

          server.close();
          resolve({ email: email || "", uid });
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(errorPage("Failed to process authentication."));
          server.close();
          reject(err);
        }
        return;
      }

      // ── Everything else → 404 ──
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    });

    // Listen on a random available port
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to start local auth server"));
        return;
      }

      const port = addr.port;
      const callbackUrl = `http://127.0.0.1:${port}/callback`;
      const authUrl = `${apiUrl}/cli-auth?callback=${encodeURIComponent(callbackUrl)}`;

      // Open the browser
      open(authUrl).catch(() => {
        // If open fails, user can manually navigate
        console.log(`\nOpen this URL in your browser:\n  ${authUrl}\n`);
      });
    });

    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Login timed out. Please try again."));
    }, 5 * 60 * 1000);

    server.on("close", () => clearTimeout(timeout));
  });
}

// ─── Token refresh ──────────────────────────────────────────────────────────

/**
 * Returns a valid Firebase ID token, refreshing if expired.
 *
 * Firebase ID tokens expire after 1 hour. We store the refresh token
 * and use the Firebase REST API (securetoken.googleapis.com) to get
 * a fresh ID token when needed.
 */
export async function getValidToken(): Promise<string> {
  const auth = await getStoredAuth();
  if (!auth) {
    throw new Error(
      "Not logged in. Run `asbuilt login` first.",
    );
  }

  // If token is still valid (with 60s buffer already baked in), use it
  if (Date.now() < auth.expiresAt) {
    return auth.idToken;
  }

  // Token expired — refresh it
  const response = await fetch(
    `${FIREBASE_TOKEN_REFRESH_URL}?key=${auth.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: auth.refreshToken,
      }),
    },
  );

  if (!response.ok) {
    // Refresh token is invalid — user needs to login again
    await clearAuth();
    throw new Error(
      "Session expired. Please run `asbuilt login` to re-authenticate.",
    );
  }

  const data = (await response.json()) as {
    id_token: string;
    refresh_token: string;
    expires_in: string;
  };

  // Update stored tokens
  const updatedAuth: StoredAuth = {
    ...auth,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (parseInt(data.expires_in, 10) - 60) * 1000,
  };

  await saveAuth(updatedAuth);
  return data.id_token;
}

// ─── Logout ─────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  await clearAuth();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function successPage(userDisplay: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>as_built CLI — Authenticated</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center;
           align-items: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa; }
    .card { text-align: center; padding: 3rem; }
    .check { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
    p { color: #a1a1aa; margin: 0; }
    .close { margin-top: 1.5rem; color: #71717a; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">&#10003;</div>
    <h1>Authenticated</h1>
    <p>Signed in as <strong>${escapeHtml(userDisplay)}</strong></p>
    <p class="close">You can close this tab and return to your terminal.</p>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>as_built CLI — Error</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center;
           align-items: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa; }
    .card { text-align: center; padding: 3rem; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; margin: 0 0 0.5rem; color: #ef4444; }
    p { color: #a1a1aa; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10007;</div>
    <h1>Authentication Failed</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
