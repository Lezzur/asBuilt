import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { UserRecord, UserSettings } from "@/lib/types";

const COL = "users";

function toUserRecord(
  uid: string,
  data: FirebaseFirestore.DocumentData
): UserRecord {
  return {
    uid,
    email: data.email,
    displayName: data.displayName,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    lastActiveAt: data.lastActiveAt?.toDate() ?? new Date(),
    reminderFrequencyDays: data.reminderFrequencyDays ?? 3,
    reminderEnabled: data.reminderEnabled ?? true,
    apiKeys: data.apiKeys,
    githubAccessToken: data.githubAccessToken,
    scanCount: data.scanCount ?? 0,
  };
}

export async function createUser(
  uid: string,
  email: string,
  displayName: string
): Promise<UserRecord> {
  const now = FieldValue.serverTimestamp();
  await adminDb.collection(COL).doc(uid).set({
    email,
    displayName,
    createdAt: now,
    lastActiveAt: now,
    reminderFrequencyDays: 3,
    reminderEnabled: true,
    scanCount: 0,
  });

  return {
    uid,
    email,
    displayName,
    createdAt: new Date(),
    lastActiveAt: new Date(),
    reminderFrequencyDays: 3,
    reminderEnabled: true,
    scanCount: 0,
  };
}

export async function getUser(uid: string): Promise<UserRecord | null> {
  const doc = await adminDb.collection(COL).doc(uid).get();
  if (!doc.exists) return null;
  return toUserRecord(uid, doc.data()!);
}

export async function updateLastActive(uid: string): Promise<void> {
  await adminDb
    .collection(COL)
    .doc(uid)
    .set({ lastActiveAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function updateUserSettings(
  uid: string,
  settings: Partial<UserSettings>
): Promise<void> {
  await adminDb.collection(COL).doc(uid).update(settings);
}

export async function incrementScanCount(uid: string): Promise<void> {
  await adminDb
    .collection(COL)
    .doc(uid)
    .update({ scanCount: FieldValue.increment(1) });
}

export async function setScanCount(uid: string, count: number): Promise<void> {
  await adminDb.collection(COL).doc(uid).update({ scanCount: count });
}

/** Returns all users who have reminders enabled and are overdue for a nudge. */
export async function getUsersDueForReminder(): Promise<UserRecord[]> {
  const snapshot = await adminDb
    .collection(COL)
    .where("reminderEnabled", "==", true)
    .get();

  const now = Date.now();
  return snapshot.docs
    .map((doc) => toUserRecord(doc.id, doc.data()))
    .filter((user) => {
      const msPerDay = 86_400_000;
      const daysSinceActive =
        (now - user.lastActiveAt.getTime()) / msPerDay;
      return daysSinceActive >= user.reminderFrequencyDays;
    });
}
