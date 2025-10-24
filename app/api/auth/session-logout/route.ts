// app/api/auth/session-logout/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ status: "success" });

  // Clear both session cookies
  response.cookies.set("session", "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  response.cookies.set("admin_session", "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  return response;
}