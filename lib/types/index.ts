// ─── Enums / Unions ───────────────────────────────────────────────────────────

export type ScanSource = "zip" | "folder" | "github" | "cli";
export type LlmProvider = "gemini" | "claude" | "openai";
export type LlmTier = "default" | "premium";
export type ScanStatus = "pending" | "processing" | "completed" | "partial" | "failed";

// ─── Shared sub-types ─────────────────────────────────────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ─── Users collection (PRD §12.1) ─────────────────────────────────────────────

export interface UserRecord {
  uid: string;
  email: string;
  displayName: string;
  createdAt: Date;
  lastActiveAt: Date;
  /** Days of inactivity before a reminder email is sent. Default: 3 */
  reminderFrequencyDays: number;
  reminderEnabled: boolean;
  /** AES-256 encrypted LLM API keys keyed by provider name. v2+ only. */
  apiKeys?: Record<string, string>;
  /** AES-256 encrypted GitHub OAuth token. */
  githubAccessToken?: string;
  /** Running total of scans created; used to enforce the 100-scan cap. */
  scanCount: number;
}

export type UserSettings = Pick<
  UserRecord,
  "reminderEnabled" | "reminderFrequencyDays"
>;

// ─── Scans collection (PRD §12.1) ─────────────────────────────────────────────

export interface ScanRecord {
  scanId: string;
  userId: string;
  projectName: string;
  source: ScanSource;
  /** GitHub URL, uploaded filename, or local directory path. */
  sourceRef: string;
  subdirectory: string | null;
  llmProvider: LlmProvider;
  /** Specific model identifier, e.g. "claude-sonnet-4-5". */
  llmModel: string;
  llmTier: LlmTier;
  status: ScanStatus;
  /** Live log messages written by the background function. */
  progressLog: string[];
  outputManifestMd: string;
  outputHumanMd: string;
  outputDriftMd: string | null;
  prdAttached: boolean;
  /** Extracted plain-text content of the attached PRD. */
  prdContent: string | null;
  fileCount: number;
  tokenUsage: TokenUsage;
  createdAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
}

/**
 * Lightweight scan representation for list views — omits large text blobs so
 * the dashboard doesn't pull megabytes of markdown per row.
 */
export type ScanSummary = Omit<
  ScanRecord,
  "outputManifestMd" | "outputHumanMd" | "outputDriftMd" | "prdContent"
>;

// ─── Input types ──────────────────────────────────────────────────────────────

/** Fields known at scan creation time (before the background function runs). */
export type CreateScanInput = Pick<
  ScanRecord,
  | "userId"
  | "projectName"
  | "source"
  | "sourceRef"
  | "subdirectory"
  | "llmProvider"
  | "llmModel"
  | "llmTier"
  | "prdAttached"
>;

/** Payload written by the background function when the scan finishes. */
export interface ScanOutputPayload {
  outputManifestMd: string;
  outputHumanMd: string;
  outputDriftMd?: string | null;
  /** Final inferred project name (may differ from initial placeholder). */
  projectName?: string;
  fileCount: number;
  tokenUsage: TokenUsage;
}
