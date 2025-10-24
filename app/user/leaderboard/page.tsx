"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { database } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import Image from "next/image";
import type { SVGProps } from "react";

type User = { id: string; name: string; imageUrl?: string }; // name required for display
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

export default function LeaderboardPage() {
  const [users, setUsers] = useState<Record<string, User>>({});
  const [packages, setPackages] = useState<Record<string, PackageRec>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [commissions, setCommissions] = useState<CommissionEvent[]>([]);
  const [loaded, setLoaded] = useState({ users: false, packages: false, orders: false, commissions: false });

  useEffect(() => {
    const usersRef = ref(database, "users");
    const pkRef = ref(database, "packages");
    const ordersRef = ref(database, "orders");
    const comRef = ref(database, "commissions");

    const unUsers = onValue(usersRef, (snap) => {
      const v = (snap.val() || {}) as Record<string, RawUser>;
      const mapped: Record<string, User> = {};
      Object.entries(v).forEach(([id, u]) => {
        if (!u) return; // missing/deleted
        const rawName = typeof u.name === "string" ? u.name.trim() : "";
        // Skip users without a name (prevents "Unknown" placeholders)
        if (!rawName) return;
        // Optionally skip deleted/rejected if you store status
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
      // Filter out events where user is deleted or nameless
      return commissions.filter((c) => users[c.referrerId] && !!users[c.referrerId].name);
    }

    const derived: CommissionEvent[] = [];
    for (const o of orders) {
      if (o.status !== "Completed" || !o.referrerId || !o.createdAt) continue;
      // Skip if referrer has been deleted or has no name in users
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
        // Only include if user exists with a valid name (deleted users not included)
        if (!u || !u.name) continue;
        entries.push({ user: u, earnings });
      }
      return entries.sort((a, b) => b.earnings - a.earnings).slice(0, 10);
    };

    return {
      daily: calc(startOfToday()),
      weekly: calc(startOfWeek()),
      monthly: calc(startOfMonth()),
      lifetime: calc(undefined),
    };
  }, [commissionStream, users]);

  const top3Lifetime = leaderboards.lifetime.slice(0, 3);
  const maxLifetime = Math.max(1, ...top3Lifetime.map((e) => e.earnings));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Affiliate Leaderboard</h1>
        <p className="mt-2 text-lg text-slate-600">Daily, Weekly, Monthly and All-Time top performers</p>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="h-6 w-40 bg-slate-200 rounded animate-pulse" />
              <div className="mt-4 space-y-3">
                {[...Array(3)].map((__, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-slate-200 animate-pulse" />
                    <div className="h-5 flex-1 bg-slate-200 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Timeframes grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <TimeframeCard
              title="Today's Earners"
              gradient="from-pink-500 to-rose-600"
              icon={<SunIcon className="h-5 w-5 text-white" />}
              data={leaderboards.daily}
            />
            <TimeframeCard
              title="This Week"
              gradient="from-violet-500 to-purple-600"
              icon={<CalendarIcon className="h-5 w-5 text-white" />}
              data={leaderboards.weekly}
            />
            <TimeframeCard
              title="This Month"
              gradient="from-sky-500 to-blue-600"
              icon={<MonthIcon className="h-5 w-5 text-white" />}
              data={leaderboards.monthly}
            />
            <TimeframeCard
              title="All-Time"
              gradient="from-amber-500 to-orange-600"
              icon={<InfinityIcon className="h-5 w-5 text-white" />}
              data={leaderboards.lifetime}
            />
          </div>

          {/* All-Time Top 3 Podium */}
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 text-center">All-Time Top 3</h2>
            {top3Lifetime.length === 0 ? (
              <p className="text-center text-slate-500 mt-6">No earnings yet.</p>
            ) : (
              <div className="mt-8 flex justify-center">
                <div className="flex items-end gap-8">
                  {/* 2nd */}
                  {top3Lifetime[1] && (
                    <PodiumBar
                      rank={2}
                      entry={top3Lifetime[1]}
                      max={maxLifetime}
                      barColor="bg-slate-300"
                      crownColor="from-slate-400 to-gray-500"
                    />
                  )}
                  {/* 1st */}
                  {top3Lifetime[0] && (
                    <PodiumBar
                      rank={1}
                      entry={top3Lifetime[0]}
                      max={maxLifetime}
                      barColor="bg-amber-300"
                      crownColor="from-amber-400 to-yellow-500"
                    />
                  )}
                  {/* 3rd */}
                  {top3Lifetime[2] && (
                    <PodiumBar
                      rank={3}
                      entry={top3Lifetime[2]}
                      max={maxLifetime}
                      barColor="bg-orange-300"
                      crownColor="from-orange-400 to-orange-600"
                    />
                  )}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* ================== UI Components ================== */

function TimeframeCard({
  title,
  gradient,
  icon,
  data,
}: {
  title: string;
  gradient: string;
  icon: ReactNode;
  data: LeaderboardEntry[];
}) {
  const top3 = data.slice(0, 3);
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className={`flex items-center justify-between bg-gradient-to-r ${gradient} px-4 py-3`}>
        <h3 className="text-white font-bold">{title}</h3>
        <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">{icon}</div>
      </div>
      {top3.length === 0 ? (
        <p className="p-6 text-center text-slate-500">No earnings recorded.</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {top3.map((entry, index) => (
            <li key={entry.user.id} className="p-4 flex items-center">
              <RankBadge rank={index + 1} />
              <Avatar user={entry.user} />
              <div className="ml-4 flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{entry.user.name}</p>
                <p className="text-sm text-slate-500">{formatCurrency(entry.earnings)}</p>
              </div>
              {index === 0 ? <CrownIcon className="h-5 w-5 text-amber-400" /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const classes =
    rank === 1
      ? "bg-amber-400 text-white"
      : rank === 2
      ? "bg-slate-400 text-white"
      : rank === 3
      ? "bg-orange-500 text-white"
      : "bg-slate-200 text-slate-700";
  return (
    <div className={`flex h-7 w-7 items-center justify-center rounded-full font-bold text-xs ${classes}`}>{rank}</div>
  );
}

function Avatar({ user }: { user: User }) {
  return user.imageUrl ? (
    <Image src={user.imageUrl} alt={user.name} width={40} height={40} className="ml-3 rounded-full object-cover ring-1 ring-slate-200" />
  ) : (
    <div className="ml-3 w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center ring-1 ring-slate-200">
      <UserIcon className="h-6 w-6 text-slate-400" />
    </div>
  );
}

function PodiumBar({
  rank,
  entry,
  max,
  barColor,
  crownColor,
}: {
  rank: 1 | 2 | 3;
  entry: LeaderboardEntry;
  max: number;
  barColor: string;
  crownColor: string;
}) {
  const baseHeight = 220;
  const minHeight = 80;
  const h = Math.max(minHeight, Math.round((entry.earnings / max) * baseHeight));

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex flex-col items-center">
        <div className={`w-20 ${barColor} rounded-t-lg flex items-end justify-center`} style={{ height: `${h}px` }}>
          {entry.user.imageUrl ? (
            <Image
              src={entry.user.imageUrl}
              alt={entry.user.name}
              width={44}
              height={44}
              className="rounded-full object-cover ring-2 ring-white -mb-4 shadow-md"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center ring-2 ring-white -mb-4 shadow-md">
              <UserIcon className="h-6 w-6 text-slate-400" />
            </div>
          )}
        </div>
        <span
          className={`absolute -top-4 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold bg-gradient-to-br ${crownColor} shadow-md`}
          title={`Rank ${rank}`}
        >
          {rank === 1 ? <CrownIcon /> : rank}
        </span>
      </div>
      <span className="mt-3 max-w-[140px] text-center rounded-full bg-slate-800 text-white px-3 py-1 text-xs font-semibold truncate">
        {entry.user.name}
      </span>
      <span className="mt-1 font-bold text-slate-900">{formatCurrency(entry.earnings)}</span>
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