import { NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

type AdminSessionLoginBody = { idToken?: string };

export async function POST(req: Request) {
  try {
    const { idToken } = (await req.json()) as AdminSessionLoginBody;
    if (!idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    initAdmin();

    // Verify the ID token and check admin list
    const auth = getAuth();
    const decoded = await auth.verifyIdToken(idToken, true);

    const db = getDatabase();
    const adminSnap = await db.ref(`admins/${decoded.uid}`).get();
    if (!adminSnap.exists() || adminSnap.val() !== true) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Create session cookie (7 days)
    const expiresIn = 7 * 24 * 60 * 60 * 1000;
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: "admin_session",
      value: sessionCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(expiresIn / 1000),
    });
    return res;
  } catch (err: unknown) {
    console.error("admin-session-login error:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}