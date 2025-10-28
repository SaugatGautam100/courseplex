"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";
import type { FormEvent, ChangeEvent, ReactNode, SVGProps, InputHTMLAttributes } from "react";
import { database, auth, storage } from "@/lib/firebase";
import { ref as dbRef, onValue, get, update } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/* ================== Types ================== */
type SpecialAccess = {
  packageId: string;
  commissionPercent?: number; // e.g., 65 means 65%
  active?: boolean;
  enabled?: boolean; // legacy alias for active
  previousCourseId?: string | null;
};

type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  balance: number;
  totalEarnings: number;
  imageUrl?: string;
  courseId: string; // legacy single course
  ownedCourseIds?: Record<string, boolean>; // multi-course
  progress: number;
  status?: string;
  specialAccess?: SpecialAccess | null;
};

type CommissionEvent = { amount: number; timestamp: number; referrerId?: string; orderId?: string };
type CoursePackage = { id: string; name: string; imageUrl: string; price?: number; commissionPercent?: number };
type Target = { goalAmount: number; prize: string; imageUrl?: string };
type Order = {
  id: string;
  userId: string;
  referrerId?: string;
  courseId?: string;
  status?: "Pending Approval" | "Completed" | "Rejected";
  createdAt?: string;
  commissionAmount?: number;
};

type PackagesDb = Record<string, Omit<CoursePackage, "id"> | undefined>;
type CommissionsDbRec = {
  amount?: number | string;
  timestamp?: number | string;
  referrerId?: string;
  orderId?: string;
};
type CommissionsDb = Record<string, CommissionsDbRec | undefined>;
type OrdersDbRec = {
  userId: string;
  referrerId?: string;
  courseId?: string;
  status?: "Pending Approval" | "Completed" | "Rejected";
  createdAt?: string;
  commissionAmount?: number;
};
type OrdersDb = Record<string, OrdersDbRec | undefined>;

/* ================== Date helpers ================== */
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const startOfWeek = () => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const startOfMonth = () => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/* ================== Commission helpers ================== */
function normalizeCommissionFromCommissions(raw: CommissionsDbRec | undefined): CommissionEvent | null {
  if (!raw) return null;
  const amount =
    typeof raw.amount === "number" ? raw.amount :
    typeof raw.amount === "string" ? parseFloat(raw.amount) : NaN;
  const ts =
    typeof raw.timestamp === "number" ? raw.timestamp :
    typeof raw.timestamp === "string" ? Date.parse(raw.timestamp) : NaN;
  if (!isFinite(amount) || !isFinite(ts) || amount <= 0) return null;
  return { amount, timestamp: ts, referrerId: raw.referrerId, orderId: raw.orderId };
}

function deriveCommissionFromOrder(
  o: Order,
  packagesMap: Record<string, CoursePackage>,
  referrerSpecialPercent?: number
): CommissionEvent | null {
  if (o.status !== "Completed" || !o.referrerId || !o.createdAt) return null;
  const ts = Date.parse(o.createdAt);
  if (!isFinite(ts)) return null;

  if (typeof o.commissionAmount === "number" && isFinite(o.commissionAmount) && o.commissionAmount > 0) {
    return { amount: o.commissionAmount, timestamp: ts, referrerId: o.referrerId, orderId: o.id };
  }

  if (!o.courseId || !packagesMap[o.courseId]?.price) return null;
  const pkg = packagesMap[o.courseId]!;
  const defaultPct = typeof pkg.commissionPercent === "number" ? pkg.commissionPercent : 58;
  const pct = typeof referrerSpecialPercent === "number" ? referrerSpecialPercent : defaultPct;
  const amount = Math.floor((pkg.price || 0) * (pct / 100));
  if (!isFinite(amount) || amount <= 0) return null;
  return { amount, timestamp: ts, referrerId: o.referrerId, orderId: o.id };
}

