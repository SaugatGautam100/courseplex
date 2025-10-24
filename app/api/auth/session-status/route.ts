// app/api/auth/session-status/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { initAdmin } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";

export async function GET() {
  try {
    initAdmin();
    const auth = getAuth();
    const cookieStore = cookies();
    const adminCookie = cookieStore.get("admin_session")?.value;
    const userCookie = cookieStore.get("session")?.value;

    if (!adminCookie && !userCookie) {
      return new NextResponse(JSON.stringify({ valid: false }), {
        status: 401,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }

    if (adminCookie) {
      const decoded = await auth.verifySessionCookie(adminCookie, true);
      return new NextResponse(JSON.stringify({ valid: true, isAdmin: true, uid: decoded.uid }), {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }

    const decoded = await auth.verifySessionCookie(userCookie!, true);
    return new NextResponse(JSON.stringify({ valid: true, isAdmin: false, uid: decoded.uid }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return new NextResponse(JSON.stringify({ valid: false }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}