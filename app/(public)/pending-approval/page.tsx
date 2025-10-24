// app/(public)/pending-approval/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, database } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, onValue } from "firebase/database";

type Status = "pending_approval" | "active" | "rejected";

export default function PendingApprovalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const navigatedRef = useRef(false);
  const statusUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unSubAuth = onAuthStateChanged(auth, (user) => {
      if (statusUnsubRef.current) {
        statusUnsubRef.current();
        statusUnsubRef.current = null;
      }

      if (!user) {
        if (!navigatedRef.current) {
          navigatedRef.current = true;
          router.replace("/login");
        }
        return;
      }

      const userStatusRef = ref(database, `users/${user.uid}/status`);
      statusUnsubRef.current = onValue(userStatusRef, async (snapshot) => {
        if (navigatedRef.current) return;
        const status = snapshot.val() as Status | null;

        if (!status || status === "pending_approval") {
          setLoading(false);
          return;
        }

        navigatedRef.current = true;

        if (status === "active") {
          // CORRECT FLOW FOR SERVER-SIDE GUARD:
          // 1. Sign out completely to clear all client-side state.
          await signOut(auth);
          await fetch("/api/auth/session-logout", { method: "POST" });
          // 2. Redirect to login page with a success flag.
          router.replace("/login?approved=true");
          return;
        }

        if (status === "rejected") {
          await signOut(auth);
          await fetch("/api/auth/session-logout", { method: "POST" });
          router.replace("/signup?rejected=true");
          return;
        }
      });
    });

    return () => {
      if (statusUnsubRef.current) statusUnsubRef.current();
      unSubAuth();
    };
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto"></div>
          <p className="mt-4 text-slate-500">Checking account status...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 antialiased flex items-center justify-center p-4">
      <div className="max-w-md text-center bg-white p-8 rounded-lg shadow-md border">
        <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-yellow-100">
          <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Account Pending Approval</h1>
        <p className="mt-2 text-base text-slate-600">Thank you for signing up! Your account is currently under review.</p>
        <p className="mt-4 text-sm text-slate-500">We&apos;ll notify you once your account has been reviewed. This page will automatically redirect.</p>
        <div className="mt-6 flex items-center justify-center space-x-2">
          <div className="animate-pulse h-2 w-2 bg-sky-600 rounded-full"></div>
          <div className="animate-pulse h-2 w-2 bg-sky-600 rounded-full" style={{ animationDelay: "200ms" }}></div>
          <div className="animate-pulse h-2 w-2 bg-sky-600 rounded-full" style={{ animationDelay: "400ms" }}></div>
        </div>
      </div>
    </main>
  );
}