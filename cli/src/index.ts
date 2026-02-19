#!/usr/bin/env node

/**
 * asbuilt-cli — CLI companion for as_built (PRD §18)
 *
 * Commands:
 *   asbuilt login              Authenticate with the web app
 *   asbuilt scan [path]        Scan a project directory
 *   asbuilt history            List recent scans
 *   asbuilt logout             Clear stored credentials
 */

import { Command } from "commander";
import { login, logout, getValidToken } from "./auth.js";
import { runScan, showHistory } from "./scan.js";
import { getStoredAuth, getConfigDir } from "./config.js";
import ora from "ora";
import updateNotifier from "update-notifier";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ─── Update check (PRD §18.2) ──────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
updateNotifier({ pkg }).notify();

const program = new Command();

program
  .name("asbuilt")
  .description("Generate AI-powered documentation from your codebase")
  .version(pkg.version);

// ─── login ──────────────────────────────────────────────────────────────────

program
  .command("login")
  .description("Authenticate with as_built via browser")
  .action(async () => {
    // Check if already logged in
    const existing = await getStoredAuth();
    if (existing) {
      try {
        await getValidToken();
        console.log(`Already logged in as ${existing.email || existing.uid}`);
        console.log('Run "asbuilt logout" first to switch accounts.');
        return;
      } catch {
        // Token invalid, proceed with login
      }
    }

    const spinner = ora("Opening browser for authentication...").start();
    try {
      const result = await login();
      spinner.succeed(`Logged in as ${result.email || result.uid}`);
      console.log(`\nCredentials stored in ${getConfigDir()}/config.json`);
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Login failed");
      process.exit(1);
    }
  });

// ─── logout ─────────────────────────────────────────────────────────────────

program
  .command("logout")
  .description("Clear stored credentials")
  .action(async () => {
    await logout();
    console.log("Logged out. Credentials cleared.");
  });

// ─── scan ───────────────────────────────────────────────────────────────────

program
  .command("scan")
  .argument("[path]", "Project directory to scan", ".")
  .description("Scan a project directory and generate documentation")
  .option("--model <provider>", "LLM provider (gemini, claude, openai)")
  .option("--premium", "Use premium (Opus-tier) model")
  .option("--prd <path>", "Path to PRD file for drift analysis")
  .option("--output <dir>", "Output directory for results")
  .option("--subdir <path>", "Scan a subdirectory only")
  .action(async (path: string, options: Record<string, unknown>) => {
    await runScan(path, {
      model: options.model as string | undefined,
      premium: options.premium as boolean | undefined,
      prd: options.prd as string | undefined,
      output: options.output as string | undefined,
      subdir: options.subdir as string | undefined,
    });
  });

// ─── history ────────────────────────────────────────────────────────────────

program
  .command("history")
  .description("List recent scans")
  .option("--limit <n>", "Max results to show", "20")
  .action(async (options: Record<string, unknown>) => {
    await showHistory({
      limit: parseInt(options.limit as string, 10) || 20,
    });
  });

// ─── Run ────────────────────────────────────────────────────────────────────

program.parse();
