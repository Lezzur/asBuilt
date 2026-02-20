import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/server";
import { getUser, createUser } from "@/lib/db/users";

/**
 * POST /api/auth/register
 *
 * Creates the Firestore user document after Firebase Auth signup.
 * Idempotent — returns the existing record if the document already exists.
 */
export const POST = withAuth<object>(async (request, user) => {
  const existing = await getUser(user.uid);
  if (existing) {
    return NextResponse.json({ uid: existing.uid });
  }

  let body: { displayName?: string } = {};
  try {
    body = (await request.json()) as { displayName?: string };
  } catch {
    // body is optional
  }

  const record = await createUser(
    user.uid,
    user.email ?? "",
    body.displayName ?? "",
  );

  return NextResponse.json({ uid: record.uid }, { status: 201 });
});
