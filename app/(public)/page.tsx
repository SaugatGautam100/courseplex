"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { database } from "@/lib/firebase";
import { ref as dbRef, get, onValue } from "firebase/database";
import { useAuth } from "@/hooks/useAuth";
import WhatsAppButton from "@/app/components/WhatsAppButton";
import type { SVGProps } from "react";

type PackagesMapRaw = Record<
  string,
  {
    name: string;
    price: number;
    imageUrl: string;
    courseIds?: Record<string, boolean>;
    highlight: boolean;
    badge: string;
    features?: string[];
  }
>;
type CoursesMap = Record<string, { title: string }>;

type Package = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  courseIds?: Record<string, boolean>;
  highlight: boolean;
  badge: string;
  features?: string[];
};

type MinimalUser = { uid: string } | null;

type HeroSection = {
  phone?: string;
  whatsappMessage?: string;
};

type SiteMetrics = {
  coursePackages?: number;
  skillCourses?: number;
  practicalLearning?: number;
};

export default function Page() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Dynamic hero contact and homepage counters
  const [hero, setHero] = useState<HeroSection>({
    phone: "9779705726179",
    whatsappMessage:
      "Hi! I’m interested in your course packages. Can you help me choose the best one?",
  });
  const [siteMetrics, setSiteMetrics] = useState<SiteMetrics>({
    coursePackages: 4,
    skillCourses: 10,
    practicalLearning: 100,
  });

  useEffect(() => {
    const fetchPackages = async () => {
      try {
        const packagesRef = dbRef(database, "packages");
        const coursesRef = dbRef(database, "courses");
        const [packagesSnapshot, coursesSnapshot] = await Promise.all([
          get(packagesRef),
          get(coursesRef),
        ]);

        const packagesData = (packagesSnapshot.val() as PackagesMapRaw | null) ?? {};
        const coursesData = (coursesSnapshot.val() as CoursesMap | null) ?? {};

        const enrichedPackages: Package[] = Object.entries(packagesData).map(
          ([id, pkg]) => {
            const featureList = pkg.courseIds
              ? Object.keys(pkg.courseIds).map(
                  (courseId) => coursesData[courseId]?.title || "Unknown Course"
                )
              : pkg.features ?? [];
            return { id, ...pkg, features: featureList };
          }
        );

        setPackages(enrichedPackages);
      } catch (error) {
        console.error("Failed to fetch content:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPackages();
  }, []);

  // Live updates for heroSection and siteMetrics
  useEffect(() => {
    const heroRef = dbRef(database, "heroSection");
    const siteMetricsRef = dbRef(database, "siteMetrics");

    const unsubHero = onValue(heroRef, (snap) => {
      const v = (snap.val() || {}) as Partial<HeroSection>;
      setHero((prev) => ({
        phone: v.phone ?? prev.phone,
        whatsappMessage: v.whatsappMessage ?? prev.whatsappMessage,
      }));
    });

    const unsubSiteMetrics = onValue(siteMetricsRef, (snap) => {
      const v = (snap.val() || {}) as Partial<SiteMetrics>;
      setSiteMetrics((prev) => ({
        coursePackages:
          typeof v.coursePackages === "number" ? v.coursePackages : prev.coursePackages,
        skillCourses:
          typeof v.skillCourses === "number" ? v.skillCourses : prev.skillCourses,
        practicalLearning:
          typeof v.practicalLearning === "number" ? v.practicalLearning : prev.practicalLearning,
      }));
    });

    return () => {
      unsubHero();
      unsubSiteMetrics();
    };
  }, []);

  const normalizedWaPhone = useMemo(() => {
    const raw = hero.phone || "9779705726179";
    // WhatsApp requires digits only: remove non-digits
    const digitsOnly = raw.replace(/[^\d]/g, "");
    return digitsOnly.length > 5 ? digitsOnly : "9779705726179";
  }, [hero.phone]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-800 antialiased">
      <section id="home" className="relative mx-auto max-w-7xl px-4 py-10 md:py-16">
        <Hero
          phoneLabel={hero.phone || "+977 970-572-6179"}
          metrics={{
            coursePackages: siteMetrics.coursePackages ?? 4,
            skillCourses: siteMetrics.skillCourses ?? 10,
            practicalLearning: siteMetrics.practicalLearning ?? 100,
          }}
        />
      </section>

      <section className="relative bg-white py-10 pb-16 md:py-14 md:pb-24">
        <div className="mx-auto max-w-7xl px-4">
          <Steps />
          <About
            metrics={{
              coursePackages: siteMetrics.coursePackages ?? 4,
              skillCourses: siteMetrics.skillCourses ?? 10,
              practicalLearning: siteMetrics.practicalLearning ?? 100,
            }}
          />
          <header className="mx-auto mt-16 max-w-3xl px-2 text-center">
            <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700 ring-1 ring-sky-200">
              <SparkleIcon className="h-5 w-5" />
              Learning Packages
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Choose Your Learning Path
            </h2>
            <p className="mt-3 text-base text-slate-600 sm:text-lg">
              Flexible packages designed to accelerate your growth.
            </p>
          </header>
          <Pricing
            tiers={packages}
            loading={loading}
            user={user ? { uid: user.uid } : null}
          />
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

/* ================== Pricing ================== */
function Pricing({
  tiers,
  loading,
  user,
}: {
  tiers: Package[];
  loading: boolean;
  user: MinimalUser;
}) {
  if (loading)
    return <div className="p-8 text-center text-slate-500">Loading packages...</div>;

  return (
    <div
      id="packages"
      className="mx-auto mt-12 grid max-w-7xl gap-8 px-1 sm:grid-cols-2 lg:grid-cols-3"
    >
      {tiers.map((t) => {
        const buttonHref = user
          ? `/user/upgrade-course?packageId=${encodeURIComponent(t.id)}`
          : `/signup?packageId=${encodeURIComponent(t.id)}`;
        const buttonText = user ? "Upgrade Now" : "Enroll Now";

        return (
          <div
            key={t.id}
            className={[
              "group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm transition-shadow duration-300",
              t.highlight ? "ring-2 ring-sky-500" : "hover:shadow-lg ring-1 ring-slate-200",
            ].join(" ")}
          >
            <div className="relative h-48 w-full">
              {t.imageUrl && (
                <Image src={t.imageUrl} alt={t.name} fill className="object-cover" />
              )}
              {t.badge && (
                <div className="absolute top-4 right-4">
                  <span className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white shadow-md">
                    {t.badge}
                  </span>
                </div>
              )}
            </div>
            <div className="p-6 flex flex-col flex-grow">
              <h3 className="text-xl font-bold text-slate-900">{t.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold tracking-tight">
                  Rs {(t.price || 0).toLocaleString()}
                </span>
                <span className="text-sm text-slate-500">/ lifetime</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-slate-700 flex-grow">
                {t.features?.map((f, idx) => (
                  <li key={`${f}-${idx}`} className="flex items-start gap-3">
                    <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  href={buttonHref}
                  className={[
                    "inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold shadow-sm transition",
                    t.highlight
                      ? "bg-sky-600 text-white hover:bg-sky-700"
                      : "bg-sky-50 text-sky-800 hover:bg-sky-100",
                  ].join(" ")}
                >
                  {buttonText}
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================== Hero and other components ================== */
function Hero({
  phoneLabel,
  metrics,
}: {
  phoneLabel: string;
  metrics: { coursePackages: number; skillCourses: number; practicalLearning: number };
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-white shadow-xl">
      <HeroDecor />
      <div className="relative z-10 grid items-center gap-10 px-4 py-10 sm:px-6 sm:py-12 md:grid-cols-2 md:px-10 md:py-20">
        <div>
          <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 ring-1 ring-emerald-200">
              <StatusDot className="h-2 w-2 text-emerald-500" /> Ready To Work
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-700 ring-1 ring-sky-200">
              <PhoneIcon className="h-3.5 w-3.5" /> {phoneLabel}
            </span>
          </div>
          <h1 className="mt-4 text-4xl font-black leading-[1.15] tracking-tight sm:text-5xl md:text-6xl">
            Skill Hub Nepal —{" "}
            <span className="bg-gradient-to-r from-sky-600 to-fuchsia-600 bg-clip-text text-transparent">
              Digital Marketing Courses
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
            Master real-world digital skills through curated packages — from fundamentals to advanced strategies.
          </p>
          <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link
              href="#packages"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-600 to-cyan-600 px-6 py-3 text-base font-semibold text-white shadow-sm"
            >
              Explore Our Packages
            </Link>
          </div>
          <dl className="mt-8 grid grid-cols-3 gap-4 text-center text-sm text-slate-600 sm:text-base">
            <div>
              <dt className="font-semibold text-slate-900">{metrics.coursePackages}+</dt>
              <dd>Course Packages</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">{metrics.skillCourses}+</dt>
              <dd>Skill Courses</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">{metrics.practicalLearning}%</dt>
              <dd>Practical Learning</dd>
            </div>
          </dl>
        </div>
        <div className="relative h-full">
          <HeroImage />
        </div>
      </div>
    </div>
  );
}

function HeroImage() {
  return (
    <div className="relative h-full w-full aspect-[4/3] md:aspect-auto">
      <Image
        src="https://images.unsplash.com/photo-1556761175-5973dc0f32e7?q=80&w=1932&auto=format&fit=crop"
        alt="Instructor guiding a student"
        fill
        className="rounded-2xl object-cover shadow-lg"
        priority
      />
    </div>
  );
}
function HeroDecor() {
  return (
    <div aria-hidden className="absolute inset-0">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50 via-white to-slate-50" />
      <div className="absolute -left-24 -top-32 h-[320px] w-[320px] -rotate-12 rounded-[48px] bg-gradient-to-tr from-sky-100 to-emerald-100 blur-2xl sm:h-[420px] sm:w-[420px]" />
      <div className="absolute -right-16 -bottom-20 h-[360px] w-[360px] rotate-12 rounded-[56px] bg-gradient-to-br from-fuchsia-100 to-sky-100 blur-2xl sm:h-[520px] sm:w-[520px]" />
      <div className="absolute inset-x-3 top-3 bottom-3 rounded-2xl bg-slate-100/60 sm:inset-x-6 sm:top-6 sm:bottom-6" />
    </div>
  );
}

function Steps() {
  const items = [
    { num: "01", title: "Explore Package", desc: "Discover what fits your goals.", color: "from-orange-400 to-pink-500" },
    { num: "02", title: "Learn Package", desc: "Master the fundamentals.", color: "from-sky-500 to-cyan-500" },
    { num: "03", title: "Apply Package", desc: "Start building projects.", color: "from-violet-500 to-indigo-500" },
    { num: "04", title: "Achieve Package", desc: "Advance your career.", color: "from-emerald-500 to-teal-500" },
  ];
  return (
    <div id="services" className="mx-auto -mt-4 max-w-5xl rounded-2xl bg-white p-4 shadow-lg sm:-mt-8 md:-mt-12 md:p-6">
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        {items.map((s) => (
          <div key={s.num} className="rounded-xl bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className={`inline-flex rounded-full bg-gradient-to-r ${s.color} px-3 py-1 text-xs font-bold text-white shadow-sm`}>
              {s.num}
            </div>
            <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function About({
  metrics,
}: {
  metrics: { coursePackages: number; skillCourses: number; practicalLearning: number };
}) {
  return (
    <section
      id="about"
      className="mx-auto mt-14 grid max-w-6xl items-center gap-8 rounded-2xl bg-white p-5 shadow-lg sm:p-6 md:grid-cols-2 md:p-8"
    >
      <div className="order-2 md:order-1">
        <span className="text-sm font-bold tracking-wide text-sky-600">ABOUT US</span>
        <h3 className="mt-3 text-2xl font-extrabold sm:text-3xl">
          Skill Hub Nepal — Your Digital Marketing{" "}
          <span className="text-sky-600">Learning Partner</span>
        </h3>
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Metric value={`${metrics.coursePackages}+`} label="Course Packages" />
          <Metric value={`${metrics.skillCourses}+`} label="Skill Courses" />
          <Metric value={`${metrics.practicalLearning}%`} label="Practical Learning" />
        </div>
        <p className="mt-4 text-base text-slate-600">
          We provide comprehensive digital marketing training with packages ranging from basic to advanced levels.
        </p>
        <Link
          href="#packages"
          className="mt-6 inline-flex items-center rounded-full bg-gradient-to-r from-sky-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Explore Packages
        </Link>
      </div>
      <div className="order-1 md:order-2">
        <AboutImage />
      </div>
    </section>
  );
}

function AboutImage() {
  return (
    <div className="relative w-full aspect-video">
      <Image
        src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=2071&auto=format&fit=crop"
        alt="A diverse group of students collaborating"
        fill
        className="rounded-2xl object-cover shadow-lg"
      />
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 shadow-sm">
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-sm text-slate-600">{label}</div>
    </div>
  );
}

/* Icons */
function StatusDot(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 8 8" fill="currentColor" aria-hidden {...props}>
      <circle cx="4" cy="4" r="4" />
    </svg>
  );
}
function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M6.6 2h3A2.4 2.4 0 0 1 12 4.4v15.2A2.4 2.4 0 0 1 9.6 22h-3A2.6 2.6 0 0 1 4 19.4V4.6A2.6 2.6 0 0 1 6.6 2zM7 4h2v1H7z" />
    </svg>
  );
}
function SparkleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2l1.8 4.3L18 8l-4.2 1.7L12 14l-1.8-4.3L6 8l4.2-1.7L12 2zM5 16l1.2 2.8L9 20l-2.8 1.2L5 24l-1.2-2.8L1 20l2.8-1.2L5 16zm14-1l1.6 3.7L24 20l-3.4 1.3L19 25l-1.6-3.7L14 20l3.4-1.3L19 15z" opacity=".35" />
      <path d="M12 4.5l1.3 3.1 3.2 1.3-3.2 1.3L12 13.3l-1.3-3.1-3.2-1.3 3.2-1.3L12 4.5z" />
    </svg>
  );
}
function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden {...props}>
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0L3.293 9.207a1 1 0 011.414-1.414l3.043 3.043 6.543-6.543a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}