/* ================== Page ================== */
export default function DashboardPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [effectiveCourse, setEffectiveCourse] = useState<CoursePackage | null>(null);
  const [monthlyTarget, setMonthlyTarget] = useState<Target | null>(null);
  const [loading, setLoading] = useState(true);

  const [commissionEventsFromDb, setCommissionEventsFromDb] = useState<CommissionEvent[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [packagesMap, setPackagesMap] = useState<Record<string, CoursePackage>>({});

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    let unUser: (() => void) | null = null;
    let unCommissions: (() => void) | null = null;
    let unOrders: (() => void) | null = null;
    let unTarget: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      // Load courses (packages) map
      const pkSnap = await get(dbRef(database, "packages"));
      const pkVal = (pkSnap.val() as PackagesDb) || {};
      const pkMap: Record<string, CoursePackage> = {};
      Object.entries(pkVal).forEach(([id, v]) => {
        if (!v) return;
        pkMap[id] = { id, ...v };
      });
      setPackagesMap(pkMap);

      // User
      const userRef = dbRef(database, `users/${currentUser.uid}`);
      unUser = onValue(userRef, async (snapshot) => {
        if (snapshot.exists()) {
          const ud = snapshot.val() as Partial<UserProfile> & { specialAccess?: SpecialAccess; ownedCourseIds?: Record<string, boolean> };
          const specialAccess = ud.specialAccess || null;
          const specialActive = !!(specialAccess && (specialAccess.active ?? specialAccess.enabled ?? true) && specialAccess.packageId);

          const profile: UserProfile = {
            id: currentUser.uid,
            name: ud.name || "",
            email: ud.email || "",
            phone: ud.phone || "",
            balance: ud.balance || 0,
            totalEarnings: ud.totalEarnings || 0,
            imageUrl: ud.imageUrl,
            courseId: ud.courseId || "",
            ownedCourseIds: ud.ownedCourseIds || undefined,
            progress: ud.progress || 0,
            status: ud.status,
            specialAccess: specialAccess ? {
              packageId: specialAccess.packageId,
              commissionPercent: specialAccess.commissionPercent,
              enabled: specialAccess.enabled,
              active: specialAccess.active,
              previousCourseId: specialAccess.previousCourseId ?? null,
            } : null,
          };
          setUser(profile);

          // Effective "primary" course for the header badge (special takes priority, else the first owned, else legacy)
          let effectiveId: string | null = null;
          if (specialActive && specialAccess!.packageId) {
            effectiveId = specialAccess!.packageId;
          } else if (profile.ownedCourseIds) {
            const firstOwned = Object.keys(profile.ownedCourseIds).find((k) => profile.ownedCourseIds?.[k]);
            effectiveId = firstOwned || null;
          } else if (profile.courseId) {
            effectiveId = profile.courseId;
          }

          if (effectiveId) {
            let pkgSnap = await get(dbRef(database, `packages/${effectiveId}`));
            if (pkgSnap.exists()) {
              const pv = pkgSnap.val() as Omit<CoursePackage, "id">;
              setEffectiveCourse({ id: effectiveId, ...pv });
            } else {
              pkgSnap = await get(dbRef(database, `specialPackages/${effectiveId}`));
              if (pkgSnap.exists()) {
                const pv = pkgSnap.val() as Omit<CoursePackage, "id">;
                setEffectiveCourse({ id: effectiveId, ...pv });
              } else {
                setEffectiveCourse(null);
              }
            }
          } else {
            setEffectiveCourse(null);
          }
        } else {
          setUser(null);
          setEffectiveCourse(null);
        }
        setLoading(false);
      });

      // Commissions
      const commissionsRef = dbRef(database, "commissions");
      unCommissions = onValue(
        commissionsRef,
        (snap) => {
          const v = (snap.val() as CommissionsDb) || {};
          const list: CommissionEvent[] = [];
          Object.values(v).forEach((item) => {
            const ev = normalizeCommissionFromCommissions(item);
            if (ev && ev.referrerId === currentUser.uid) list.push(ev);
          });
          list.sort((a, b) => b.timestamp - a.timestamp);
          setCommissionEventsFromDb(list);
        },
        () => setCommissionEventsFromDb([])
      );

      // Orders
      const ordersRef = dbRef(database, "orders");
      unOrders = onValue(
        ordersRef,
        (snap) => {
          const v = (snap.val() as OrdersDb) || {};
          const list: Order[] = [];
          Object.entries(v).forEach(([id, o]) => {
            if (!o) return;
            list.push({
              id,
              userId: o.userId,
              referrerId: o.referrerId,
              courseId: o.courseId,
              status: o.status,
              createdAt: o.createdAt,
              commissionAmount: typeof o.commissionAmount === "number" ? o.commissionAmount : undefined,
            });
          });
          setOrders(list);
        },
        () => setOrders([])
      );

      // Monthly target
      const targetRef = dbRef(database, "monthlyTarget");
      unTarget = onValue(
        targetRef,
        (snap) => {
          if (!snap.exists()) {
            setMonthlyTarget(null);
            return;
          }
          const t = snap.val() as Partial<Target> & { goalAmount?: number | string };
          const goalAmount = typeof t.goalAmount === "string" ? parseFloat(t.goalAmount) : t.goalAmount || 0;
          setMonthlyTarget({
            goalAmount: Number.isFinite(goalAmount) ? goalAmount : 0,
            prize: t.prize || "",
            imageUrl: t.imageUrl || undefined,
          });
        },
        () => setMonthlyTarget(null)
      );
    });

    return () => {
      unsubAuth();
      if (unUser) unUser();
      if (unCommissions) unCommissions();
      if (unOrders) unOrders();
      if (unTarget) unTarget();
    };
  }, []);

  /* ================== Multi-course names ================== */
  const ownedCourseNames = useMemo(() => {
    if (!user) return [];
    const ids = new Set<string>();
    if (user.courseId) ids.add(user.courseId); // legacy
    if (user.ownedCourseIds) {
      Object.entries(user.ownedCourseIds).forEach(([cid, enabled]) => {
        if (enabled) ids.add(cid);
      });
    }
    const names: string[] = [];
    ids.forEach((cid) => {
      const p = packagesMap[cid];
      if (p?.name) names.push(p.name);
    });
    // dedupe + sort
    const seen = new Set<string>();
    const unique = names.filter((n) => {
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }, [user, packagesMap]);

  /* ================== Earnings assembly ================== */
  const commissionEvents: CommissionEvent[] = useMemo(() => {
    if (commissionEventsFromDb.length > 0) return commissionEventsFromDb;
    if (!user) return [];
    const referrerSpecialPercent = user.specialAccess?.commissionPercent;
    const derived: CommissionEvent[] = [];
    for (const o of orders) {
      if (o.referrerId !== user.id) continue;
      const ev = deriveCommissionFromOrder(o, packagesMap, referrerSpecialPercent);
      if (ev) derived.push(ev);
    }
    derived.sort((a, b) => b.timestamp - a.timestamp);
    return derived;
  }, [commissionEventsFromDb, orders, packagesMap, user]);

  const timeBasedEarnings = useMemo(() => {
    const today = startOfToday();
    const week = startOfWeek();
    const month = startOfMonth();
    return commissionEvents.reduce(
      (acc, ev) => {
        const amt = ev.amount || 0;
        if (ev.timestamp >= today) acc.daily += amt;
        if (ev.timestamp >= week) acc.weekly += amt;
        if (ev.timestamp >= month) acc.monthly += amt;
        return acc;
      },
      { daily: 0, weekly: 0, monthly: 0 }
    );
  }, [commissionEvents]);

  const chartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (6 - i));
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return {
        name: d.toLocaleDateString("en-US", { weekday: "short" }),
        start: d.getTime(),
        end: end.getTime(),
        earnings: 0,
      };
    });
    for (const ev of commissionEvents) {
      const bucket = days.find((b) => ev.timestamp >= b.start && ev.timestamp <= b.end);
      if (bucket) bucket.earnings += ev.amount;
    }
    return days.map((d) => ({ name: d.name, earnings: Math.round(d.earnings) }));
  }, [commissionEvents]);

  const monthlyProgress = useMemo(() => {
    if (!monthlyTarget || monthlyTarget.goalAmount <= 0) return 0;
    const pct = (timeBasedEarnings.monthly / monthlyTarget.goalAmount) * 100;
    return Math.min(100, Math.max(0, pct));
  }, [monthlyTarget, timeBasedEarnings.monthly]);

  const isTargetCompleted = monthlyProgress >= 100;

  /* ================== Profile updates ================== */
  const handleUpdateProfile = async (data: { name: string; phone: string }, imageFile: File | null) => {
    if (!user) return;
    try {
      let imageUrl = user.imageUrl || "";
      if (imageFile) {
        const fileRef = storageRef(storage, `profile-pictures/${user.id}`);
        const result = await uploadBytes(fileRef, imageFile);
        imageUrl = await getDownloadURL(result.ref);
      }
      await update(dbRef(database, `users/${user.id}`), {
        name: data.name,
        phone: data.phone,
        imageUrl,
      });
      alert("Profile updated successfully!");
      setIsEditModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to update profile.");
    }
  };

  const handleChangePassword = async (currentPass: string, newPass: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) throw new Error("No user found.");
    const credential = EmailAuthProvider.credential(currentUser.email, currentPass);
    await reauthenticateWithCredential(currentUser, credential);
    await updatePassword(currentUser, newPass);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading Dashboard...</p>
        </div>
      </div>
    );
  }
  if (!user) {
    return <div className="p-10 text-center text-red-500">Could not load user data. Please log in again.</div>;
  }

  // WhatsApp helper (for prize claim)
  const goalTxt = monthlyTarget?.goalAmount ? monthlyTarget.goalAmount.toLocaleString() : "0";
  const monthEarnTxt = Math.round(timeBasedEarnings.monthly).toLocaleString();
  const prizeTxt = monthlyTarget?.prize ?? "";
  const whatsappMessage = encodeURIComponent(
    `Hi! I have completed the monthly target of Rs ${goalTxt} with earnings of Rs ${monthEarnTxt}. How can I claim my prize (${prizeTxt})?`
  );
  const whatsappUrl = `https://api.whatsapp.com/send/?phone=9779705726179&text=${whatsappMessage}&type=phone_number&app_absent=0`;

  const isOnSpecial = Boolean(user.specialAccess?.packageId && (user.specialAccess.active ?? user.specialAccess.enabled ?? true));
  const specialPct = user.specialAccess?.commissionPercent ?? 58;

  /* ================== UI ================== */
  return (
    <>
      <div className="space-y-8">
        {/* Header with profile + chips, and inline course names (no separate section) */}
        <header className="flex flex-col sm:flex-row items-center gap-6 rounded-lg border bg-white p-6 shadow-sm">
          <div className="relative h-24 w-24 sm:h-28 sm:w-28 flex-shrink-0">
            {user.imageUrl ? (
              <Image src={user.imageUrl} alt="Profile" fill className="rounded-full object-cover" />
            ) : (
              <div className="h-full w-full rounded-full bg-slate-200 flex items-center justify-center">
                <UserIcon className="h-16 w-16 text-slate-500" />
              </div>
            )}
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{user.name}</h1>
            <p className="mt-1 text-base text-slate-500">{user.phone}</p>

            <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              {isOnSpecial && (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  Special Access • {specialPct}% commission
                </span>
              )}
              {effectiveCourse && (
                <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                  Primary: {effectiveCourse.name}
                </span>
              )}
              <Link
                href="/user/upgrade-course"
                className="inline-flex items-center rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Buy More Courses
              </Link>
            </div>

            {/* Show owned course names inline as chips (no separate section) */}
            {ownedCourseNames.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                {ownedCourseNames.map((name) => (
                  <span key={name} className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-800 ring-1 ring-slate-200">
                    {name}
                  </span>
                ))}
              </div>
            )}

            <button
              onClick={() => setIsEditModalOpen(true)}
              className="mt-3 block mx-auto sm:mx-0 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              Edit Profile
            </button>
          </div>
        </header>

        {/* Stats */}
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Today&apos;s Earnings"
            value={<MoneyCounter value={Math.round(timeBasedEarnings.daily)} />}
            icon={<SunIcon />}
            color="from-pink-500 to-rose-600"
          />
          <StatCard
            title="This Week&apos;s Earnings"
            value={<MoneyCounter value={Math.round(timeBasedEarnings.weekly)} />}
            icon={<CalendarIcon />}
            color="from-violet-500 to-purple-600"
          />
          <StatCard
            title="This Month&apos;s Earnings"
            value={<MoneyCounter value={Math.round(timeBasedEarnings.monthly)} />}
            icon={<MonthIcon />}
            color="from-sky-500 to-blue-600"
          />
          <StatCard
            title="Lifetime Earnings"
            value={<MoneyCounter value={Math.round(user.totalEarnings || 0)} />}
            icon={<TrophyIcon />}
            color="from-amber-400 to-orange-500"
          />
        </section>

        {/* Monthly Target */}
        {monthlyTarget && monthlyTarget.goalAmount > 0 && (
          <section className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div className="flex-grow">
                <h2 className="text-lg font-semibold text-slate-800">This Month&apos;s Target</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Reach the goal to win a <span className="font-bold text-slate-700">{monthlyTarget.prize}</span>!
                </p>

                <PrizeStatusChecker
                  userId={user.id}
                  currentMonth={new Date().getMonth()}
                  currentYear={new Date().getFullYear()}
                />

                <div className="mt-4 max-w-sm">
                  <div className="flex justify-between text-sm font-semibold text-slate-600 mb-1">
                    <span>Rs {Math.round(timeBasedEarnings.monthly).toLocaleString()}</span>
                    <span>Rs {Math.round(monthlyTarget.goalAmount).toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
                    <div
                      className={`h-4 rounded-full transition-all duration-500 ${isTargetCompleted ? "bg-gradient-to-r from-green-500 to-emerald-400" : "bg-gradient-to-r from-sky-500 to-cyan-400"}`}
                      style={{ width: `${Math.min(100, monthlyProgress)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {isTargetCompleted ? "🎉 Target Completed!" : `${Math.round(monthlyProgress)}% Complete`}
                  </p>
                </div>

                <PrizeButton
                  isTargetCompleted={isTargetCompleted}
                  userId={user.id}
                  whatsappUrl={whatsappUrl}
                  currentMonth={new Date().getMonth()}
                  currentYear={new Date().getFullYear()}
                />
              </div>

              {monthlyTarget.imageUrl && (
                <div className="relative h-24 w-24 flex-shrink-0 self-center">
                  <Image src={monthlyTarget.imageUrl} alt={monthlyTarget.prize} fill className="rounded-md object-contain" />
                </div>
              )}
            </div>
          </section>
        )}

        {/* Earnings Trend */}
        <section className="rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Earnings Trend (Last 7 Days)</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                <Tooltip
                  formatter={(value: unknown) => [`Rs ${Number(value as number).toLocaleString()}`, "Earnings"]}
                  contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "0.5rem", fontSize: "12px" }}
                />
                <Line type="monotone" dataKey="earnings" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4, fill: "#0ea5e9" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {commissionEvents.length === 0 && (
            <p className="text-center text-sm text-slate-500 mt-4">
              No commission data available yet. Start referring to see your earnings!
            </p>
          )}
        </section>
      </div>

      {isEditModalOpen && user && (
        <EditProfileModal
          user={user}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleUpdateProfile}
          onChangePassword={handleChangePassword}
        />
      )}
    </>
  );
}

/* ================== Prize helpers ================== */
function PrizeStatusChecker({ userId, currentMonth, currentYear }: { userId: string; currentMonth: number; currentYear: number }) {
  const [prizeCollected, setPrizeCollected] = useState<boolean>(false);

  useEffect(() => {
    const prizeRef = dbRef(database, `users/${userId}/monthlyPrizes/${currentYear}_${currentMonth}`);
    const unsubscribe = onValue(prizeRef, (snapshot) => {
      setPrizeCollected(Boolean(snapshot.val()));
    });
    return () => unsubscribe();
  }, [userId, currentMonth, currentYear]);

  if (prizeCollected) {
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-2">
        <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-semibold text-green-700">Prize Collected!</span>
      </div>
    );
  }
  return null;
}

function PrizeButton({
  isTargetCompleted,
  userId,
  whatsappUrl,
  currentMonth,
  currentYear,
}: {
  isTargetCompleted: boolean;
  userId: string;
  whatsappUrl: string;
  currentMonth: number;
  currentYear: number;
}) {
  const [prizeCollected, setPrizeCollected] = useState<boolean>(false);

  useEffect(() => {
    if (userId) {
      const prizeRef = dbRef(database, `users/${userId}/monthlyPrizes/${currentYear}_${currentMonth}`);
      const unsubscribe = onValue(prizeRef, (snapshot) => {
        setPrizeCollected(Boolean(snapshot.val()));
      });
      return () => unsubscribe();
    }
  }, [userId, currentMonth, currentYear]);

  if (!isTargetCompleted) return null;

  if (prizeCollected) {
    return (
      <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600">
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
        </svg>
        Prize Already Collected
      </div>
    );
  }

  return (
    <Link
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-green-600 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-700 transition-all transform hover:scale-105"
    >
      <GiftIcon className="h-5 w-5" />
      Collect Prize
    </Link>
  );
}

/* ================== Edit Profile ================== */
function EditProfileModal({
  user,
  onClose,
  onSave,
  onChangePassword,
}: {
  user: UserProfile;
  onClose: () => void;
  onSave: (data: { name: string; phone: string }, file: File | null) => Promise<void>;
  onChangePassword: (current: string, newP: string) => Promise<void>;
}) {
  const [formData, setFormData] = useState({ name: user.name, phone: user.phone });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(user.imageUrl || null);
  const [passwordData, setPasswordData] = useState({ current: "", new: "", confirm: "" });
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [isSavingPass, setIsSavingPass] = useState(false);
  const [passError, setPassError] = useState("");
  const [passSuccess, setPassSuccess] = useState("");

  const handlePictureChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleInfoSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSavingInfo(true);
    await onSave(formData, imageFile);
    setIsSavingInfo(false);
  };

  const handlePassSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPassError("");
    setPassSuccess("");
    if (passwordData.new !== passwordData.confirm) return setPassError("New passwords do not match.");
    if (passwordData.new.length < 6) return setPassError("New password must be at least 6 characters.");
    setIsSavingPass(true);
    try {
      await onChangePassword(passwordData.current, passwordData.new);
      setPassSuccess("Password changed successfully!");
      setPasswordData({ current: "", new: "", confirm: "" });
    } catch (error: unknown) {
      setPassError(error instanceof Error ? error.message : "Failed to change password.");
    } finally {
      setIsSavingPass(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Edit Profile</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100">
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleInfoSubmit} className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16">
              {imagePreview ? (
                <Image src={imagePreview} alt="Profile" fill className="rounded-full object-cover" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-slate-200 flex items-center justify-center">
                  <UserIcon className="h-10 w-10 text-slate-400" />
                </div>
              )}
            </div>
            <label
              htmlFor="picture-update"
              className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span>Change Picture</span>
              <input id="picture-update" type="file" className="sr-only" accept="image/*" onChange={handlePictureChange} />
            </label>
          </div>

          <InputField label="Full Name" id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          <InputField label="Phone Number" id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={isSavingInfo} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-sky-400">
              {isSavingInfo ? "Saving..." : "Save Details"}
            </button>
          </div>
        </form>

        <form onSubmit={handlePassSubmit} className="mt-6 border-t border-slate-200 pt-6 space-y-4">
          <h4 className="font-semibold text-slate-800">Change Password</h4>
          <InputField label="Current Password" id="current" type="password" value={passwordData.current} onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })} required />
          <InputField label="New Password" id="new" type="password" value={passwordData.new} onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })} required />
          <InputField label="Confirm New Password" id="confirm" type="password" value={passwordData.confirm} onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })} required />
          {passError && <p className="text-sm text-red-600">{passError}</p>}
          {passSuccess && <p className="text-sm text-green-600">{passSuccess}</p>}
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={isSavingPass} className="rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400">
              {isSavingPass ? "Updating..." : "Change Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================== UI bits ================== */
function MoneyCounter({ value, prefix = "Rs ", duration = 900 }: { value: number; prefix?: string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(progress);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);

      if (progress < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        prev.current = to;
      }
    };

    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);

    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  return <span>{prefix}{display.toLocaleString()}</span>;
}

function StatCard({ title, value, icon, color }: { title: string; value: ReactNode; icon: ReactNode; color: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${color} p-5 shadow-lg text-white`}>
      <div className="absolute -right-4 -bottom-4 h-24 w-24 text-white/20">{icon}</div>
      <dl>
        <dt className="truncate text-sm font-medium uppercase tracking-wider">{title}</dt>
        <dd>
          <div className="text-3xl font-bold">{value}</div>
        </dd>
      </dl>
    </div>
  );
}

function InputField({ id, label, ...props }: { id: string; label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input id={id} {...props} className="w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500" />
    </div>
  );
}

/* ================== Icons ================== */
function CloseIcon() {
  return (
    <svg className="h-5 w-5 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
function GiftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path fillRule="evenodd" d="M5 5a3 3 0 015-2.236A3 3 0 0114.83 6H16a2 2 0 110 4h-5V9a1 1 0 10-2 0v1H4a2 2 0 110-4h1.17C5.06 5.687 5 5.35 5zm4 1V5a1 1 0 10-1 1h1zm3 0a1 1 0 10-1-1v1h1z" clipRule="evenodd" />
      <path d="M9 11H3v5a2 2 0 002 2h4v-7zM11 18h4a2 2 0 002-2v-5h-6z" />
    </svg>
  );
}
const iconProps = { className: "h-full w-full", strokeWidth: "1" } as const;
function TrophyIcon() {
  return (
    <svg {...iconProps} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5" transform="rotate(45 12 12)" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5" transform="rotate(45 12 12) translate(8 8)" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg {...iconProps} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg {...iconProps} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M16 12a4 4 0 11-8 0 4 4 0 0118 0z" />
    </svg>
  );
}
function MonthIcon() {
  return (
    <svg {...iconProps} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z" clipRule="evenodd" />
    </svg>
  );
}
function StarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path fillRule="evenodd" d="M10.868 2.884c.321-.662 1.134-.662 1.456 0l1.83 3.778 4.167.606c.73.106 1.022.99.494 1.503l-3.014 2.938.712 4.15c.124.726-.638 1.283-1.296.952L10 15.347l-3.732 1.961c-.658.332-1.42-.226-1.296-.952l.712-4.15-3.014-2.938c-.528-.513-.236-1.397.494-1.503l4.167-.606 1.83-3.778z" clipRule="evenodd" />
    </svg>
  );
}