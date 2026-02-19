import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { withAuth } from "@/lib/auth/server";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/auth/github/disconnect
 *
 * Removes the stored GitHub OAuth token and profile from the user's record.
 */
export const POST = withAuth(async (_request: NextRequest, user) => {
  try {
    await adminDb
      .collection("users")
      .doc(user.uid)
      .update({
        githubAccessToken: FieldValue.delete(),
        githubUsername: FieldValue.delete(),
        githubAvatarUrl: FieldValue.delete(),
        githubConnectedAt: FieldValue.delete(),
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[github-disconnect] error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect GitHub" },
      { status: 500 },
    );
  }
});
