"use client";

import { useEffect, useState } from "react";
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

// FIX: Added referrerId to the type definition
type CommissionDbRec = {
  orderId: string;
  amount: number;
  timestamp: number;
  userId: string;
  referrerId?: string; // This property was missing
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      // 1. Listener for withdrawals
      const withdrawalRef = ref(database, `users/${currentUser.uid}/transactions`);
      const unsubscribeWithdrawals = onValue(withdrawalRef, (withdrawalSnap) => {
        const withdrawalData = (withdrawalSnap.val() as Record<string, WithdrawalDbRec>) || {};
        const withdrawalList: UnifiedTransaction[] = Object.entries(withdrawalData).map(
          ([id, t]) => ({
            id,
            description: t.product || "Withdrawal",
            amount: t.amount,
            date: t.date,
            status: t.status,
            type: "withdrawal",
          })
        );

        // 2. Listener for earnings (commissions)
        const commissionsRef = ref(database, "commissions");
        const unsubscribeCommissions = onValue(commissionsRef, (commissionSnap) => {
          const commissionData = (commissionSnap.val() as Record<string, CommissionDbRec>) || {};
          const commissionList: UnifiedTransaction[] = [];
          
          for (const [id, c] of Object.entries(commissionData)) {
            // Check if this commission belongs to the current user
            if (c.referrerId === currentUser.uid) {
              commissionList.push({
                id,
                description: `Referral Commission`,
                amount: c.amount,
                date: new Date(c.timestamp).toISOString(),
                status: "Completed",
                type: "earning",
              });
            }
          }

          // 3. Merge and sort all transactions
          const allTransactions = [...withdrawalList, ...commissionList];
          allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          setTransactions(allTransactions);
          setLoading(false);
        });
        
        // This inner cleanup is important
        return () => unsubscribeCommissions();
      });

      // Main cleanup function
      return () => {
        unsubscribeWithdrawals();
        // The commissions listener is cleaned up by the withdrawals listener's return
      };
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Transaction History</h1>
        <p className="mt-2 text-slate-600">A record of all your referral earnings and withdrawals.</p>
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