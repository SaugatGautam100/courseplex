"use client";

import { useEffect, useMemo, useState } from "react";
import { database, auth } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

// A unified structure for all transaction-like events
type UnifiedTransaction = {
  id: string;
  description: string;
  amount: number;
  date: string; // ISO string
  status: "Completed" | "Pending" | "Processed" | "Rejected";
  type: "earning" | "withdrawal";
};

// Types for raw data from Firebase
type WithdrawalDbRec = { product: string; amount: number; date: string; status: "Processed" | "Pending" | "Rejected" };

// Commission/cashback raw events saved globally
type CommissionDbRec = {
  orderId?: string;
  amount?: number | string;
  timestamp?: number | string;
  userId?: string;
  referrerId?: string;
  courseId?: string;
};
type CashbackDbRec = {
  orderId?: string;
  amount?: number | string;
  timestamp?: number | string;
  userId?: string; // the buyer (current user for cashback)
  referrerId?: string;
  courseId?: string;
};

type PackagesMap = Record<string, { name?: string }>;

export default function TransactionsPage() {
  const [uid, setUid] = useState<string | null>(null);

  const [withdrawals, setWithdrawals] = useState<UnifiedTransaction[]>([]);
  const [commissionsRaw, setCommissionsRaw] = useState<Record<string, CommissionDbRec>>({});
  const [cashbacksRaw, setCashbacksRaw] = useState<Record<string, CashbackDbRec>>({});
  const [packagesMap, setPackagesMap] = useState<PackagesMap>({});
  const [loaded, setLoaded] = useState({ withdrawals: false, commissions: false, cashbacks: false, packages: false });

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        setUid(null);
        setLoaded({ withdrawals: true, commissions: true, cashbacks: true, packages: true });
        return;
      }
      setUid(currentUser.uid);

      // Packages (for names)
      const pkRef = ref(database, "packages");
      const unsubPk = onValue(
        pkRef,
        (snap) => {
          setPackagesMap((snap.val() as PackagesMap) || {});
          setLoaded((s) => ({ ...s, packages: true }));
        },
        () => setLoaded((s) => ({ ...s, packages: true }))
      );

      // Withdrawals from user's node
      const withdrawalRef = ref(database, `users/${currentUser.uid}/transactions`);
      const unsubWithdrawals = onValue(
        withdrawalRef,
        (withdrawalSnap) => {
          const withdrawalData = (withdrawalSnap.val() as Record<string, WithdrawalDbRec>) || {};
          const withdrawalList: UnifiedTransaction[] = Object.entries(withdrawalData).map(([id, t]) => ({
            id,
            description: t.product || "Withdrawal",
            amount: Number(t.amount || 0),
            date: t.date,
            status: t.status,
            type: "withdrawal",
          }));
          setWithdrawals(withdrawalList);
          setLoaded((s) => ({ ...s, withdrawals: true }));
        },
        () => setLoaded((s) => ({ ...s, withdrawals: true }))
      );

      // Commissions (global)
      const commissionsRef = ref(database, "commissions");
      const unsubCommissions = onValue(
        commissionsRef,
        (commissionSnap) => {
          setCommissionsRaw((commissionSnap.val() as Record<string, CommissionDbRec>) || {});
          setLoaded((s) => ({ ...s, commissions: true }));
        },
        () => setLoaded((s) => ({ ...s, commissions: true }))
      );

      // Cashbacks (global)
      const cashbacksRef = ref(database, "cashbacks");
      const unsubCashbacks = onValue(
        cashbacksRef,
        (cashbackSnap) => {
          setCashbacksRaw((cashbackSnap.val() as Record<string, CashbackDbRec>) || {});
          setLoaded((s) => ({ ...s, cashbacks: true }));
        },
        () => setLoaded((s) => ({ ...s, cashbacks: true }))
      );

      return () => {
        unsubPk();
        unsubWithdrawals();
        unsubCommissions();
        unsubCashbacks();
      };
    });

    return () => unsubAuth();
  }, []);

  const commissionTxs: UnifiedTransaction[] = useMemo(() => {
    if (!uid) return [];
    const list: UnifiedTransaction[] = [];
    Object.entries(commissionsRaw).forEach(([id, c]) => {
      if (!c || c.referrerId !== uid) return;
      const amount =
        typeof c.amount === "number" ? c.amount : typeof c.amount === "string" ? Number(c.amount) : 0;
      const ts =
        typeof c.timestamp === "number" ? c.timestamp : typeof c.timestamp === "string" ? Date.parse(c.timestamp) : 0;
      if (!isFinite(amount) || amount <= 0 || !isFinite(ts) || ts <= 0) return;

      const courseName = c.courseId ? packagesMap[c.courseId]?.name : undefined;
      list.push({
        id,
        description: `Referral Commission${courseName ? ` — ${courseName}` : ""}`,
        amount,
        date: new Date(ts).toISOString(),
        status: "Completed",
        type: "earning",
      });
    });
    return list;
  }, [uid, commissionsRaw, packagesMap]);

  const cashbackTxs: UnifiedTransaction[] = useMemo(() => {
    if (!uid) return [];
    const list: UnifiedTransaction[] = [];
    Object.entries(cashbacksRaw).forEach(([id, cb]) => {
      if (!cb || cb.userId !== uid) return;
      const amount =
        typeof cb.amount === "number" ? cb.amount : typeof cb.amount === "string" ? Number(cb.amount) : 0;
      const ts =
        typeof cb.timestamp === "number" ? cb.timestamp : typeof cb.timestamp === "string" ? Date.parse(cb.timestamp) : 0;
      if (!isFinite(amount) || amount <= 0 || !isFinite(ts) || ts <= 0) return;

      const courseName = cb.courseId ? packagesMap[cb.courseId]?.name : undefined;
      list.push({
        id,
        description: `10% Cashback${courseName ? ` — ${courseName}` : ""}`,
        amount,
        date: new Date(ts).toISOString(),
        status: "Completed",
        type: "earning",
      });
    });
    return list;
  }, [uid, cashbacksRaw, packagesMap]);

  const transactions = useMemo(() => {
    const all = [...withdrawals, ...commissionTxs, ...cashbackTxs];
    all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return all;
  }, [withdrawals, commissionTxs, cashbackTxs]);

  const loading = !loaded.withdrawals || !loaded.commissions || !loaded.cashbacks || !loaded.packages;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Transaction History</h1>
        <p className="mt-2 text-slate-600">A record of all your referral earnings, cashbacks, and withdrawals.</p>
      </header>

      {/* Mobile cards */}
      <div className="space-y-4 md:hidden">
        {loading ? (
          <p className="p-8 text-center text-slate-500">Loading transactions...</p>
        ) : transactions.length === 0 ? (
          <p className="p-8 text-center text-slate-500">No transactions found.</p>
        ) : (
          transactions.map((t) => (
            <div key={t.id} className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-slate-800">{t.description}</p>
                  <p className="text-sm text-slate-500">{new Date(t.date).toLocaleDateString()}</p>
                </div>
                <StatusBadge status={t.status} />
              </div>
              <div className="mt-4 border-t pt-2 text-right">
                <p className={`text-lg font-mono font-semibold ${t.type === "earning" ? "text-green-600" : "text-red-600"}`}>
                  {t.type === "earning" ? `+Rs ${t.amount.toLocaleString()}` : `-Rs ${Math.abs(t.amount).toLocaleString()}`}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-500">Loading transactions...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-500">No transactions found.</td></tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">{new Date(t.date).toLocaleDateString()}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">{t.description}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className={`whitespace-nowrap px-6 py-4 text-right text-sm font-mono font-semibold ${t.type === 'earning' ? 'text-green-600' : 'text-red-600'}`}>
                      {t.type === 'earning' ? `+Rs ${t.amount.toLocaleString()}` : `-Rs ${Math.abs(t.amount).toLocaleString()}`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  let colorClasses = "bg-slate-100 text-slate-800";
  if (status === "Completed" || status === "Processed") {
    colorClasses = "bg-green-100 text-green-800";
  } else if (status === "Pending") {
    colorClasses = "bg-yellow-100 text-yellow-800";
  } else if (status === "Rejected") {
    colorClasses = "bg-red-100 text-red-800";
  }

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold leading-4 ${colorClasses}`}>
      {status}
    </span>
  );
}