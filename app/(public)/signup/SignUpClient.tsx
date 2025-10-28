"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, type FormEvent, type ChangeEvent, KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, database, storage } from "@/lib/firebase";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { ref as dbRef, set, onValue, get, push } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import type { SVGProps, ReactNode } from "react";

// Extended types for Courses and Packages
type PackagesMapRaw = Record<
  string,
  {
    name: string;
    price: number;
    currency?: string;
    imageUrl?: string;
    courseIds?: Record<string, boolean>;
    highlight?: boolean;
    badge?: string;
  }
>;
type CoursesMap = Record<string, { title: string }>;

type Package = {
  id: string;
  name: string;
  price: number;
  currency?: string;
  imageUrl?: string;
  highlight?: boolean;
  badge?: string;
  features: string[]; // sub-course titles
};

type PaymentMethod = "eSewa" | "Khalti" | "Bank Transfer";
type QrCodes = { universal?: string; esewa?: string; khalti?: string; bank?: string };
type PaymentQRCodesDb = Partial<QrCodes> & { eSewa?: string; bankTransfer?: string };

// Helpers
function methodKey(method: PaymentMethod): keyof QrCodes {
  switch (method) {
    case "eSewa":
      return "esewa";
    case "Khalti":
      return "khalti";
    default:
      return "bank";
  }
}

