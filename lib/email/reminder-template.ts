interface ReminderEmailData {
  displayName: string;
  daysSinceActive: number;
  dashboardUrl: string;
}

export function buildReminderEmail(data: ReminderEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { displayName, daysSinceActive, dashboardUrl } = data;
  const firstName = displayName.split(" ")[0] || displayName;
  const dayLabel = daysSinceActive === 1 ? "day" : "days";

  const subject = `It's been ${daysSinceActive} ${dayLabel} since your last scan`;

  const text = [
    `Hey ${firstName},`,
    "",
    `It's been ${daysSinceActive} ${dayLabel} since your last scan. Your projects are waiting. Jump back in.`,
    "",
    dashboardUrl,
    "",
    "— as_built",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 520px; margin: 48px auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #09090b; padding: 28px 36px; }
    .logo { color: #ffffff; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
    .body { padding: 36px; }
    .greeting { font-size: 15px; color: #374151; margin: 0 0 16px; }
    .nudge { font-size: 17px; color: #111827; font-weight: 500; line-height: 1.5; margin: 0 0 28px; }
    .cta { display: inline-block; background: #09090b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; }
    .footer { padding: 20px 36px; border-top: 1px solid #f3f4f6; }
    .footer-text { font-size: 12px; color: #9ca3af; margin: 0; }
    .footer-link { color: #9ca3af; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <p class="logo">as_built</p>
    </div>
    <div class="body">
      <p class="greeting">Hey ${firstName},</p>
      <p class="nudge">
        It's been ${daysSinceActive} ${dayLabel} since your last scan.
        Your projects are waiting. Jump back in.
      </p>
      <a href="${dashboardUrl}" class="cta">Open dashboard</a>
    </div>
    <div class="footer">
      <p class="footer-text">
        You're receiving this because you have development reminders enabled.
        <a href="${dashboardUrl}/settings" class="footer-link">Update your preferences</a>.
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
