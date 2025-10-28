"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { database } from "@/lib/firebase";
import { ref as dbRef, get, onValue } from "firebase/database";
import { useAuth } from "@/hooks/useAuth";
import WhatsAppButton from "@/app/components/WhatsAppButton";
import type { SVGProps } from "react";

const BRAND = "Course Plex";

// E-learning hero image (Unsplash)
const HERO_MAIN_URL =
  "https://images.unsplash.com/photo-1496171367470-9ed9a91ea931?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=870";

/*
If you prefer Firebase Storage or GCS, just replace the URLs above, e.g.:

const HERO_MAIN_URL =
  "https://firebasestorage.googleapis.com/v0/b/<your-bucket>/o/elearning%2Fhero.jpg?alt=media";
*/

// Payout config
const AFFILIATE_PCT = 70;
const CASHBACK_PCT = 10;

/* ================== Types ================== */
type PackagesMapRaw = Record<
  string,
  {
    name: string;
    price: number;
    imageUrl: string;
    courseIds?: Record<string, boolean>; // included sub-courses
    highlight: boolean;
    badge: string;
    features?: string[]; // legacy
  }
>;

type SubCoursesMap = Record<
  string,
  {
    title: string;
    videos?: Record<string, { title: string; url: string }>;
  }
>;

type CourseBundle = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  subCourseIds?: Record<string, boolean>; // from courseIds in DB
  highlight: boolean;
  badge: string;
  subCourses?: string[]; // titles of included sub-courses
};

type SubCourse = {
  id: string;
  title: string;
  videos?: Record<string, { title: string; url: string }>;
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

/* ================== Page ================== */
export default function Page() {
  const [courses, setCourses] = useState<CourseBundle[]>([]); // UI: Courses (DB: packages)
  const [subCourses, setSubCourses] = useState<SubCourse[]>([]); // UI: Sub-courses (DB: courses)
  const [topCourseIds, setTopCourseIds] = useState<string[]>([]); // from homepage/topPackageIds
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Dynamic hero contact and homepage counters
  const [hero, setHero] = useState<HeroSection>({
    phone: "9779705726179",
    whatsappMessage:
      "Hi! I'm interested in your courses. Can you help me choose best one?",
  });
  const [siteMetrics, setSiteMetrics] = useState<SiteMetrics>({
    coursePackages: 4,
    skillCourses: 10,
    practicalLearning: 100,
  });

  // Fetch Courses (packages) + Sub-courses (courses)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const packagesRef = dbRef(database, "packages");
        const subCoursesRef = dbRef(database, "courses");
        const [packagesSnapshot, subCoursesSnapshot] = await Promise.all([
          get(packagesRef),
          get(subCoursesRef),
        ]);

        const packagesData = (packagesSnapshot.val() as PackagesMapRaw | null) ?? {};
        const subCoursesData = (subCoursesSnapshot.val() as SubCoursesMap | null) ?? {};

        const subCourseArray: SubCourse[] = Object.entries(subCoursesData).map(
          ([id, c]) => ({
            id,
            title: c.title,
            videos: c.videos || {},
          })
        );

        const uiCourses: CourseBundle[] = Object.entries(packagesData).map(
          ([id, pkg]) => {
            const subCourseTitles = pkg.courseIds
              ? Object.keys(pkg.courseIds).map(
                  (cid) => subCoursesData[cid]?.title || "Untitled Sub-course"
                )
              : pkg.features ?? []; // fallback if legacy features exist

            return {
              id,
              name: pkg.name,
              price: pkg.price,
              imageUrl: pkg.imageUrl,
              subCourseIds: pkg.courseIds,
              highlight: pkg.highlight,
              badge: pkg.badge,
              subCourses: subCourseTitles,
            };
          }
        );

        setSubCourses(subCourseArray);
        setCourses(uiCourses);
      } catch (error) {
        console.error("Failed to fetch content:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Live updates: heroSection and siteMetrics
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
          typeof v.practicalLearning === "number"
            ? v.practicalLearning
            : prev.practicalLearning,
      }));
    });

    return () => {
      unsubHero();
      unsubSiteMetrics();
    };
  }, []);

  // Live selection for Featured Courses (homepage/topPackageIds)
  useEffect(() => {
    const topRef = dbRef(database, "homepage/topPackageIds");
    const unsub = onValue(topRef, (snap) => {
      const v = (snap.val() || {}) as Record<string, boolean>;
      const ids = Object.entries(v)
        .filter(([, enabled]) => !!enabled)
        .map(([id]) => id);
      setTopCourseIds(ids);
    });
    return () => unsub();
  }, []);

  const normalizedWaPhone = useMemo(() => {
    const raw = hero.phone || "9779705726179";
    const digitsOnly = raw.replace(/[^\d]/g, "");
    return digitsOnly.length > 5 ? digitsOnly : "9779705726179";
  }, [hero.phone]);

  const totalCoursesCount = courses.length || siteMetrics.coursePackages || 0;
  const totalSubCoursesCount = subCourses.length || siteMetrics.skillCourses || 0;

  // Only show featured courses selected in admin
  const featuredCourseSet = new Set(topCourseIds);
  const featuredCourses = courses.filter((c) => featuredCourseSet.has(c.id));

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-800 antialiased">
      {/* HERO */}
      <section id="home" className="relative mx-auto w-full overflow-hidden">
        <Hero
          phoneLabel={hero.phone || "+977 970-572-6179"}
          metrics={{
            totalCourses: totalCoursesCount,
            totalSubCourses: totalSubCoursesCount,
            practicalLearning: siteMetrics.practicalLearning ?? 100,
          }}
        />
      </section>

      {/* Payouts Banner */}
      <section className="bg-gradient-to-r from-emerald-50 via-white to-sky-50 py-6">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:flex-row">
            <div className="text-center sm:text-left">
              <h3 className="text-base font-bold text-slate-900">New Payouts & Cashback</h3>
              <p className="text-sm text-slate-600">
                Affiliates earn <span className="font-semibold text-emerald-700">{AFFILIATE_PCT}%</span> of package price. Buyers get a{" "}
                <span className="font-semibold text-sky-700">{CASHBACK_PCT}%</span> cashback.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Become an Affiliate
              </Link>
              <Link
                href="/courses"
                className="inline-flex items-center justify-center rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
              >
                Browse Courses
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED COURSES ONLY */}
      <section className="relative z-10 bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4">
          <header className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700 ring-1 ring-violet-200">
              <SparkleIcon className="h-5 w-5" />
              Featured Courses
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Master complete tracks
            </h2>
            <p className="mt-3 text-base text-slate-600 sm:text-lg">
              Each course is a bundle of sub-courses like Frontend, Backend, and Database.
            </p>
          </header>

          <FeaturedCoursesGrid
            courses={featuredCourses}
            loading={loading}
            user={user ? { uid: user.uid } : null}
          />

          <div className="mt-10 text-center">
            <Link
              href="/courses"
              className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              Browse All Courses
            </Link>
          </div>
        </div>
      </section>

      {/* WHY US */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-12">
        <WhyUs />
      </section>

      {/* Floating WhatsApp Button */}
      <WhatsAppButton
        phone={normalizedWaPhone}
        message={
          hero.whatsappMessage ||
          "Hi! I'm interested in your courses. Can you help me choose best one?"
        }
      />
    </main>
  );
}

