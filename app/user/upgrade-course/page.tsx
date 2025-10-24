"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { database, auth, storage } from "@/lib/firebase";
import { ref as dbRef, onValue, get, push } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import type { SVGProps } from "react";

// Types
type Package = { id: string; name: string; price: number; imageUrl: string; features?: string[]; commissionPercent?: number };
type UserProfile = {
  id: string;
  name: string;
  email: string;
  courseId: string;
  referrerId?: string;
  referredBy?: string;
};
type PaymentMethod = "eSewa" | "Khalti" | "Bank Transfer";
type OrderStatus = "Pending Approval" | "Completed" | "Rejected";
type Order = {
  id: string;
  userId: string;
  customerName: string;
  product: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  transactionCode: string;
  courseId: string;
  createdAt: string;
  email: string;
  referrerId?: string;
  paymentProofUrl?: string;
};
type SpecialAccess = {
  active?: boolean;
  enabled?: boolean;
  packageId?: string;
  commissionPercent?: number;
  previousCourseId?: string | null;
};

type OrderDb = Omit<Order, "id">;
type OrdersDb = Record<string, OrderDb>;
type PackagesDb = Record<string, Omit<Package, "id">>;

function parseUniversalQR(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (typeof val === "object" && val && "url" in (val as any)) {
    const url = (val as any).url;
    return typeof url === "string" ? url : null;
  }
  return null;
}

