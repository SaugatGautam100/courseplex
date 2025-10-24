import { NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";

export const runtime = "nodejs";

type UpdateUserBody = {
  userId: string;
  name?: string;
  phone?: string;
  email?: string;
  newPassword?: string;
};

export async function POST(request: Request) {
  // In a real app, you MUST protect this route.
  const { userId, name, phone, email, newPassword } = (await request.json()) as UpdateUserBody;

  if (!userId) {
    return NextResponse.json({ error: "User ID is required" }, { status: 400 });
  }

  try {
    const authUpdates: { email?: string; password?: string } = {};
    if (email) authUpdates.email = email;
    if (newPassword) authUpdates.password = newPassword;

    if (Object.keys(authUpdates).length > 0) {
      await admin.auth().updateUser(userId, authUpdates);
    }

    const dbUpdates: Record<string, unknown> = {};
    if (name) dbUpdates[`/users/${userId}/name`] = name;
    if (phone) dbUpdates[`/users/${userId}/phone`] = phone;
    if (email) dbUpdates[`/users/${userId}/email`] = email;

    if (Object.keys(dbUpdates).length > 0) {
      await admin.database().ref().update(dbUpdates);
    }

    return NextResponse.json({ message: "User updated successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update user:", error);
    return NextResponse.json({ error: `Failed to update user: ${message}` }, { status: 500 });
  }
}