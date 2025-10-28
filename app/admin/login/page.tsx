// app/admin/login/page.tsx
"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { auth, database } from "@/lib/firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { get, ref } from "firebase/database";
import Link from "next/link";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const adminRef = ref(database, `admins/${user.uid}`);
      const adminSnapshot = await get(adminRef);

      if (!adminSnapshot.exists() || adminSnapshot.val() !== true) {
        throw new Error("auth/not-an-admin");
      }

      // Force a token refresh to ensure any new claims are included
      const idToken = await user.getIdToken(true);

      // Call API to set the admin claim.
      await fetch('/api/auth/set-admin-claim', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });

      // Now create the unified session cookie
      const sessionResponse = await fetch('/api/auth/session-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!sessionResponse.ok) throw new Error('Failed to create session');
      
      router.push("/admin/orders");

    } catch (err: any) {
      let errorMessage = "Login failed. Please check your credentials.";
      if (err.message === "auth/not-an-admin") {
        errorMessage = "Access Denied. You do not have admin privileges.";
      } else if (err.code === 'auth/invalid-credential') {
        errorMessage = "Invalid email or password.";
      }
      setError(errorMessage);
      await signOut(auth).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) {
      setForgotError("Please enter your email in the login form above.");
      return;
    }

    setForgotLoading(true);
    setForgotError(null);
    setForgotSuccess(false);

    try {
      const response = await fetch('/api/admin/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send request');
      }

      setForgotSuccess(true);
    } catch (err: any) {
      setForgotError(err.message || 'Failed to send request. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const openForgotPassword = () => {
    if (!email) {
      setForgotError("Please enter your email in the login form above.");
      return;
    }
    setShowForgotPassword(true);
    setForgotError(null);
    setForgotSuccess(false);
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link href="/" className="inline-block text-2xl font-bold text-slate-800">
            Course Plex Admin
          </Link>
          <p className="mt-2 text-slate-600">Please sign in to continue.</p>
        </div>
        <div className="rounded-lg border bg-white p-8 shadow-sm">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
              <input 
                id="email" 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                placeholder="admin@example.com" 
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500" 
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
              <input 
                id="password" 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                placeholder="••••••••" 
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500" 
              />
            </div>
            
            {/* Forgot Password Link */}
            <div className="text-right">
              <button 
                type="button"
                onClick={openForgotPassword}
                disabled={!email || loading}
                className="text-sm text-sky-600 hover:text-sky-700 underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Forgot Password?
              </button>
            </div>
            
            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            
            <button 
              type="submit" 
              disabled={loading} 
              className="w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:bg-sky-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-slate-600">
          <Link href="/" className="text-sky-600 hover:text-sky-700">
            ← Back to main site
          </Link>
        </p>
      </div>

      {/* Forgot Password Modal - No Email Input */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black bg-opacity-50" 
            onClick={() => setShowForgotPassword(false)} 
          />
          <div className="relative w-full max-w-md bg-white rounded-lg p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">Forgot Password?</h2>
              <button
                onClick={() => setShowForgotPassword(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Enter your email in the login form above and click "Send Request" below. Our support team will be notified and provide a reset link via email.
              </p>
              
              <p className="text-sm font-medium text-slate-800">
                Email to notify: <span className="text-sky-600">{email || 'Enter email above'}</span>
              </p>
              
              {forgotError && (
                <div className="rounded-md bg-red-50 p-3">
                  <p className="text-sm text-red-600">{forgotError}</p>
                </div>
              )}
              
              {forgotSuccess && (
                <div className="rounded-md bg-green-50 p-3">
                  <p className="text-sm text-green-600">
                    Request sent to our support team! They will contact you soon with a reset link.
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
                  {forgotLoading ? "Sending..." : "Send Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}