export default function UpgradeCoursePage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentPackage, setCurrentPackage] = useState<Package | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [latestUpgrade, setLatestUpgrade] = useState<Order | null>(null);

  // Single universal QR
  const [universalQr, setUniversalQr] = useState<string>("/images/shnqrcode.jpg");

  // Special access state
  const [specialAccess, setSpecialAccess] = useState<SpecialAccess | null>(null);
  const [specialPackage, setSpecialPackage] = useState<Package | null>(null);

  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    let unsubOrders: (() => void) | null = null;
    let unsubQR1: (() => void) | null = null;
    let unsubQR2: (() => void) | null = null;
    let unsubSpecial: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      // Load packages (public)
      const pkSnap = await get(dbRef(database, "packages"));
      const pkObj = (pkSnap.val() as PackagesDb | null) ?? {};
      const pks: Package[] = Object.entries(pkObj).map(([id, v]) => ({
        id,
        ...v,
        commissionPercent: typeof v.commissionPercent === "number" ? v.commissionPercent : 58,
      }));
      pks.sort((a, b) => (a.price || 0) - (b.price || 0));
      setPackages(pks);

      // Listen to universal QR
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
        setLoading(false);
        return;
      }

      // Listen to current user profile
      const userRef = dbRef(database, `users/${fbUser.uid}`);
      unsubUser = onValue(userRef, async (snap) => {
        const val = snap.val() as Partial<UserProfile> | null;
        if (!val) {
          setUser(null);
          setCurrentPackage(null);
          setLoading(false);
          return;
        }
        const u: UserProfile = {
          id: fbUser.uid,
          name: val.name || "",
          email: val.email || "",
          courseId: val.courseId || "",
          referrerId: val.referrerId,
          referredBy: val.referredBy,
        };
        setUser(u);
        const current = pks.find((pk) => pk.id === u.courseId) || null;
        setCurrentPackage(current || null);
        setLoading(false);
      });

      // Listen to special access
      const specialRef = dbRef(database, `users/${fbUser.uid}/specialAccess`);
      unsubSpecial = onValue(specialRef, async (snap) => {
        const sa = (snap.val() || null) as SpecialAccess | null;
        setSpecialAccess(sa);

        if (sa?.active !== false && sa?.packageId) {
          // Load special package details from specialPackages
          const spSnap = await get(dbRef(database, `specialPackages/${sa.packageId}`));
          if (spSnap.exists()) {
            const v = spSnap.val() as Partial<Package>;
            setSpecialPackage({
              id: sa.packageId!,
              name: String(v.name || "Special Package"),
              price: Number(v.price || 0),
              imageUrl: String(v.imageUrl || ""),
              commissionPercent: typeof v.commissionPercent === "number" ? v.commissionPercent : 58,
              features: v.features,
            });
          } else {
            // Fallback: if admin accidentally used public package id
            const fromPublic = pks.find((x) => x.id === sa.packageId) || null;
            setSpecialPackage(fromPublic);
          }
        } else {
          setSpecialPackage(null);
        }
      });

      // Listen to orders
      const ordersRef = dbRef(database, "orders");
      unsubOrders = onValue(ordersRef, (snap) => {
        const all = (snap.val() as OrdersDb | null) ?? {};
        const orders: Order[] = Object.entries(all).map(([id, v]) => ({ id, ...v }));
        const myUpgrades = orders.filter(
          (o) => o.userId === fbUser.uid && typeof o.product === "string" && o.product.startsWith("Upgrade")
        );
        if (myUpgrades.length === 0) {
          setLatestUpgrade(null);
          return;
        }
        myUpgrades.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setLatestUpgrade(myUpgrades[0]);
      });
    });

    return () => {
      unsubAuth();
      if (unsubUser) unsubUser();
      if (unsubOrders) unsubOrders();
      if (unsubQR1) unsubQR1();
      if (unsubQR2) unsubQR2();
      if (unsubSpecial) unsubSpecial();
    };
  }, []);

  // Determine if the user has an active special package.
  const hasActiveSpecial = useMemo(() => {
    return !!(specialAccess && specialAccess.active !== false && specialPackage);
  }, [specialAccess, specialPackage]);

  // Show only higher-priced (upper tier) packages for upgrade
  const upgradeOptions = useMemo(() => {
    if (!packages.length) return [];
    if (!currentPackage) return packages; // fallback if user has no current package
    const currentPrice = Number(currentPackage.price) || 0;
    return packages.filter(
      (p) => p.id !== currentPackage.id && p.id !== specialPackage?.id && (Number(p.price) || 0) > currentPrice
    );
  }, [packages, currentPackage, specialPackage]);

  const openUpgradeModal = (pkg: Package) => {
    setSelectedPackage(pkg);
    setIsModalOpen(true);
  };
  const closeUpgradeModal = () => {
    setIsModalOpen(false);
    setSelectedPackage(null);
  };

  const handleSubmitUpgrade = async (
    pkg: Package,
    paymentMethod: PaymentMethod,
    transactionCode: string,
    paymentProof: File | null
  ) => {
    if (!user) return;
    if (hasActiveSpecial) {
      alert("You’re on a special package with all-access. Upgrading isn’t needed.");
      return;
    }
    if (latestUpgrade?.status === "Pending Approval") {
      alert("You already have a pending upgrade request. Please wait for admin approval.");
      return;
    }
    if (!transactionCode || transactionCode.trim().length < 5) {
      alert("Please enter a valid transaction code.");
      return;
    }
    if (!paymentProof) {
      alert("Please upload a payment proof screenshot.");
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
        product: `Upgrade to: ${pkg.name}`,
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
      closeUpgradeModal();
    } catch (e) {
      console.error("Failed to create upgrade order:", e);
      alert("Failed to submit upgrade request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const approvedPackageName = useMemo(() => {
    if (latestUpgrade?.status !== "Completed") return null;
    const approvedPkg = packages.find((p) => p.id === latestUpgrade?.courseId);
    return approvedPkg?.name || null;
  }, [latestUpgrade, packages]);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  return (
    <div className="min-h-screen overflow-auto">
      <header className="mb-6 p-4">
        <h1 className="text-3xl font-bold">Upgrade Your Package</h1>
        <p className="mt-2 text-slate-600">Unlock more features.</p>
      </header>

      {/* Special package banner (no revoke button) */}
      {hasActiveSpecial && specialPackage && (
        <div className="mx-4 mb-6 rounded-lg border-2 border-emerald-400 bg-gradient-to-r from-emerald-50 to-green-50 p-4">
          <div className="flex items-start gap-3">
            <TrophyIcon className="h-6 w-6 text-emerald-600" />
            <div>
              <h3 className="text-base font-semibold text-emerald-800">
                Your package is {specialPackage.name}.
              </h3>
              <p className="text-sm text-emerald-700 mt-0.5">
                Your commission is{" "}
                <span className="font-semibold">
                  {specialAccess?.commissionPercent ?? specialPackage.commissionPercent ?? 58}%
                </span>
                . You don’t need to upgrade your course.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade status banner (shown even if special is active) */}
      <UpgradeStatusBanner latestUpgrade={latestUpgrade} />

      {currentPackage && !hasActiveSpecial && (
        <div className="mb-8 rounded-lg border-2 border-sky-500 bg-sky-50 p-6 mx-4">
          <h2 className="text-sm font-semibold text-sky-800">Your Current Package</h2>
          <p className="text-xl font-bold text-sky-900 mt-1">{currentPackage.name}</p>
        </div>
      )}

      {/* Hide all upgrade options while special is active */}
      {!hasActiveSpecial && (
        <>
          {upgradeOptions.length > 0 ? (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 px-4">
              {upgradeOptions.map((pkg) => (
                <article
                  key={pkg.id}
                  className="flex flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 hover:shadow-lg"
                >
                  <div className="relative h-48 w-full">
                    <Image src={pkg.imageUrl} alt={pkg.name} fill className="object-cover rounded-t-2xl" />
                  </div>
                  <div className="p-6 flex flex-col flex-grow">
                    <h3 className="text-xl font-bold">{pkg.name}</h3>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold">Rs {pkg.price.toLocaleString()}</span>
                    </div>
                    <ul className="mt-6 space-y-3 text-sm text-slate-700 flex-grow">
                      {pkg.features?.map((f) => (
                        <li key={f} className="flex items-start gap-3">
                          <CheckIcon />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-8">
                      <button
                        onClick={() => openUpgradeModal(pkg)}
                        className="w-full rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-sky-400"
                        disabled={isSubmitting}
                      >
                        Upgrade to {pkg.name}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="text-center p-12 bg-white rounded-lg border shadow-sm mx-4">
              <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-green-100">
                <TrophyIcon />
              </div>
              <h3 className="mt-4 text-lg font-semibold">You&apos;re on the Top Tier!</h3>
              <p className="mt-2 text-slate-600">You already have our best package.</p>
            </div>
          )}
        </>
      )}

      {isModalOpen && selectedPackage && user && (
        <UpgradePaymentModal
          pkg={selectedPackage}
          onClose={closeUpgradeModal}
          onSubmit={handleSubmitUpgrade}
          submitting={isSubmitting}
          qrUrl={universalQr}
        />
      )}
    </div>
  );
}

// Upgrade Status Banner Component
function UpgradeStatusBanner({ latestUpgrade, compact = false }: { latestUpgrade: Order | null; compact?: boolean }) {
  if (!latestUpgrade) return null;
  const productName = latestUpgrade.product?.replace("Upgrade to: ", "") || "your upgrade";
  if (latestUpgrade.status === "Pending Approval")
    return (
      <div
        className={`rounded-lg border-2 border-dashed border-yellow-300 bg-yellow-50 ${
          compact ? "p-4" : "p-6"
        } mb-6 mx-4`}
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 flex items-center justify-center rounded-full bg-yellow-100">
            <ClockIcon />
          </div>
          <div>
            <p className="font-semibold text-yellow-800">Upgrade request is being reviewed</p>
            <p className="text-sm text-yellow-700 mt-0.5">
              We&apos;re verifying your payment for {productName}. You&apos;ll be notified after approval.
            </p>
          </div>
        </div>
      </div>
    );
  if (latestUpgrade.status === "Rejected")
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 ${compact ? "p-4" : "p-6"} mb-6 mx-4`}>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 flex items-center justify-center rounded-full bg-red-100">
            <AlertIcon />
          </div>
          <div>
            <p className="font-semibold text-red-800">Upgrade failed</p>
            <p className="text-sm text-red-700 mt-0.5">
              Your upgrade request was rejected. Please check your transaction and try again.
            </p>
          </div>
        </div>
      </div>
    );
  if (latestUpgrade.status === "Completed")
    return (
      <div className={`rounded-lg border border-green-200 bg-green-50 ${compact ? "p-4" : "p-6"} mb-6 mx-4`}>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 flex items-center justify-center rounded-full bg-green-100">
            <TrophyIcon />
          </div>
          <div>
            <p className="font-semibold text-green-800">Upgrade complete</p>
            <p className="text-sm text-green-700 mt-0.5">Your package has been upgraded to {productName}.</p>
          </div>
        </div>
      </div>
    );
  return null;
}

// Upgrade Payment Modal Component
function UpgradePaymentModal({
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
          <h3 className="text-lg sm:text-xl font-semibold">Upgrade to {pkg.name}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-slate-100">
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm text-slate-600">
              Amount: <span className="font-semibold">Rs {pkg.price.toLocaleString()}</span>
            </p>
            <p className="text-sm text-slate-600">
              Account: <span className="font-semibold">Skill Hub Nepal</span>
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
              {submitting ? "Submitting..." : `Submit Rs ${pkg.price.toLocaleString()}`}
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

// Icons
function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden fill="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" {...props}>
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0L3.293 9.207a1 1 0 011.414-1.414l3.043 3.043 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}
function TrophyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-6 w-6 text-green-600" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z" />
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
function AlertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-6 w-6 text-red-600" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M4.062 20h15.876c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L2.33 17c-.77 1.333.192 3 1.732 3z" />
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