// app/api/auth/session-login/route.ts
import { NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

export async function POST(req: Request) {
  try {
    const { idToken } = await req.json();
    if (!idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    initAdmin();

    const auth = getAuth();
    const decoded = await auth.verifyIdToken(idToken, true);
    const db = getDatabase();

    // 14 days in ms
    const EXPIRES_IN = 14 * 24 * 60 * 60 * 1000;

    // Is Admin?
    const adminSnap = await db.ref(`admins/${decoded.uid}`).get();
    const isAdmin = adminSnap.exists() && adminSnap.val() === true;

    if (isAdmin) {
      await auth.setCustomUserClaims(decoded.uid, { admin: true });

      const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: EXPIRES_IN });
      const res = NextResponse.json({ ok: true, isAdmin: true });
      res.cookies.set({
        name: "admin_session",
        value: sessionCookie,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: EXPIRES_IN / 1000,
      });
      return res;
    } else {
      // Ensure user exists
      const userSnap = await db.ref(`users/${decoded.uid}`).get();
      if (!userSnap.exists()) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: EXPIRES_IN });
      const res = NextResponse.json({ ok: true, isAdmin: false });
      res.cookies.set({
        name: "session",
        value: sessionCookie,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: EXPIRES_IN / 1000,
      });
      return res;
    }
  } catch (err) {
    console.error("session-login error:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}