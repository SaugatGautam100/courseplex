"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { auth, database } from "@/lib/firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { ref, get } from "firebase/database";

type FirebaseAuthError = { code?: string; message?: string };

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Forgot Password UI state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const searchParams = useSearchParams();
  const wasApproved = searchParams?.get("approved") === "true";
  const expired = searchParams?.get("expired") === "true";
  const returnTo = searchParams?.get("returnTo") || "/user/dashboard";

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Authenticate with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Check the user's status in Realtime Database
      const userRef = ref(database, `users/${user.uid}/status`);
      const snapshot = await get(userRef);
      const status = snapshot.val();

      if (status === "pending_approval") {
        await signOut(auth);
        throw new Error("auth/pending-approval");
      }
      if (status !== "active") {
        await signOut(auth);
        throw new Error("auth/account-inactive");
      }

      // 3. Client flag if needed
      if (status === "active") {
        sessionStorage.setItem(`post_approval_login_${user.uid}`, "true");
      }

      // 4. Create the server session cookie for 14 days
      const idToken = await user.getIdToken();
      const response = await fetch("/api/auth/session-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Ensure cookies are set and avoid any caching edge cases
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error("Failed to create session");
      }

      // Important: hard navigation so the new cookie is sent on first load
      window.location.replace(returnTo);
    } catch (err: unknown) {
      const e = err as FirebaseAuthError;
      let errorMessage = "Login failed. Please try again.";
      if (e?.message === "auth/pending-approval") {
        errorMessage = "Your account is under review. Please wait for admin approval.";
      } else if (e?.message === "auth/account-inactive") {
        errorMessage = "Your account is not active. Please contact support.";
      } else if (e?.code === "auth/invalid-credential") {
        errorMessage = "Invalid email or password.";
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Forgot password actions
  const openForgotPassword = () => {
    if (!email) {
      setForgotError("Please enter your email in the form first.");
      setShowForgotPassword(true);
      return;
    }
    setShowForgotPassword(true);
    setForgotError(null);
    setForgotSuccess(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setForgotError("Please enter your email in the login form above.");
      return;
    }

    setForgotLoading(true);
    setForgotError(null);
    setForgotSuccess(false);

    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to send reset link");
      }
      setForgotSuccess(true);
    } catch (err: any) {
      setForgotError(err.message || "Failed to send reset link. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 antialiased">
      <section className="mx-auto max-w-md px-4 py-16 md:py-24">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-slate-900">Log in to Course Plex</h1>
            <p className="mt-2 text-base text-slate-600">Welcome back! Please enter your details to continue.</p>
          </div>

          {wasApproved && (
            <div className="mb-4 rounded-md bg-green-50 p-4 border border-green-200">
              <p className="text-sm text-green-800">Your account has been approved! Please log in to continue.</p>
            </div>
          )}

          {expired && (
            <div className="mb-4 rounded-md bg-yellow-50 p-4 border border-yellow-200">
              <p className="text-sm text-yellow-800">Your session expired. Please log in again.</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
                placeholder="you@example.com"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                required
                placeholder="Your Password"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              />
            </div>
            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={openForgotPassword}
                className="text-sm font-medium text-sky-600 transition hover:text-sky-700 hover:underline"
              >
                Forgot your password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm ring-1 ring-sky-700/20 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
            >
              {loading ? "Logging in..." : "Log in"}
            </button>

            <p className="pt-2 text-center text-sm text-slate-600">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-semibold text-sky-600 transition hover:text-sky-700 hover:underline">
                Sign up
              </Link>
            </p>
          </form>
        </div>
      </section>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowForgotPassword(false)} />
          <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Forgot Password?</h2>
              <button onClick={() => setShowForgotPassword(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                We&apos;ll send a password reset link to:{" "}
                <span className="font-medium text-sky-700">{email || "Enter your email above"}</span>
              </p>

              {forgotError && (
                <div className="rounded-md bg-red-50 p-3">
                  <p className="text-sm text-red-600">{forgotError}</p>
                </div>
              )}

              {forgotSuccess && (
                <div className="rounded-md bg-green-50 p-3">
                  <p className="text-sm text-green-600">
                    If the email exists, a reset link has been sent. Please check your inbox.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  disabled={forgotLoading}
                  className="flex-1 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={forgotLoading || forgotSuccess || !email}
                  className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-sky-400 disabled:cursor-not-allowed transition-colors"
                >
                  {forgotLoading ? "Sending..." : "Send Reset Link"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}