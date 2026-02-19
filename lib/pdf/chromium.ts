/**
 * Returns puppeteer launch options for the current environment.
 *
 * On Vercel (and other serverless environments), uses @sparticuz/chromium
 * which provides a Lambda-compatible Chromium binary. Locally, falls back
 * to the Chromium bundled with puppeteer via md-to-pdf.
 *
 * If bundle size becomes an issue on Vercel, swap @sparticuz/chromium for
 * @sparticuz/chromium-min and pass an S3 URL to executablePath().
 */
export async function getLaunchOptions(): Promise<Record<string, unknown>> {
  const isServerless = process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;

  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    };
  }

  return {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };
}
