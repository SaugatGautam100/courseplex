import admin from "firebase-admin";
import type { App } from "firebase-admin/app";

// Attach the singleton App to the Node global to avoid re-initializing in dev
declare global {
  // eslint-disable-next-line no-var
  var __FIREBASE_ADMIN_APP__: App | undefined;
}

type ServiceAccountLike = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
};

function normalizePrivateKey(raw?: string): string | undefined {
  if (!raw) return undefined;

  // If not a PEM yet, it might be base64 from env
  const isPem = raw.includes("BEGIN PRIVATE KEY");
  let key = raw;
  if (!isPem) {
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      if (decoded.includes("BEGIN PRIVATE KEY")) {
        key = decoded;
      }
    } catch {
      // ignore decode errors; will try as-is
    }
  }
  // Ensure newlines are real newlines
  return key.replace(/\\n/g, "\n");
}

function loadServiceAccount(): ServiceAccountLike {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const projectId =
        (parsed["project_id"] as string | undefined) ||
        (parsed["projectId"] as string | undefined) ||
        process.env.FIREBASE_PROJECT_ID;

      const clientEmail =
        (parsed["client_email"] as string | undefined) ||
        (parsed["clientEmail"] as string | undefined) ||
        process.env.FIREBASE_CLIENT_EMAIL;

      const privateKey = normalizePrivateKey(
        (parsed["private_key"] as string | undefined) ||
          (parsed["privateKey"] as string | undefined) ||
          process.env.FIREBASE_PRIVATE_KEY
      );

      return { projectId, clientEmail, privateKey };
    } catch (e: unknown) {
      console.warn(
        "FirebaseAdmin: Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to discrete vars."
      );
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  return { projectId, clientEmail, privateKey };
}

function resolveDatabaseURL(projectId?: string): string | undefined {
  // Use explicit env if provided
  if (process.env.FIREBASE_DATABASE_URL) return process.env.FIREBASE_DATABASE_URL;

  // Try sensible defaults based on projectId
  if (projectId && projectId.trim().length > 0) {
    // Many projects use -default-rtdb
    return `https://${projectId}-default-rtdb.firebaseio.com`;
    // If your project uses the legacy domain, swap to:
    // return `https://${projectId}.firebaseio.com`;
  }

  // If we cannot resolve, return undefined (admin.init can still work without DB)
  return undefined;
}

export function initAdmin(): App {
  if (globalThis.__FIREBASE_ADMIN_APP__) {
    return globalThis.__FIREBASE_ADMIN_APP__;
  }

  if (!admin.apps.length) {
    try {
      const sa = loadServiceAccount();

      if (!sa.projectId || !sa.clientEmail || !sa.privateKey) {
        console.warn(
          "Firebase Admin: missing credentials. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY or FIREBASE_SERVICE_ACCOUNT_KEY."
        );
      }

      const databaseURL = resolveDatabaseURL(sa.projectId);

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: sa.projectId,
          clientEmail: sa.clientEmail,
          privateKey: sa.privateKey,
        } as admin.ServiceAccount),
        ...(databaseURL ? { databaseURL } : {}),
      });
    } catch (err: unknown) {
      console.error("Firebase admin initialization error", err);
    }
  }

  globalThis.__FIREBASE_ADMIN_APP__ = admin.app();
  return globalThis.__FIREBASE_ADMIN_APP__;
}

// Export the app instance directly for use in API routes
export const adminApp = initAdmin();
export const adminAuth = admin.auth();
export const adminDb = admin.database();

// Convenience helpers (optional)
export function getAdminAuth() {
  initAdmin();
  return admin.auth();
}
export function getAdminDb() {
  initAdmin();
  return admin.database();
}

export default admin;