/* ================== Hero ================== */
function Hero({
  phoneLabel,
  metrics,
}: {
  phoneLabel: string;
  metrics: { totalCourses: number; totalSubCourses: number; practicalLearning: number };
}) {
  return (
    <div className="relative mx-auto max-w-7xl px-4 py-12 sm:py-16">
      <div className="relative overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
        <HeroDecor />

        <div className="relative z-10 grid items-center gap-10 px-5 py-10 sm:px-8 md:grid-cols-2 md:py-16 lg:px-12">
          {/* Left: Content */}
          <div>
            <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 ring-1 ring-emerald-200">
                <StatusDot className="h-2 w-2 text-emerald-500" />
                Full learning tracks
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-700 ring-1 ring-indigo-200">
                <PhoneIcon className="h-3.5 w-3.5" />
                {phoneLabel}
              </span>
            </div>

            <h1 className="mt-4 text-4xl font-black leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
              {BRAND} —{" "}
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                Learn complete skills, step by step
              </span>
            </h1>

            <p className="mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
              Choose a Course like Website Development, then progress through Sub-courses:
              Frontend, Backend, Database — all in one place.
            </p>

            <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Link
                href="/courses"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:brightness-110"
              >
                Browse Courses
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50"
              >
                Become an Affiliate
              </Link>
            </div>

            {/* Metrics */}
            <dl className="mt-8 grid grid-cols-3 gap-3 text-center text-sm text-slate-600 sm:text-base">
              <MetricCard value={`${metrics.totalCourses}+`} label="Courses" />
              <MetricCard value={`${metrics.totalSubCourses}+`} label="Sub-courses" />
              <MetricCard value={`${metrics.practicalLearning}%`} label="Practical Learning" />
            </dl>
          </div>

          {/* Right: Media (Images fixed via local files) */}
          <div className="relative h-full">
            <HeroMedia />
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroMedia() {
  const [mainSrc, setMainSrc] = useState<string>(HERO_MAIN_URL);

  return (
    <div className="relative mx-auto w-full max-w-xl">
      {/* Main image */}
      <div className="relative w-full overflow-hidden rounded-2xl shadow-xl ring-1 ring-slate-200 h-[240px] sm:h-[320px] md:h-[380px] lg:h-[420px]">
        <Image
          src={mainSrc}
          alt="Digital e-learning on a laptop"
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
          priority
          unoptimized
          onError={() => setMainSrc("/images/course-fallback.jpg")}
        />
        <div className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-slate-700 backdrop-blur">
          <PlayIcon className="h-4 w-4 text-fuchsia-600" /> Learn anywhere
        </div>
      </div>

      {/* Floating cards (keep your existing ones) */}
      <div className="pointer-events-none absolute -left-6 -bottom-6 h-28 w-40 overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-slate-200 sm:-left-10 sm:-bottom-8 sm:h-32 sm:w-48">
        <Image
          src="https://images.unsplash.com/photo-1501504905252-473c47e087f8?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=774"
          alt="Collaborative online study"
          fill
          sizes="160px"
          className="object-cover"
        />
      </div>
      <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-40 overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-slate-200 sm:-right-10 sm:-top-10 sm:h-32 sm:w-48">
        <Image
          src="https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80"
          alt="Learning tech skills online"
          fill
          sizes="160px"
          className="object-cover"
        />
      </div>
    </div>
  );
}

function HeroDecor() {
  return (
    <div aria-hidden className="absolute inset-0">
      {/* Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-sky-50" />
      {/* Glow blobs */}
      <div className="absolute -left-24 -top-32 h-[360px] w-[360px] -rotate-12 rounded-[48px] bg-gradient-to-tr from-indigo-100 to-fuchsia-100 blur-2xl sm:h-[420px] sm:w-[420px]" />
      <div className="absolute -right-16 -bottom-20 h-[380px] w-[380px] rotate-12 rounded-[56px] bg-gradient-to-br from-fuchsia-100 to-sky-100 blur-2xl sm:h-[520px] sm:w-[520px]" />
      {/* Inner frame */}
      <div className="absolute inset-x-3 top-3 bottom-3 rounded-2xl bg-white/60 ring-1 ring-slate-100 sm:inset-x-6 sm:top-6 sm:bottom-6" />
    </div>
  );
}

/* ================== Featured Courses Grid ================== */
function FeaturedCoursesGrid({
  courses,
  loading,
  user,
}: {
  courses: CourseBundle[];
  loading: boolean;
  user: MinimalUser;
}) {
  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading courses...</div>;
  }

  if (!courses.length) {
    return (
      <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
        No featured courses yet. Select courses in admin under "Homepage: Featured Courses".
      </div>
    );
  }

  return (
    <div className="mx-auto mt-8 grid max-w-7xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => (
        <CourseCard key={course.id} course={course} user={user} />
      ))}
    </div>
  );
}

