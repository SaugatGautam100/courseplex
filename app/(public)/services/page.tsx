"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { database } from "@/lib/firebase";
import { ref as dbRef, onValue } from "firebase/database";
import WhatsAppButton from "@/app/components/WhatsAppButton";
import type { SVGProps } from "react";

type ServicesStats = {
  expertInstructors?: number;
  careerFocusedCourses?: number;
  successRate?: number;
};

type HeroSection = {
  phone?: string;
  whatsappMessage?: string;
};

export default function ServicesPage() {
  const [servicesStats, setServicesStats] = useState<ServicesStats>({
    expertInstructors: 15,
    careerFocusedCourses: 40,
    successRate: 95,
  });

  const [hero, setHero] = useState<HeroSection>({
    phone: "9779705726179",
    whatsappMessage:
      "Hi! I'm interested in your courses. Can you help me choose the best one?",
  });

  useEffect(() => {
    const statsRef = dbRef(database, "servicesStats");
    const heroRef = dbRef(database, "heroSection");

    const unsubStats = onValue(statsRef, (snap) => {
      const v = (snap.val() || {}) as Partial<ServicesStats>;
      setServicesStats((prev) => ({
        expertInstructors:
          typeof v.expertInstructors === "number" ? v.expertInstructors : prev.expertInstructors,
        careerFocusedCourses:
          typeof v.careerFocusedCourses === "number" ? v.careerFocusedCourses : prev.careerFocusedCourses,
        successRate: typeof v.successRate === "number" ? v.successRate : prev.successRate,
      }));
    });

    const unsubHero = onValue(heroRef, (snap) => {
      const v = (snap.val() || {}) as Partial<HeroSection>;
      setHero((prev) => ({
        phone: v.phone ?? prev.phone,
        whatsappMessage: v.whatsappMessage ?? prev.whatsappMessage,
      }));
    });

    return () => {
      unsubStats();
      unsubHero();
    };
  }, []);

  const normalizedWaPhone = useMemo(() => {
    const raw = hero.phone || "9779705726179";
    const digitsOnly = raw.replace(/[^\d]/g, "");
    return digitsOnly.length > 5 ? digitsOnly : "9779705726179";
  }, [hero.phone]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 antialiased">
      {/* Hero Section */}
      <section id="services" className="bg-white scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 py-12 md:py-16">
          <Hero
            expertInstructors={servicesStats.expertInstructors ?? 15}
            careerFocusedCourses={servicesStats.careerFocusedCourses ?? 40}
            successRate={servicesStats.successRate ?? 95}
          />
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-slate-50 scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 py-14 md:py-20">
          <header className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">
              A learning experience designed for real outcomes
            </h2>
            <p className="mt-2 text-lg text-slate-600">
              Learn through projects, get mentor support, and earn a certificate on completion.
            </p>
          </header>
          <Features />
        </div>
      </section>

      {/* Bottom CTA Section */}
      <section className="bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-16">
          <BottomCTA />
        </div>
      </section>

      {/* Floating WhatsApp Button */}
      <WhatsAppButton
        phone={normalizedWaPhone}
        message={
          hero.whatsappMessage ||
          "Hi! I'm interested in your courses. Can you help me choose the best one?"
        }
      />
    </main>
  );
}

