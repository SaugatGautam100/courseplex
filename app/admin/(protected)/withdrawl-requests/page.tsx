"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { database } from "@/lib/firebase";
import { ref as dbRef, onValue, update, get, push } from "firebase/database";
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
  qrUrl?: string;
};
type WithdrawalRequest = WithdrawalRequestDB & { id: string };

type UserLite = { id: string; name?: string; email?: string; imageUrl?: string };

// New: Deleted entry (written by delete-user route when user had completed transactions)
type DeletedEntry = {
  id: string;
  name?: string;
  email?: string;
  deletedAt?: number; // epoch ms
  hadCompletedTransaction?: boolean;
};

export default function WithdrawalRequestsPage() {
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, UserLite>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // New: deleted users list (with completed transactions)
  const [deletedEntries, setDeletedEntries] = useState<DeletedEntry[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<WithdrawalRequest | null>(null);
  const [selectedQrUrl, setSelectedQrUrl] = useState<string | null>(null);

  // Subscribe withdrawal requests
  useEffect(() => {
    const withdrawalRef = dbRef(database, "withdrawalRequests/");
    const unsubscribe = onValue(withdrawalRef, (snapshot) => {
      const data = (snapshot.val() || {}) as Record<string, WithdrawalRequestDB | any>;

      // Exclude _deleted node from normal requests
      const normalOnly: Record<string, WithdrawalRequestDB> = {};
      for (const [key, val] of Object.entries(data)) {
        if (key === "_deleted") continue;
        normalOnly[key] = val as WithdrawalRequestDB;
      }

      const list: WithdrawalRequest[] = Object.entries(normalOnly).map(([id, req]) => ({ id, ...req }));

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

  // Subscribe deleted list (withdrawalRequests/_deleted)
  useEffect(() => {
    const deletedRef = dbRef(database, "withdrawalRequests/_deleted");
    const unsub = onValue(deletedRef, (snap) => {
      const v = (snap.val() || {}) as Record<
        string,
        { name?: string; email?: string; deletedAt?: number; hadCompletedTransaction?: boolean }
      >;
      const list: DeletedEntry[] = Object.entries(v).map(([id, d]) => ({
        id,
        name: d?.name,
        email: d?.email,
        deletedAt: typeof d?.deletedAt === "number" ? d.deletedAt : undefined,
        hadCompletedTransaction: d?.hadCompletedTransaction === true,
      }));

      // Only keep those flagged with completed transaction (should already be true per route)
      const filtered = list.filter((x) => x.hadCompletedTransaction);
      // Sort by deletedAt desc
      filtered.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
      setDeletedEntries(filtered);
    });
    return () => unsub();
  }, []);

  // Subscribe users for avatar + email
  useEffect(() => {
    const uRef = dbRef(database, "users");
    const unsub = onValue(uRef, (snap) => {
      const v = (snap.val() || {}) as Record<string, any>;
      const map: Record<string, UserLite> = {};
      Object.entries(v).forEach(([id, val]) => {
        map[id] = {
          id,
          name: val?.name || undefined,
          email: val?.email || undefined,
          imageUrl: val?.imageUrl || undefined,
        };
      });
      setUsersMap(map);
    });
    return () => unsub();
  }, []);

  const filteredRequests = requests.filter((req) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const email = usersMap[req.userId]?.email?.toLowerCase() || "";
    return (
      req.userName.toLowerCase().includes(q) ||
      email.includes(q) ||
      String(req.amount).includes(q) ||
      req.paymentMethod.toLowerCase().includes(q) ||
      req.details.toLowerCase().includes(q)
    );
  });

  const stats = {
    total: filteredRequests.length,
    pending: filteredRequests.filter((r) => r.status === "Pending").length,
    completed: filteredRequests.filter((r) => r.status === "Completed").length,
    rejected: filteredRequests.filter((r) => r.status === "Rejected").length,
  };

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
        // Deduct user balance and log transaction
        const userBalanceRef = dbRef(database, `users/${request.userId}/balance`);
        const snapshot = await get(userBalanceRef);
        const currentBalance = Number(snapshot.val() || 0);

        if (currentBalance < request.amount) {
          alert("Error: User has insufficient balance. Marking as Rejected.");
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

      // Email user
      const emailSnap = await get(dbRef(database, `users/${request.userId}/email`));
      const userEmail = emailSnap.val() as string | null;

      if (userEmail) {
        await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: userEmail,
            subject: `Your Withdrawal Request: ${newStatus}`,
            htmlContent: `<h1>Withdrawal Status Update</h1><p>Hello ${request.userName},</p>${emailHtmlContent}<p>Thank you,<br/>The Plex Courses Team</p>`,
          }),
        });
      }

      setIsModalOpen(false);
    } catch (error) {
      console.error("Failed to update withdrawal status:", error);
      alert("Error updating status.");
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Withdrawal Requests</h1>
          <p className="mt-2 text-sm text-slate-600">Review and process user withdrawal requests</p>
        </div>
      </header>

      {/* Deleted Accounts (with completed transactions) */}
      {deletedEntries.length > 0 && (
        <div className="mb-6 rounded-lg border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrashIcon className="h-5 w-5 text-slate-600" />
              <h3 className="text-base font-semibold text-slate-900">Deleted Accounts (Completed Transactions)</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {deletedEntries.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">User ID</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Deleted At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {deletedEntries.map((d) => (
                  <tr key={d.id} className="text-sm">
                    <td className="px-4 py-2 font-mono text-slate-700">{d.id}</td>
                    <td className="px-4 py-2">{d.name || "-"}</td>
                    <td className="px-4 py-2">{d.email || "-"}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {d.deletedAt ? new Date(d.deletedAt).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            This list shows only deleted accounts that had completed transactions. It does not affect normal requests.
          </p>
        </div>
      )}

      {/* Stats (match orders) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        <StatCard title="Total Requests" value={stats.total} icon={<CashIcon />} color="slate" />
        <StatCard title="Pending" value={stats.pending} icon={<ClockIcon />} color="yellow" />
        <StatCard title="Completed" value={stats.completed} icon={<CheckCircleIcon />} color="green" />
        <StatCard title="Rejected" value={stats.rejected} icon={<XCircleIcon />} color="red" />
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, amount, method, details..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Desktop Table (match orders) */}
      <div className="hidden lg:block">
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">User</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">Amount</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">Method</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">Requested</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">QR</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="flex justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-600"></div>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">Loading requests...</p>
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      No withdrawal requests found.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((req) => {
                    const u = usersMap[req.userId];
                    return (
                      <tr key={req.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center">
                              {u?.imageUrl ? (
                                <Image src={u.imageUrl} alt={req.userName} width={40} height={40} className="object-cover" />
                              ) : (
                                <UserIcon className="h-6 w-6 text-slate-400" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">{req.userName}</div>
                              <div className="text-sm text-slate-500">{u?.email || "-"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-700">Rs {req.amount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-slate-900">{req.paymentMethod}</td>
                        <td className="px-6 py-4 text-slate-900">
                          {req.requestedAt ? new Date(req.requestedAt).toLocaleString() : "-"}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={req.status} />
                        </td>
                        <td className="px-6 py-4">
                          {req.qrUrl ? (
                            <button onClick={() => handleViewQr(req.qrUrl!)} className="font-medium text-sky-600 hover:text-sky-800">
                              View QR
                            </button>
                          ) : (
                            <span className="text-slate-400">No QR</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <ActionsDropdown
                            request={req}
                            onView={() => handleViewRequest(req)}
                            onApprove={(r) => handleUpdateStatus(r, "Completed")}
                            onReject={(r) => handleUpdateStatus(r, "Rejected")}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mobile Cards (match orders) */}
      <div className="lg:hidden space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-600"></div>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-lg border bg-white p-6 text-center text-slate-500">No withdrawal requests found.</div>
        ) : (
          filteredRequests.map((req) => {
            const u = usersMap[req.userId];
            return (
              <div key={req.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center">
                      {u?.imageUrl ? (
                        <Image src={u.imageUrl} alt={req.userName} width={40} height={40} className="object-cover" />
                      ) : (
                        <UserIcon className="h-6 w-6 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{req.userName}</h3>
                      <p className="text-sm text-slate-500">{u?.email || "-"}</p>
                      <p className="mt-1 text-xs text-slate-400">{new Date(req.requestedAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <StatusBadge status={req.status} />
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Amount</span>
                    <span className="font-mono text-slate-700">Rs {req.amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Method</span>
                    <span className="text-slate-900">{req.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Details</span>
                    <span className="text-slate-600">{req.details}</span>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  {req.qrUrl && (
                    <button
                      onClick={() => handleViewQr(req.qrUrl!)}
                      className="flex-1 rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200"
                    >
                      View QR
                    </button>
                  )}
                  <button
                    onClick={() => handleViewRequest(req)}
                    className="flex-1 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
                  >
                    Review
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Review Modal */}
      {isModalOpen && selectedRequest && (
        <WithdrawalReviewModal
          request={selectedRequest}
          onClose={() => setIsModalOpen(false)}
          onUpdateStatus={handleUpdateStatus}
        />
      )}

      {/* QR Modal */}
      {isQrModalOpen && selectedQrUrl && (
        <QRViewModal qrUrl={selectedQrUrl} onClose={() => setIsQrModalOpen(false)} />
      )}
    </div>
  );
}

/* ================== Components ================== */

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
        <div className="flex items-start justify_between">
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
          <DetailRow label="Amount" value={`Rs ${request.amount.toLocaleString()}`} />
          <DetailRow label="Method" value={request.paymentMethod} />
          <DetailRow label="Details" value={request.details} />
          <DetailRow label="Requested At" value={new Date(request.requestedAt).toLocaleString()} />
          {request.qrUrl && (
            <div className="flex justify-between border-b border-slate-200 pb-2">
              <dt className="text-sm font-medium text-slate-500">QR Code</dt>
              <dd className="text-sm">
                <a href={request.qrUrl} target="_blank" className="font-semibold text-sky-600 hover:text-sky-800">
                  View QR
                </a>
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
            <Image src={qrUrl} alt="Payment QR Code" fill className="rounded-lg border border-slate-200 object-contain" />
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <a href={qrUrl} download="payment-qr.png" className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
            Download QR
          </a>
        </div>
      </div>
    </div>
  );
}

function ActionsDropdown({
  request,
  onView,
  onApprove,
  onReject,
}: {
  request: WithdrawalRequest;
  onView: () => void;
  onApprove: (r: WithdrawalRequest) => void;
  onReject: (r: WithdrawalRequest) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg_white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
      >
        Actions
        <ChevronDownIcon className="ml-2 h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5">
          <div className="py-1">
            <button
              onClick={() => {
                onView();
                setIsOpen(false);
              }}
              className="flex w-full items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              <EyeIcon className="mr-3 h-4 w-4" />
              Review
            </button>
            {request.status === "Pending" && (
              <>
                <button
                  onClick={() => {
                    onApprove(request);
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center px-4 py-2 text-sm text-green-700 hover:bg-green-50"
                >
                  <CheckIcon className="mr-3 h-4 w-4" />
                  Approve &amp; Pay
                </button>
                <button
                  onClick={() => {
                    onReject(request);
                    setIsOpen(false);
                  }}
                  className="flex w_full items-center px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  <XIcon className="mr-3 h-4 w-4" />
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: "slate" | "yellow" | "green" | "red";
}) {
  const bg =
    color === "yellow" ? "bg-yellow-100" : color === "green" ? "bg-green-100" : color === "red" ? "bg-red-100" : "bg-slate-100";
  const text =
    color === "yellow" ? "text-yellow-600" : color === "green" ? "text-green-600" : color === "red" ? "text-red-600" : "text-slate-600";

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-medium ${text}`}>{title}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
        <div className={`rounded-full ${bg} p-3`}>
          <span className={text}>{icon}</span>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
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

/* ================== Icons (match orders) ================== */
function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
    </svg>
  );
}
function CashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18v10H3zM7 7a4 4 0 004 4 4 4 0 004-4M7 17a4 4 0 004-4 4 4 0 004 4" />
    </svg>
  );
}
function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function XCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}
function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  );
}
function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M9 3h6m-9 4h12m-10 0v12m4-12v12M5 7l1 14h12l1-14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}