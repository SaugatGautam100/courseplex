"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { database } from "@/lib/firebase";
import { ref, get } from "firebase/database";
import { useAuth } from "@/hooks/useAuth";
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

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const packagesRef = ref(database, "packages");
        const coursesRef = ref(database, "courses");
        const [packagesSnapshot, coursesSnapshot] = await Promise.all([get(packagesRef), get(coursesRef)]);
        const packagesData = (packagesSnapshot.val() as PackagesMapRaw | null) ?? {};
        const coursesData = (coursesSnapshot.val() as CoursesMap | null) ?? {};

        const enrichedPackages: Package[] = Object.entries(packagesData).map(([id, pkg]) => {
          const featureList = pkg.courseIds
            ? Object.keys(pkg.courseIds).map((courseId) => coursesData[courseId]?.title || "Unknown Course")
            : [];
          return { id, ...pkg, features: featureList };
        });
        setPackages(enrichedPackages);
      } catch (error) {
        console.error("Failed to fetch content:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 antialiased">
      <section id="packages" className="bg-white scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-14 md:pb-16 md:pt-20">
          <header className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Our Course Packages</h1>
            <p className="mt-4 text-lg text-slate-600">
              Find the perfect plan to launch and grow your digital marketing career.
            </p>
          </header>
          <PricingGrid plans={packages} loading={loading} user={user ? { uid: user.uid } : null} />
        </div>
      </section>
    </main>
  );
}

function PricingGrid({ plans, loading, user }: { plans: Package[]; loading: boolean; user: MinimalUser }) {
  if (loading) return <div className="p-8 text-center text-slate-500">Loading packages...</div>;

  const buttonHref = user ? "/user/upgrade-course" : "/login";
  const buttonText = user ? "Upgrade Now" : "Enroll Now";

  return (
    <div className="mx-auto mt-12 grid max-w-7xl gap-8 md:mt-16 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((p) => (
        <article
          key={p.id}
          className={[
            "relative flex flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition-shadow duration-300",
            p.highlight ? "ring-2 ring-sky-500" : "hover:shadow-lg",
          ].join(" ")}
        >
          {p.badge && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
              <span className="rounded-full bg-sky-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm">
                {p.badge}
              </span>
            </div>
          )}
          <div className="relative h-48 w-full">
            {p.imageUrl && <Image src={p.imageUrl} alt={p.name} fill className="object-cover rounded-t-2xl" />}
          </div>
          <div className="p-6 flex flex-col flex-grow">
            <h3 className="text-xl font-bold text-slate-900">{p.name}</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tracking-tight">Rs {(p.price || 0).toLocaleString()}</span>
              <span className="text-sm text-slate-500">/ lifetime</span>
            </div>
            <ul className="mt-6 space-y-3 text-sm text-slate-700 flex-grow">
              {p.features?.map((f) => (
                <li key={f} className="flex items-start gap-3">
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