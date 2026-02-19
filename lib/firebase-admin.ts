import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

let _app: App | undefined;

function getAdminApp(): App {
  if (_app) return _app;
  if (getApps().length > 0) {
    _app = getApps()[0];
    return _app;
  }

  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_ADMIN_SERVICE_ACCOUNT environment variable is not set",
    );
  }

  _app = initializeApp({
    credential: cert(JSON.parse(raw)),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
  return _app;
}

// Lazy getters — only initialize when actually called at runtime,
// not at module-import time during the build.

let _auth: Auth | undefined;
export function getAdminAuth(): Auth {
  if (!_auth) _auth = getAuth(getAdminApp());
  return _auth;
}

let _db: Firestore | undefined;
export function getAdminDb(): Firestore {
  if (!_db) _db = getFirestore(getAdminApp());
  return _db;
}

let _storage: Storage | undefined;
export function getAdminStorage(): Storage {
  if (!_storage) _storage = getStorage(getAdminApp());
  return _storage;
}

// Convenience aliases matching the old export names (as getters)
export const adminAuth = new Proxy({} as Auth, {
  get: (_, prop: string | symbol) =>
    Reflect.get(getAdminAuth(), prop, getAdminAuth()),
});
export const adminDb = new Proxy({} as Firestore, {
  get: (_, prop: string | symbol) =>
    Reflect.get(getAdminDb(), prop, getAdminDb()),
});
export const adminStorage = new Proxy({} as Storage, {
  get: (_, prop: string | symbol) =>
    Reflect.get(getAdminStorage(), prop, getAdminStorage()),
});
