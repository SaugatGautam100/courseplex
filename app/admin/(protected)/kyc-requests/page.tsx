"use client";

import { useEffect, useState } from "react";
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

export default function KycRequestsPage() {
  const [requests, setRequests] = useState<KycRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<KycRequest | null>(null);

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

  const filteredRequests = requests.filter((req) => {
    const q = searchQuery.toLowerCase();
    return (
      req.fullName.toLowerCase().includes(q) ||
      req.citizenshipNo.toLowerCase().includes(q) ||
      req.contactNo.toLowerCase().includes(q) ||
      req.userName.toLowerCase().includes(q)
    );
  });

  const handleViewRequest = (request: KycRequest) => {
    setSelectedRequest(request);
    setIsModalOpen(true);
  };

  const handleUpdateStatus = async (request: KycRequest, newStatus: KycRequest["status"]) => {
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
      }<p>Thank you,<br/>The Skill Hub Nepal Team</p>`;

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
    <>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">KYC Requests</h2>
          <p className="mt-1 text-sm sm:text-base text-slate-500">Review and verify user-submitted documents.</p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <SearchIcon className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search by name, citizenship, or contact..."
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
                <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Citizenship No.</th>
                <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Submitted On</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Loading requests...
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    No KYC requests found.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => (
                  <tr key={req.id}>
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">{req.fullName}</td>
                    <td className="hidden sm:table-cell whitespace-nowrap px-6 py-4 font-mono text-slate-600">{req.citizenshipNo}</td>
                    <td className="hidden md:table-cell whitespace-nowrap px-6 py-4 text-slate-600">
                      {new Date(req.submittedAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <StatusBadge status={req.status} />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <button onClick={() => handleViewRequest(req)} className="font-medium text-sky-600 hover:text-sky-800">
                        View Details
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
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500">No KYC requests found.</div>
        ) : (
          filteredRequests.map((req) => <MobileKycCard key={req.id} request={req} onView={() => handleViewRequest(req)} />)
        )}
      </div>

      {isModalOpen && selectedRequest && (
        <KycReviewModal request={selectedRequest} onClose={() => setIsModalOpen(false)} onUpdateStatus={handleUpdateStatus} />
      )}
    </>
  );
}

function MobileKycCard({ request, onView }: { request: KycRequest; onView: () => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">{request.fullName}</div>
          <div className="text-sm text-slate-500">{request.contactNo}</div>
          <div className="mt-1 text-xs text-slate-400">{new Date(request.submittedAt).toLocaleDateString()}</div>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <div className="mt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Citizenship No.</span>
          <span className="font-mono text-slate-600">{request.citizenshipNo}</span>
        </div>
      </div>
      <button onClick={onView} className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
        View Details
      </button>
    </div>
  );
}

function KycReviewModal({
  request,
  onClose,
  onUpdateStatus,
}: {
  request: KycRequest;
  onClose: () => void;
  onUpdateStatus: (request: KycRequest, status: KycRequest["status"]) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" aria-modal="true">
      <div className="relative w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Review KYC Submission</h3>
            <p className="mt-1 text-slate-600">
              Details for <span className="font-medium">{request.fullName}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100">
            <CloseIcon className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <div className="mt-6 space-y-4 rounded-md border bg-slate-50 p-4">
          <DetailItem label="Full Name" value={request.fullName} />
          <DetailItem label="Address" value={request.address} />
          <DetailItem label="Contact Number" value={request.contactNo} />
          <DetailItem label="Citizenship No." value={request.citizenshipNo} />
          <DetailItem label="Father&apos;s Name" value={request.fatherName} />
          <DetailItem label="Mother&apos;s Name" value={request.motherName} />
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

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-4 border-b border-slate-200 pb-2 last:border-b-0">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="col-span-2 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: KycStatus }) {
  const base = "inline-flex rounded-full px-2 text-xs font-semibold leading-5";
  if (status === "Approved") return <span className={`${base} bg-green-100 text-green-800`}>Approved</span>;
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