"use client";

import { useEffect, useState, useMemo } from "react";
import { database } from "@/lib/firebase";
import { ref as dbRef, onValue } from "firebase/database";
import Image from "next/image";
import type { SVGProps, ReactNode } from "react";

// --- TYPES ---
type User = {
  id: string;
  name: string;
  email: string;
  imageUrl?: string;
  totalEarnings: number;
  balance: number;
  phone?: string;
  status?: string;
};
type UsersMap = Record<string, User>;
type CommissionDB = { referrerId: string; amount: number | string; timestamp: number | string };
type CommissionEvent = { referrerId: string; amount: number; timestamp: number };
type LeaderboardEntry = { user: User; earnings: number };

// --- HELPERS ---
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const startOfWeek = () => { const now = new Date(); const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()); d.setHours(0, 0, 0, 0); return d.getTime(); };
const startOfMonth = () => { const now = new Date(); const d = new Date(now.getFullYear(), now.getMonth(), 1); d.setHours(0, 0, 0, 0); return d.getTime(); };
const formatCurrency = (n: number) => `Rs ${Math.round(n).toLocaleString()}`;

const normalizeCommission = (c: CommissionDB): CommissionEvent | null => {
  if (!c?.referrerId) return null;
  const amount = typeof c.amount === 'number' ? c.amount : parseFloat(c.amount);
  const ts = typeof c.timestamp === 'number' ? c.timestamp : Date.parse(String(c.timestamp));
  if (!isFinite(amount) || !isFinite(ts)) return null;
  return { referrerId: c.referrerId, amount, timestamp: ts };
};

export default function AdminRanksPage() {
  const [allUsers, setAllUsers] = useState<UsersMap>({});
  const [allCommissions, setAllCommissions] = useState<CommissionEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const usersRef = dbRef(database, "users");
    const commissionsRef = dbRef(database, "commissions");

    const unsubUsers = onValue(usersRef, (snapshot) => {
      const data = (snapshot.val() || {}) as Record<string, Omit<User, 'id'>>;
      const users: UsersMap = {};
      Object.entries(data).forEach(([userId, u]) => {
        if (u && typeof u === 'object' && u.name) {
          users[userId] = {
            id: userId,
            name: u.name,
            email: u.email || '',
            imageUrl: u.imageUrl,
            totalEarnings: u.totalEarnings || 0,
            balance: u.balance || 0,
            phone: u.phone,
            status: u.status,
          };
        }
      });
      setAllUsers(users);
      setLoading(false);
    });

    const unsubCommissions = onValue(commissionsRef, (snapshot) => {
      const data = (snapshot.val() || {}) as Record<string, CommissionDB>;
      const list = Object.values(data).map(normalizeCommission).filter(Boolean) as CommissionEvent[];
      setAllCommissions(list);
    });

    return () => {
      unsubUsers();
      unsubCommissions();
    };
  }, []);

  const leaderboards = useMemo(() => {
    const calc = (fromTs?: number): LeaderboardEntry[] => {
      const stream = fromTs ? allCommissions.filter(c => c.timestamp >= fromTs) : allCommissions;
      const map = new Map<string, number>();
      for (const c of stream) {
        map.set(c.referrerId, (map.get(c.referrerId) || 0) + c.amount);
      }
      const entries: LeaderboardEntry[] = [];
      for (const [uid, earnings] of map.entries()) {
        const user = allUsers[uid];
        if (user) {
          entries.push({ user, earnings });
        }
      }
      return entries.sort((a, b) => b.earnings - a.earnings).slice(0, 10);
    };
    
    const lifetimeEntries = Object.values(allUsers)
        .filter(u => u.totalEarnings > 0)
        .sort((a,b) => b.totalEarnings - a.totalEarnings)
        .slice(0, 10)
        .map(user => ({ user, earnings: user.totalEarnings }));

    return {
      daily: calc(startOfToday()),
      weekly: calc(startOfWeek()),
      monthly: calc(startOfMonth()),
      lifetime: lifetimeEntries,
    };
  }, [allUsers, allCommissions]);

  const stats = useMemo(() => {
    const usersArray = Object.values(allUsers);
    const activeEarners = usersArray.filter((u) => u.status === 'active' && u.totalEarnings > 0);
    const totalEarnings = usersArray.reduce((sum, u) => sum + u.totalEarnings, 0);
    const totalBalance = usersArray.reduce((sum, u) => sum + u.balance, 0);
    return {
      totalUsers: usersArray.length,
      activeEarners: activeEarners.length,
      totalEarnings,
      totalBalance,
    };
  }, [allUsers]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Admin Leaderboard</h1>
        <p className="mt-2 text-lg text-slate-600">Monitor top-performing affiliates across different timeframes</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Users" value={stats.totalUsers.toString()} icon={<UsersIcon />} color="bg-blue-500" />
        <StatCard title="Active Earners" value={stats.activeEarners.toString()} icon={<UserCheckIcon />} color="bg-green-500" />
        <StatCard title="Total Earnings" value={formatCurrency(stats.totalEarnings)} icon={<CashIcon />} color="bg-purple-500" />
        <StatCard title="Total Balance" value={formatCurrency(stats.totalBalance)} icon={<WalletIcon />} color="bg-orange-500" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Loading leaderboard data...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-12">
          <LeaderboardSection title="Today&apos;s Top Earners" leaderboard={leaderboards.daily} emptyMessage="No earnings recorded today" />
          <LeaderboardSection title="This Week&apos;s Top Earners" leaderboard={leaderboards.weekly} emptyMessage="No earnings recorded this week" />
          <LeaderboardSection title="This Month&apos;s Top Earners" leaderboard={leaderboards.monthly} emptyMessage="No earnings recorded this month" />
          <LeaderboardSection title="All-Time Top Earners" leaderboard={leaderboards.lifetime} emptyMessage="No earnings recorded yet" />
        </div>
      )}
    </div>
  );
}

