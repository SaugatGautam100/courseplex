"use client";

import { useEffect, useState } from "react";
import { database } from "@/lib/firebase";
import { ref as dbRef, onValue, update, get, push } from "firebase/database";
import Image from "next/image";
import type { SVGProps } from "react";

type WithdrawalStatus = "Pending" | "Completed" | "Rejected";

type WithdrawalRequestDB = {
  userId: string;
  userName: string;
  amount: number;
  paymentMethod: string;
  details: string;
  requestedAt: string;
  status: WithdrawalStatus;
  qrUrl?: string; // Added QR URL field
};

type WithdrawalRequest = WithdrawalRequestDB & { id: string };

export default function WithdrawalRequestsPage() {
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false); // QR modal state
  const [selectedRequest, setSelectedRequest] = useState<WithdrawalRequest | null>(null);
  const [selectedQrUrl, setSelectedQrUrl] = useState<string | null>(null); // Selected QR URL

  useEffect(() => {
    const withdrawalRef = dbRef(database, "withdrawalRequests/");
    const unsubscribe = onValue(withdrawalRef, (snapshot) => {
      const data = (snapshot.val() || {}) as Record<string, WithdrawalRequestDB>;
      const list: WithdrawalRequest[] = Object.entries(data).map(([id, req]) => ({ id, ...req }));

      // Sort by status then date
      list.sort((a, b) => {
        const order: Record<WithdrawalStatus, number> = { Pending: 0, Completed: 1, Rejected: 2 };
        const sa = order[a.status] ?? 3;
        const sb = order[b.status] ?? 3;
        if (sa !== sb) return sa - sb;
        return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
      });

      setRequests(list);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredRequests = requests.filter((req) => {
    const q = searchQuery.toLowerCase();
    return (
      req.userName.toLowerCase().includes(q) ||
      req.amount.toString().includes(q) ||
      req.paymentMethod.toLowerCase().includes(q) ||
      req.details.toLowerCase().includes(q)
    );
  });

  const handleViewRequest = (request: WithdrawalRequest) => {
    setSelectedRequest(request);
    setIsModalOpen(true);
  };

  const handleViewQr = (qrUrl: string) => {
    setSelectedQrUrl(qrUrl);
    setIsQrModalOpen(true);
  };

  const handleUpdateStatus = async (request: WithdrawalRequest, newStatus: WithdrawalStatus) => {
    if (!window.confirm(`Are you sure you want to mark this request as "${newStatus}"? This will notify the user.`)) return;

    try {
      const updates: Record<string, unknown> = {};
      updates[`/withdrawalRequests/${request.id}/status`] = newStatus;
      let emailHtmlContent = "";

      if (newStatus === "Completed") {
        const userBalanceRef = dbRef(database, `users/${request.userId}/balance`);
        const snapshot = await get(userBalanceRef);
        const currentBalance = Number(snapshot.val() || 0);
        if (currentBalance < request.amount) {
          alert("Error: User has insufficient balance. Rejecting request.");
          updates[`/withdrawalRequests/${request.id}/status`] = "Rejected";
          await update(dbRef(database), updates);
          setIsModalOpen(false);
          return;
        }
        updates[`/users/${request.userId}/balance`] = currentBalance - request.amount;

        const txRef = push(dbRef(database, `users/${request.userId}/transactions`));
        const txKey = txRef.key;
        if (txKey) {
          updates[`/users/${request.userId}/transactions/${txKey}`] = {
            product: "Withdrawal",
            amount: -request.amount,
            date: new Date().toISOString(),
            status: "Processed",
          };
        }

        emailHtmlContent = `<p>Your withdrawal request for <strong>Rs ${request.amount.toLocaleString()}</strong> has been processed.</p>`;
      } else if (newStatus === "Rejected") {
        emailHtmlContent = `<p>Your withdrawal request for <strong>Rs ${request.amount.toLocaleString()}</strong> has been rejected. Please contact support for more information.</p>`;
      }

      await update(dbRef(database), updates);

      const emailSnap = await get(dbRef(database, `users/${request.userId}/email`));
      const userEmail = emailSnap.val() as string | null;

      if (userEmail) {
        await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: userEmail,
            subject: `Your Withdrawal Request: ${newStatus}`,
            htmlContent: `<h1>Withdrawal Status Update</h1><p>Hello ${request.userName},</p>${emailHtmlContent}<p>Thank you,<br/>The Course Plex Team</p>`,
          }),
        });
      }

      setIsModalOpen(false);
    } catch (error) {
      console.error("Failed to update withdrawal status:", error);
    }
  };

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Withdrawal Requests</h2>
          <p className="mt-1 text-sm sm:text-base text-slate-500">Review and process user withdrawal requests.</p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <SearchIcon className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search by name, amount, or method..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border-slate-300 pl-10 shadow-sm focus:border-sky-500 focus:ring-sky-500"
          />
        </div>
      </header>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Amount</th>
                <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Method</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">QR</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Loading requests...
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No withdrawal requests found.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => (
                  <tr key={req.id}>
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">{req.userName}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-slate-600">Rs {req.amount.toLocaleString()}</td>
                    <td className="hidden sm:table-cell whitespace-nowrap px-6 py-4 text-slate-600">{req.paymentMethod}</td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <StatusBadge status={req.status} />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {req.qrUrl ? (
                        <button
                          onClick={() => handleViewQr(req.qrUrl!)}
                          className="font-medium text-sky-600 hover:text-sky-800"
                        >
                          View QR
                        </button>
                      ) : (
                        <span className="text-slate-400">No QR</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <button onClick={() => handleViewRequest(req)} className="font-medium text-sky-600 hover:text-sky-800">
                        Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3 mt-4">
        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500">Loading requests...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500">No withdrawal requests found.</div>
        ) : (
          filteredRequests.map((req) => <MobileWithdrawalCard key={req.id} request={req} onView={() => handleViewRequest(req)} onViewQr={() => handleViewQr(req.qrUrl!)} />)
        )}
      </div>

      {isModalOpen && selectedRequest && (
        <WithdrawalReviewModal request={selectedRequest} onClose={() => setIsModalOpen(false)} onUpdateStatus={handleUpdateStatus} />
      )}

      {isQrModalOpen && selectedQrUrl && (
        <QRViewModal qrUrl={selectedQrUrl} onClose={() => setIsQrModalOpen(false)} />
      )}
    </>
  );
}

