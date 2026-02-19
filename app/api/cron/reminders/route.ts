import { NextRequest, NextResponse } from "next/server";
import { getUsersDueForReminder } from "@/lib/db/users";
import { sendReminderEmail } from "@/lib/email/send-reminder";

/**
 * GET /api/cron/reminders
 *
 * Triggered daily at 09:00 UTC by Vercel Cron (vercel.json).
 * Validates the CRON_SECRET, fetches users overdue for a reminder,
 * and sends a nudge email to each via Resend.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/reminders] CRON_SECRET is not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let users;
  try {
    users = await getUsersDueForReminder();
  } catch (err) {
    console.error("[cron/reminders] Failed to query users:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  if (users.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const now = Date.now();
  const msPerDay = 86_400_000;
  let sent = 0;
  const failures: string[] = [];

  await Promise.allSettled(
    users.map(async (user) => {
      const daysSinceActive = Math.floor(
        (now - user.lastActiveAt.getTime()) / msPerDay
      );
      try {
        await sendReminderEmail({
          to: user.email,
          displayName: user.displayName,
          daysSinceActive,
        });
        sent++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cron/reminders] Failed to send to ${user.email}:`, message);
        failures.push(user.email);
      }
    })
  );

  console.log(`[cron/reminders] Sent ${sent}/${users.length} reminders. Failures: ${failures.length}`);

  return NextResponse.json({
    sent,
    total: users.length,
    failures: failures.length,
  });
}
