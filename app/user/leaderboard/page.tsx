"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { database } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import Image from "next/image";
import type { SVGProps } from "react";

/* ================== Types ================== */
type User = { id: string; name: string; imageUrl?: string };
type RawUser = { name?: string; imageUrl?: string; status?: string } | null | undefined;
type PackageRec = { price?: number };
type Order = {
  id: string;
  userId: string;
  referrerId?: string;
  courseId?: string;
  status?: "Pending Approval" | "Completed" | "Rejected";
  createdAt?: string;
  commissionAmount?: number;
};
type OrderDb = Omit<Order, "id">;
type CommissionEvent = { referrerId: string; amount: number; timestamp: number };
type CommissionDb = { referrerId?: string; amount?: number | string; timestamp?: number | string };
type LeaderboardEntry = { user: User; earnings: number };
type TimeframeKey = "daily" | "weekly" | "monthly" | "lifetime";

/* ================== Utils ================== */
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
const formatCurrency = (n: number) => `Rs ${Math.round(n).toLocaleString()}`;

/* ================== Page ================== */
export default function LeaderboardPage() {
  const [users, setUsers] = useState<Record<string, User>>({});
  const [packages, setPackages] = useState<Record<string, PackageRec>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [commissions, setCommissions] = useState<CommissionEvent[]>([]);
  const [loaded, setLoaded] = useState({ users: false, packages: false, orders: false, commissions: false });
  const [timeframe, setTimeframe] = useState<TimeframeKey>("lifetime");

  useEffect(() => {
    const usersRef = ref(database, "users");
    const pkRef = ref(database, "packages");
    const ordersRef = ref(database, "orders");
    const comRef = ref(database, "commissions");

    const unUsers = onValue(usersRef, (snap) => {
      const v = (snap.val() || {}) as Record<string, RawUser>;
      const mapped: Record<string, User> = {};
      Object.entries(v).forEach(([id, u]) => {
        if (!u) return;
        const rawName = typeof u.name === "string" ? u.name.trim() : "";
        if (!rawName) return;
        if (u.status && (u.status === "deleted" || u.status === "rejected")) return;
        mapped[id] = { id, name: rawName, imageUrl: u.imageUrl || undefined };
      });
      setUsers(mapped);
      setLoaded((s) => ({ ...s, users: true }));
    });

    const unPk = onValue(pkRef, (snap) => {
      const pk = (snap.val() || {}) as Record<string, PackageRec>;
      setPackages(pk);
      setLoaded((s) => ({ ...s, packages: true }));
    });

    const unOrders = onValue(ordersRef, (snap) => {
      const v = (snap.val() || {}) as Record<string, OrderDb>;
      const list: Order[] = Object.entries(v).map(([id, o]) => ({
        id,
        userId: o.userId,
        referrerId: o.referrerId,
        courseId: o.courseId,
        status: o.status,
        createdAt: o.createdAt,
        commissionAmount: typeof o.commissionAmount === "number" ? o.commissionAmount : undefined,
      }));
      setOrders(list);
      setLoaded((s) => ({ ...s, orders: true }));
    });

    const unCom = onValue(
      comRef,
      (snap) => {
        const v = (snap.val() || {}) as Record<string, CommissionDb>;
        const list: (CommissionEvent | null)[] = Object.values(v).map((c) => {
          const amount =
            typeof c.amount === "number" ? c.amount :
            typeof c.amount === "string" ? parseFloat(c.amount) : NaN;
          const ts =
            typeof c.timestamp === "number" ? c.timestamp :
            typeof c.timestamp === "string" ? Date.parse(c.timestamp) : NaN;
          return c && c.referrerId && isFinite(amount) && isFinite(ts)
            ? { referrerId: c.referrerId, amount, timestamp: ts }
            : null;
        });
        setCommissions(list.filter((x): x is CommissionEvent => x !== null));
        setLoaded((s) => ({ ...s, commissions: true }));
      },
      () => setLoaded((s) => ({ ...s, commissions: true }))
    );

    return () => {
      unUsers();
      unPk();
      unOrders();
      unCom();
    };
  }, []);

  const loading = !loaded.users || !loaded.packages || !loaded.orders || !loaded.commissions;

  // Prefer /commissions; fallback to deriving from orders
  const commissionStream: CommissionEvent[] = useMemo(() => {
    if (!loading && commissions.length > 0) {
      return commissions.filter((c) => users[c.referrerId] && !!users[c.referrerId].name);
    }
    const derived: CommissionEvent[] = [];
    for (const o of orders) {
      if (o.status !== "Completed" || !o.referrerId || !o.createdAt) continue;
      if (!users[o.referrerId] || !users[o.referrerId].name) continue;

      const price = o.courseId ? (packages[o.courseId!]?.price || 0) : 0;
      const amount = typeof o.commissionAmount === "number" ? o.commissionAmount : Math.floor((price || 0) * 0.58);
      if (!isFinite(amount) || amount <= 0) continue;
      const ts = Date.parse(o.createdAt);
      if (!isFinite(ts)) continue;
      derived.push({ referrerId: o.referrerId, amount, timestamp: ts });
    }
    return derived;
  }, [loading, commissions, orders, packages, users]);

  const leaderboards = useMemo(() => {
    const calc = (fromTs?: number): LeaderboardEntry[] => {
      const sumByReferrer = new Map<string, number>();
      for (const c of commissionStream) {
        if (fromTs && c.timestamp < fromTs) continue;
        sumByReferrer.set(c.referrerId, (sumByReferrer.get(c.referrerId) || 0) + c.amount);
      }
      const entries: LeaderboardEntry[] = [];
      for (const [uid, earnings] of sumByReferrer) {
        const u = users[uid];
        if (!u || !u.name) continue;
        entries.push({ user: u, earnings });
      }
      // Top 10
      return entries.sort((a, b) => b.earnings - a.earnings).slice(0, 10);
    };

    return {
      daily: calc(startOfToday()),
      weekly: calc(startOfWeek()),
      monthly: calc(startOfMonth()),
      lifetime: calc(undefined),
    };
  }, [commissionStream, users]);

  const current = leaderboards[timeframe];
  const maxAll = Math.max(1, ...current.map((e) => e.earnings));
  const top3 = current.slice(0, 3);
  const others = current.slice(3, 10);

  return (
    <div className="relative max-w-5xl mx-auto px-4 py-10">
      {/* Ambient gradient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/2 h-72 w-[70vw] -translate-x-1/2 rounded-full bg-gradient-to-r from-rose-300/30 via-sky-300/30 to-violet-300/30 blur-3xl" />
      </div>

      <header className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200/70 backdrop-blur">
          <SparklesIcon className="h-4 w-4 text-amber-500" />
          Top 10 Leaders
        </div>
        <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">
          Affiliate Leaderboard
        </h1>
        <p className="mt-2 text-slate-600">Top 3 celebrated in style. Aim for the podium ✨</p>
      </header>

      {/* Segmented control (tabs) */}
      <div className="mb-6 flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1 shadow-inner ring-1 ring-slate-200">
          {(["daily", "weekly", "monthly", "lifetime"] as TimeframeKey[]).map((key) => {
            const active = timeframe === key;
            const label =
              key === "daily" ? "Today" : key === "weekly" ? "This Week" : key === "monthly" ? "This Month" : "All-Time";
            const Icon =
              key === "daily" ? SunIcon : key === "weekly" ? CalendarIcon : key === "monthly" ? MonthIcon : InfinityIcon;
            return (
              <button
                key={key}
                onClick={() => setTimeframe(key)}
                className={[
                  "group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60",
                ].join(" ")}
              >
                <span className={active ? "text-slate-900" : "text-slate-500"}>
                  <Icon className="h-4 w-4" />
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main card */}
      <section className="rounded-2xl border border-slate-200/70 bg-white/70 shadow-lg backdrop-blur overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <TrophyIcon className="h-5 w-5 text-amber-500" />
            <h2 className="text-base md:text-lg font-bold text-slate-900">
              {timeframe === "daily" ? "Today's" : timeframe === "weekly" ? "This Week's" : timeframe === "monthly" ? "This Month's" : "All-Time"} Top 10
            </h2>
          </div>
          <div className="text-xs md:text-sm text-slate-500">Ranking by total commissions</div>
        </div>

        {loading ? (
          <div className="px-5 pb-5">
            <PodiumSkeleton />
            <ul className="divide-y divide-slate-200/70 mt-2">
              {[...Array(7)].map((_, i) => (
                <li key={i} className="px-1 py-4">
                  <div className="flex items-center gap-4">
                    <div className="h-8 w-8 rounded-full bg-slate-200 animate-pulse" />
                    <div className="h-11 w-11 rounded-full bg-slate-200 animate-pulse" />
                    <div className="flex-1">
                      <div className="h-4 w-40 bg-slate-200 rounded animate-pulse" />
                      <div className="mt-2 h-2 w-full bg-slate-100 rounded overflow-hidden">
                        <div className="h-full w-1/3 bg-slate-200 animate-pulse" />
                      </div>
                    </div>
                    <div className="h-5 w-24 bg-slate-200 rounded animate-pulse" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : current.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-gradient-to-br from-slate-200 to-slate-100 flex items-center justify-center">
              <UserIcon className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-slate-700 font-semibold">No earnings recorded yet</p>
            <p className="text-slate-500 text-sm">Be the first to climb the leaderboard.</p>
          </div>
        ) : (
          <div className="px-5 pb-5">
            {/* Premium Top 3 Podium */}
            <TopThreePodium top3={top3} />

            {/* Ranks 4–10 wrapped in a colorful panel */}
            {others.length > 0 && (
              <div className="mt-4">
                <ColorfulPanel>
                  <ol className="divide-y divide-white/30">
                    {others.map((entry, idx) => (
                      <LeaderboardRow
                        key={entry.user.id}
                        rank={idx + 4}
                        entry={entry}
                        max={maxAll}
                      />
                    ))}
                  </ol>
                </ColorfulPanel>
              </div>
            )}
          </div>
        )}
      </section>

      <p className="mt-6 text-center text-xs text-slate-500">
        Data auto-updates in real-time • Powered by Firebase
      </p>

      {/* Animated gradient helper */}
      <style jsx global>{`
        @keyframes gradient-x {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-x {
          background-size: 200% 100%;
          animation: gradient-x 6s ease infinite;
        }
      `}</style>
    </div>
  );
}

/* ================== Colorful Panel for ranks 4–10 ================== */
function ColorfulPanel({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-2xl p-[2px] bg-gradient-to-r from-fuchsia-500 via-amber-400 to-sky-500">
      <div className="relative rounded-2xl bg-white/90 backdrop-blur px-3 py-2">
        {/* colorful background accents */}
        <div className="pointer-events-none absolute -top-6 -left-6 h-24 w-24 rounded-full bg-fuchsia-400/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-sky-400/15 blur-2xl" />
        {children}
      </div>
    </div>
  );
}

/* ================== Top 3 Premium Podium ================== */

function TopThreePodium({ top3 }: { top3: LeaderboardEntry[] }) {
  if (top3.length === 0) return null;

  const first = top3[0];
  const second = top3[1];
  const third = top3[2];

  return (
    <div className="mt-2">
      <div className="flex items-end justify-center gap-8 md:gap-14">
        {/* 2nd */}
        {second && (
          <PodiumPerson
            rank={2}
            entry={second}
            size={140}
            pillarHeight={130}
          />
        )}

        {/* 1st */}
        {first && (
          <PodiumPerson
            rank={1}
            entry={first}
            size={180}
            pillarHeight={170}
          />
        )}

        {/* 3rd */}
        {third && (
          <PodiumPerson
            rank={3}
            entry={third}
            size={132}
            pillarHeight={120}
          />
        )}
      </div>
      <div className="mt-3 text-center text-xs md:text-sm text-slate-500">
        Chase the podium. Become a Top 3 earner!
      </div>
    </div>
  );
}

function PodiumPerson({
  rank,
  entry,
  size,
  pillarHeight,
}: {
  rank: 1 | 2 | 3;
  entry: LeaderboardEntry;
  size: number;
  pillarHeight: number;
}) {
  const { ringGradient, glowShadow, titleGradient, moneyGradient, badgeBg, badgeText, cardGradient, pillarGradient } =
    getRankVisuals(rank);

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex flex-col items-center">
        {/* Rank badge */}
        <span
          className={[
            "absolute -top-4 left-1/2 -translate-x-1/2 z-10",
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold shadow-md ring-1",
            badgeBg, badgeText, "ring-white/40",
          ].join(" ")}
          title={`Rank ${rank}`}
        >
          {rank === 1 ? <CrownIcon className="h-4 w-4" /> : `#${rank}`}
          {rank === 1 ? "Champion" : rank === 2 ? "Runner‑up" : "Top 3"}
        </span>

        {/* Colorful avatar with gradient ring + glow */}
        <div
          className={[
            "relative rounded-full p-1.5 bg-gradient-to-br shadow-xl",
            ringGradient,
            glowShadow,
            rank === 1 ? "animate-pulse" : "",
          ].join(" ")}
        >
          <div className="rounded-full bg-white p-1">
            {entry.user.imageUrl ? (
              <Image
                src={entry.user.imageUrl}
                alt={entry.user.name}
                width={size}
                height={size}
                className="rounded-full object-cover"
              />
            ) : (
              <div
                className="rounded-full bg-slate-200 flex items-center justify-center"
                style={{ width: size, height: size }}
              >
                <UserIcon className="h-1/2 w-1/2 text-slate-400" />
              </div>
            )}
          </div>

          {/* Subtle sparkle accents */}
          <div className="pointer-events-none absolute -right-3 -top-1 h-8 w-8 rounded-full bg-amber-300/20 blur-md" />
          <div className="pointer-events-none absolute -left-3 -bottom-1 h-8 w-8 rounded-full bg-fuchsia-400/20 blur-md" />
        </div>

        {/* Colorful pillar (was silver) */}
        <div className="mt-3">
          <div
            className={[
              "w-28 rounded-t-2xl p-[2px] bg-gradient-to-r shadow-md",
              pillarGradient,
            ].join(" ")}
            style={{ height: pillarHeight }}
          >
            <div className="h-full w-full rounded-t-2xl bg-white/85 backdrop-blur-sm ring-1 ring-white/40" />
          </div>
        </div>
      </div>

      {/* Colorful box under the avatar (name + earnings) */}
      <div className="mt-3 w-full flex justify-center">
        <div className={["relative inline-block rounded-xl p-[2px] bg-gradient-to-r", cardGradient, "shadow-sm"].join(" ")}>
          <div className="rounded-xl bg-white/90 px-4 py-2 text-center backdrop-blur-sm">
            <div
              className={[
                "max-w-[220px] truncate font-extrabold leading-tight",
                rank === 1 ? "text-2xl md:text-3xl" : "text-xl md:text-2xl",
                "bg-clip-text text-transparent bg-gradient-to-r",
                titleGradient,
              ].join(" ")}
              title={entry.user.name}
            >
              {entry.user.name}
            </div>
            <div
              className={[
                "mt-0.5 font-black bg-clip-text text-transparent bg-gradient-to-r",
                "text-lg md:text-xl",
                moneyGradient,
              ].join(" ")}
            >
              {formatCurrency(entry.earnings)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getRankVisuals(rank: 1 | 2 | 3) {
  if (rank === 1) {
    return {
      ringGradient: "from-amber-400 via-orange-500 to-fuchsia-500",
      glowShadow: "shadow-[0_0_0_6px_rgba(251,191,36,0.25)]",
      titleGradient: "from-slate-900 via-slate-800 to-slate-900",
      moneyGradient: "from-emerald-500 to-cyan-500",
      badgeBg: "bg-amber-50",
      badgeText: "text-amber-700",
      cardGradient: "from-amber-400 via-orange-500 to-fuchsia-500",
      pillarGradient: "from-amber-300 via-orange-400 to-fuchsia-500",
    };
  }
  if (rank === 2) {
    return {
      ringGradient: "from-slate-300 via-gray-400 to-slate-600",
      glowShadow: "shadow-[0_0_0_6px_rgba(148,163,184,0.25)]",
      titleGradient: "from-slate-800 to-slate-600",
      moneyGradient: "from-indigo-500 to-sky-500",
      badgeBg: "bg-slate-100",
      badgeText: "text-slate-700",
      cardGradient: "from-slate-300 via-gray-400 to-slate-600",
      pillarGradient: "from-sky-400 via-indigo-500 to-violet-600",
    };
  }
  return {
    ringGradient: "from-orange-400 via-rose-500 to-pink-600",
    glowShadow: "shadow-[0_0_0_6px_rgba(249,115,22,0.22)]",
    titleGradient: "from-rose-700 to-orange-600",
    moneyGradient: "from-purple-500 to-fuchsia-500",
    badgeBg: "bg-orange-50",
    badgeText: "text-orange-700",
    cardGradient: "from-rose-500 via-pink-500 to-orange-400",
    pillarGradient: "from-orange-400 via-rose-500 to-pink-600",
  };
}

/* ================== Rows 4–10 ================== */

function LeaderboardRow({
  rank,
  entry,
  max,
}: {
  rank: number;
  entry: LeaderboardEntry;
  max: number;
}) {
  const pct = Math.max(6, Math.round((entry.earnings / max) * 100)); // keep a minimum bar
  const { bg, text } = rankBadgeColors(rank);
  const ringClass =
    rank === 1 ? "ring-amber-400" : rank === 2 ? "ring-slate-400" : rank === 3 ? "ring-orange-400" : "ring-slate-200";

  return (
    <li className="px-2 py-3">
      <div className="group flex items-center gap-4">
        {/* Rank badge */}
        <div
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
            "shadow-sm ring-1",
            bg, text,
          ].join(" ")}
          title={`Rank ${rank}`}
        >
          {rank <= 3 ? <CrownIcon className="h-4 w-4" /> : rank}
        </div>

        {/* Avatar */}
        {entry.user.imageUrl ? (
          <Image
            src={entry.user.imageUrl}
            alt={entry.user.name}
            width={44}
            height={44}
            className={[
              "h-11 w-11 rounded-full object-cover",
              "ring-2 ring-offset-2 ring-offset-white transition",
              ringClass,
            ].join(" ")}
          />
        ) : (
          <div
            className={[
              "h-11 w-11 rounded-full bg-slate-200 flex items-center justify-center",
              "ring-2 ring-offset-2 ring-offset-white",
              ringClass,
            ].join(" ")}
          >
            <UserIcon className="h-6 w-6 text-slate-400" />
          </div>
        )}

        {/* Name + Animated Colorful Progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate font-semibold text-slate-900">
              {entry.user.name}
            </p>
            <span className="shrink-0 font-semibold text-slate-900" title={formatCurrency(entry.earnings)}>
              {formatCurrency(entry.earnings)}
            </span>
          </div>

          <div className="mt-2 h-2.5 w-full rounded-full bg-slate-100/60 overflow-hidden ring-1 ring-white/40">
            <div
              className={[
                "h-full rounded-full bg-gradient-to-r",
                barGradient(rank),
                "animate-gradient-x",
              ].join(" ")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

function rankBadgeColors(rank: number) {
  if (rank === 1) return { bg: "bg-gradient-to-br from-amber-400 to-yellow-500", text: "text-white" };
  if (rank === 2) return { bg: "bg-gradient-to-br from-slate-400 to-gray-500", text: "text-white" };
  if (rank === 3) return { bg: "bg-gradient-to-br from-orange-400 to-orange-600", text: "text-white" };
  return { bg: "bg-slate-200", text: "text-slate-800" };
}

// Rotating sets of vibrant gradients per rank for extra color
function barGradient(rank: number) {
  const sets = [
    "from-fuchsia-400 via-rose-400 to-orange-400",
    "from-emerald-400 via-teal-400 to-cyan-400",
    "from-amber-400 via-yellow-400 to-rose-400",
    "from-sky-400 via-indigo-400 to-violet-500",
    "from-pink-400 via-rose-500 to-red-500",
  ];
  const i = (rank - 1) % sets.length;
  return sets[i];
}

/* ================== Skeleton ================== */

function PodiumSkeleton() {
  return (
    <div className="mt-1">
      <div className="flex items-end justify-center gap-8 md:gap-14">
        {[130, 170, 120].map((h, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="h-9 w-24 rounded-full bg-slate-200 animate-pulse -mb-2" />
            <div className="h-28 w-28 md:h-36 md:w-36 rounded-full bg-slate-200 animate-pulse" />
            <div className="mt-3 w-28 rounded-t-2xl bg-slate-100" style={{ height: h }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================== Icons ================== */

function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  );
}
function CrownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 3h14v2H5v-2z" />
    </svg>
  );
}
function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.364 6.364l-1.414-1.414M6.05 6.05L4.636 4.636m12.728 0l-1.414 1.414M6.05 17.95L4.636 19.364M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}
function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function MonthIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function InfinityIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M18.5 12c0 2.485-2.015 4.5-4.5 4.5-3.5 0-4.5-4.5-8-4.5 0-2.485 2.015-4.5 4.5-4.5 3.5 0 4.5 4.5 8 4.5z" />
    </svg>
  );
}
function TrophyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M4 5h2a2 2 0 012-2h8a2 2 0 012 2h2a1 1 0 011 1v1a5 5 0 01-5 5h-1.28A6 6 0 0113 15.917V18h3a1 1 0 110 2H8a1 1 0 110-2h3v-2.083A6 6 0 017.28 12H6a5 5 0 01-5-5V6a1 1 0 011-1zm16 2V7h-1.06a3.002 3.002 0 01-2.815 2.995A3.993 3.993 0 0017 7h3zm-16 0a3.993 3.993 0 001.875 2.995A3.003 3.003 0 014.06 7H1v0z" />
    </svg>
  );
}
function SparklesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l.803 2.47a1 1 0 00.95.69h2.596c.969 0 1.371 1.24.588 1.81l-2.102 1.527a1 1 0 00-.364 1.118l.803 2.47c.3.921-.755 1.688-1.54 1.118l-2.102-1.527a1 1 0 00-1.176 0L6.206 14.15c-.784.57-1.838-.197-1.539-1.118l.803-2.47a1 1 0 00-.364-1.118L3.004 7.897c-.784-.57-.38-1.81.588-1.81h2.596a1 1 0 00.95-.69l.911-2.47z" />
    </svg>
  );
}