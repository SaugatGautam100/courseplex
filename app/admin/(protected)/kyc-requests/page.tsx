"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { database } from "@/lib/firebase";
import { ref, onValue, update, get } from "firebase/database";
import type { SVGProps } from "react";

type KycStatus = "Pending" | "Approved" | "Rejected";

// DB shape
type KycRequestDB = {
  userName: string;
  status: KycStatus;
  submittedAt: string;
  fullName: string;
  address: string;
  citizenshipNo: string;
  contactNo: string;
  fatherName: string;
  motherName: string;
};
// App shape
type KycRequest = KycRequestDB & { id: string };

// Minimal user info (for avatar + email)
type UserLite = {
  id: string;
  email?: string;
  imageUrl?: string;
  name?: string;
};

export default function KycRequestsPage() {
  const [requests, setRequests] = useState<KycRequest[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, UserLite>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<KycRequest | null>(null);

  // Subscribe KYC requests
  useEffect(() => {
    const kycRef = ref(database, "kycRequests/");
    const unsubscribe = onValue(kycRef, (snapshot) => {
      const data = (snapshot.val() || {}) as Record<string, KycRequestDB>;
      const requestsArray: KycRequest[] = Object.entries(data).map(([id, req]) => ({ id, ...req }));

      // Sort by status then submitted date
      requestsArray.sort((a, b) => {
        const order: Record<KycStatus, number> = { Pending: 0, Approved: 1, Rejected: 2 };
        const sa = order[a.status] ?? 3;
        const sb = order[b.status] ?? 3;
        if (sa !== sb) return sa - sb;
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      });

      setRequests(requestsArray);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe users (for email + imageUrl)
  useEffect(() => {
    const uRef = ref(database, "users");
    const unsub = onValue(uRef, (snap) => {
      const v = (snap.val() || {}) as Record<string, any>;
      const map: Record<string, UserLite> = {};
      Object.entries(v).forEach(([id, val]) => {
        map[id] = {
          id,
          email: val?.email || undefined,
          imageUrl: val?.imageUrl || undefined,
          name: val?.name || undefined,
        };
      });
      setUsersMap(map);
    });
    return () => unsub();
  }, []);

  // Filter including email and username
  const filteredRequests = requests.filter((req) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const email = usersMap[req.id]?.email?.toLowerCase() || "";
    return (
      req.fullName.toLowerCase().includes(q) ||
      req.citizenshipNo.toLowerCase().includes(q) ||
      req.contactNo.toLowerCase().includes(q) ||
      req.userName.toLowerCase().includes(q) ||
      email.includes(q)
    );
  });

  const stats = {
    total: filteredRequests.length,
    pending: filteredRequests.filter((r) => r.status === "Pending").length,
    approved: filteredRequests.filter((r) => r.status === "Approved").length,
    rejected: filteredRequests.filter((r) => r.status === "Rejected").length,
  };

  const openModal = (request: KycRequest) => {
    setSelectedRequest(request);
    setIsModalOpen(true);
  };

  const handleUpdateStatus = async (request: KycRequest, newStatus: KycStatus) => {
    if (!window.confirm(`Are you sure you want to ${newStatus.toLowerCase()} this request? This will notify the user.`)) return;
    try {
      const updates: Record<string, unknown> = {};
      updates[`/kycRequests/${request.id}/status`] = newStatus;
      updates[`/users/${request.id}/kyc/status`] = newStatus;
      await update(ref(database), updates);

      const userEmailSnap = await get(ref(database, `users/${request.id}/email`));
      const userEmail = userEmailSnap.val() as string | null;
      if (!userEmail) throw new Error("User email not found.");

      const subject = `Your KYC Status: ${newStatus}`;
      const htmlContent = `<h1>KYC Verification Update</h1><p>Hello ${request.userName},</p><p>An admin has reviewed your details and your KYC status has been updated to <strong>${newStatus}</strong>.</p>${
        newStatus === "Approved" ? "<p>Congratulations! Your account is now fully verified.</p>" : ""
      }${
        newStatus === "Rejected" ? "<p>Please review your details and re-submit if necessary.</p>" : ""
      }<p>Thank you,<br/>The Plex Courses Team</p>`;

      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: userEmail, subject, htmlContent }),
      });

      setIsModalOpen(false);
    } catch (error) {
      console.error("Failed to update KYC status and send email:", error);
      alert("Error updating status.");
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">KYC Requests</h1>
          <p className="mt-2 text-sm text-slate-600">Review and verify user-submitted documents</p>
        </div>
      </header>

      {/* Stats (match orders) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        <StatCard title="Total Requests" value={stats.total} icon={<DocumentIcon />} color="slate" />
        <StatCard title="Pending" value={stats.pending} icon={<ClockIcon />} color="yellow" />
        <StatCard title="Approved" value={stats.approved} icon={<CheckCircleIcon />} color="green" />
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
            placeholder="Search by name, email, citizenship, contact, username..."
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
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">Citizenship No.</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">Contact</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">Submitted</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-600"></div>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">Loading requests...</p>
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">No KYC requests found.</td>
                  </tr>
                ) : (
                  filteredRequests.map((req) => {
                    const u = usersMap[req.id];
                    return (
                      <tr key={req.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center">
                              {u?.imageUrl ? (
                                <Image
                                  src={u.imageUrl}
                                  alt={req.fullName}
                                  width={40}
                                  height={40}
                                  className="object-cover"
                                />
                              ) : (
                                <UserIcon className="h-6 w-6 text-slate-400" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">{req.fullName}</div>
                              <div className="text-sm text-slate-500">{u?.email || "-"}</div>
                              <div className="mt-1 text-xs text-slate-400">@{req.userName}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-700">{req.citizenshipNo}</td>
                        <td className="px-6 py-4 text-slate-900">{req.contactNo}</td>
                        <td className="px-6 py-4 text-slate-900">{req.submittedAt ? new Date(req.submittedAt).toLocaleString() : "-"}</td>
                        <td className="px-6 py-4">
                          <KycStatusBadge status={req.status} />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <ActionsDropdown
                            request={req}
                            onView={() => openModal(req)}
                            onApprove={(r) => handleUpdateStatus(r, "Approved")}
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

      {/* Mobile Cards (match orders style) */}
      <div className="lg:hidden space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-600"></div>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-lg border bg-white p-6 text-center text-slate-500">
            No KYC requests found.
          </div>
        ) : (
          filteredRequests.map((req) => {
            const u = usersMap[req.id];
            return (
              <div key={req.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center">
                      {u?.imageUrl ? (
                        <Image
                          src={u.imageUrl}
                          alt={req.fullName}
                          width={40}
                          height={40}
                          className="object-cover"
                        />
                      ) : (
                        <UserIcon className="h-6 w-6 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{req.fullName}</h3>
                      <p className="text-sm text-slate-500">{u?.email || "-"}</p>
                      <p className="mt-1 text-xs text-slate-400">@{req.userName}</p>
                      <p className="mt-1 text-xs text-slate-400">{new Date(req.submittedAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <KycStatusBadge status={req.status} />
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Citizenship No.</span>
                    <span className="font-mono text-slate-700">{req.citizenshipNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Contact</span>
                    <span className="text-slate-900">{req.contactNo}</span>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => openModal(req)}
                    className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    View Details
                  </button>
                  {req.status === "Pending" && (
                    <>
                      <button
                        onClick={() => handleUpdateStatus(req, "Approved")}
                        className="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(req, "Rejected")}
                        className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      {isModalOpen && selectedRequest && (
        <KycReviewModal
          request={selectedRequest}
          onClose={() => setIsModalOpen(false)}
          onUpdateStatus={handleUpdateStatus}
          userEmail={usersMap[selectedRequest.id]?.email}
          userImageUrl={usersMap[selectedRequest.id]?.imageUrl}
        />
      )}
    </div>
  );
}

/* ================== Components ================== */

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
    color === "yellow"
      ? "bg-yellow-100"
      : color === "green"
      ? "bg-green-100"
      : color === "red"
      ? "bg-red-100"
      : "bg-slate-100";
  const text =
    color === "yellow"
      ? "text-yellow-600"
      : color === "green"
      ? "text-green-600"
      : color === "red"
      ? "text-red-600"
      : "text-slate-600";

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

function ActionsDropdown({
  request,
  onView,
  onApprove,
  onReject,
}: {
  request: KycRequest;
  onView: () => void;
  onApprove: (r: KycRequest) => void;
  onReject: (r: KycRequest) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
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
              View Details
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
                  Approve
                </button>
                <button
                  onClick={() => {
                    onReject(request);
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center px-4 py-2 text-sm text-red-700 hover:bg-red-50"
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

function KycReviewModal({
  request,
  onClose,
  onUpdateStatus,
  userEmail,
  userImageUrl,
}: {
  request: KycRequest;
  onClose: () => void;
  onUpdateStatus: (request: KycRequest, status: KycStatus) => void;
  userEmail?: string;
  userImageUrl?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" aria-modal="true">
      <div className="relative w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center">
              {userImageUrl ? (
                <Image src={userImageUrl} alt={request.fullName} width={40} height={40} className="object-cover" />
              ) : (
                <UserIcon className="h-6 w-6 text-slate-400" />
              )}
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-900">{request.fullName}</h3>
              <p className="text-sm text-slate-500">{userEmail || "-"}</p>
              <p className="text-xs text-slate-400">@{request.userName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100">
            <CloseIcon className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="mt-6 space-y-4 rounded-md border bg-slate-50 p-4">
          <DetailItem label="Full Name" value={request.fullName} />
          <DetailItem label="Email" value={userEmail || "-"} />
          <DetailItem label="Address" value={request.address} />
          <DetailItem label="Contact Number" value={request.contactNo} />
          <DetailItem label="Citizenship No." value={request.citizenshipNo} />
          <DetailItem label="Father's Name" value={request.fatherName} />
          <DetailItem label="Mother's Name" value={request.motherName} />
          <DetailItem label="Submitted On" value={new Date(request.submittedAt).toLocaleString()} />
          <DetailItem label="Status" value={request.status} />
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
                onClick={() => onUpdateStatus(request, "Approved")}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                Approve
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-500">This request has been processed.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileKycCard({ request, onView }: { request: KycRequest; onView: () => void }) {
  // This uses usersMap in parent; for simplicity, parent builds full mobile cards with avatar/email.
  return null;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-4 border-b border-slate-200 pb-2 last:border-b-0">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="col-span-2 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function KycStatusBadge({ status }: { status: KycStatus }) {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";
  if (status === "Approved") return <span className={`${base} bg-green-100 text-green-800`}>Approved</span>;
  if (status === "Pending") return <span className={`${base} bg-yellow-100 text-yellow-800`}>Pending</span>;
  return <span className={`${base} bg-red-100 text-red-800`}>Rejected</span>;
}

/* ============== Icons (match orders) ============== */
function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
    </svg>
  );
}
function DocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16h8M8 12h8m-6 8h6a2 2 0 002-2V7l-5-5H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
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
function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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