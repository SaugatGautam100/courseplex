// lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getAuth, type Auth } from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// Public env vars (NEXT_PUBLIC_...) must all be set
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  databaseURL: "https://saugat-firebase1-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const isBrowser = typeof window !== "undefined";

let app: FirebaseApp | null = null;
function getClientApp(): FirebaseApp {
  if (!isBrowser) {
    // Don't initialize on the server
    throw new Error("Firebase client SDK used on the server. Use firebase-admin on the server.");
  }
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

// Export typed placeholders on the server so imports don't crash.
// Only call these in Client Components.
export const database: Database = isBrowser ? getDatabase(getClientApp()) : (null as unknown as Database);
export const auth: Auth = isBrowser ? getAuth(getClientApp()) : (null as unknown as Auth);
export const storage: FirebaseStorage = isBrowser ? getStorage(getClientApp()) : (null as unknown as FirebaseStorage);