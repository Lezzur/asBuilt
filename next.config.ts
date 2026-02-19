import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Puppeteer, Chromium, and md-to-pdf as Node.js server-side modules.
  // They must not be bundled by webpack — they rely on native binaries and
  // dynamic requires that are incompatible with the Next.js module bundler.
  serverExternalPackages: ["md-to-pdf", "puppeteer", "@sparticuz/chromium"],
};

export default nextConfig;