export default function SignUpClient() {
  const [name, setName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");

  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);

  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);

  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("eSewa");
  const [transactionCode, setTransactionCode] = useState<string>("");

  const [referralCode, setReferralCode] = useState<string>("");
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [cleanReferrerId, setCleanReferrerId] = useState<string | null>(null);

  const [packages, setPackages] = useState<Package[]>([]);
  const [pkgQuery, setPkgQuery] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Dynamic QR codes from Firebase
  const [qrCodes, setQrCodes] = useState<QrCodes>({
    universal: undefined,
    esewa: "/images/shnqrcode.jpg",
    khalti: "/images/shnqrcode.jpg",
    bank: "/images/shnqrcode.jpg",
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const wasRejected = searchParams?.get("rejected") === "true";
  const packageIdFromQuery = searchParams?.get("packageId") || "";

  // Clear any existing auth session on mount
  useEffect(() => {
    const clearExistingSession = async () => {
      try {
        if (typeof window !== "undefined") {
          Object.keys(sessionStorage).forEach((key) => {
            if (key.startsWith("post_approval_login_")) {
              sessionStorage.removeItem(key);
            }
          });
        }
        if (auth.currentUser) {
          await signOut(auth);
          await fetch("/api/auth/session-logout", { method: "POST" });
        }
      } catch (err) {
        console.error("Error clearing session:", err);
      }
    };
    void clearExistingSession();
  }, []);

  // Load packages WITH details (image, sub-course titles)
  useEffect(() => {
    const packagesRef = dbRef(database, "packages/");
    const unsubscribe = onValue(packagesRef, async (snapshot) => {
      try {
        const pkgMap = (snapshot.val() || {}) as PackagesMapRaw;
        const coursesSnap = await get(dbRef(database, "courses/"));
        const coursesMap = (coursesSnap.val() as CoursesMap | null) ?? {};

        const list: Package[] = Object.entries(pkgMap).map(([id, p]) => {
          const features = p.courseIds
            ? Object.keys(p.courseIds).map((cid) => coursesMap[cid]?.title || "Unknown Sub-course")
            : [];
          return {
            id,
            name: String(p.name || ""),
            price: Number(p.price || 0),
            currency: p.currency,
            imageUrl: p.imageUrl,
            highlight: Boolean(p.highlight),
            badge: p.badge || "",
            features,
          };
        });
        list.sort((a, b) => (a.price || 0) - (b.price || 0));
        setPackages(list);
      } catch (e) {
        console.error("Failed to load packages:", e);
      }
    });
    return () => unsubscribe();
  }, []);

  // Preselect from ?packageId=... if valid, else first
  useEffect(() => {
    if (!packages.length) return;
    setSelectedPackageId((prev) => {
      if (prev && packages.some((p) => p.id === prev)) return prev;
      if (packageIdFromQuery && packages.some((p) => p.id === packageIdFromQuery)) {
        return packageIdFromQuery;
      }
      return packages[0]?.id || "";
    });
  }, [packages, packageIdFromQuery]);

  // Load payment QR codes (universal + fallbacks)
  useEffect(() => {
    const qrRef = dbRef(database, "paymentQRCodes");
    const unsub = onValue(qrRef, (snap) => {
      const v = (snap.val() as PaymentQRCodesDb | null) ?? {};
      setQrCodes((prev) => ({
        universal: v.universal ?? prev.universal,
        esewa: v.esewa ?? v.eSewa ?? prev.esewa,
        khalti: v.khalti ?? prev.khalti,
        bank: v.bank ?? v.bankTransfer ?? prev.bank,
      }));
    });
    return () => unsub();
  }, []);

  // Prefill referral from ?ref=
  useEffect(() => {
    const uidFromLink = searchParams?.get("ref");
    if (!uidFromLink) return;
    setReferralCode(uidFromLink);
    get(dbRef(database, `users/${uidFromLink}/name`)).then((snapshot) => {
      if (snapshot.exists()) {
        setReferrerName(String(snapshot.val()));
        setCleanReferrerId(uidFromLink);
      } else {
        setReferrerName(null);
        setCleanReferrerId(null);
      }
    });
  }, [searchParams]);

  // Validate typed referral code (debounced)
  useEffect(() => {
    const handler = setTimeout(() => {
      let codeToTest = referralCode.trim();
      if (codeToTest.includes("?ref=")) {
        try {
          codeToTest = new URL(codeToTest).searchParams.get("ref") || "";
        } catch {
          codeToTest = "";
        }
      }
      if (codeToTest.length > 5) {
        get(dbRef(database, `users/${codeToTest}/name`)).then((snapshot) => {
          if (snapshot.exists()) {
            setReferrerName(String(snapshot.val()));
            setCleanReferrerId(codeToTest);
          } else {
            setReferrerName(null);
            setCleanReferrerId(null);
          }
        });
      } else {
        setReferrerName(null);
        setCleanReferrerId(null);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [referralCode]);

  const handlePictureChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setProfilePicture(file);
    const reader = new FileReader();
    reader.onloadend = () => setPicturePreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handlePaymentProofChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setPaymentProof(file);
    const reader = new FileReader();
    reader.onloadend = () => setPaymentProofPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleSignUp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Validate email format and password length
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return setError("Please enter a valid email address.");
    if (password.length < 6) return setError("Password must be at least 6 characters long.");
    if (password !== confirmPassword) return setError("Passwords do not match.");

    if (!profilePicture) return setError("Please upload a profile picture.");
    if (!name.trim()) return setError("Please enter your full name.");
    if (!selectedPackageId) return setError("Please select a course.");
    if (!paymentProof) return setError("Please upload a payment proof screenshot.");
    if (!transactionCode.trim()) return setError("Please enter the transaction code.");

    setLoading(true);
    try {
      // Ensure any existing user is signed out first
      if (auth.currentUser) {
        await signOut(auth);
        await fetch("/api/auth/session-logout", { method: "POST" });
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = userCredential.user;

      // Upload profile picture
      const pictureStorageRef = storageRef(storage, `profile-pictures/${fbUser.uid}`);
      const snapshot = await uploadBytes(pictureStorageRef, profilePicture);
      const imageUrl = await getDownloadURL(snapshot.ref);

      // Upload payment proof screenshot
      const paymentProofStorageRef = storageRef(storage, `payment-proofs/${fbUser.uid}/${Date.now()}`);
      const paymentSnapshot = await uploadBytes(paymentProofStorageRef, paymentProof);
      const paymentProofUrl = await getDownloadURL(paymentSnapshot.ref);

      const selected = packages.find((p) => p.id === selectedPackageId);

      // Create user node (pending approval)
      await set(dbRef(database, `users/${fbUser.uid}`), {
        name: name.trim(),
        phone: phone.trim(),
        email: fbUser.email,
        imageUrl,
        createdAt: new Date().toISOString(),
        status: "pending_approval",
        courseId: selectedPackageId, // selected course (bundle)
        referredBy: cleanReferrerId,
        balance: 0,
        totalEarnings: 0,
        progress: 0,
      });

      // Add referral record under referrer
      if (cleanReferrerId) {
        const newReferralRef = push(dbRef(database, `users/${cleanReferrerId}/referrals`));
        await set(newReferralRef, {
          name: name.trim(),
          email: fbUser.email,
          joinedAt: new Date().toISOString(),
        });
      }

      // Create sign-up order (not upgrade)
      await push(dbRef(database, "orders"), {
        userId: fbUser.uid,
        customerName: name.trim(),
        email: fbUser.email,
        product: selected?.name || "Unknown",
        courseId: selectedPackageId,
        referrerId: cleanReferrerId,
        status: "Pending Approval",
        createdAt: new Date().toISOString(),
        paymentMethod,
        transactionCode: transactionCode.trim(),
        paymentProofUrl,
      });

      // Notify
      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: "Welcome! Account Under Review.",
          htmlContent: `<h1>Welcome, ${name.trim()}!</h1><p>Thank you for registering. Your account is now pending review by our admin team. You will receive another email once it is activated.</p>`,
        }),
      });

      router.push("/pending-approval");
    } catch (err: unknown) {
      console.error("Signup error:", err);
      let msg = "Failed to create account. Please try again.";
      if (typeof err === "object" && err && "code" in err) {
        const code = (err as { code: string }).code;
        if (code === "auth/email-already-in-use") msg = "This email is already registered. Please log in instead.";
        if (code === "auth/invalid-email") msg = "Invalid email address format.";
        if (code === "auth/weak-password") msg = "Password is too weak. It must be at least 6 characters.";
        if (code === "auth/network-request-failed") msg = "Network error. Please check your connection and try again.";
        if (code === "auth/operation-not-allowed") msg = "Email/password signup is disabled. Contact support.";
        if (code === "auth/too-many-requests") msg = "Too many attempts. Please try again later.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const filteredPackages = packages.filter((p) => {
    const q = pkgQuery.trim().toLowerCase();
    if (!q) return true;
    const inName = p.name.toLowerCase().includes(q);
    const inBadge = (p.badge || "").toLowerCase().includes(q);
    const inFeatures = p.features.some((f) => f.toLowerCase().includes(q));
    return inName || inBadge || inFeatures;
  });

  const onCardKeyDown = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedPackageId(id);
    }
  };

  const selectedPackagePrice = packages.find((p) => p.id === selectedPackageId)?.price || 0;
  const currentQr = qrCodes.universal || qrCodes[methodKey(paymentMethod)] || "/images/shnqrcode.jpg";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 antialiased">
      {/* Narrow layout as requested */}
      <section className="mx-auto max-w-lg px-4 py-12 md:py-16">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold">Create Your Account</h1>
            <p className="mt-2 text-base text-slate-600">Join our platform</p>
          </div>

          {wasRejected && (
            <div className="mb-6 rounded-md bg-red-50 p-4 border border-red-200">
              <p className="text-sm text-red-800">
                Your previous application was not approved. Please ensure all information is correct and try again.
              </p>
            </div>
          )}

          <form onSubmit={handleSignUp} className="space-y-8">
            {/* Step 1: Your Details */}
            <fieldset className="space-y-4">
              <legend className="w-full border-b pb-3 text-lg font-semibold">Step 1: Your Details</legend>
              <div className="pt-2">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Profile Picture <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16">
                    {picturePreview ? (
                      <Image src={picturePreview} alt="Profile preview" fill className="rounded-full object-cover" />
                    ) : (
                      <div className="h-16 w-16 rounded-full bg-slate-200 flex items-center justify-center">
                        <UserCircleIcon className="h-10 w-10 text-slate-400" />
                      </div>
                    )}
                  </div>
                  <label
                    htmlFor="picture-upload"
                    className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <span>Upload Picture</span>
                    <input id="picture-upload" name="picture-upload" type="file" className="sr-only" accept="image/*" onChange={handlePictureChange} />
                  </label>
                </div>
              </div>

              <InputField id="name" label="Full Name" type="text" value={name} onChange={(e) => setName(e.target.value)} required icon={<UserIcon />} />
              <InputField id="phone" label="Phone Number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required icon={<PhoneIcon />} />
              <InputField id="email" label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required icon={<EmailIcon />} />
              <InputField id="password" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required icon={<LockIcon />} />
              <InputField id="confirmPassword" label="Confirm Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required icon={<LockIcon />} />
              <InputField id="referralCode" label="Referral Code (Optional)" type="text" value={referralCode} onChange={(e) => setReferralCode(e.target.value)} icon={<UsersIcon />} />

              {referrerName && (
                <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm ring-1 ring-green-200">
                  <CheckCircleIcon className="h-5 w-5 text-green-600" />
                  <p>
                    Referred by <span className="font-semibold">{referrerName}</span>.
                  </p>
                </div>
              )}
            </fieldset>

            {/* Step 2: Choose Course (two columns within a scroll area) */}
            <fieldset className="space-y-4">
              <legend className="w-full border-b pb-3 text-lg font-semibold">Step 2: Choose Your Course</legend>

              {/* Search bar for courses */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={pkgQuery}
                    onChange={(e) => setPkgQuery(e.target.value)}
                    placeholder="Search courses"
                    aria-label="Search courses"
                    className="w-full rounded-full border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none ring-1 ring-transparent transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-sky-200"
                  />
                </div>
              </div>

              {/* Scrollable grid: two columns */}
              <div role="radiogroup" aria-label="Choose your course" className="rounded-lg border border-slate-200">
                <div className="h-[420px] overflow-y-auto p-3">
                  {filteredPackages.length === 0 && (
                    <div className="rounded-md border bg-slate-50 p-6 text-center text-slate-500">
                      No courses match your search.
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {filteredPackages.map((pkg) => {
                      const selected = selectedPackageId === pkg.id;
                      const featureChips = pkg.features.slice(0, 3);
                      const extra = Math.max(0, (pkg.features?.length || 0) - featureChips.length);

                      return (
                        <div
                          key={pkg.id}
                          className={[
                            "flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-white transition hover:shadow-md focus:outline-none",
                            selected ? "border-sky-500 ring-2 ring-sky-200" : "border-slate-200",
                          ].join(" ")}
                          onClick={() => setSelectedPackageId(pkg.id)}
                          onKeyDown={(e) => onCardKeyDown(e, pkg.id)}
                          role="radio"
                          aria-checked={selected}
                          tabIndex={0}
                        >
                          <div className="relative h-28 w-full">
                            {pkg.imageUrl ? (
                              <Image src={pkg.imageUrl} alt={pkg.name} fill className="object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center bg-slate-100 text-slate-400">
                                No Image
                              </div>
                            )}
                            {pkg.badge && (
                              <div className="absolute left-2 top-2 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                {pkg.badge}
                              </div>
                            )}
                          </div>
                          <div className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-sm font-semibold text-slate-900 leading-snug">{pkg.name}</h4>
                              <div className="text-[12px] font-mono text-slate-600 whitespace-nowrap">
                                Rs {pkg.price.toLocaleString()}
                              </div>
                            </div>

                            {!!featureChips.length && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {featureChips.map((t, idx) => (
                                  <span
                                    key={`${t}-${idx}`}
                                    className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200"
                                  >
                                    {t}
                                  </span>
                                ))}
                                {extra > 0 && (
                                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                                    +{extra}
                                  </span>
                                )}
                              </div>
                            )}

                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={() => setSelectedPackageId(pkg.id)}
                                className={[
                                  "inline-flex w-full items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm",
                                  selected ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-800 hover:bg-slate-200",
                                ].join(" ")}
                              >
                                {selected ? "Selected" : "Select"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </fieldset>

            {/* Step 3: Payment */}
            <fieldset className="space-y-4">
              <legend className="w-full border-b pb-3 text-lg font-semibold">Step 3: Complete Payment</legend>
              <div>
                <label className="block text-sm font-medium text-slate-700">Payment Method</label>
                <div className="mt-2 flex flex-wrap gap-3">
                  {(["eSewa", "Khalti", "Bank Transfer"] as PaymentMethod[]).map((method) => (
                    <button
                      type="button"
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`rounded-md px-4 py-2 text-sm font-medium border transition ${
                        paymentMethod === method ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
                <p className="text-sm text-slate-600">Scan to pay with {paymentMethod}:</p>
                <p className="my-2 font-mono text-2xl font-bold">Rs {selectedPackagePrice.toLocaleString()}</p>
                <div className="mx-auto flex flex-col items-center gap-2">
                  <div className="relative h-48 w-48 rounded-md bg-white p-2 shadow-inner">
                    <div className="relative h-full w-full">
                      <Image src={currentQr} alt={`${paymentMethod} QR`} fill className="rounded-md object-contain" />
                    </div>
                  </div>
                  {currentQr && (
                    <a href={currentQr} target="_blank" rel="noreferrer" className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                      Open full size
                    </a>
                  )}
                </div>
              </div>

              {/* Payment Proof Screenshot Input */}
              <div className="pt-2">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Payment Proof Screenshot <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-col items-center gap-4">
                  <div className="relative mx-auto flex h-48 w-48 items-center justify-center rounded-md bg-slate-200 p-2 shadow-inner">
                    {paymentProofPreview ? (
                      <Image src={paymentProofPreview} alt="Payment proof preview" fill className="rounded-md object-cover" />
                    ) : (
                      <UploadIcon className="h-16 w-16 text-slate-400" />
                    )}
                  </div>
                  <label
                    htmlFor="payment-proof-upload"
                    className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <span>Upload Screenshot</span>
                    <input id="payment-proof-upload" name="payment-proof-upload" type="file" className="sr-only" accept="image/*" onChange={handlePaymentProofChange} />
                  </label>
                </div>
              </div>

              {/* Disclaimer Box */}
              <div className="rounded-md bg-red-50 p-4 border border-red-200 text-center">
                <p className="text-sm font-semibold text-red-800">
                  Disclaimer: Make sure your transaction code is correct and the payment is real, there is no refund policy!{" "}
                  <Link href={"/disclaimer"} className="font-bold text-black">
                    Click Here To Read Disclaimer
                  </Link>
                </p>
              </div>

              <InputField
                id="transactionCode"
                label="Transaction Code / Ref ID"
                type="text"
                value={transactionCode}
                onChange={(e) => setTransactionCode(e.target.value)}
                required
                placeholder="Enter code from your payment app"
              />
            </fieldset>

            {error && <p className="text-center text-sm font-bold text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-green-600 px-4 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-green-700 disabled:bg-green-400"
            >
              {loading ? "Processing..." : "Confirm & Create Account"}
            </button>

            <p className="pt-2 text-center text-sm text-slate-600">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-sky-600 hover:underline">
                Log in
              </Link>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}

/* ================== UI Helpers ================== */
function InputField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  icon,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        {icon && <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">{icon}</div>}
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          required={required}
          placeholder={placeholder}
          className={`w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm outline-none transition ${
            icon ? "pl-10" : ""
          } border-slate-300 focus:border-sky-500 focus:ring-4 focus:ring-sky-100`}
        />
      </div>
    </div>
  );
}

/* ================== Icons ================== */
function EmailIcon() {
  return (
    <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
      <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
      <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm6-11a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
    </svg>
  );
}
function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function UserCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 3v12m0 0l4-4m-4 4l-4-4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
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