"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

interface AdminSidebarProps {
  onNavClick?: () => void;
}

// Icons
function GaugeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 3a9 9 0 00-9 9 1 1 0 102 0 7 7 0 0114 0 1 1 0 102 0 9 9 0 00-9-9zm0 5a1 1 0 00-1 1v4a1 1 0 00.293.707l2 2a1 1 0 001.414-1.414L13 12.586V9a1 1 0 00-1-1z" />
    </svg>
  );
}
function BookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
    </svg>
  );
}
function IdCardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
    </svg>
  );
}
function CartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
    </svg>
  );
}
function TrophyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}
function WalletIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
      <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
    </svg>
  );
}
function StarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}
function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}
function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  );
}

// Data
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: GaugeIcon },
  { label: "Orders", href: "/admin/orders", icon: CartIcon },
  { label: "Courses", href: "/admin/courses", icon: BookIcon },
  { label: "KYC Requests", href: "/admin/kyc-requests", icon: IdCardIcon },
  { label: "Leaderboard", href: "/admin/ranks", icon: TrophyIcon },
  { label: "Withdrawal Requests", href: "/admin/withdrawl-requests", icon: WalletIcon },
  { label: "Monthly Target", href: "/admin/monthly-target", icon: StarIcon },
];

export default function AdminSidebar({ onNavClick }: AdminSidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  const isActive = (href: string) => pathname.startsWith(href);

  const handleLogout = async () => {
    try {
      try {
        const logoutResponse = await fetch("/api/auth/session-logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!logoutResponse.ok) {
          await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" } });
        }
      } catch {
        // continue anyway
      }
      try {
        await signOut(auth);
      } catch {
        // continue anyway
      }
      onNavClick?.();
      if (typeof window !== "undefined") {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "/admin/login";
      }
    } catch {
      if (typeof window !== "undefined") window.location.href = "/admin/login";
    }
  };

  if (!user) return null;

  return (
    <aside className="w-full h-full bg-white p-6 flex flex-col justify-between border-r border-slate-200">
      {/* Top */}
      <div>
        <Link href="/" onClick={onNavClick} className="mb-8 flex items-center gap-2">
          <Image
            className="h-8 w-auto"
            src="/images/skillhubnepallogo.png"
            alt="Skill Hub Nepal Logo"
            height={40}
            width={40}
          />
          <h1 className="text-xl font-bold text-slate-800">Skill Hub Admin</h1>
        </Link>
        <nav className="flex flex-col space-y-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavClick}
              aria-current={isActive(item.href) ? "page" : undefined}
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

      {/* Bottom */}
      <div className="space-y-2 border-t border-slate-200 pt-4">
        <div className="flex items-center gap-3 rounded-lg p-2">
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-slate-700 flex items-center justify-center">
            <UserIcon className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 truncate">Admin</h2>
            <p className="text-xs text-slate-500 truncate">{user.email || "admin@skillhubnepal.com"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors cursor-pointer"
        >
          <LogoutIcon className="h-5 w-5" />
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
}