// ================== HELPER COMPONENTS ==================

function StatCard({ title, value, icon, color }: { title: string; value: string; icon: ReactNode; color: string }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
        <div className={`${color} p-3 rounded-lg text-white`}>{icon}</div>
      </div>
    </div>
  );
}

function LeaderboardSection({ title, leaderboard, emptyMessage }: { title: string; leaderboard: LeaderboardEntry[]; emptyMessage: string }) {
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3, 10);
  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-slate-200">
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white p-4">
        <h2 className="text-xl font-bold text-center">{title}</h2>
      </div>
      {top3.length > 0 && (
        <div className="flex justify-around items-end p-6 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
          <div className="flex justify-center gap-4 w-full max-w-2xl mx-auto">
            {top3[1] && <div className="order-1"><TopEarner {...top3[1]} rank={2} /></div>}
            {top3[0] && <div className="order-2"><TopEarner {...top3[0]} rank={1} /></div>}
            {top3[2] && <div className="order-3"><TopEarner {...top3[2]} rank={3} /></div>}
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <ul className="divide-y divide-slate-200">
          {rest.map((entry, index) => <LeaderboardItem key={entry.user.id} {...entry} rank={index + 4} />)}
        </ul>
      )}
      {leaderboard.length === 0 && <p className="p-8 text-center text-slate-500">{emptyMessage}</p>}
    </div>
  );
}

function TopEarner({ user, earnings, rank }: LeaderboardEntry & { rank: number }) {
  const size = rank === 1 ? 96 : 80;
  const rankColor = rank === 1 ? "from-amber-400 to-yellow-500" : rank === 2 ? "from-slate-400 to-gray-500" : "from-orange-400 to-orange-600";
  const borderColor = rank === 1 ? "border-amber-400" : rank === 2 ? "border-slate-400" : "border-orange-500";
  const crown = rank === 1 ? <CrownIcon /> : rank;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        {user.imageUrl ? (
          <Image src={user.imageUrl} alt={user.name} width={size} height={size} className={`rounded-full object-cover border-4 ${borderColor} shadow-lg`} />
        ) : (
          <div className={`rounded-full bg-slate-200 flex items-center justify-center border-4 ${borderColor} shadow-lg`} style={{ width: size, height: size }}>
            <UserIcon className="h-12 w-12 text-slate-400" />
          </div>
        )}
        <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full flex items-center justify-center font-bold text-white bg-gradient-to-br ${rankColor} shadow-md`}>{crown}</span>
      </div>
      <span className="mt-4 rounded-full bg-slate-800 text-white px-3 py-1 text-sm font-semibold max-w-[120px] truncate">{user.name}</span>
      <span className="mt-1 font-bold text-slate-900 text-lg">{formatCurrency(earnings)}</span>
      {user.status === "active" && <span className="mt-1 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Active</span>}
    </div>
  );
}

function LeaderboardItem({ user, earnings, rank }: LeaderboardEntry & { rank: number }) {
  return (
    <li className="p-4 flex items-center hover:bg-slate-50 transition-colors">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600 font-bold text-sm flex-shrink-0">{rank}</div>
      <div className="ml-4 flex-shrink-0">
        {user.imageUrl ? (
          <Image src={user.imageUrl} alt={user.name} width={40} height={40} className="rounded-full object-cover border-2 border-slate-200" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center"><UserIcon className="h-6 w-6 text-slate-400" /></div>
        )}
      </div>
      <div className="ml-4 flex-grow">
        <p className="font-semibold text-slate-800">{user.name}</p>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{user.email}</span>
          {user.phone && <span>• {user.phone}</span>}
        </div>
      </div>
      <div className="text-right">
        <p className="font-semibold text-sky-700">{formatCurrency(earnings)}</p>
        {user.status === "active" && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Active</span>}
      </div>
    </li>
  );
}

// ================== ICONS ==================
function UserIcon(props: SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z" clipRule="evenodd" /></svg>; }
function CrownIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm2.86-2h8.28l.8-5.2-3.54 3.2L12 9.5 9.6 12l-3.54-3.2L6.86 14zM5 19h14v2H5v-2z" /></svg>; }
function UsersIcon() { return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>; }
function UserCheckIcon() { return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function CashIcon() { return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>; }
function WalletIcon() { return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>; }