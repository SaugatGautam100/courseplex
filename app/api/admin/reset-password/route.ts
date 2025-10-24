// app/api/admin/reset-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { initAdmin } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

export async function POST(request: NextRequest) {
  try {
    const { token, newPassword, email } = await request.json();

    if (!token || !newPassword || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    initAdmin();
    const db = getDatabase();
    const auth = getAuth();

    // Verify token exists and is valid
    const tokenRef = db.ref(`passwordResets/${token}`);
    const snapshot = await tokenRef.get();
    const resetData = snapshot.val();

    if (!resetData || resetData.status !== 'pending') {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }

    if (resetData.email !== email) {
      return NextResponse.json({ error: "Email mismatch" }, { status: 400 });
    }

    if (Date.now() > resetData.expiresAt) {
      // Clean up expired token
      await tokenRef.remove();
      return NextResponse.json({ error: "Reset link has expired" }, { status: 400 });
    }

    // Update password using the stored UID
    const uid = resetData.uid;
    if (!uid) {
      return NextResponse.json({ error: "Invalid reset request" }, { status: 400 });
    }

    await auth.updateUser(uid, {
      password: newPassword,
    });

    // Mark token as used and clean up
    await tokenRef.update({ status: 'used', updatedAt: Date.now() });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Password reset error:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}