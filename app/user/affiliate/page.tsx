"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { database, auth } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import type { SVGProps } from "react";

// Types
type ReferredUser = {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  packageName?: string; // NEW
};

type ReferralDbRecord = Record<string, { name: string; email: string; joinedAt: string }>;
type UserDbSnapshot = {
  totalEarnings?: number;
  referrals?: ReferralDbRecord;
};

type OrderDbRec = {
  userId: string;
  referrerId?: string;
  courseId?: string;
  status?: "Pending Approval" | "Completed" | "Rejected";
  createdAt?: string;
  email?: string;
};

type PackagesMap = Record<string, { name?: string }>;

export default function AffiliatePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [rawReferred, setRawReferred] = useState<ReferredUser[]>([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [loadingUser, setLoadingUser] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  const [affiliateLink, setAffiliateLink] = useState("");

  const [orders, setOrders] = useState<Record<string, OrderDbRec>>({});
  const [packages, setPackages] = useState<PackagesMap>({});
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingPackages, setLoadingPackages] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        setUid(null);
        setLoadingUser(false);
        setLoadingOrders(false);
        setLoadingPackages(false);
        return;
      }

      setUid(currentUser.uid);
      const baseUrl = "https://sajilointerior.com.np";
      setAffiliateLink(`${baseUrl}/signup?ref=${currentUser.uid}`);

      // User + referrals
      const userRef = ref(database, `users/${currentUser.uid}`);
      const unsubscribeUser = onValue(userRef, (snapshot) => {
        const data = (snapshot.val() || {}) as UserDbSnapshot;
        setTotalEarnings(Number(data.totalEarnings || 0));

        const referralsData: ReferralDbRecord = data.referrals || {};
        const usersArray: ReferredUser[] = Object.entries(referralsData)
          .map(([id, user]) => ({
            id,
            name: user.name,
            email: user.email,
            joinedAt: user.joinedAt,
          }))
          .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime());
        setRawReferred(usersArray);

        setLoadingUser(false);
      });

      // Orders (to resolve package per referral)
      const ordersRef = ref(database, "orders");
      const unsubscribeOrders = onValue(
        ordersRef,
        (snap) => {
          setOrders((snap.val() as Record<string, OrderDbRec>) || {});
          setLoadingOrders(false);
        },
        () => setLoadingOrders(false)
      );

      // Packages (names)
      const pkRef = ref(database, "packages");
      const unsubscribePk = onValue(
        pkRef,
        (snap) => {
          setPackages((snap.val() as PackagesMap) || {});
          setLoadingPackages(false);
        },
        () => setLoadingPackages(false)
      );

      return () => {
        unsubscribeUser();
        unsubscribeOrders();
        unsubscribePk();
      };
    });

    return () => unsubscribeAuth();
  }, []);

  // Enrich referred with package name by matching orders where:
  // - status Completed
  // - referrerId === currentUser.uid
  // - order.email matches referral email (case-insensitive) OR order.userId (if you later store it in referrals)
  const referredUsers = useMemo(() => {
    if (!uid) return rawReferred;

    // Build a lookup from email(lower) -> latest completed order's package name
    const emailToPkg = new Map<string, string>();
    Object.values(orders)
      .filter((o) => o && o.status === "Completed" && o.referrerId === uid)
      .forEach((o) => {
        const emailKey = (o.email || "").trim().toLowerCase();
        if (!emailKey) return;
        const pkgName = o.courseId ? packages[o.courseId]?.name || "" : "";
        // Keep the latest by createdAt (if you want strict latest, compare timestamps; here we just set first found)
        const prev = emailToPkg.get(emailKey);
        if (!prev) {
          emailToPkg.set(emailKey, pkgName);
        }
      });

    return rawReferred.map((r) => {
      const pkg = emailToPkg.get((r.email || "").trim().toLowerCase());
      return { ...r, packageName: pkg || undefined };
    });
  }, [rawReferred, orders, packages, uid]);

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(affiliateLink);
      } else {
        const el = document.createElement("textarea");
        el.value = affiliateLink;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy link", err);
    }
  };

  const totalReferrals = referredUsers.length;
  const loading = loadingUser || loadingOrders || loadingPackages;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Affiliate Dashboard
        </h1>
        <p className="mt-2 text-lg text-slate-600">
          Share your unique link with your network and earn rewards.
        </p>
      </header>

      {/* Stats */}
      <section className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <StatCard title="Total Referrals" value={totalReferrals.toString()} icon={<UsersIcon />} />
        <StatCard title="Lifetime Earnings" value={`Rs ${totalEarnings.toLocaleString()}`} icon={<MoneyIcon />} />
      </section>

      <div className="space-y-8">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Your Unique Affiliate Link
          </h3>
          <div className="flex flex-col sm:flex-row max-w-md items-stretch sm:items-center">
            <input
              className="h-12 w-full rounded-t-lg sm:rounded-l-lg sm:rounded-t-none border border-slate-300 bg-white px-4 text-sm text-slate-700 shadow-sm"
              readOnly
              value={affiliateLink}
            />
            <button
              onClick={handleCopyLink}
              className="flex h-12 items-center justify-center rounded-b-lg sm:rounded-r-lg sm:rounded-b-none bg-sky-600 px-4 text-white transition hover:bg-sky-700"
              aria-label="Copy affiliate link"
            >
              {copySuccess ? <CheckIcon className="h-5 w-5" /> : <CopyIcon className="h-5 w-5" />}
            </button>
          </div>
          {copySuccess && <p className="mt-2 text-sm text-green-600">Copied to clipboard!</p>}
          <p className="mt-2 text-xs text-slate-500">
            Anyone who signs up via this link will have your referral code auto-filled.
          </p>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 sm:hidden">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Your Referred Users</h3>
          {loading ? (
            <div className="rounded-lg border bg-white p-6 text-center text-slate-500">Loading...</div>
          ) : referredUsers.length === 0 ? (
            <div className="rounded-lg border bg-white p-6 text-center text-slate-500">No referred users yet.</div>
          ) : (
            referredUsers.map((user) => (
              <div key={user.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{user.name}</p>
                    <p className="text-sm text-slate-500">{user.email}</p>
                  </div>
                  <div className="text-xs text-slate-500">{new Date(user.joinedAt).toLocaleDateString()}</div>
                </div>
                <div className="mt-2 text-sm">
                  <span className="text-slate-500">Package: </span>
                  <span className="font-medium text-slate-800">{user.packageName || "-"}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm hidden sm:block">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Package</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Joined Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                      Loading...
                    </td>
                  </tr>
                ) : referredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                      No referred users yet.
                    </td>
                  </tr>
                ) : (
                  referredUsers.map((user) => (
                    <tr key={user.id}>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                        {user.name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                        {user.email}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                        {user.packageName || "-"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                        {new Date(user.joinedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-2 px-4 py-3">
            This list updates in real time when someone signs up or completes a purchase via your referral.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================== UI Components ================== */

function StatCard({ title, value, icon }: { title: string; value: string; icon: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-white p-5 shadow-sm border border-slate-200">
      <div className="flex items-center">
        <div className="flex-shrink-0">{icon}</div>
        <div className="ml-5 w-0 flex-1">
          <dl>
            <dt className="truncate text-sm font-medium text-slate-500">{title}</dt>
            <dd>
              <div className="text-2xl font-bold text-slate-900">{value}</div>
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

const iconBase = "h-8 w-8 rounded-full bg-sky-100 p-1.5 text-sky-600";
function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg className={iconBase} fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0a9 9 0 00-9 9m9-9a9 9 0 009-9m-9 9a9 9 0 01-9-9m9 9a9 9 0 01-9 9" />
    </svg>
  );
}
function MoneyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg className={iconBase} fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="currentColor" viewBox="0 0 20 20" {...props}>
      <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8zM2 4a2 2 0 012-2h4a2 2 0 012 2v2a2 2 0 002 2h2a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
    </svg>
  );
}
function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="currentColor" viewBox="0 0 20 20" {...props}>
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}