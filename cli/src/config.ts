/**
 * Token storage and config management.
 *
 * Stores Firebase auth credentials in ~/.asbuilt/config.json.
 * Reads .asbuiltrc from the project root for project-level defaults.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

// ─── Paths ──────────────────────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), ".asbuilt");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StoredAuth {
  idToken: string;
  refreshToken: string;
  email: string;
  uid: string;
  expiresAt: number;
  apiKey: string;
}

export interface CliConfig {
  auth?: StoredAuth;
  apiUrl?: string;
}

export interface ProjectConfig {
  model?: string;
  output?: string;
  subdir?: string;
  premium?: boolean;
}

// ─── Config file I/O ────────────────────────────────────────────────────────

export async function loadConfig(): Promise<CliConfig> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as CliConfig;
  } catch {
    return {};
  }
}

export async function saveConfig(config: CliConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export async function clearAuth(): Promise<void> {
  const config = await loadConfig();
  delete config.auth;
  await saveConfig(config);
}

export async function getStoredAuth(): Promise<StoredAuth | null> {
  const config = await loadConfig();
  return config.auth ?? null;
}

export async function saveAuth(auth: StoredAuth): Promise<void> {
  const config = await loadConfig();
  config.auth = auth;
  await saveConfig(config);
}

// ─── .asbuiltrc project config ──────────────────────────────────────────────

export async function loadProjectConfig(
  projectRoot: string,
): Promise<ProjectConfig> {
  try {
    const raw = await readFile(join(projectRoot, ".asbuiltrc"), "utf-8");
    return JSON.parse(raw) as ProjectConfig;
  } catch {
    return {};
  }
}

// ─── API URL ────────────────────────────────────────────────────────────────

const DEFAULT_API_URL = "https://asbuilt.baryapps.com";

export async function getApiUrl(): Promise<string> {
  const config = await loadConfig();
  return config.apiUrl ?? DEFAULT_API_URL;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}
