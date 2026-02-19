import { adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { setScanCount } from "@/lib/db/users";
import type {
  ScanRecord,
  ScanSummary,
  ScanStatus,
  CreateScanInput,
  ScanOutputPayload,
} from "@/lib/types";

const COL = "scans";
const MAX_SCANS_PER_USER = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toScanRecord(
  id: string,
  data: FirebaseFirestore.DocumentData
): ScanRecord {
  return {
    scanId: id,
    userId: data.userId,
    projectName: data.projectName,
    source: data.source,
    sourceRef: data.sourceRef,
    subdirectory: data.subdirectory ?? null,
    llmProvider: data.llmProvider,
    llmModel: data.llmModel,
    llmTier: data.llmTier,
    status: data.status,
    progressLog: data.progressLog ?? [],
    outputAgentMd: data.outputAgentMd ?? "",
    outputHumanMd: data.outputHumanMd ?? "",
    outputDriftMd: data.outputDriftMd ?? null,
    prdAttached: data.prdAttached ?? false,
    prdContent: data.prdContent ?? null,
    fileCount: data.fileCount ?? 0,
    tokenUsage: data.tokenUsage ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    createdAt: data.createdAt?.toDate() ?? new Date(),
    completedAt: data.completedAt?.toDate() ?? null,
    errorMessage: data.errorMessage ?? null,
  };
}

function toScanSummary(
  id: string,
  data: FirebaseFirestore.DocumentData
): ScanSummary {
  const full = toScanRecord(id, data);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { outputAgentMd, outputHumanMd, outputDriftMd, prdContent, ...summary } =
    full;
  return summary;
}

// ─── Scan history cap (PRD §12.2) ─────────────────────────────────────────────

/**
 * Enforces the 100-scan-per-user limit. If the user already has MAX_SCANS_PER_USER
 * or more scans, the oldest ones are batch-deleted to make room for one new scan.
 * The user's scanCount is then synced to reflect the post-deletion count.
 */
async function enforceScanLimit(userId: string): Promise<void> {
  const snapshot = await adminDb
    .collection(COL)
    .where("userId", "==", userId)
    .orderBy("createdAt", "asc")
    .get();

  const count = snapshot.size;
  if (count < MAX_SCANS_PER_USER) return;

  // Delete oldest scans so the user ends up at MAX - 1 (room for the new one)
  const deleteCount = count - MAX_SCANS_PER_USER + 1;
  const toDelete = snapshot.docs.slice(0, deleteCount);

  const batch = adminDb.batch();
  for (const doc of toDelete) {
    batch.delete(doc.ref);
  }
  await batch.commit();

  // Sync scanCount on the user document
  await setScanCount(userId, MAX_SCANS_PER_USER - 1);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Creates a new scan record with status "pending". Enforces the 100-scan cap
 * before writing, auto-deleting the oldest scan(s) if necessary.
 */
export async function createScan(input: CreateScanInput): Promise<ScanRecord> {
  await enforceScanLimit(input.userId);

  const docRef = adminDb.collection(COL).doc();
  const nowTs = Timestamp.now();

  const data = {
    userId: input.userId,
    projectName: input.projectName,
    source: input.source,
    sourceRef: input.sourceRef,
    subdirectory: input.subdirectory ?? null,
    llmProvider: input.llmProvider,
    llmModel: input.llmModel,
    llmTier: input.llmTier,
    prdAttached: input.prdAttached,
    status: "pending" as ScanStatus,
    progressLog: [],
    outputAgentMd: "",
    outputHumanMd: "",
    outputDriftMd: null,
    prdContent: null,
    fileCount: 0,
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    createdAt: FieldValue.serverTimestamp(),
    completedAt: null,
    errorMessage: null,
  };

  await docRef.set(data);

  return {
    ...data,
    scanId: docRef.id,
    status: "pending",
    createdAt: nowTs.toDate(),
    completedAt: null,
    errorMessage: null,
  };
}

export async function getScan(scanId: string): Promise<ScanRecord | null> {
  const doc = await adminDb.collection(COL).doc(scanId).get();
  if (!doc.exists) return null;
  return toScanRecord(doc.id, doc.data()!);
}

/**
 * Returns lightweight scan summaries for the dashboard list.
 * Large markdown output fields are excluded via Firestore field masks.
 */
export async function listScanSummaries(
  userId: string,
  limit = 100
): Promise<ScanSummary[]> {
  const snapshot = await adminDb
    .collection(COL)
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .select(
      "userId",
      "projectName",
      "source",
      "sourceRef",
      "subdirectory",
      "llmProvider",
      "llmModel",
      "llmTier",
      "status",
      "progressLog",
      "prdAttached",
      "fileCount",
      "tokenUsage",
      "createdAt",
      "completedAt",
      "errorMessage"
    )
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => toScanSummary(doc.id, doc.data()));
}

export async function updateScanStatus(
  scanId: string,
  status: ScanStatus,
  errorMessage?: string
): Promise<void> {
  const update: Record<string, unknown> = { status };

  if (status === "completed" || status === "failed") {
    update.completedAt = FieldValue.serverTimestamp();
  }
  if (errorMessage !== undefined) {
    update.errorMessage = errorMessage;
  }

  await adminDb.collection(COL).doc(scanId).update(update);
}

/** Appends a single progress log line for the live processing screen. */
export async function appendProgressLog(
  scanId: string,
  message: string
): Promise<void> {
  await adminDb
    .collection(COL)
    .doc(scanId)
    .update({ progressLog: FieldValue.arrayUnion(message) });
}

/** Saves PRD text after extraction — stored alongside the scan for drift analysis. */
export async function savePrdContent(
  scanId: string,
  prdContent: string
): Promise<void> {
  await adminDb.collection(COL).doc(scanId).update({ prdContent });
}

/** Writes final LLM outputs and marks the scan completed in a single write. */
export async function saveScanOutputs(
  scanId: string,
  payload: ScanOutputPayload
): Promise<void> {
  await adminDb
    .collection(COL)
    .doc(scanId)
    .update({
      outputAgentMd: payload.outputAgentMd,
      outputHumanMd: payload.outputHumanMd,
      outputDriftMd: payload.outputDriftMd ?? null,
      fileCount: payload.fileCount,
      tokenUsage: payload.tokenUsage,
      ...(payload.projectName ? { projectName: payload.projectName } : {}),
      status: "completed" as ScanStatus,
      completedAt: FieldValue.serverTimestamp(),
    });
}

export async function deleteScan(
  scanId: string,
  userId: string
): Promise<void> {
  const batch = adminDb.batch();
  batch.delete(adminDb.collection(COL).doc(scanId));
  // Decrement scanCount atomically
  batch.update(adminDb.collection("users").doc(userId), {
    scanCount: FieldValue.increment(-1),
  });
  await batch.commit();
}
