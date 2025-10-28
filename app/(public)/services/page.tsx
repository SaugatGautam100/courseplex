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
      "Hi! I’m interested in your course packages. Can you help me choose the best one?",
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
              A Learning Experience Designed for Your Success
            </h2>
            <p className="mt-2 text-lg text-slate-600">
              We provide more than just videos. Our courses are structured to give you the skills and confidence to excel.
            </p>
          </header>
          <Features />
        </div>
      </section>

      {/* Examples Section */}
      <section id="examples" className="bg-white scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 py-14 md:py-20">
          <header className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">
              Explore Our Core Digital Marketing Courses
            </h2>
            <p className="mt-2 text-lg text-slate-600">
              From foundational principles to advanced strategies, our curriculum covers every critical area of digital marketing.
            </p>
          </header>
          <Examples />
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
          "Hi! I’m interested in your course packages. Can you help me choose the best one?"
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
          Master In-Demand Digital Skills for a Brighter Future
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
          At Course Plex, we provide practical, career-focused training in digital marketing. Our courses are designed to
          give you the real-world skills needed to thrive in today&apos;s competitive job market.
        </p>
        <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/packages"
            className="inline-flex items-center rounded-full bg-sky-600 px-6 py-3 text-base font-semibold text-white shadow-sm ring-1 ring-sky-700/20 transition hover:bg-sky-700"
          >
            Explore All Courses
          </Link>
        </div>
        <dl className="mt-8 grid w-full grid-cols-3 gap-4 text-center text-sm text-slate-600 sm:text-base">
          <div>
            <dt className="font-semibold text-slate-900">{expertInstructors}+</dt>
            <dd>Expert Instructors</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">{careerFocusedCourses}+</dt>
            <dd>Career-Focused Courses</dd>
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
    { title: "Expert-Led Curriculum", desc: "Learn from industry professionals who bring real-world experience to every lesson." },
    { title: "Hands-On Projects", desc: "Build a portfolio with practical projects that solve real business challenges." },
    { title: "Career Guidance", desc: "Receive personalized support, from resume building to interview preparation." },
    { title: "Flexible Learning", desc: "Study at your own pace with 24/7 access to all course materials and our community." },
  ];
  const icons = [BuilderIcon, ContentIcon, CommunityIcon, AnalyticsIcon];
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

/* ====================== Examples ====================== */
function Examples() {
  const items: { title: string; desc: string; variant: "seo" | "social" | "ppc" }[] = [
    {
      title: "SEO & Content Mastery",
      desc: "Learn to rank websites on Google and create content that attracts and converts customers.",
      variant: "seo",
    },
    {
      title: "Social Media Marketing Pro",
      desc: "Master platforms like Instagram and Facebook to build communities and drive engagement.",
      variant: "social",
    },
    {
      title: "Digital Advertising & PPC",
      desc: "Launch and manage profitable ad campaigns on Google Ads and social media platforms.",
      variant: "ppc",
    },
  ];
  return (
    <div className="mx-auto mt-12 grid max-w-6xl gap-8 lg:grid-cols-3">
      {items.map((c) => (
        <article key={c.title} className="group overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md">
          <div className="relative h-48 w-full bg-slate-100">
            {c.variant === "seo" && <ThumbSEO />}
            {c.variant === "social" && <ThumbSocial />}
            {c.variant === "ppc" && <ThumbPPC />}
          </div>
          <div className="p-6">
            <h3 className="text-lg font-semibold">{c.title}</h3>
            <p className="mt-1 text-base text-slate-600">{c.desc}</p>
            <div className="mt-4">
              <Link href="/packages" className="inline-flex items-center text-sm font-medium text-sky-700 hover:underline">
                View syllabus →
              </Link>
            </div>
          </div>
        </article>
      ))}
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
            Enroll today and take the first step towards a successful career in digital marketing.
          </p>
        </div>
        <Link
          href="/packages"
          className="inline-flex shrink-0 items-center rounded-full bg-white px-5 py-3 text-base font-semibold text-sky-700 shadow-lg ring-1 ring-white/60 transition hover:bg-sky-50"
        >
          Explore All Packages
        </Link>
      </div>
    </div>
  );
}

/* ====================== Thumbs & Icons ====================== */
function ThumbSEO() {
  return (
    <svg viewBox="0 0 600 220" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
      <rect x="20" y="20" width="560" height="180" rx="14" fill="#0EA5E9" opacity=".12" />
      <rect x="60" y="60" width="480" height="24" rx="8" fill="#0284C7" opacity=".35" />
      <path d="M80 69h16" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <rect x="60" y="110" width="220" height="16" rx="6" fill="#0284C7" opacity=".25" />
      <rect x="60" y="140" width="160" height="16" rx="6" fill="#0284C7" opacity=".25" />
      <rect x="320" y="110" width="220" height="16" rx="6" fill="#0284C7" opacity=".25" />
      <rect x="320" y="140" width="160" height="16" rx="6" fill="#0284C7" opacity=".25" />
    </svg>
  );
}
function ThumbSocial() {
  return (
    <svg viewBox="0 0 600 220" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
      <rect x="20" y="20" width="560" height="180" rx="14" fill="#8B5CF6" opacity=".12" />
      <rect x="80" y="70" width="100" height="80" rx="10" fill="#7C3AED" opacity=".4" />
      <path d="M120 120l-10 10-10-10" stroke="#fff" strokeWidth="2" />
      <rect x="200" y="50" width="120" height="120" rx="10" fill="#A78BFA" opacity=".5" />
      <path
        d="M260 80h-40M260 95h-40M260 110h-20M260 140a10 10 0 10-20 0 10 10 0 0020 0z"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="340" y="90" width="180" height="40" rx="20" fill="#C4B5FD" opacity=".6" />
    </svg>
  );
}
function ThumbPPC() {
  return (
    <svg viewBox="0 0 600 220" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
      <rect x="20" y="20" width="560" height="180" rx="14" fill="#22C55E" opacity=".12" />
      <rect x="60" y="150" width="60" height="20" rx="6" fill="#10B981" opacity=".6" />
      <rect x="140" y="140" width="60" height="30" rx="6" fill="#10B981" opacity=".6" />
      <rect x="220" y="120" width="60" height="50" rx="6" fill="#10B981" opacity=".6" />
      <rect x="300" y="100" width="60" height="70" rx="6" fill="#10B981" opacity=".6" />
      <rect x="380" y="80" width="60" height="90" rx="6" fill="#10B981" opacity=".6" />
      <path d="M60 140C152 40 330 20 450 120" stroke="#059669" strokeWidth="3" strokeDasharray="4 4" />
    </svg>
  );
}

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
function AnalyticsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <rect x="4" y="10" width="3" height="8" rx="1.5" />
      <rect x="10.5" y="6" width="3" height="12" rx="1.5" opacity=".6" />
      <rect x="17" y="3" width="3" height="15" rx="1.5" opacity=".35" />
      <path d="M5 9l6-4 6 3 2-3" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}