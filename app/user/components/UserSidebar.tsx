// app/user/components/UserSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import Image from "next/image";
import { useAuth } from "@/hooks/useAuth";
import type { SVGProps, ComponentType } from "react";

// Types
type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

interface UserSidebarProps {
  onNavClick?: () => void;
}

// Data
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/user/dashboard", icon: DashboardIcon },
  { label: "Study Page", href: "/user/study-page", icon: BookIcon },
  { label: "Upgrade Course", href: "/user/upgrade-course", icon: RocketIcon },
  { label: "Leaderboard", href: "/user/leaderboard", icon: TrophyIcon },
  { label: "Affiliate", href: "/user/affiliate", icon: UsersIcon },
  { label: "Transactions", href: "/user/transactions", icon: ReceiptIcon },
  { label: "Withdrawal", href: "/user/withdraw", icon: WalletIcon },
  { label: "KYC", href: "/user/kyc", icon: IdCardIcon },
];

export default function UserSidebar({ onNavClick }: UserSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile } = useAuth(); // Use the auth hook

  const isActive = (href: string) => pathname === href;

  const handleLinkClick = () => {
    onNavClick?.();
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      await fetch("/api/auth/session-logout", { method: "POST" });
      onNavClick?.();
      router.replace("/login");
    } catch (error) {
      console.error("User logout error:", error);
      router.replace("/login");
    }
  };

  return (
    <aside className="w-full h-full bg-white p-6 flex flex-col justify-between border-r border-slate-200">
      {/* Top Section */}
      <div>
        <Link href="/" onClick={handleLinkClick} className="mb-8 flex items-center gap-2">
          <Image
            className="h-8 w-8 text-sky-600"
            src={"/images/skillhubnepallogo.png"}
            alt="Skill Hub Nepal Logo"
            height={100}
            width={100}
          />
          <h1 className="text-xl font-bold text-slate-800">Skill Hub Nepal</h1>
        </Link>
        <nav className="flex flex-col space-y-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={handleLinkClick}
              className={`flex items-center gap-3 rounded-md px-3 py-2 transition-colors ${
                isActive(item.href)
                  ? "bg-sky-100 text-sky-600 font-semibold"
                  : "text-slate-600 hover:bg-sky-50"
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Bottom Section */}
      <div className="space-y-2 border-t border-slate-200 pt-4">
        <div className="flex items-center gap-3 rounded-lg p-2">
          <div className="relative h-10 w-10 flex-shrink-0">
            {profile?.imageUrl ? (
              <Image
                src={profile.imageUrl}
                alt="Profile"
                fill
                className="rounded-full object-cover"
              />
            ) : (
              <div className="h-full w-full rounded-full bg-slate-200 flex items-center justify-center">
                <UserIcon className="h-6 w-6 text-slate-500" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 truncate">{profile?.name || "User"}</h2>
            <p className="text-xs text-slate-500 truncate">{user?.email || "..."}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors"
        >
          <LogoutIcon className="h-5 w-5" />
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
}

/* ============== ICONS (Self-Contained) ============== */
function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}
function BookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}
function RocketIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}
function TrophyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z" />
    </svg>
  );
}
function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm6-11a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}
function ReceiptIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
function WalletIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}
function IdCardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm9-2a2 2 0 100-4 2 2 0 000 4z" />
    </svg>
  );
}
function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
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