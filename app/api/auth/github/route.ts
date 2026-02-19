import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildGitHubAuthUrl } from "@/lib/github";

/**
 * GET /api/auth/github
 *
 * Initiates the GitHub OAuth flow. Generates a CSRF state token,
 * stores it in a short-lived cookie, and redirects to GitHub.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const state = randomBytes(16).toString("hex");
    const authUrl = buildGitHubAuthUrl(state);

    const response = NextResponse.redirect(authUrl);

    // Set state cookie for CSRF validation in the callback
    response.cookies.set("github_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[github-oauth] initiation error:", error);
    return NextResponse.json(
      { error: "Failed to initiate GitHub OAuth" },
      { status: 500 },
    );
  }
}
