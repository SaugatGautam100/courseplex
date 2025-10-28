"use client";

import { useState, ReactNode } from "react";
import UserSidebar from "./components/UserSidebar";
import type { SVGProps } from "react";
import Image from "next/image";

export default function UserLayoutClient({ children }: { children: ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="font-sans bg-slate-50 text-slate-800">
      <div className="flex min-h-screen">
        {/* DESKTOP SIDEBAR */}
        <div className="hidden md:flex">
          <UserSidebar />
        </div>

        <div className="flex-1 flex flex-col">
          {/* MOBILE HEADER */}
          <header className="md:hidden sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-sm px-4">
            <div className="flex items-center gap-2">
              <Image
                className="h-8 w-auto"
                src={"/images/courseplexlogo.png"}
                alt="Course Plex Logo"
                height={40}
                width={40}
              />
              <h1 className="text-xl font-bold text-slate-800">Course Plex</h1>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-md hover:bg-slate-100"
              aria-label="Open menu"
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
                <UserSidebar onNavClick={closeMobileMenu} />
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

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}