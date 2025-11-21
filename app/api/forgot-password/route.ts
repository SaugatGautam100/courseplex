import { NextRequest, NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import crypto from "crypto";
import { sendEmailViaGmailAPI } from "@/lib/server/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { email } = (await request.json()) as { email?: string };
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    initAdmin();
    const auth = getAuth();
    const db = getDatabase();

    // Avoid email enumeration
    let uid: string | null = null;
    try {
      const userRecord = await auth.getUserByEmail(email);
      uid = userRecord.uid;
    } catch {
      return NextResponse.json({ success: true });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    await db.ref(`passwordResets/${token}`).set({
      uid,
      email,
      status: "pending",
      createdAt: Date.now(),
      expiresAt,
    });

    const origin =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
      `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("host")}`;
    const resetLink = `${origin}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    await sendEmailViaGmailAPI({
      to: email,
      subject: "Reset your Plex Courses password",
      html: `
        <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;">
          <h2>Reset your password</h2>
          <p>We received a request to reset your password for <strong>${email}</strong>.</p>
          <p>This link will expire in 10 minutes.</p>
          <p style="margin: 24px 0;">
            <a href="${resetLink}" style="display:inline-block;padding:12px 18px;background:#0284c7;color:#fff;border-radius:8px;text-decoration:none">
              Reset Password
            </a>
          </p>
          <p>If you didn’t request this, you can safely ignore this email.</p>
          <p>— Plex Courses</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}