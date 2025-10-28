"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useRef, type ChangeEvent } from "react";
import { database, auth, storage } from "@/lib/firebase";
import { ref as dbRef, onValue, get, push, update } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import type { SVGProps } from "react";

/* ================== Types ================== */
type Package = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  features?: string[];
  commissionPercent?: number;
};
type UserProfile = {
  id: string;
  name: string;
  email: string;
  courseId?: string; // legacy single course
  ownedCourseIds?: Record<string, boolean>; // multiple courses
  referrerId?: string;
  referredBy?: string;
};

type PaymentMethod = "eSewa" | "Khalti" | "Bank Transfer";
type OrderStatus = "Pending Approval" | "Completed" | "Rejected";
type Order = {
  id: string;
  userId: string;
  customerName: string;
  product: string; // "Purchase: X" or "Upgrade to: X"
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  transactionCode: string;
  courseId: string;
  createdAt: string;
  email: string;
  referrerId?: string;
  paymentProofUrl?: string;
};

type OrdersDb = Record<string, Omit<Order, "id">>;
type PackagesDb = Record<string, Omit<Package, "id">>;

/* ================== Helpers ================== */
function parseUniversalQR(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (typeof val === "object" && val && "url" in (val as any)) {
    const url = (val as any).url;
    return typeof url === "string" ? url : null;
  }
  return null;
}

