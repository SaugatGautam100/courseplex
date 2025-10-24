// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected areas
  const isAdminPath = pathname.startsWith("/admin");
  const isUserPath = pathname.startsWith("/user");

  // Public login/recovery pages
  const isAdminLoginPage = pathname === "/admin/login";
  const isAdminResetPage = pathname === "/admin/reset-password";
  const isUserLoginPage = pathname === "/login";

  // Cookies
  const adminSession = request.cookies.get("admin_session")?.value || null;
  const userSession = request.cookies.get("session")?.value || null;

  // ADMIN ROUTES (except login/reset)
  if (isAdminPath && !isAdminLoginPage && !isAdminResetPage) {
    if (!adminSession) {
      const url = new URL("/admin/login", request.url);
      url.searchParams.set("returnTo", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // USER ROUTES (allow admin_session too)
  if (isUserPath) {
    if (!userSession && !adminSession) {
      const url = new URL("/login", request.url);
      url.searchParams.set("returnTo", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // LOGIN PAGES
  if (isAdminLoginPage) {
    if (adminSession) {
      return NextResponse.redirect(new URL("/admin/orders", request.url));
    }
    return NextResponse.next();
  }

  if (isUserLoginPage) {
    if (userSession || adminSession) {
      return NextResponse.redirect(new URL("/user/dashboard", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/user/:path*", "/admin/login", "/admin/reset-password", "/login"],
};