import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

export interface VerifiedUser {
  uid: string;
  email: string | undefined;
}

/**
 * Extracts and verifies the Firebase ID token from the Authorization header.
 * Returns the decoded user or null if invalid/missing.
 */
export async function verifyAuthToken(
  request: NextRequest,
): Promise<VerifiedUser | null> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice(7);
  if (!token) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

/**
 * Higher-order function that wraps an API route handler with auth verification.
 * Returns 401 if the request is not authenticated.
 */
export function withAuth<T>(
  handler: (
    request: NextRequest,
    user: VerifiedUser,
    context: T,
  ) => Promise<NextResponse>,
) {
  return async (request: NextRequest, context: T): Promise<NextResponse> => {
    const user = await verifyAuthToken(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(request, user, context);
  };
}
