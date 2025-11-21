"use client";

import React, { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { database, storage } from "@/lib/firebase";
import { ref as dbRef, onValue, update } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

// ========== Types ==========
type Analytics = {
  totalUsers: number;
  activeUsers: number; // unique users with referral commissions (not cashback)
  totalCourses: number;
  totalPackages: number;
  totalEarnings: number; // platform income from Completed orders
  totalBalance: number;  // platform income minus processed withdrawals
  monthlyTarget: number;
  monthlyTargetProgress: number;
};

type HeroContact = {
  phone: string;
  whatsappMessage: string;
};

type SiteMetrics = { coursePackages: number; skillCourses: number; practicalLearning: number; };
type ServicesStats = { expertInstructors: number; careerFocusedCourses: number; successRate: number; };

type UserDB = { totalEarnings?: number; balance?: number; status?: string; };
type UsersMapDB = Record<string, UserDB>;

// DB rows
type CommissionDBRec = { referrerId?: string; amount?: number | string; timestamp?: number | string; };
type OrderDbRec = {
  courseId?: string;
  status?: "Pending Approval" | "Completed" | "Rejected";
  createdAt?: string; // add createdAt for breakdown
};
type PackageDbRec = { price?: number | string };
type WithdrawalDB = {
  amount?: number | string;
  status?: "Pending" | "Completed" | "Rejected";
  // requestedAt?: string;
};

// Helpers
const formatCurrency = (n: number) => `Rs ${Math.round(n).toLocaleString()}`;
const toNumber = (v: unknown) => (typeof v === "number" ? v : Number(v || 0));

const startOfTodayTs = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const startOfWeekTs = () => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const startOfMonthTs = () => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<Analytics>({
    totalUsers: 0,
    activeUsers: 0,
    totalCourses: 0,
    totalPackages: 0,
    totalEarnings: 0,
    totalBalance: 0,
    monthlyTarget: 0,
    monthlyTargetProgress: 0,
  });

  const [heroContact, setHeroContact] = useState<HeroContact>({
    phone: "9779705726179",
    whatsappMessage:
      "Hi! I’m interested in your course packages. Can you help me choose the best one?",
  });
  const [siteMetrics, setSiteMetrics] = useState<SiteMetrics>({ coursePackages: 4, skillCourses: 10, practicalLearning: 100 });
  const [servicesStats, setServicesStats] = useState<ServicesStats>({ expertInstructors: 15, careerFocusedCourses: 40, successRate: 95 });

  const [universalQrUrl, setUniversalQrUrl] = useState<string>("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<{ [key: string]: boolean }>({});

  const [allUsersMap, setAllUsersMap] = useState<UsersMapDB>({});
  const [activeReferrerIds, setActiveReferrerIds] = useState<string[]>([]);
  const [ordersMap, setOrdersMap] = useState<Record<string, OrderDbRec>>({});
  const [packagesMap, setPackagesMap] = useState<Record<string, PackageDbRec>>({});
  const [withdrawalsMap, setWithdrawalsMap] = useState<Record<string, WithdrawalDB | any>>({}); // may include _deleted node

  // Subscriptions
  useEffect(() => {
    const usersRef = dbRef(database, "users");
    const coursesRef = dbRef(database, "courses");
    const packagesRef = dbRef(database, "packages");
    const ordersRef = dbRef(database, "orders");
    const heroRef = dbRef(database, "heroSection");
    const siteMetricsRef = dbRef(database, "siteMetrics");
    const servicesStatsRef = dbRef(database, "servicesStats");
    const universalQrRef = dbRef(database, "paymentQRCodes/universal");
    const commissionsRef = dbRef(database, "commissions");
    const withdrawalsRef = dbRef(database, "withdrawalRequests");

    const unsubUsers = onValue(usersRef, (snap) => {
      const data = (snap.val() || {}) as UsersMapDB;
      setAllUsersMap(data);
      const usersArr = Object.values(data || {});
      const totalUsers = usersArr.length;
      setAnalytics((prev) => ({ ...prev, totalUsers }));
      setLoading(false);
    });

    const unsubCourses = onValue(coursesRef, (snap) => {
      const data = snap.val() || {};
      const totalCourses = Object.keys(data).length;
      setAnalytics((prev) => ({ ...prev, totalCourses }));
    });

    const unsubPackages = onValue(packagesRef, (snap) => {
      const data = (snap.val() as Record<string, PackageDbRec>) || {};
      setPackagesMap(data);
      const totalPackages = Object.keys(data).length;
      setAnalytics((prev) => ({ ...prev, totalPackages }));
    });

    const unsubOrders = onValue(ordersRef, (snap) => {
      setOrdersMap((snap.val() as Record<string, OrderDbRec>) || {});
    });

    const unsubHero = onValue(heroRef, (snap) => {
      const data = (snap.val() || {}) as Partial<HeroContact>;
      setHeroContact((prev) => ({
        phone: data.phone ?? prev.phone,
        whatsappMessage: data.whatsappMessage ?? prev.whatsappMessage,
      }));
    });

    const unsubSiteMetrics = onValue(siteMetricsRef, (snap) => {
      const data = (snap.val() || {}) as Partial<SiteMetrics>;
      setSiteMetrics((prev) => ({
        coursePackages: typeof data.coursePackages === "number" ? data.coursePackages : prev.coursePackages,
        skillCourses: typeof data.skillCourses === "number" ? data.skillCourses : prev.skillCourses,
        practicalLearning: typeof data.practicalLearning === "number" ? data.practicalLearning : prev.practicalLearning,
      }));
    });

    const unsubServicesStats = onValue(servicesStatsRef, (snap) => {
      const data = (snap.val() || {}) as Partial<ServicesStats>;
      setServicesStats((prev) => ({
        expertInstructors: typeof data.expertInstructors === "number" ? data.expertInstructors : prev.expertInstructors,
        careerFocusedCourses: typeof data.careerFocusedCourses === "number" ? data.careerFocusedCourses : prev.careerFocusedCourses,
        successRate: typeof data.successRate === "number" ? data.successRate : prev.successRate,
      }));
    });

    const unsubUniversalQr = onValue(universalQrRef, (snap) => {
      const url = (snap.val() as string) || "";
      setUniversalQrUrl(url);
      if (!qrPreview && !qrFile) setQrPreview(url || null);
    });

    // Active earners: unique referrers with commissions (exclude cashbacks)
    const unsubCommissions = onValue(
      commissionsRef,
      (snap) => {
        const data = (snap.val() || {}) as Record<string, CommissionDBRec>;
        const setRef = new Set<string>();
        Object.values(data).forEach((c) => {
          const amt = typeof c?.amount === "number" ? c.amount : typeof c?.amount === "string" ? Number(c.amount) : 0;
          if (c?.referrerId && isFinite(amt) && amt > 0) setRef.add(c.referrerId);
        });
        setActiveReferrerIds(Array.from(setRef));
      },
      () => setActiveReferrerIds([])
    );

    const unsubWithdrawals = onValue(withdrawalsRef, (snap) => {
      setWithdrawalsMap((snap.val() as Record<string, WithdrawalDB | any>) || {});
    });

    return () => {
      unsubUsers();
      unsubCourses();
      unsubPackages();
      unsubOrders();
      unsubHero();
      unsubSiteMetrics();
      unsubServicesStats();
      unsubUniversalQr();
      unsubCommissions();
      unsubWithdrawals();
    };
  }, [qrFile, qrPreview]);

  // Recalculate active users from referrers (not cashback)
  useEffect(() => {
    const count = activeReferrerIds.filter((uid) => !!allUsersMap[uid]).length;
    setAnalytics((prev) => ({ ...prev, activeUsers: count }));
  }, [activeReferrerIds, allUsersMap]);

  // Earnings breakdown (Today, This Week, This Month, Lifetime) from Completed Orders
  const earningsBreakdown = useMemo(() => {
    const todayStart = startOfTodayTs();
    const weekStart = startOfWeekTs();
    const monthStart = startOfMonthTs();

    let today = 0;
    let weekly = 0;
    let monthly = 0;
    let lifetime = 0;

    for (const o of Object.values(ordersMap || {})) {
      if (o?.status !== "Completed" || !o.courseId) continue;

      // Course price
      const p = packagesMap[o.courseId]?.price;
      const price = typeof p === "number" ? p : Number(p || 0);
      if (!isFinite(price) || price <= 0) continue;

      // Time
      const ts = o.createdAt ? Date.parse(o.createdAt) : NaN;
      lifetime += price;

      if (!isNaN(ts)) {
        if (ts >= monthStart) monthly += price;
        if (ts >= weekStart) weekly += price;
        if (ts >= todayStart) today += price;
      }
    }

    return { today, weekly, monthly, lifetime };
  }, [ordersMap, packagesMap]);

  // Processed withdrawals sum (Completed only). Ignore _deleted subtree
  const processedWithdrawals = useMemo(() => {
    let sum = 0;
    for (const [key, v] of Object.entries(withdrawalsMap || {})) {
      if (key === "_deleted") continue; // skip deleted registry
      const r = v as WithdrawalDB;
      if (r?.status !== "Completed") continue;
      const amt = typeof r.amount === "number" ? r.amount : Number(r.amount || 0);
      if (isFinite(amt) && amt > 0) sum += amt;
    }
    return sum;
  }, [withdrawalsMap]);

  // Update analytics (Total Earnings & Balance)
  useEffect(() => {
    setAnalytics((prev) => ({
      ...prev,
      totalEarnings: earningsBreakdown.lifetime,
      totalBalance: Math.max(0, earningsBreakdown.lifetime - processedWithdrawals),
    }));
  }, [earningsBreakdown.lifetime, processedWithdrawals]);

  // Save handlers
  const saveContact = async () => {
    try {
      setSaving((s) => ({ ...s, contact: true }));
      await update(dbRef(database, "heroSection"), {
        phone: heroContact.phone,
        whatsappMessage: heroContact.whatsappMessage,
      });
    } finally {
      setSaving((s) => ({ ...s, contact: false }));
    }
  };

  const saveSiteMetrics = async () => {
    try {
      setSaving((s) => ({ ...s, site: true }));
      await update(dbRef(database, "siteMetrics"), {
        coursePackages: Number(siteMetrics.coursePackages) || 0,
        skillCourses: Number(siteMetrics.skillCourses) || 0,
        practicalLearning: Number(siteMetrics.practicalLearning) || 0,
      });
    } finally {
      setSaving((s) => ({ ...s, site: false }));
    }
  };

  const saveServicesStats = async () => {
    try {
      setSaving((s) => ({ ...s, services: true }));
      await update(dbRef(database, "servicesStats"), {
        expertInstructors: Number(servicesStats.expertInstructors) || 0,
        careerFocusedCourses: Number(servicesStats.careerFocusedCourses) || 0,
        successRate: Number(servicesStats.successRate) || 0,
      });
    } finally {
      setSaving((s) => ({ ...s, services: false }));
    }
  };

  const [universalQrSaving, setUniversalQrSaving] = useState(false);
  const onQrChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setQrFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setQrPreview(String(reader.result));
      reader.readAsDataURL(file);
    } else {
      setQrPreview(universalQrUrl || null);
    }
  };

  const saveUniversalQr = async () => {
    if (!qrFile) return;
    try {
      setSaving((s) => ({ ...s, universalQr: true }));
      setUniversalQrSaving(true);
      const ext = qrFile.name.split(".").pop() || "jpg";
      const path = `paymentQRCodes/universal/${Date.now()}.${ext}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, qrFile);
      const url = await getDownloadURL(sRef);
      await update(dbRef(database, "paymentQRCodes"), { universal: url });
      setUniversalQrUrl(url);
      setQrFile(null);
      setQrPreview(url);
    } catch (e) {
      console.error("Failed to upload universal QR:", e);
      alert("Failed to upload QR. Check your Storage rules/permissions.");
    } finally {
      setSaving((s) => ({ ...s, universalQr: false }));
      setUniversalQrSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-slate-600">Loading dashboard...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const chartValues = [
    { label: "Today", value: earningsBreakdown.today },
    { label: "This Week", value: earningsBreakdown.weekly },
    { label: "This Month", value: earningsBreakdown.monthly },
    { label: "Lifetime", value: earningsBreakdown.lifetime },
  ];
  const maxVal = Math.max(1, ...chartValues.map((d) => d.value));
  const barColor = ["bg-emerald-500", "bg-sky-500", "bg-indigo-500", "bg-fuchsia-500"];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
          <p className="text-slate-600 mt-1">Monitor performance and manage site content</p>
        </header>

        {/* Analytics */}
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <StatCard title="Total Users" value={analytics.totalUsers.toString()} color="bg-blue-500">
            <UsersIcon />
          </StatCard>
          <StatCard title="Active Users" value={analytics.activeUsers.toString()} color="bg-emerald-500">
            <UserCheckIcon />
          </StatCard>
          <StatCard title="Total Courses" value={analytics.totalCourses.toString()} color="bg-purple-500">
            <CoursesIcon />
          </StatCard>
          <StatCard title="Total Packages" value={analytics.totalPackages.toString()} color="bg-sky-500">
            <PackagesIcon />
          </StatCard>
          <StatCard title="Total Earnings" value={formatCurrency(analytics.totalEarnings)} color="bg-fuchsia-500">
            <CashIcon />
          </StatCard>
          <StatCard title="Total Balance" value={formatCurrency(analytics.totalBalance)} color="bg-orange-500">
            <WalletIcon />
          </StatCard>
        </div>

        {/* Earnings Overview (Graph) */}
        <section className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900">Earnings Overview</h2>
            <div className="text-xs text-slate-500">Sum of package prices from Completed orders</div>
          </div>

          {/* Summary row */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            {chartValues.map((d, i) => (
              <div key={d.label} className="rounded-md border border-slate-200 p-3">
                <div className="text-xs text-slate-500">{d.label}</div>
                <div className="text-lg font-bold text-slate-900">{formatCurrency(d.value)}</div>
              </div>
            ))}
          </div>

          {/* Simple responsive bar chart */}
          <div className="mt-2">
            <div className="flex items-end gap-4 h-40">
              {chartValues.map((d, i) => {
                const hPct = Math.round((d.value / maxVal) * 100);
                return (
                  <div key={d.label} className="flex-1 flex flex-col items-center">
                    <div className="relative w-8 sm:w-10 lg:w-12 bg-slate-100 rounded-md overflow-hidden">
                      <div
                        className={`${barColor[i]} absolute bottom-0 left-0 w-full`}
                        style={{ height: `${hPct}%` }}
                        title={`${d.label}: ${formatCurrency(d.value)}`}
                      />
                    </div>
                    <div className="mt-2 text-xs text-slate-600">{d.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Contact & WhatsApp */}
        <section className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900">Contact & WhatsApp</h2>
            <div className="text-xs text-slate-500">Used in homepage hero and WhatsApp button</div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone (WhatsApp-enabled)</label>
              <input
                type="tel"
                value={heroContact.phone}
                onChange={(e) => setHeroContact((p) => ({ ...p, phone: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="9779705726179"
              />
              <p className="mt-1 text-xs text-slate-500">Format: country code + number (no + sign)</p>
            </div>
            <div>
              <label className="block text-sm font_medium text-slate-700 mb-1">Default WhatsApp Message</label>
              <textarea
                rows={3}
                value={heroContact.whatsappMessage}
                onChange={(e) => setHeroContact((p) => ({ ...p, whatsappMessage: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline_none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>
          <div className="mt-4">
            <button onClick={saveContact} disabled={!!saving.contact} className="inline-flex items-center rounded-md bg-sky-600 px-4 py-2 text-white font-semibold hover:bg-sky-700 disabled:bg-sky-400">
              {saving.contact ? "Saving..." : "Save Contact"}
            </button>
          </div>
        </section>

        {/* Homepage Public Counters */}
        <section className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center justify_between mb-4">
            <h2 className="text-xl font-semibold text-slate-900">Homepage Counters</h2>
            <div className="text-xs text-slate-500">Course Packages • Skill Courses • Practical Learning</div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <NumberInput label="Course Packages" value={siteMetrics.coursePackages} onChange={(v) => setSiteMetrics((p) => ({ ...p, coursePackages: v }))} />
            <NumberInput label="Skill Courses" value={siteMetrics.skillCourses} onChange={(v) => setSiteMetrics((p) => ({ ...p, skillCourses: v }))} />
            <NumberInput label="Practical Learning (%)" value={siteMetrics.practicalLearning} onChange={(v) => setSiteMetrics((p) => ({ ...p, practicalLearning: v }))} />
          </div>
          <div className="mt-4">
            <button onClick={saveSiteMetrics} disabled={!!saving.site} className="inline-flex items-center rounded-md bg-sky-600 px-4 py-2 text-white font-semibold hover:bg-sky-700 disabled:bg-sky-400">
              {saving.site ? "Saving..." : "Save Homepage Counters"}
            </button>
          </div>
        </section>

        {/* Services Stats */}
        <section className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900">Services Page Stats</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <NumberInput label="Expert Instructors" value={servicesStats.expertInstructors} onChange={(v) => setServicesStats((p) => ({ ...p, expertInstructors: v }))} />
            <NumberInput label="Career-Focused Courses" value={servicesStats.careerFocusedCourses} onChange={(v) => setServicesStats((p) => ({ ...p, careerFocusedCourses: v }))} />
            <NumberInput label="Success Rate (%)" value={servicesStats.successRate} onChange={(v) => setServicesStats((p) => ({ ...p, successRate: v }))} />
          </div>
          <div className="mt-4">
            <button onClick={saveServicesStats} disabled={!!saving.services} className="inline-flex items-center rounded-md bg-sky-600 px-4 py-2 text-white font-semibold hover:bg-sky-700 disabled:bg-sky-400">
              {saving.services ? "Saving..." : "Save Services Stats"}
            </button>
          </div>
        </section>

        {/* Universal Payment QR */}
        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900">Universal Payment QR</h2>
            <div className="text-xs text-slate-500">One QR code shown on Signup and Upgrade pages</div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">Current QR</div>
              <div className="relative w-56 h-56 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                {universalQrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={universalQrUrl} alt="Universal QR" className="h-full w-full object-contain" />
                ) : (
                  <div className="text-slate-400 text-sm">No QR set</div>
                )}
              </div>
              {universalQrUrl && (
                <a href={universalQrUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-sky-600 hover:text-sky-700">
                  Open full size
                </a>
              )}
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">Upload/Replace QR</div>
              <div className="relative w-56 h-56 rounded-md border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
                {qrPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrPreview} alt="QR preview" className="h-full w-full object-contain" />
                ) : (
                  <div className="text-slate-400 text-sm">Select image to preview</div>
                )}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                  Choose Image
                  <input type="file" accept="image/*" className="sr-only" onChange={onQrChange} />
                </label>
                <button onClick={saveUniversalQr} disabled={!qrFile || !!saving.universalQr} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-400">
                  {saving.universalQr ? "Uploading..." : "Save QR"}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Recommended: PNG/JPG, max 10MB</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ========== UI Helpers ==========
function StatCard({ title, value, color, children }: { title: string; value: string; color: string; children: React.ReactNode; }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
        <div className={`${color} p-3 rounded-lg text-white`}>{children}</div>
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void; }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
    </div>
  );
}

// ========== Icons ==========
function UsersIcon() { return (<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>); }
function UserCheckIcon() { return (<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>); }
function CoursesIcon() { return (<svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" /></svg>); }
function PackagesIcon() { return (<svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6"><path d="M3 1a1 1 0 000 2h1.22l.305 1.222a1 1 0 00.01.042l1.358 5.43L4 12.5C3 13.5 4 15 6 15h9a1 1 0 100-2H6.414l1-1H14c.34 0  .65-.173.83-.46l3-4.54A1 1 0 0017 5H6.28l-.31-1.243A1 1 0 005 3H3z" /></svg>); }
function CashIcon() { return (<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>); }
function WalletIcon() { return (<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>); }