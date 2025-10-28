// lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getAuth, type Auth } from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// Public env vars (NEXT_PUBLIC_...) must all be set
const firebaseConfig = {
  apiKey: "AIzaSyCFdDAIC_2APnckuwTMX2boQGlJU5arAGQ",
  authDomain: "saugat-whatsapp-clone.firebaseapp.com",
  databaseURL: "https://saugat-whatsapp-clone-default-rtdb.firebaseio.com",
  projectId: "saugat-whatsapp-clone",
  storageBucket: "saugat-whatsapp-clone.firebasestorage.app",
  messagingSenderId: "22501273955",
  appId: "1:22501273955:web:cbc4f3f6b60200954e2356",
  measurementId: "G-QYZ76LZMDB"
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