function MobileWithdrawalCard({ request, onView, onViewQr }: { request: WithdrawalRequest; onView: () => void; onViewQr: () => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">{request.userName}</div>
          <div className="text-sm text-slate-500">Rs {request.amount.toLocaleString()}</div>
          <div className="mt-1 text-xs text-slate-400">{new Date(request.requestedAt).toLocaleDateString()}</div>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <div className="mt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Method</span>
          <span className="font-mono text-slate-600">{request.paymentMethod}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Details</span>
          <span className="text-slate-600">{request.details}</span>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        {request.qrUrl && (
          <button onClick={onViewQr} className="flex-1 rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200">
            View QR
          </button>
        )}
        <button onClick={onView} className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          Review
        </button>
      </div>
    </div>
  );
}

function WithdrawalReviewModal({
  request,
  onClose,
  onUpdateStatus,
}: {
  request: WithdrawalRequest;
  onClose: () => void;
  onUpdateStatus: (request: WithdrawalRequest, status: WithdrawalStatus) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" aria-modal="true">
      <div className="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Review Withdrawal</h3>
            <p className="mt-1 text-slate-600">
              Request from <span className="font-medium">{request.userName}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100">
            <CloseIcon className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <div className="mt-4 space-y-3 rounded-md border bg-slate-50 p-4">
          <DetailItem label="Amount" value={`Rs ${request.amount.toLocaleString()}`} />
          <DetailItem label="Method" value={request.paymentMethod} />
          <DetailItem label="Details" value={request.details} />
          <DetailItem label="Requested At" value={new Date(request.requestedAt).toLocaleString()} />
          {request.qrUrl && (
            <div className="flex justify-between border-b border-slate-200 pb-2">
              <dt className="text-sm font-medium text-slate-500">QR Code</dt>
              <dd className="text-sm">
                <button
                  onClick={() => window.open(request.qrUrl, '_blank')}
                  className="font-semibold text-sky-600 hover:text-sky-800"
                >
                  View QR
                </button>
              </dd>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3 border-t pt-4">
          {request.status === "Pending" ? (
            <>
              <button
                onClick={() => onUpdateStatus(request, "Rejected")}
                className="rounded-md bg-red-100 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-200"
              >
                Reject
              </button>
              <button
                onClick={() => onUpdateStatus(request, "Completed")}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                Approve &amp; Pay
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-500">This request has already been processed.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// New QR View Modal
function QRViewModal({ qrUrl, onClose }: { qrUrl: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" aria-modal="true">
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h3 className="text-xl font-semibold text-slate-900">Payment QR Code</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100">
            <CloseIcon className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <div className="mt-6 flex justify-center">
          <div className="relative w-64 h-64">
            <Image
              src={qrUrl}
              alt="Payment QR Code"
              fill
              className="rounded-lg border border-slate-200 object-contain"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <a
            href={qrUrl}
            download="payment-qr.png"
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Download QR
          </a>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-200 pb-2 last:border-b-0">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="text-sm font-semibold text-slate-900 text-right">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: WithdrawalStatus }) {
  const base = "inline-flex rounded-full px-2 text-xs font-semibold leading-5";
  if (status === "Completed") return <span className={`${base} bg-green-100 text-green-800`}>Completed</span>;
  if (status === "Pending") return <span className={`${base} bg-yellow-100 text-yellow-800`}>Pending</span>;
  return <span className={`${base} bg-red-100 text-red-800`}>Rejected</span>;
}

function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
        clipRule="evenodd"
      />
    </svg>
  );
}