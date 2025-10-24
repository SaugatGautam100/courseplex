import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return new Response("Unauthorized", { status: 401 });

    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    
    await auth.setCustomUserClaims(decodedToken.uid, { admin: true });

    return NextResponse.json({ success: true });
  } catch (err) {
    return new Response("Internal Server Error", { status: 500 });
  }
}