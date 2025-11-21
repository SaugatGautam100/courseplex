"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { database, auth, storage } from "@/lib/firebase";
import { ref as dbRef, onValue, set, push, update } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import Link from "next/link";
import Image from "next/image";
import type { SVGProps } from "react";

// Types
type KycStatus = "Not Submitted" | "Pending" | "Approved" | "Rejected";
type UserProfile = { name: string; balance: number; kyc?: { status: KycStatus }; withdrawalQrUrl?: string };
type WithdrawalRequest = {
  id: string;
  userId: string;
  amount: number;
  paymentMethod: string;
  details: string;
  qrUrl?: string;
  requestedAt: string;
  status: "Pending" | "Completed" | "Rejected";
};

type WithdrawalRequestDb = Omit<WithdrawalRequest, "id">;
type WithdrawalRequestsDb = Record<string, WithdrawalRequestDb>;

const MINIMUM_WITHDRAWAL_AMOUNT = 400;

// Full timestamp formatter
function formatDateTime(input: string) {
  const d = new Date(input);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

export default function WithdrawPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [history, setHistory] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("eSewa");
  const [details, setDetails] = useState("");
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [existingQrUrl, setExistingQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQrUploading, setIsQrUploading] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        setLoading(false);
        return;
      }
      const userRef = dbRef(database, `users/${currentUser.uid}`);
      const historyRef = dbRef(database, "withdrawalRequests");

      const unsubscribeUser = onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.val() as UserProfile;
          setUser(userData);
          setExistingQrUrl(userData.withdrawalQrUrl || null);
          setQrPreview(userData.withdrawalQrUrl || null);
        }
        setLoading(false);
      });

      const unsubscribeHistory = onValue(historyRef, (snapshot) => {
        const data = (snapshot.val() as WithdrawalRequestsDb | null) ?? {};
        const userHistory: WithdrawalRequest[] = Object.entries(data)
          .map(([id, req]) => ({ id, ...req }))
          .filter((req) => req.userId === currentUser.uid)
          .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
        setHistory(userHistory);
      });

      return () => {
        unsubscribeUser();
        unsubscribeHistory();
      };
    });
    return () => unsubscribeAuth();
  }, []);

  // NEW: Sum of pending requests
  const totalPendingAmount = history
    .filter((r) => r.status === "Pending")
    .reduce((sum, r) => sum + r.amount, 0);

  const handleQrChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setIsQrUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = () => setQrPreview(String(reader.result));
      reader.readAsDataURL(file);

      const qrStorageRef = storageRef(storage, `withdrawal-qrs/${currentUser.uid}/${Date.now()}`);
      const qrSnapshot = await uploadBytes(qrStorageRef, file);
      const qrUrl = await getDownloadURL(qrSnapshot.ref);

      await update(dbRef(database, `users/${currentUser.uid}`), { withdrawalQrUrl: qrUrl });
      setExistingQrUrl(qrUrl);
      setQrPreview(qrUrl);
      alert("QR code uploaded and saved successfully!");
    } catch (error) {
      console.error("QR upload error:", error);
      alert("Failed to upload QR code. Please try again.");
      setQrPreview(null);
    } finally {
      setIsQrUploading(false);
    }
  };

  const handleWithdraw = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    const currentUser = auth.currentUser;
    const withdrawalAmount = Number(amount);

    if (!currentUser || !user) {
      setError("User not found.");
      setIsSubmitting(false);
      return;
    }
    if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
      setError("Please enter a valid amount.");
      setIsSubmitting(false);
      return;
    }
    if (withdrawalAmount < MINIMUM_WITHDRAWAL_AMOUNT) {
      setError(`Minimum withdrawal is Rs ${MINIMUM_WITHDRAWAL_AMOUNT}.`);
      setIsSubmitting(false);
      return;
    }
    if (withdrawalAmount + totalPendingAmount > user.balance) {
      setError("Requested amount plus pending withdrawals exceeds your available balance.");
      setIsSubmitting(false);
      return;
    }
    if (!details.trim()) {
      setError("Please provide payment details (e.g., account number or ID).");
      setIsSubmitting(false);
      return;
    }
    if (!existingQrUrl) {
      setError("Please upload your QR code before submitting a withdrawal request.");
      setIsSubmitting(false);
      return;
    }

    try {
      const withdrawalRef = push(dbRef(database, "withdrawalRequests"));
      await set(withdrawalRef, {
        userId: currentUser.uid,
        userName: user.name,
        amount: withdrawalAmount,
        paymentMethod,
        details: details.trim(),
        qrUrl: existingQrUrl,
        requestedAt: new Date().toISOString(),
        status: "Pending",
      });
      setSuccess("Withdrawal request submitted! It will be reviewed by an admin.");
      setAmount("");
      setDetails("");
    } catch {
      setError("Failed to submit request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading your balance...</div>;
  if (!user) return <div className="p-8 text-center text-red-500">Could not load user data. Please log in again.</div>;

  const isKycApproved = user.kyc?.status === "Approved";
  const requestedAmount = Number(amount) || 0;
  const isRequestDisabled = isSubmitting || requestedAmount + totalPendingAmount > user.balance;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Request Withdrawal</h1>
        <p className="mt-2 text-slate-600">Withdraw your affiliate earnings. KYC approval is required.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500">Available Balance</h3>
            <p className="mt-1 text-3xl font-bold text-slate-900">Rs {user.balance.toLocaleString()}</p>
            {totalPendingAmount > 0 && (
              <p className="mt-1 text-xs text-yellow-600">
                Pending: Rs {totalPendingAmount.toLocaleString()}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">Minimum withdrawal: Rs {MINIMUM_WITHDRAWAL_AMOUNT}</p>
          </div>

          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 mb-2">Your Saved QR Code</h3>
            {existingQrUrl ? (
              <div className="flex justify-center">
                <Image
                  src={existingQrUrl}
                  alt="Your QR Code"
                  width={160}
                  height={160}
                  className="rounded-md shadow-inner max-w-full h-auto"
                />
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center">No QR saved yet. Upload one below.</p>
            )}
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Upload/Update QR Code <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-4">
                <label
                  htmlFor="qr-upload"
                  className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <span>{isQrUploading ? "Uploading..." : "Upload QR Code"}</span>
                  <input
                    id="qr-upload"
                    name="qr-upload"
                    type="file"
                    className="sr-only"
                    accept="image/*"
                    onChange={handleQrChange}
                    disabled={isQrUploading}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
        <div className="md:col-span-2">
          {isKycApproved ? (
            <form onSubmit={handleWithdraw} className="rounded-lg border bg-white p-6 shadow-sm space-y-6">
              <h3 className="text-lg font-semibold text-slate-800">New Withdrawal Request</h3>
              <InputField label="Amount to Withdraw (Rs)" id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              <div>
                <label className="block text-sm font-medium text-slate-700">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="mt-1.5 w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                >
                  <option>eSewa</option>
                  <option>Khalti</option>
                  <option>Bank Transfer</option>
                </select>
              </div>
              <InputField
                label="Payment Details (Account Number or ID)"
                id="details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                required
              />
              {error && (
                <p className="text-sm font-semibold text-red-600 text-center p-3 bg-red-50 border border-red-200 rounded-md">
                  {error}
                </p>
              )}
              {success && (
                <p className="text-sm font-semibold text-green-600 text-center p-3 bg-green-50 border border-green-200 rounded-md">
                  {success}
                </p>
              )}
              <button
                type="submit"
                disabled={isRequestDisabled}
                title={isRequestDisabled && !isSubmitting ? "Amount plus pending requests exceeds balance" : undefined}
                className="w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:bg-sky-400 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : "Submit Request"}
              </button>
            </form>
          ) : (
            <KycNotApprovedNotice status={user.kyc?.status || "Not Submitted"} />
          )}
        </div>
      </div>

      <div className="mt-10">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Your Withdrawal History</h3>
        {/* Mobile list */}
        <div className="space-y-4 md:hidden">
          {history.length === 0 ? (
            <p className="text-center text-slate-500 p-4">No withdrawal history.</p>
          ) : (
            history.map((req) => (
              <div key={req.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-slate-800 font-mono">Rs {req.amount.toLocaleString()}</p>
                    <p className="text-sm text-slate-500">{req.paymentMethod}</p>
                  </div>
                  <StatusBadge status={req.status} />
                </div>
                <div className="mt-4 border-t pt-2 text-xs text-slate-500 text-right">
                  Requested on{" "}
                  <time dateTime={req.requestedAt} title={new Date(req.requestedAt).toISOString()}>
                    {formatDateTime(req.requestedAt)}
                  </time>
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
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Date & Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                      No withdrawal requests yet.
                    </td>
                  </tr>
                ) : (
                  history.map((req) => (
                    <tr key={req.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        <time dateTime={req.requestedAt} title={new Date(req.requestedAt).toISOString()}>
                          {formatDateTime(req.requestedAt)}
                        </time>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-800">
                        Rs {req.amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{req.paymentMethod}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={req.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================== HELPER COMPONENTS ==================
function InputField({
  id,
  label,
  ...props
}: {
  id: string;
  label: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input id={id} {...props} className="mt-1 w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500" />
    </div>
  );
}

function StatusBadge({ status }: { status: WithdrawalRequest["status"] }) {
  const base = "inline-flex rounded-full px-2 text-xs font-semibold leading-5";
  if (status === "Completed") return <span className={`${base} bg-green-100 text-green-800`}>Completed</span>;
  if (status === "Pending") return <span className={`${base} bg-yellow-100 text-yellow-800`}>Pending</span>;
  return <span className={`${base} bg-red-100 text-red-800`}>Rejected</span>;
}

function KycNotApprovedNotice({ status }: { status: KycStatus }) {
  const message =
    status === "Pending"
      ? "Your KYC is under review. Please wait for approval before making a withdrawal."
      : "Your KYC has not been approved. Please complete verification to enable withdrawals.";
  return (
    <div className="rounded-lg border-2 border-dashed border-yellow-300 bg-yellow-50 p-6 text-center">
      <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-yellow-100">
        <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-yellow-800">KYC Verification Required</h3>
      <p className="mt-2 text-sm text-yellow-700">{message}</p>
      {status !== "Pending" && (
        <Link href="/user/kyc" className="mt-4 inline-block rounded-md bg-yellow-500 px-4 py-2 text-sm font-semibold text-white hover:bg-yellow-600">
          Go to KYC Page
        </Link>
      )}
    </div>
  );
}

function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
    </svg>
  );
}