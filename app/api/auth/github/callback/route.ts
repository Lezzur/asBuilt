import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { encrypt } from "@/lib/crypto";
import { exchangeCodeForToken, fetchGitHubUser } from "@/lib/github";
import { verifyAuthToken } from "@/lib/auth/server";

/**
 * GET /api/auth/github/callback
 *
 * GitHub OAuth callback handler.
 * 1. Validates the CSRF state parameter.
 * 2. Exchanges the authorization code for an access token.
 * 3. Fetches the GitHub user profile.
 * 4. Encrypts the token with AES-256 and stores it in the user's Firestore doc.
 * 5. Redirects to settings page with a success indicator.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const settingsUrl = new URL("/settings", appUrl);

  // GitHub denied the request
  if (error) {
    console.error("[github-oauth] denied by user:", error);
    settingsUrl.searchParams.set("github", "denied");
    return NextResponse.redirect(settingsUrl.toString());
  }

  // Missing code or state
  if (!code || !state) {
    settingsUrl.searchParams.set("github", "error");
    return NextResponse.redirect(settingsUrl.toString());
  }

  // Validate CSRF state
  const storedState = request.cookies.get("github_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    console.error("[github-oauth] state mismatch");
    settingsUrl.searchParams.set("github", "error");
    const response = NextResponse.redirect(settingsUrl.toString());
    response.cookies.delete("github_oauth_state");
    return response;
  }

  // Verify the user is authenticated with Firebase
  const user = await verifyAuthToken(request);

  // Also check the __session cookie as a fallback (browser redirect flow
  // doesn't carry the Authorization header, so middleware sets the cookie)
  let uid: string | null = user?.uid ?? null;

  if (!uid) {
    // In the browser OAuth redirect flow, the Firebase ID token lives in
    // the __session cookie rather than an Authorization header.
    // We still need to identify the user — fall back to a uid cookie
    // set before initiating the OAuth flow.
    const uidCookie = request.cookies.get("github_oauth_uid")?.value;
    if (uidCookie) {
      uid = uidCookie;
    }
  }

  if (!uid) {
    console.error("[github-oauth] no authenticated user found");
    settingsUrl.searchParams.set("github", "auth_error");
    const response = NextResponse.redirect(settingsUrl.toString());
    response.cookies.delete("github_oauth_state");
    return response;
  }

  try {
    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(code);

    // Fetch GitHub user profile
    const ghUser = await fetchGitHubUser(accessToken);

    // Encrypt the token before storing
    const encryptedToken = encrypt(accessToken);

    // Store in Firestore user document
    await adminDb
      .collection("users")
      .doc(uid)
      .set(
        {
          githubAccessToken: encryptedToken,
          githubUsername: ghUser.login,
          githubAvatarUrl: ghUser.avatar_url,
          githubConnectedAt: new Date(),
        },
        { merge: true },
      );

    settingsUrl.searchParams.set("github", "connected");

    const response = NextResponse.redirect(settingsUrl.toString());
    response.cookies.delete("github_oauth_state");
    response.cookies.delete("github_oauth_uid");
    return response;
  } catch (err) {
    console.error("[github-oauth] callback error:", err);
    settingsUrl.searchParams.set("github", "error");
    const response = NextResponse.redirect(settingsUrl.toString());
    response.cookies.delete("github_oauth_state");
    return response;
  }
}
