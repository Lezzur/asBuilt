import { Resend } from "resend";
import { buildReminderEmail } from "./reminder-template";

const FROM_ADDRESS = "as_built <reminders@mail.as-built.app>";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY environment variable is not set");
    _resend = new Resend(key);
  }
  return _resend;
}

export interface ReminderPayload {
  to: string;
  displayName: string;
  daysSinceActive: number;
}

export async function sendReminderEmail(payload: ReminderPayload): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://as-built.app";
  const { subject, html, text } = buildReminderEmail({
    displayName: payload.displayName,
    daysSinceActive: payload.daysSinceActive,
    dashboardUrl: appUrl,
  });

  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: payload.to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(`Resend error for ${payload.to}: ${error.message}`);
  }
}
