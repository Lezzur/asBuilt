import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getApp_(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

// Lazy getters to avoid initializing Firebase during SSR/build
// when env vars may not be available.

let _auth: Auth | undefined;
export function getClientAuth(): Auth {
  if (!_auth) _auth = getAuth(getApp_());
  return _auth;
}

let _db: Firestore | undefined;
export function getClientDb(): Firestore {
  if (!_db) _db = getFirestore(getApp_());
  return _db;
}

let _storage: FirebaseStorage | undefined;
export function getClientStorage(): FirebaseStorage {
  if (!_storage) _storage = getStorage(getApp_());
  return _storage;
}

// Legacy aliases — prefer the getter functions above
export const auth = new Proxy({} as Auth, {
  get: (_, prop: string | symbol) =>
    Reflect.get(getClientAuth(), prop, getClientAuth()),
});
export const db = new Proxy({} as Firestore, {
  get: (_, prop: string | symbol) =>
    Reflect.get(getClientDb(), prop, getClientDb()),
});
export const storage = new Proxy({} as FirebaseStorage, {
  get: (_, prop: string | symbol) =>
    Reflect.get(getClientStorage(), prop, getClientStorage()),
});
