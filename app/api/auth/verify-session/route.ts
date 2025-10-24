// app/api/auth/verify-session/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminAuth } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic'; // Ensure this route is always run dynamically

export async function GET() {
  try {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get('session')?.value;
    const adminSessionCookie = cookieStore.get('admin_session')?.value;

    const auth = getAdminAuth();

    // Check for admin session first
    if (adminSessionCookie) {
      try {
        const decodedToken = await auth.verifySessionCookie(adminSessionCookie, true);
        if (decodedToken.admin === true) {
          return NextResponse.json({ valid: true, isAdmin: true });
        }
      } catch {
        // Fall through to check regular session if admin one is invalid
      }
    }
    
    // Check for regular user session
    if (sessionCookie) {
      try {
        await auth.verifySessionCookie(sessionCookie, true);
        return NextResponse.json({ valid: true, isAdmin: false });
      } catch {
        // Invalid session
      }
    }
    
    // If no valid session is found
    return NextResponse.json({ valid: false }, { status: 401 });

  } catch (error) {
    return NextResponse.json({ valid: false, error: 'Internal Server Error' }, { status: 500 });
  }
}