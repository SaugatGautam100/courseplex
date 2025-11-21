// app/api/admin/forgot-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    initAdmin();
    const auth = getAuth();
    const db = getDatabase();

    // Server-side verification: Check if user exists
    let uid: string;
    try {
      const userRecord = await auth.getUserByEmail(email);
      uid = userRecord.uid;
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        return NextResponse.json({ error: "No account found with this email" }, { status: 404 });
      }
      throw error;
    }

    // Generate unique, secure token
    const token = uuidv4();
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour expiration

    // Store reset request in database
    await db.ref(`passwordResets/${token}`).set({
      uid,
      email,
      expiresAt,
      status: 'pending',
      createdAt: Date.now(),
    });

    // Get the reset URL (works on localhost or production)
    const origin = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const resetUrl = `${origin}/admin/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    // Send notification email ONLY to support
    const emailResponse = await fetch(`${origin}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'appplex100@gmail.com',
        subject: `Admin Password Reset Request for ${email}`,
        htmlContent: `
          <h2>Admin Password Reset Request</h2>
          <p>An admin has requested a password reset:</p>
          <ul>
            <li><strong>Admin Email:</strong> ${email}</li>
            <li><strong>Request Time:</strong> ${new Date().toLocaleString()}</li>
          </ul>
          <p><strong>Reset Link (valid for 1 hour):</strong></p>
          <p><a href="${resetUrl}" style="background-color: #0ea5e9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
          <p>Click the link above to reset the password. You can also copy-paste it to share with the admin if needed.</p>
          <p><em>This link expires in 1 hour. If not used, it will be invalid.</em></p>
          <p><em>Automated from Plex Courses Admin Panel.</em></p>
        `,
      }),
    });

    if (!emailResponse.ok) {
      console.error('Failed to send support email:', await emailResponse.text());
      return NextResponse.json({ error: "Request processed, but notification failed. Contact support manually." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Request sent to support team" });
  } catch (error: unknown) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}