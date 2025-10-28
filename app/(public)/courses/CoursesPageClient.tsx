"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent, type ChangeEvent } from "react";
import { database } from "@/lib/firebase";
import { ref, get } from "firebase/database";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
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

export default function CoursesPageClient({ initialQuery = "" }: { initialQuery?: string }) {
  const [allCourses, setAllCourses] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Router (no useSearchParams here)
  const router = useRouter();
  const [query, setQuery] = useState<string>(initialQuery);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const packagesRef = ref(database, "packages");
        const coursesRef = ref(database, "courses");
        const [packagesSnapshot, coursesSnapshot] = await Promise.all([get(packagesRef), get(coursesRef)]);
        const packagesData = (packagesSnapshot.val() as PackagesMapRaw | null) ?? {};
        const coursesData = (coursesSnapshot.val() as CoursesMap | null) ?? {};

        const enriched: Package[] = Object.entries(packagesData).map(([id, pkg]) => {
          const featureList = pkg.courseIds
            ? Object.keys(pkg.courseIds).map((courseId) => coursesData[courseId]?.title || "Unknown Sub-course")
            : pkg.features ?? [];
          return { id, ...pkg, features: featureList };
        });

        setAllCourses(enriched);
      } catch (error) {
        console.error("Failed to fetch content:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const onSubmitSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/courses?search=${encodeURIComponent(q)}`);
    else router.push(`/courses`);
  };

  const filteredCourses = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return allCourses;
    return allCourses.filter((p) => {
      const inName = p.name?.toLowerCase().includes(q);
      const inBadge = p.badge?.toLowerCase().includes(q);
      const inFeatures = (p.features || []).some((f) => f.toLowerCase().includes(q));
      return inName || inBadge || inFeatures;
    });
  }, [allCourses, query]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 antialiased">
      <section id="courses" className="bg-white scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-14 md:pb-16 md:pt-20">
          <header className="mx-auto max-w-4xl text-center">
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Explore Courses</h1>
            <p className="mt-4 text-lg text-slate-600">
              Pick a complete learning path made of focused sub-courses.
            </p>

            {/* Search bar */}
            <form onSubmit={onSubmitSearch} className="mx-auto mt-6 flex max-w-xl items-center gap-2">
              <div className="relative flex-1">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
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

            {/* Results info */}
            <p className="mt-3 text-sm text-slate-500">
              {loading
                ? "Loading courses..."
                : `Showing ${filteredCourses.length} result${filteredCourses.length === 1 ? "" : "s"}${query ? ` for “${query.trim()}”` : ""}`}
            </p>
          </header>

          <CoursesGrid plans={filteredCourses} loading={loading} user={user ? { uid: user.uid } : null} />
        </div>
      </section>
    </main>
  );
}

function CoursesGrid({ plans, loading, user }: { plans: Package[]; loading: boolean; user: MinimalUser }) {
  if (loading) return <div className="p-8 text-center text-slate-500">Loading courses...</div>;

  if (!plans.length) {
    return (
      <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
        No courses found. Try a different search term.
      </div>
    );
  }

  const buttonHref = user ? "/user/upgrade-course" : "/login";
  const buttonText = user ? "Upgrade Now" : "Enroll Now";

  return (
    <div className="mx-auto mt-10 grid max-w-7xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((p) => (
        <article
          key={p.id}
          className={[
            "relative flex flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition-shadow duration-300",
            p.highlight ? "ring-2 ring-sky-500" : "hover:shadow-lg",
          ].join(" ")}
        >
          {p.badge && (
            <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
              <span className="rounded-full bg-sky-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm">
                {p.badge}
              </span>
            </div>
          )}
          <div className="relative h-48 w-full">
            {p.imageUrl && (
              <Image src={p.imageUrl} alt={p.name} fill className="rounded-t-2xl object-cover" />
            )}
          </div>
          <div className="flex flex-grow flex-col p-6">
            <h3 className="text-xl font-bold text-slate-900">{p.name}</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tracking-tight">Rs {(p.price || 0).toLocaleString()}</span>
              <span className="text-sm text-slate-500">/ lifetime</span>
            </div>

            {!!p.features?.length && (
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {p.features.map((f, idx) => (
                  <li key={`${f}-${idx}`} className="flex items-start gap-3">
                    <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-8">
              <Link
                href={buttonHref}
                className={[
                  "inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold shadow-sm transition",
                  p.highlight ? "bg-sky-600 text-white hover:bg-sky-700" : "bg-sky-50 text-sky-800 hover:bg-sky-100",
                ].join(" ")}
              >
                {buttonText}
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
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

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden {...props}>
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
        clipRule="evenodd"
      />
    </svg>
  );
}