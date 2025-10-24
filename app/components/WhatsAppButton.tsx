"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { SVGProps } from "react";
import { database } from "@/lib/firebase";
import { ref as dbRef, onValue } from "firebase/database";

type Props = {
  phone?: string;
  message?: string;
  className?: string;
};

type HeroSection = {
  phone?: string;
  whatsappMessage?: string;
};

export default function WhatsAppButton({
  phone,
  message,
  className = "",
}: Props) {
  const [hero, setHero] = useState<HeroSection>({});

  // Live subscribe to heroSection from RTDB if no explicit props are provided
  useEffect(() => {
    const ref = dbRef(database, "heroSection");
    const unsub = onValue(ref, (snap) => {
      const val = (snap.val() || {}) as Partial<HeroSection>;
      setHero({
        phone: val.phone,
        whatsappMessage: val.whatsappMessage,
      });
    });
    return () => unsub();
  }, []);

  const resolvedPhone = phone ?? hero.phone ?? "9779705726179";
  const resolvedMessage =
    message ??
    hero.whatsappMessage ??
    "Hi! I’m interested in your course packages. Can you help me choose the best one?";

  // WhatsApp expects digits only: remove non-digits
  const waPhone = useMemo(() => {
    const digits = String(resolvedPhone).replace(/[^\d]/g, "");
    return digits.length > 5 ? digits : "9779705726179";
  }, [resolvedPhone]);

  const href = useMemo(() => {
    return `https://wa.me/${waPhone}?text=${encodeURIComponent(resolvedMessage)}`;
  }, [waPhone, resolvedMessage]);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className={[
        "group fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 p-2 text-white shadow-lg ring-1 ring-emerald-600/30 transition hover:brightness-105",
        className,
      ].join(" ")}
    >
      <span className="select-none rounded-full bg-black/10 px-3 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur-sm ring-1 ring-white/20 motion-safe:animate-pulse">
        Contact now
      </span>
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-200 transition group-hover:scale-105 sm:h-11 sm:w-11">
        <WhatsAppIcon className="h-6 w-6" />
      </span>
    </a>
  );
}

function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden fill="currentColor" {...props}>
      <path d="M19.1 17.7c-.3-.1-1-.5-1.2-.6-.2-.1-.4-.1-.5.1-.1.1-.6.6-.7.7-.1.1-.2.1-.4 0-.2-.1-.8-.3-1.5-1-.6-.5-1-1.2-1.1-1.4-.1-.2 0-.3.1-.4.1-.1.2-.2.3-.3.1-.1.1-.2.2-.3.1-.1.1-.2.2-.3.1-.2.1-.3 0-.5-.1-.1-.5-1.2-.7-1.6-.2-.4-.4-.3-.5-.3h-.4c-.1 0-.3 0-.5.2-.2.2-.7.6-.7 1.5s.7 1.8.8 1.9c.1.2 1.4 2.1 3.4 3 .5.2.9.3 1.2.4.5.2.9.2 1.2.1.4-.1 1-.4 1.1-.8.1-.4.1-.8.1-.9 0-.1-.3-.2-.6-.3z" />
      <path d="M26.7 5.3C23.9 2.5 20.2 1 16.2 1 8.6 1 2.4 7.1 2.4 14.7c0 2.5.7 4.8 2 6.9L3 30.6l9.1-1.4c1.9 1 4.1 1.6 6.3 1.6 7.6 0 13.8-6.2 13.8-13.8 0-3.7-1.5-7.4-4.3-10.2zM16.2 28c-2 0-4-.5-5.8-1.5l-.4-.2-5.4.8.9-5.2-.3-.4c-1.2-1.9-1.8-4.1-1.8-6.5C3.4 8 9 2.4 16.2 2.4c3.3 0 6.4 1.3 8.7 3.6 2.3 2.3 3.6 5.4 3.6 8.7 0 6.8-5.5 12.3-12.3 12.3z" />
    </svg>
  );
}