/* ================== Course Card ================== */
function CourseCard({ course, user }: { course: CourseBundle; user: MinimalUser }) {
  const enrollHref = user
    ? `/user/upgrade-course?packageId=${encodeURIComponent(course.id)}`
    : `/signup?packageId=${encodeURIComponent(course.id)}`;
  const enrollText = user ? "Upgrade Now" : "Enroll Now";

  const subTitles = course.subCourses || [];
  const extra = Math.max(0, subTitles.length - 4);

  const price = Number(course.price || 0);
  const affiliateEarn = Math.floor((price * AFFILIATE_PCT) / 100);
  const buyerCashback = Math.floor((price * CASHBACK_PCT) / 100);

  const coverSrc =
    course.imageUrl?.trim() ? course.imageUrl : "/images/course-fallback.jpg";

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {/* Cover */}
      <div className="relative h-48 w-full">
        <Image
          src={coverSrc}
          alt={course.name}
          fill
          sizes="(max-width: 1024px) 100vw, 33vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 via-transparent to-transparent" />
        {(course.badge || course.highlight) && (
          <div className="absolute top-4 right-4">
            <span
              className={[
                "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white shadow-md",
                course.highlight ? "bg-indigo-600" : "bg-slate-800/80",
              ].join(" ")}
            >
              {course.badge || "Popular"}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold text-slate-900">{course.name}</h3>

        {/* Sub-courses chips */}
        {!!subTitles.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {subTitles.slice(0, 4).map((title, idx) => (
              <span
                key={`${title}-${idx}`}
                className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
              >
                {title}
              </span>
            ))}
            {extra > 0 && (
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">
                +{extra} more
              </span>
            )}
          </div>
        )}

        {/* Price */}
        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-3xl font-extrabold tracking-tight">
            Rs {price.toLocaleString()}
          </span>
          <span className="text-sm text-slate-500">/ lifetime</span>
        </div>

        {/* Payout + Cashback */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="inline-flex items-center justify-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200">
            Affiliate Earn: Rs {affiliateEarn.toLocaleString()}
          </div>
          <div className="inline-flex items-center justify-center gap-1 rounded-full bg-sky-50 px-2 py-1 font-semibold text-sky-700 ring-1 ring-sky-200">
            Cashback: Rs {buyerCashback.toLocaleString()}
          </div>
        </div>

        {/* Perks */}
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <ShieldIcon className="h-4 w-4 text-indigo-600" /> Lifetime Access
          </span>
          <span className="inline-flex items-center gap-1">
            <StarIcon className="h-4 w-4 text-amber-500" /> Mentor Support
          </span>
        </div>

        {/* CTA */}
        <div className="mt-6">
          <Link
            href={enrollHref}
            className={[
              "inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold shadow-sm transition",
              course.highlight
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100",
            ].join(" ")}
          >
            {enrollText}
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ================== Why Us ================== */
function WhyUs() {
  const items = [
    {
      title: "Project-first",
      desc: "Build portfolio-worthy projects while you learn.",
      icon: LightningIcon,
      color: "from-indigo-500 to-fuchsia-500",
    },
    {
      title: "Mentor Support",
      desc: "Get feedback and stay unblocked with expert help.",
      icon: UsersIcon,
      color: "from-emerald-500 to-teal-500",
    },
    {
      title: "Career Ready",
      desc: "From sub-courses to full tracks that map to real roles.",
      icon: ShieldIcon,
      color: "from-amber-500 to-orange-500",
    },
    {
      title: "Lifetime Access",
      desc: "Rewatch lessons and updates anytime.",
      icon: ClockIcon,
      color: "from-violet-500 to-indigo-500",
    },
  ];

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mx-auto max-w-3xl text-center">
        <h3 className="text-2xl font-extrabold sm:text-3xl">Why learn with {BRAND}?</h3>
        <p className="mt-2 text-slate-600">
          Structured Courses built from focused Sub-courses, designed for real outcomes.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <div
            key={it.title}
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <div
              className={`inline-flex rounded-full bg-gradient-to-r ${it.color} px-3 py-1 text-xs font-bold text-white shadow-sm`}
            >
              {it.title}
            </div>
            <p className="mt-3 text-sm text-slate-600">{it.desc}</p>
            <div className="pointer-events-none absolute -right-3 -bottom-3 opacity-20 transition group-hover:opacity-30">
              <it.icon className="h-16 w-16 text-slate-400" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================== Small Components ================== */
function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-3 shadow-sm ring-1 ring-slate-200 backdrop-blur">
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-600">{label}</div>
    </div>
  );
}

/* ================== Icons ================== */
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
    <svg viewBox="0 0 20 20" aria-hidden fill="currentColor" {...props}>
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0L3.293 9.207a1 1 0 011.414-1.414l3.043 3.043 6.543-6.543a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2l8 4v6c0 5-3.5 9.74-8 10-4.5-.26-8-5-8-10V6l8-4z" />
    </svg>
  );
}
function StarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2l2.9 6.1L22 9.2l-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 7.1-1.1L12 2z" />
    </svg>
  );
}
function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}
function LightningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}
function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M16 11c1.93 0 3.5-1.79 3.5-4S17.93 3 16 3s-3.5 1.79-3.5 4 1.57 4 3.5 4zM8 11c1.93 0 3.5-1.79 3.5-4S9.93 3 8 3 4.5 4.79 4.5 7 6.07 11 8 11zm8 2c-2.33 0-7 1.17-7 3.5V20h14v-3.5C23 14.17 18.33 13 16 13zM8 13c-.29 0-.62.02-.97.05C4.68 13.27 3 14.28 3 15.5V20h5v-3.5c0-1.48.99-2.52 2.4-3.2C9.67 13.12 8.81 13 8 13z" />
    </svg>
  );
}
function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2a10 10 0 1010 10A10.011 10.011 0 0012 2zm1 11h4v-2h-2V7h-2v6z" />
    </svg>
  );
}