/* ====================== Hero ====================== */
function Hero({
  expertInstructors,
  careerFocusedCourses,
  successRate,
}: {
  expertInstructors: number;
  careerFocusedCourses: number;
  successRate: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-white shadow-lg">
      <div className="absolute inset-0">
        <HeroArt />
      </div>
      <div className="relative z-10 mx-auto grid max-w-4xl place-items-center px-6 py-16 text-center md:px-10 md:py-24">
        <h1 className="text-4xl font-black leading-tight tracking-tight md:text-6xl">
          Master in-demand skills for a brighter future
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
          At Plex Courses, learn through structured tracks across Tech, Business, Design, Marketing, and more — with hands-on projects, mentor support, and a certificate on completion.
        </p>
        <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/courses"
            className="inline-flex items-center rounded-full bg-sky-600 px-6 py-3 text-base font-semibold text-white shadow-sm ring-1 ring-sky-700/20 transition hover:bg-sky-700"
          >
            Browse All Courses
          </Link>
        </div>
        <dl className="mt-8 grid w-full grid-cols-3 gap-4 text-center text-sm text-slate-600 sm:text-base">
          <div>
            <dt className="font-semibold text-slate-900">{expertInstructors}+</dt>
            <dd>Expert Instructors</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">{careerFocusedCourses}+</dt>
            <dd>Career-Focused Tracks</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">{successRate}%</dt>
            <dd>Success Rate</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function HeroArt() {
  return (
    <div aria-hidden className="h-full w-full">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-100 via-white to-slate-50" />
      <div className="absolute -left-24 -top-20 h-72 w-72 rounded-full bg-sky-100 blur-2xl" />
      <div className="absolute -right-24 -bottom-20 h-80 w-80 rounded-full bg-emerald-100 blur-2xl" />
      <div className="absolute inset-x-6 top-6 bottom-6 rounded-2xl bg-slate-100/70 ring-1 ring-slate-200" />
    </div>
  );
}

/* ====================== Features ====================== */
function Features() {
  const items = [
    { title: "Expert-led curriculum", desc: "Learn from professionals who bring real-world experience to every lesson." },
    { title: "Project-first learning", desc: "Build portfolio-ready projects that map to actual roles and outcomes." },
    { title: "Mentor support", desc: "Stay unblocked with guidance, feedback, and accountability from mentors." },
    { title: "Certificate on completion", desc: "Validate your skills with a shareable certificate when you finish a track." },
  ];
  const icons = [BuilderIcon, ContentIcon, CommunityIcon, CertificateIcon];

  return (
    <div className="mx-auto mt-12 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((f, i) => {
        const Icon = icons[i];
        return (
          <div key={f.title} className="rounded-xl border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sky-100 text-sky-700 ring-1 ring-sky-200">
              <Icon className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
            <p className="mt-1 text-base text-slate-600">{f.desc}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ====================== CTA ====================== */
function BottomCTA() {
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-sky-600 to-fuchsia-600 p-1">
      <div className="flex flex-col items-center justify-between gap-6 rounded-[14px] bg-sky-900/40 px-6 py-10 text-center backdrop-blur-lg sm:flex-row sm:text-left">
        <div>
          <h3 className="text-2xl font-semibold text-white">Ready to build your future?</h3>
          <p className="mt-1 text-base text-sky-100">
            Enroll today, learn by doing, and earn a certificate when you complete a track.
          </p>
        </div>
        <Link
          href="/courses"
          className="inline-flex shrink-0 items-center rounded-full bg-white px-5 py-3 text-base font-semibold text-sky-700 shadow-lg ring-1 ring-white/60 transition hover:bg-sky-50"
        >
          Browse All Courses
        </Link>
      </div>
    </div>
  );
}

/* ====================== Icons ====================== */
function BuilderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <rect x="3" y="4" width="8" height="8" rx="2" />
      <rect x="13" y="4" width="8" height="5" rx="2" opacity=".6" />
      <rect x="13" y="11" width="8" height="9" rx="2" opacity=".35" />
      <rect x="3" y="14" width="8" height="6" rx="2" opacity=".35" />
    </svg>
  );
}
function ContentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <rect x="4" y="4" width="16" height="4" rx="2" />
      <rect x="4" y="10" width="12" height="3" rx="1.5" opacity=".6" />
      <rect x="4" y="15" width="10" height="3" rx="1.5" opacity=".35" />
      <rect x="16.5" y="10" width="3.5" height="8" rx="1.5" opacity=".35" />
    </svg>
  );
}
function CommunityIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16" cy="9" r="3" opacity=".6" />
      <rect x="4" y="14" width="16" height="6" rx="3" opacity=".35" />
    </svg>
  );
}
function CertificateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2a5 5 0 110 10 5 5 0 010-10zm-7 14l7-2 7 2v4l-7-2-7 2v-4z" />
    </svg>
  );
}