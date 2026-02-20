import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/server";
import { getUser, updateUserSettings } from "@/lib/db/users";
import type { UserSettings } from "@/lib/types";

const VALID_FREQUENCIES = [1, 2, 3, 5, 7] as const;

/** GET /api/user/settings — returns the current user's settings + GitHub status. */
export const GET = withAuth<object>(async (request, user) => {
  const userData = await getUser(user.uid);
  if (!userData) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const settings: UserSettings = {
    reminderEnabled: userData.reminderEnabled,
    reminderFrequencyDays: userData.reminderFrequencyDays,
  };

  return NextResponse.json({
    settings,
    githubConnected: !!userData.githubAccessToken,
  });
});

/**
 * PATCH /api/user/settings — partially updates the user's reminder settings.
 *
 * Body (all optional):
 *   reminderEnabled       boolean
 *   reminderFrequencyDays 1 | 2 | 3 | 5 | 7
 */
export const PATCH = withAuth<object>(async (request, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const settings: Partial<UserSettings> = {};

  if ("reminderEnabled" in input) {
    if (typeof input.reminderEnabled !== "boolean") {
      return NextResponse.json(
        { error: "reminderEnabled must be a boolean" },
        { status: 400 }
      );
    }
    settings.reminderEnabled = input.reminderEnabled;
  }

  if ("reminderFrequencyDays" in input) {
    const freq = input.reminderFrequencyDays;
    if (!VALID_FREQUENCIES.includes(freq as (typeof VALID_FREQUENCIES)[number])) {
      return NextResponse.json(
        { error: `reminderFrequencyDays must be one of: ${VALID_FREQUENCIES.join(", ")}` },
        { status: 400 }
      );
    }
    settings.reminderFrequencyDays = freq as number;
  }

  if (Object.keys(settings).length === 0) {
    return NextResponse.json(
      { error: "No valid fields provided" },
      { status: 400 }
    );
  }

  await updateUserSettings(user.uid, settings);
  return NextResponse.json({ success: true });
});
