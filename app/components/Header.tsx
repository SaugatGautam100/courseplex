"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, type FormEvent, type ChangeEvent } from "react";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useAuth } from "@/hooks/useAuth";
import type { SVGProps } from "react";

// Types
type NavItem = { href: string; label: string };
const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About Us" },
  { href: "/courses", label: "Courses" }, // renamed from Packages -> Courses
];

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, profile, loading } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Search states
  const [search, setSearch] = useState("");
  const [mobileSearch, setMobileSearch] = useState("");

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      // Clear both session cookies
      await Promise.all([
        fetch("/api/auth/session-logout", { method: "POST" }),
        fetch("/api/auth/admin-session-logout", { method: "POST" }),
      ]);
      router.replace("/login");
    } catch (error) {
      console.error("Error logging out:", error);
      router.replace("/login");
    }
  }, [router]);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);
  const isActive = (href: string) =>
    (href === "/" && pathname === href) || (href !== "/" && pathname.startsWith(href));

  const linkBaseClasses =
    'relative px-1 py-2 text-[15px] text-slate-600 hover:text-slate-900 transition after:absolute after:left-0 after:-bottom-1 after:h-[3px] after:w-0 after:rounded-full after:bg-gradient-to-r after:from-sky-500 after:to-fuchsia-500 after:content-[""] hover:after:w-full after:transition-all';

  const AuthButtons = ({ isMobile = false }: { isMobile?: boolean }) => {
    if (!isClient || loading) {
      return (
        <div className={`h-10 w-24 rounded-full bg-slate-200 animate-pulse ${isMobile ? "w-full" : ""}`} />
      );
    }

    if (user && profile) {
      const status = profile.status || "active";

      if (status === "active") {
        return (
          <div className="flex items-center gap-3">
            <Link
              href="/user/dashboard"
              onClick={closeMobileMenu}
              className="h-10 w-10 flex-shrink-0 rounded-full overflow-hidden ring-2 ring-offset-2 ring-sky-500 hover:ring-sky-400 transition-all"
              aria-label="Go to Dashboard"
            >
              {profile.imageUrl ? (
                <Image src={profile.imageUrl} alt="Profile" width={40} height={40} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-slate-200 flex items-center justify-center">
                  <UserIcon className="h-6 w-6 text-slate-500" />
                </div>
              )}
            </Link>
            {!isMobile && (
              <button
                onClick={() => {
                  handleLogout();
                  closeMobileMenu();
                }}
                className="inline-flex items-center justify-center rounded-full bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-white"
              >
                Log Out
              </button>
            )}
          </div>
        );
      }

      if (status === "pending_approval") {
        return (
          <div className="flex items-center gap-3">
            <Link
              href="/pending-approval"
              onClick={closeMobileMenu}
              className="inline-flex items-center justify-center rounded-full bg-yellow-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-yellow-600"
            >
              Pending
            </Link>
            {!isMobile && (
              <button
                onClick={() => {
                  handleLogout();
                  closeMobileMenu();
                }}
                className="inline-flex items-center justify-center rounded-full bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-white"
              >
                Log Out
              </button>
            )}
          </div>
        );
      }
    }

    // Default: Logged out
    return (
      <div className={`flex items-center gap-2 ${isMobile ? "grid grid-cols-2" : ""}`}>
        <Link
          href="/login"
          onClick={closeMobileMenu}
          className="inline-flex items-center justify-center rounded-full bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-white"
        >
          Login
        </Link>
        <Link
          href="/signup"
          onClick={closeMobileMenu}
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-sky-700/20 transition hover:opacity-95"
        >
          Sign Up
        </Link>
      </div>
    );
  };

  // Desktop search submit
  const onSubmitSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = search.trim();
    if (q) {
      router.push(`/courses?search=${encodeURIComponent(q)}`);
    } else {
      router.push("/courses");
    }
  };

  // Mobile search submit
  const onSubmitMobileSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = mobileSearch.trim();
    if (q) {
      router.push(`/courses?search=${encodeURIComponent(q)}`);
    } else {
      router.push("/courses");
    }
    closeMobileMenu();
  };

  return (
    <>
      <header id="site-header" className="sticky top-0 z-40 bg-white/60 backdrop-blur-xl supports-[backdrop-filter]:bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Go to Home">
            <Image
              className="h-8 w-8 text-sky-600"
              src={"/images/courseplexlogo.png"}
              alt="CoursePlex Logo"
              height={100}
              width={100}
            />
            <span className="bg-gradient-to-r from-sky-600 via-cyan-600 to-fuchsia-600 bg-clip-text text-lg font-extrabold text-transparent">
              CoursePlex
            </span>
          </Link>

          {/* Desktop Search (to the LEFT of nav items) */}
          <form onSubmit={onSubmitSearch} className="relative hidden flex-1 items-center md:flex">
            <SearchIcon className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              type="search"
              placeholder="Search courses..."
              aria-label="Search courses"
              className="w-full rounded-full border border-slate-200 bg-white/80 py-2 pl-9 pr-10 text-sm text-slate-700 shadow-sm outline-none ring-1 ring-transparent transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-sky-200"
            />
            <button
              type="submit"
              className="absolute right-1 inline-flex h-8 items-center justify-center rounded-full bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
            >
              Search
            </button>
          </form>

          {/* Desktop Nav (appears to the RIGHT of the search) */}
          <nav className="hidden items-center gap-6 md:flex">
            {NAV_ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={`${linkBaseClasses} ${isActive(href) ? "text-slate-900 after:w-full" : ""}`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Desktop Auth Buttons */}
          <div className="hidden items-center gap-2 sm:flex">
            <AuthButtons />
          </div>

          {/* Mobile Auth Buttons & Menu Trigger */}
          <div className="flex items-center gap-2 sm:hidden">
            <AuthButtons isMobile={true} />
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-slate-700 shadow-sm ring-1 ring-slate-200"
              aria-label="Open menu"
            >
              <BurgerIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={closeMobileMenu}>
          <div className="absolute inset-0 bg-slate-900/40"></div>
          <div
            className="absolute inset-x-3 top-[68px] mx-auto max-w-md rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link href={"/"} className="flex gap-0.5" onClick={closeMobileMenu}>
                  <Image
                    className="h-8 w-8 text-sky-600"
                    src={"/images/courseplexlogo.png"}
                    alt="CoursePlex Logo"
                    height={100}
                    width={100}
                  />
                  <span className="text-base font-extrabold">CoursePlex</span>
                </Link>
              </div>
              <button
                onClick={closeMobileMenu}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-700 ring-1 ring-slate-200"
                aria-label="Close menu"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Mobile search (at top of the menu) */}
            <form onSubmit={onSubmitMobileSearch} className="mt-4 flex items-center gap-2">
              <div className="relative flex-1">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={mobileSearch}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setMobileSearch(e.target.value)}
                  type="search"
                  placeholder="Search courses"
                  aria-label="Search courses"
                  className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none ring-1 ring-transparent transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-sky-200"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
              >
                Search
              </button>
            </form>

            <nav className="mt-4 space-y-1">
              {NAV_ITEMS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={closeMobileMenu}
                  className={`block rounded-lg px-3 py-2 text-base ${
                    isActive(href) ? "bg-sky-50 text-sky-800 ring-1 ring-sky-100" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between">
                <AuthButtons />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Icons
function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2c3.5 0 8 1.5 8 6.5S15.5 22 12 22 4 17.5 4 8.5 8.5 2 12 2z" opacity=".2" />
      <path d="M7 9.5c0-2.3 2.1-4.5 5-4.5s5 2.2 5 4.5-2.1 4.5-5 4.5-5-2.2-5-4.5z" />
    </svg>
  );
}
function BurgerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
    </svg>
  );
}
function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M6.2 5l12.8 12.8-1.2 1.2L5 6.2 6.2 5zm12.8 0L5 17.8l1.2 1.2L20.2 6.2 19 5z" />
    </svg>
  );
}
function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
        clipRule="evenodd"
      />
    </svg>
  );
}