/* ================== Page ================== */
export default function BuyCoursePage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ownedSet, setOwnedSet] = useState<Set<string>>(new Set());
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Universal QR
  const [universalQr, setUniversalQr] = useState<string>("/images/shnqrcode.jpg");

  // Purchase modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search
  const [query, setQuery] = useState("");

  // Avoid repeated sync loops
  const syncingLegacyRef = useRef(false);

  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    let unsubOrders: (() => void) | null = null;
    let unsubQR1: (() => void) | null = null;
    let unsubQR2: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      // Load courses (public packages)
      const pkSnap = await get(dbRef(database, "packages"));
      const pkObj = (pkSnap.val() as PackagesDb | null) ?? {};
      const pks: Package[] = Object.entries(pkObj).map(([id, v]) => ({
        id,
        ...v,
        commissionPercent: typeof v.commissionPercent === "number" ? v.commissionPercent : 58,
      }));
      pks.sort((a, b) => (a.price || 0) - (b.price || 0));
      setPackages(pks);

      // Listen to universal QR (two fallback paths)
      const ref1 = dbRef(database, "paymentQRCodes/universal");
      const ref2 = dbRef(database, "universalPaymentQR");
      unsubQR1 = onValue(ref1, (snap) => {
        const url = parseUniversalQR(snap.val());
        if (url) setUniversalQr(url);
      });
      unsubQR2 = onValue(ref2, (snap) => {
        const url = parseUniversalQR(snap.val());
        if (url) setUniversalQr(url);
      });

      if (!fbUser) {
        setUser(null);
        setOwnedSet(new Set());
        setOrders([]);
        setLoading(false);
        return;
      }

      // Listen to current user
      const userRef = dbRef(database, `users/${fbUser.uid}`);
      unsubUser = onValue(userRef, async (snap) => {
        const val = (snap.val() || {}) as Partial<UserProfile>;
        const u: UserProfile = {
          id: fbUser.uid,
          name: String(val?.name || ""),
          email: String(val?.email || fbUser.email || ""),
          courseId: val?.courseId,
          ownedCourseIds: val?.ownedCourseIds || undefined,
          referrerId: val?.referrerId,
          referredBy: val?.referredBy,
        };
        setUser(u);

        // Build owned set (support legacy courseId + new ownedCourseIds map)
        const s = new Set<string>();
        if (u.courseId) s.add(u.courseId);
        if (u.ownedCourseIds) {
          Object.entries(u.ownedCourseIds).forEach(([cid, v]) => {
            if (v) s.add(cid);
          });
        }
        setOwnedSet(s);

        // Migrate legacy courseId -> ownedCourseIds if missing
        if (u.courseId && !u.ownedCourseIds?.[u.courseId] && !syncingLegacyRef.current) {
          try {
            syncingLegacyRef.current = true;
            await update(dbRef(database, `users/${u.id}/ownedCourseIds`), { [u.courseId]: true });
          } catch (e) {
            console.warn("Legacy course migration failed:", e);
          } finally {
            syncingLegacyRef.current = false;
          }
        }
        setLoading(false);
      });

      // Listen to all orders (we’ll filter user’s orders in memory)
      const ordersRef = dbRef(database, "orders");
      unsubOrders = onValue(ordersRef, (snap) => {
        const all = (snap.val() as OrdersDb | null) ?? {};
        const list: Order[] = Object.entries(all).map(([id, v]) => ({ id, ...v }));
        setOrders(list);
      });
    });

    return () => {
      unsubAuth();
      if (unsubUser) unsubUser();
      if (unsubOrders) unsubOrders();
      if (unsubQR1) unsubQR1();
      if (unsubQR2) unsubQR2();
    };
  }, []);

  const userOrders = useMemo(() => {
    if (!user) return [];
    return orders
      .filter((o) => o.userId === user.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, user]);

  const pendingPurchases = useMemo(() => {
    return userOrders.filter((o) => o.status === "Pending Approval" && o.product?.startsWith("Purchase"));
  }, [userOrders]);

  const ownedCourses = useMemo(() => {
    if (!packages.length || !ownedSet.size) return [];
    return packages.filter((p) => ownedSet.has(p.id));
  }, [packages, ownedSet]);

  const availableToBuy = useMemo(() => {
    if (!packages.length) return [];
    return packages.filter((p) => !ownedSet.has(p.id));
  }, [packages, ownedSet]);

  // Search filter for Add More Courses
  const filteredAvailableToBuy = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableToBuy;
    return availableToBuy.filter((p) => {
      const inName = p.name?.toLowerCase().includes(q);
      const inFeatures = (p.features || []).some((f) => f.toLowerCase().includes(q));
      return inName || inFeatures;
    });
  }, [availableToBuy, query]);

  const openPurchaseModal = (pkg: Package) => {
    setSelectedPackage(pkg);
    setIsModalOpen(true);
  };
  const closePurchaseModal = () => {
    setSelectedPackage(null);
    setIsModalOpen(false);
  };

  const hasPendingForCourse = (courseId: string) => {
    return pendingPurchases.some((o) => o.courseId === courseId);
  };

  const handleSubmitPurchase = async (
    pkg: Package,
    paymentMethod: PaymentMethod,
    transactionCode: string,
    paymentProof: File | null
  ) => {
    if (!user) return;
    if (!transactionCode || transactionCode.trim().length < 5) {
      alert("Please enter a valid transaction code.");
      return;
    }
    if (!paymentProof) {
      alert("Please upload a payment proof screenshot.");
      return;
    }
    if (hasPendingForCourse(pkg.id)) {
      alert("You already have a pending purchase for this course.");
      return;
    }

    try {
      setIsSubmitting(true);
      const referrerId = user.referrerId || user.referredBy;

      // Upload payment proof
      const paymentProofStorageRef = storageRef(storage, `payment-proofs/${user.id}/${Date.now()}`);
      const paymentSnapshot = await uploadBytes(paymentProofStorageRef, paymentProof);
      const paymentProofUrl = await getDownloadURL(paymentSnapshot.ref);

      const newOrder: Omit<Order, "id"> = {
        userId: user.id,
        customerName: user.name,
        product: `Purchase: ${pkg.name}`,
        status: "Pending Approval",
        paymentMethod,
        transactionCode: transactionCode.trim(),
        courseId: pkg.id,
        createdAt: new Date().toISOString(),
        email: user.email,
        paymentProofUrl,
        ...(referrerId ? { referrerId } : {}),
      };
      await push(dbRef(database, "orders"), newOrder);
      closePurchaseModal();
      alert("Your purchase request has been submitted and is pending approval.");
    } catch (e) {
      console.error("Failed to create purchase order:", e);
      alert("Failed to submit purchase request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  return (
    <div className="min-h-screen overflow-auto">
      <header className="mb-6 p-4">
        <h1 className="text-3xl font-bold">Buy Another Course</h1>
        <p className="mt-2 text-slate-600">View your courses and add more anytime.</p>
      </header>

      {/* Owned courses */}
      <section className="mx-4 mb-10">
        <h2 className="text-lg font-semibold text-slate-900">Your Courses</h2>
        {ownedCourses.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {ownedCourses.map((pkg) => (
              <article key={pkg.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
                <div className="relative h-36 w-full">
                  {pkg.imageUrl ? (
                    <Image src={pkg.imageUrl} alt={pkg.name} fill className="object-cover" />
                  ) : (
                    <div className="h-full w-full bg-slate-100" />
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-base font-semibold">{pkg.name}</h3>
                  <div className="text-sm text-slate-600 mt-1">Rs {Number(pkg.price || 0).toLocaleString()}</div>
                  {!!pkg.features?.length && (
                    <ul className="mt-3 space-y-1 text-sm text-slate-700">
                      {pkg.features.slice(0, 4).map((f, idx) => (
                        <li key={`${f}-${idx}`} className="flex items-start gap-2">
                          <CheckIcon className="h-4 w-4 text-emerald-600 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
            You don’t have any courses yet. Pick one from “Add More Courses” below.
          </div>
        )}
      </section>

      {/* Pending purchases banner */}
      {pendingPurchases.length > 0 && (
        <div className="mx-4 mb-8 rounded-lg border-2 border-dashed border-yellow-300 bg-yellow-50 p-4">
          <div className="flex items-start gap-3">
            <ClockIcon className="h-6 w-6 text-yellow-600" />
            <div>
              <p className="font-semibold text-yellow-800">You have {pendingPurchases.length} pending purchase{pendingPurchases.length > 1 ? "s" : ""}</p>
              <p className="text-sm text-yellow-700 mt-0.5">We’re verifying your payment. You’ll be notified after approval.</p>
            </div>
          </div>
        </div>
      )}

      {/* Available to buy + Search */}
      <section className="mx-4 mb-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Add More Courses</h2>

          {/* Search bar */}
          <div className="relative w-full sm:w-80">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              placeholder="Search courses"
              aria-label="Search courses"
              className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none ring-1 ring-transparent transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-sky-200"
            />
          </div>
        </div>

        {filteredAvailableToBuy.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-2">
            {filteredAvailableToBuy.map((pkg) => (
              <article key={pkg.id} className="flex flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 hover:shadow-lg overflow-hidden">
                <div className="relative h-48 w-full">
                  {pkg.imageUrl ? (
                    <Image src={pkg.imageUrl} alt={pkg.name} fill className="object-cover" />
                  ) : (
                    <div className="h-full w-full bg-slate-100" />
                  )}
                </div>
                <div className="p-6 flex flex-col flex-grow">
                  <h3 className="text-xl font-bold">{pkg.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold">Rs {Number(pkg.price || 0).toLocaleString()}</span>
                  </div>
                  {!!pkg.features?.length && (
                    <ul className="mt-6 space-y-3 text-sm text-slate-700 flex-grow">
                      {pkg.features.slice(0, 6).map((f, idx) => (
                        <li key={`${f}-${idx}`} className="flex items-start gap-3">
                          <CheckIcon className="h-5 w-5 text-emerald-600 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-8">
                    <button
                      onClick={() => openPurchaseModal(pkg)}
                      className="w-full rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-sky-400"
                      disabled={isSubmitting || hasPendingForCourse(pkg.id)}
                      title={hasPendingForCourse(pkg.id) ? "Pending purchase exists" : "Buy this course"}
                    >
                      {hasPendingForCourse(pkg.id) ? "Pending Verification" : `Buy ${pkg.name}`}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
            {availableToBuy.length === 0
              ? "You already own all available courses. 🎉"
              : "No courses match your search."}
          </div>
        )}
      </section>

      {/* Purchase Modal */}
      {isModalOpen && selectedPackage && user && (
        <PurchasePaymentModal
          pkg={selectedPackage}
          onClose={closePurchaseModal}
          onSubmit={handleSubmitPurchase}
          submitting={isSubmitting}
          qrUrl={universalQr}
        />
      )}
    </div>
  );
}

/* ================== Purchase Modal ================== */
function PurchasePaymentModal({
  pkg,
  onClose,
  onSubmit,
  submitting,
  qrUrl,
}: {
  pkg: Package;
  onClose: () => void;
  onSubmit: (pkg: Package, method: PaymentMethod, tx: string, proof: File | null) => Promise<void>;
  submitting: boolean;
  qrUrl: string;
}) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("eSewa");
  const [transactionCode, setTransactionCode] = useState("");
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);

  const handleProofChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setPaymentProof(file);
    const reader = new FileReader();
    reader.onloadend = () => setPaymentProofPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(pkg, paymentMethod, transactionCode, paymentProof);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-xl bg-white p-4 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg sm:text-xl font-semibold">Purchase: {pkg.name}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-slate-100" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm text-slate-600">
              Amount: <span className="font-semibold">Rs {Number(pkg.price || 0).toLocaleString()}</span>
            </p>
            <p className="text-sm text-slate-600">
              Account: <span className="font-semibold">Course Plex</span>
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {(["eSewa", "Khalti", "Bank Transfer"] as PaymentMethod[]).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-md border px-2 py-1 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold ${
                    paymentMethod === m ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Scan QR to pay</p>
              {qrUrl ? (
                <a href={qrUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                  Open full size
                </a>
              ) : null}
            </div>
            <div className="mt-3 flex items-center justify-center">
              <div className="relative w-full max-w-xs aspect-square">
                <Image
                  src={qrUrl || "/images/shnqrcode.jpg"}
                  alt="Payment QR"
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="rounded-lg object-contain ring-1 ring-slate-200"
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 text-center">
              After paying, upload proof and paste your transaction code below.
            </p>
          </div>

          {/* Payment Proof Upload */}
          <div className="pt-2">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Payment Proof Screenshot <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-full max-w-xs aspect-square flex items-center justify-center rounded-md border-2 border-dashed border-slate-300 bg-white/80 p-3">
                {paymentProofPreview ? (
                  <Image src={paymentProofPreview} alt="Payment proof preview" fill className="rounded-md object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-500">
                    <UploadIcon className="h-14 w-14 text-slate-400" />
                    <span className="mt-2 text-xs">PNG, JPG up to 10MB</span>
                  </div>
                )}
              </div>
              <label
                htmlFor="payment-proof-upload"
                className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <span>Upload Screenshot</span>
                <input
                  id="payment-proof-upload"
                  name="payment-proof-upload"
                  type="file"
                  className="sr-only"
                  accept="image/*"
                  onChange={handleProofChange}
                />
              </label>
            </div>
          </div>

          {/* Disclaimer Box */}
          <div className="rounded-md bg-red-50 p-4 border border-red-200 text-center">
            <p className="text-sm font-semibold text-red-800">
              Make sure your transaction code is correct, there is no refund!
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Transaction Code</label>
            <input
              value={transactionCode}
              onChange={(e) => setTransactionCode(e.target.value)}
              placeholder="e.g. ESW1234XYZ"
              className="w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
              required
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium hover:bg-slate-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-sky-400"
            >
              {submitting ? "Submitting..." : `Submit Rs ${Number(pkg.price || 0).toLocaleString()}`}
            </button>
          </div>
        </form>
        <p className="mt-4 text-xs text-slate-500">
          By submitting, you confirm that the transaction was made from your account and can be verified if needed.
        </p>
      </div>
    </div>
  );
}

/* ================== Icons ================== */
function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden fill="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" {...props}>
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0L3.293 9.207a1 1 0 011.414-1.414l3.043 3.043 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}
function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-6 w-6 text-yellow-600" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg className="h-5 w-5 text-slate-500" viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 3v12m0 0l4-4m-4 4l-4-4"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden {...props}>
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
        clipRule="evenodd"
      />
    </svg>
  );
}