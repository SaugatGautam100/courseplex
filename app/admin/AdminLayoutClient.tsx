"use client";

import { useState, ReactNode } from "react";
import AdminSidebar from "@/app/components/AdminSidebar";
import type { SVGProps } from "react";
import Image from "next/image";

export default function AdminLayoutClient({ children }: { children: ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="font-sans bg-slate-50 text-slate-800">
      <div className="relative flex min-h-screen">
        {/* DESKTOP SIDEBAR */}
        <aside className="sticky top-0 h-screen hidden md:flex">
          <AdminSidebar />
        </aside>

        {/* CONTENT AREA */}
        <div className="flex-1 flex flex-col">
          {/* MOBILE HEADER */}
          <header className="md:hidden sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-sm px-4">
            <div className="flex items-center gap-2">
              <Image
                src="/images/courseplexlogo.png"
                alt="Logo"
                width={28}
                height={28}
              />
              <h1 className="text-lg font-bold text-slate-800">Admin Panel</h1>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-md hover:bg-slate-100"
              aria-label="Toggle menu"
            >
              <MenuIcon className="h-6 w-6 text-slate-700" />
            </button>
          </header>

          {/* MOBILE MENU OVERLAY */}
          {isMobileMenuOpen && (
            <div className="md:hidden fixed inset-0 z-40">
              <div
                className="absolute inset-0 bg-black/30"
                onClick={closeMobileMenu}
                aria-hidden="true"
              ></div>
              <div className="relative h-full w-72 bg-white border-r border-slate-200">
                <AdminSidebar onNavClick={closeMobileMenu} />
              </div>
            </div>
          )}

          {/* MAIN CONTENT */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

// Icon for the mobile menu button
function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      {...props}
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}