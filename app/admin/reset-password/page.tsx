"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

function AdminResetPasswordContent() {
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = searchParams.get("token");
  const email = searchParams.get("email");

  useEffect(() => {
    if (!token || !email) {
      setError("Invalid reset link. Please request a new one.");
    }
  }, [token, email]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword || newPassword.length < 6) {
      setError("Passwords must match and be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword, email }),
      });

      const ct = res.headers.get("content-type") || "";
      const payload = ct.includes("application/json") ? await res.json() : { error: await res.text() };

      if (!res.ok) {
        throw new Error(payload.error || "Failed to reset password.");
      }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center bg-white rounded-lg p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Password Reset Successful!</h1>
          <p className="text-slate-600 mb-6">You can now log in with your new password.</p>
          <Link href="/admin/login" className="inline-block bg-sky-600 text-white px-6 py-3 rounded-md hover:bg-sky-700 transition-colors">
            Go to Login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg p-8 shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Reset Password</h1>
          <p className="text-sm text-slate-600 mt-2">Enter your new password for {email}.</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3 mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:bg-sky-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          <Link href="/admin/login" className="text-sky-600 hover:text-sky-700">
            ← Back to Login
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-lg p-8 shadow-sm">
            <p className="text-slate-600">Loading reset form...</p>
          </div>
        </main>
      }
    >
      <AdminResetPasswordContent />
    </Suspense>
  );
}