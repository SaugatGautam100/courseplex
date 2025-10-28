// components/Footer.tsx
"use client"; // Add this for the onClick event handler to work

import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="overflow-hidden bg-[#0F172A] text-slate-400">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand & Made By */}
          <div className="md:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2">
              <Image
                className="h-8 w-auto"
                src={"/images/courseplexlogo.png"}
                alt="Course Plex Logo"
                height={40}
                width={40}
              />
              <span className="text-lg font-semibold text-white">Course Plex</span>
            </Link>
            <p className="mt-3 text-base">Learn, apply, and grow your digital marketing career.</p>
            <p className="mt-6 text-sm">
             Website Made By{" "}
              <a // Use <a> for external links
                href="https://appplex.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-white hover:text-sky-300 transition"
              >
                App Plex
              </a>
            </p>
          </div>

          {/* Quick Links */}
          <FooterCol
            title="Quick Links"
            links={[
              { label: "Home", href: "/" },
              { label: "Services", href: "/services" },
              { label: "About Us", href: "/about" },
              { label: "Packages", href: "/packages" },
            ]}
          />

          {/* Legal */}
          <FooterCol
            title="Legal"
            links={[
              { label: "Privacy Policy", href: "/privacy-policy" },
              { label: "Terms & Conditions", href: "/terms-and-conditions" },
              { label: "Disclaimer", href: "/disclaimer" },
            ]}
          />
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-6 sm:flex-row">
          <p className="text-xs">© {year} Course Plex. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <button // Use a button for actions
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 shadow-sm ring-1 ring-slate-700 transition hover:bg-slate-700"
            >
              Back to top
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="text-base font-semibold text-white">{title}</h4>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((link) => (
          <li key={link.label}>
            <Link href={link.href} className="text-slate-400 transition hover:text-white">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}