import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

type SendBody = {
  toAll?: boolean;
  userIds?: string[];
  subject: string;
  htmlContent: string;
};

// Validates simple email format
function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const db = getAdminDb();

    // Verify admin role via Firebase token claims (or fallback to RTDB)
    const decoded = await adminAuth.verifyIdToken(idToken);
    let isAdmin = decoded.admin === true;
    if (!isAdmin) {
      const adminSnap = await db.ref(`admins/${decoded.uid}`).get();
      isAdmin = adminSnap.exists() && adminSnap.val() === true;
    }
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden: Not an admin" }, { status: 403 });
    }

    // Parse request body
    const body = (await req.json()) as SendBody;
    const { toAll, userIds, subject, htmlContent } = body || {};
    if (!subject || !htmlContent) {
      return NextResponse.json(
        { error: "Subject and htmlContent are required." },
        { status: 400 }
      );
    }

    // Build recipient list
    let emails: string[] = [];
    if (toAll) {
      const usersSnap = await db.ref("users").get();
      const v = (usersSnap.val() || {}) as Record<string, { email?: string }>;
      emails = Object.values(v)
        .map((u) => String(u?.email || "").trim())
        .filter((e) => isEmail(e));
    } else {
      const ids = Array.from(new Set(userIds || [])).filter(Boolean);
      for (const uid of ids) {
        const s = await db.ref(`users/${uid}/email`).get();
        const em = String(s.val() || "").trim();
        if (isEmail(em)) {
          emails.push(em);
        }
      }
    }

    // Deduplicate emails
    emails = Array.from(new Set(emails));

    if (emails.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 0, message: "No valid recipients found." });
    }

    // Build origin for internal API call
    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    // Send emails in chunks of 50 to avoid overloading the send-email route and for better error handling
    const chunkSize = 50;
    let sent = 0;
    for (let i = 0; i < emails.length; i += chunkSize) {
      const chunk = emails.slice(i, i + chunkSize);
      const results = await Promise.allSettled(
        chunk.map((to) =>
          fetch(`${origin}/api/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to, subject, htmlContent }),
          })
        )
      );
      sent += results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    }

    return NextResponse.json({ sent, skipped: emails.length - sent });
  } catch (e: any) {
    console.error("broadcast-email error:", e?.message || e);
    return NextResponse.json({ error: "Failed to send broadcast email." }, { status: 500 });
  }
}