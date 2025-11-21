"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { database, auth } from "@/lib/firebase";
import { ref as dbRef, get, onValue, set } from "firebase/database";
import type { SVGProps } from "react";

/* ================== Types ================== */
type Video = { id: string; title: string; url: string };
type VideosMap = { [key: string]: Omit<Video, "id"> };
type Course = { id: string; title: string; videos?: VideosMap };
type Package = {
  id: string;
  name: string;
  imageUrl?: string;
  courseIds?: { [key: string]: boolean };
};
type PackagesDb = Record<string, Omit<Package, "id"> | undefined>;
type CoursesDb = Record<string, Omit<Course, "id"> | undefined>;
type SpecialAccess = {
  active?: boolean;
  enabled?: boolean;
  packageId?: string;
  commissionPercent?: number;
};

type UserNode = {
  name?: string;
  email?: string;
  phone?: string;
  ownedCourseIds?: Record<string, boolean>;
  courseId?: string; // legacy
  specialAccess?: SpecialAccess | null;
  progress?: Record<string, Record<string, boolean>>;
  certificates?: Record<
    string,
    {
      certificateId: string;
      courseTitle: string;
      issuedAt: string;
      recipientName?: string; // to lock the name used on the certificate
    }
  >;
};

/* ================== Helpers ================== */
function getYouTubeId(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch {}
  return null;
}

declare global {
  interface Window {
    html2canvas?: (el: HTMLElement, opts?: any) => Promise<HTMLCanvasElement>;
  }
}

async function loadScript(src: string) {
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load script: " + src));
    document.head.appendChild(s);
  });
}

// Allow DOM to paint before capture
function waitForNextFrame() {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve())
  );
}

// Ensure all images inside a node are loaded to avoid blank captures
async function ensureImagesLoaded(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((res) => {
        const done = () => {
          img.removeEventListener("load", done);
          img.removeEventListener("error", done);
          res();
        };
        img.addEventListener("load", done);
        img.addEventListener("error", done);
      });
    })
  );
}

/* ================== Component ================== */
export default function StudyPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("Student");
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [userPhone, setUserPhone] = useState<string | undefined>(undefined);

  const [specialAccess, setSpecialAccess] = useState<SpecialAccess | null>(
    null
  );
  const [ownedPackageIds, setOwnedPackageIds] = useState<string[]>([]);
  const [legacyPackageId, setLegacyPackageId] = useState<string | null>(null);

  const [packagesMap, setPackagesMap] = useState<Record<string, Package>>({});
  const [coursesMap, setCoursesMap] = useState<Record<string, Course>>({});

  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(
    null
  );
  const [selectedSubCourseId, setSelectedSubCourseId] = useState<string | null>(
    null
  );
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  const [progress, setProgress] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [certificates, setCertificates] =
    useState<UserNode["certificates"]>({});
  const [loading, setLoading] = useState(true);

  const [showCertModal, setShowCertModal] = useState(false);
  const certRef = useRef<HTMLDivElement | null>(null);

  // Auth + live user node
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (cu) => {
      if (!cu) {
        setLoading(false);
        return;
      }
      setUserId(cu.uid);

      const userRef = dbRef(database, `users/${cu.uid}`);
      const off = onValue(
        userRef,
        (snap) => {
          const val = (snap.val() || {}) as UserNode;
          setUserName(val?.name || cu.email || "Student");
          setUserEmail(val?.email || cu.email || undefined);
          setUserPhone(val?.phone || undefined);
          setSpecialAccess(val?.specialAccess || null);
          setProgress(val?.progress || {});
          setCertificates(val?.certificates || {});
          const owned = Object.entries(val?.ownedCourseIds || {})
            .filter(([, v]) => !!v)
            .map(([id]) => id);
          setOwnedPackageIds(owned);
          setLegacyPackageId(val?.courseId || null);
          setLoading(false);
        },
        () => setLoading(false)
      );

      return () => off();
    });
    return () => unsub();
  }, []);

  // Load all packages and sub-courses once
  useEffect(() => {
    const load = async () => {
      try {
        const [pSnap, cSnap] = await Promise.all([
          get(dbRef(database, "packages")),
          get(dbRef(database, "courses")),
        ]);
        const pVal = (pSnap.val() as PackagesDb) || {};
        const cVal = (cSnap.val() as CoursesDb) || {};

        const pMap: Record<string, Package> = {};
        Object.entries(pVal).forEach(([id, v]) => {
          if (!v) return;
          pMap[id] = { id, ...v, name: v.name || "Untitled Course" };
        });

        const cMap: Record<string, Course> = {};
        Object.entries(cVal).forEach(([id, v]) => {
          if (!v) return;
          cMap[id] = {
            id,
            title: v.title || "Untitled Sub-course",
            videos: v.videos || {},
          };
        });

        setPackagesMap(pMap);
        setCoursesMap(cMap);
      } catch (e) {
        console.error("Failed to load packages/courses:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Build accessible package ids
  const accessiblePackageIds = useMemo(() => {
    const specialActive = !!(
      specialAccess &&
      (specialAccess.active ?? specialAccess.enabled) &&
      specialAccess.packageId
    );
    if (specialActive) {
      return Object.keys(packagesMap);
    }
    const ids = new Set<string>(ownedPackageIds);
    if (legacyPackageId) ids.add(legacyPackageId);
    return Array.from(ids);
  }, [specialAccess, packagesMap, ownedPackageIds, legacyPackageId]);

  // Ensure selection is valid
  useEffect(() => {
    if (accessiblePackageIds.length === 0) {
      setSelectedPackageId(null);
      setSelectedSubCourseId(null);
      setSelectedVideo(null);
      return;
    }
    setSelectedPackageId((prev) =>
      prev && accessiblePackageIds.includes(prev) ? prev : accessiblePackageIds[0] || null
    );
  }, [accessiblePackageIds]);

  // When package changes, set first sub-course and first video
  useEffect(() => {
    if (!selectedPackageId) {
      setSelectedSubCourseId(null);
      setSelectedVideo(null);
      return;
    }
    const pkg = packagesMap[selectedPackageId];
    const subIds = Object.keys(pkg?.courseIds || {});
    if (subIds.length === 0) {
      setSelectedSubCourseId(null);
      setSelectedVideo(null);
      return;
    }
    setSelectedSubCourseId((prev) => (prev && subIds.includes(prev) ? prev : subIds[0]));
  }, [selectedPackageId, packagesMap]);

  useEffect(() => {
    if (!selectedSubCourseId) {
      setSelectedVideo(null);
      return;
    }
    const sc = coursesMap[selectedSubCourseId];
    const vids = Object.entries(sc?.videos || {});
    if (vids.length === 0) {
      setSelectedVideo(null);
      return;
    }
    const [id, v] = vids[0];
    setSelectedVideo((prev) => prev ?? { id, title: v.title, url: v.url });
  }, [selectedSubCourseId, coursesMap]);

  // Derived data
  const currentVideoId = useMemo(
    () => (selectedVideo ? getYouTubeId(selectedVideo.url) : null),
    [selectedVideo]
  );
  const selectedPackage = useMemo(
    () => (selectedPackageId ? packagesMap[selectedPackageId] : null),
    [selectedPackageId, packagesMap]
  );
  const selectedSubCourse = useMemo(
    () => (selectedSubCourseId ? coursesMap[selectedSubCourseId] : null),
    [selectedSubCourseId, coursesMap]
  );

  const selectedSubCourseVideoList = useMemo(() => {
    if (!selectedSubCourse?.videos) return [];
    return Object.entries(selectedSubCourse.videos).map(([id, v]) => ({
      id,
      title: v.title,
      url: v.url,
    }));
  }, [selectedSubCourse]);

  // Package completion
  const packageCompletion = useMemo(() => {
    if (!selectedPackage)
      return { total: 0, done: 0, pct: 0, completed: false };
    const subIds = Object.keys(selectedPackage.courseIds || {});
    let total = 0;
    let done = 0;
    subIds.forEach((cid) => {
      const vids = Object.keys(coursesMap[cid]?.videos || {});
      total += vids.length;
      const doneHere = Object.keys(progress[cid] || {}).filter(
        (vid) => progress[cid]?.[vid]
      ).length;
      done += Math.min(doneHere, vids.length);
    });
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct, completed: total > 0 && done >= total };
  }, [selectedPackage, progress, coursesMap]);

  const toggleVideoCompleted = async (subCourseId: string, videoId: string) => {
    if (!userId) return;
    const current = !!progress?.[subCourseId]?.[videoId];
    try {
      await set(
        dbRef(
          database,
          `users/${userId}/progress/${subCourseId}/${videoId}`
        ),
        !current
      );
    } catch (e) {
      console.error("Failed to update progress:", e);
    }
  };

  /* ================== Certificate Logic ================== */

  // Build current certificate (locked after first save)
  const activeCertificate = useMemo(() => {
    if (!selectedPackage) return null;
    const existing = certificates?.[selectedPackage.id];
    if (existing) {
      return {
        ...existing,
        recipientName: existing.recipientName || userName,
        isNew: false,
      } as {
        certificateId: string;
        courseTitle: string;
        issuedAt: string;
        recipientName: string;
        isNew: boolean;
      };
    }
    return {
      certificateId: `${selectedPackage.id}-${userId?.slice(
        0,
        6
      )}-${Date.now()}`,
      courseTitle: selectedPackage.name,
      issuedAt: new Date().toISOString(),
      recipientName: userName,
      isNew: true,
    } as {
      certificateId: string;
      courseTitle: string;
      issuedAt: string;
      recipientName: string;
      isNew: boolean;
    };
  }, [selectedPackage, certificates, userName, userId]);

  const displayDate = useMemo(() => {
    if (!activeCertificate) return "";
    return new Date(activeCertificate.issuedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [activeCertificate]);

  // Certificate download (one-time issue, multi-download)
  const downloadCertificatePNG = async () => {
    if (!certRef.current || !selectedPackage || !userId || !activeCertificate)
      return;
    try {
      if (!window.html2canvas) {
        await loadScript(
          "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"
        );
      }

      await ensureImagesLoaded(certRef.current);
      await waitForNextFrame();

      // Persist only the first time (locks name, course, date)
      if (activeCertificate.isNew) {
        await set(
          dbRef(
            database,
            `users/${userId}/certificates/${selectedPackage.id}`
          ),
          {
            certificateId: activeCertificate.certificateId,
            courseTitle: activeCertificate.courseTitle,
            issuedAt: activeCertificate.issuedAt,
            recipientName: activeCertificate.recipientName,
          }
        );
      }

      const canvas = await window.html2canvas!(certRef.current, {
        backgroundColor: "#fbf7f0",
        scale: 3,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });

      const filename = `certificate-${selectedPackage.name
        .replace(/[^a-z0-9]/gi, "-")
        .toLowerCase()}.png`;

      const data = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = data;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("Certificate download failed:", e);
      alert("Could not generate certificate. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600 mx-auto" />
          <p className="mt-3 text-slate-600">Loading your courses...</p>
        </div>
      </div>
    );
  }

  if (accessiblePackageIds.length === 0) {
    return (
      <div className="text-center p-8 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-slate-900">
          No Courses Available
        </h1>
        <p className="mt-2 text-slate-600">
          It looks like you haven’t enrolled in any main course yet.
        </p>
        <Link
          href="/user/upgrade-course"
          className="mt-4 inline-flex items-center rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          Browse Courses
        </Link>
      </div>
    );
  }

  const brand = "Plex Courses";

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16">
      {/* Global fonts for the classical certificate */}
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Great+Vibes&family=Lora:ital,wght@0,400;0,700;1,400&display=swap");
      `}</style>

      {/* Header */}
      <header className="mb-6 flex flex-col gap-2">
        <div className="inline-flex items-center gap-2 self-start rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-200">
          <SparkleIcon className="h-4 w-4" />
          {brand} Study
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          Your Learning Space
        </h1>
        <p className="text-slate-600">
          Welcome back, {userName.split(" ")[0]}! Complete your lessons and
          download a beautiful certificate for each course.
        </p>
      </header>

      {/* Layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Player + Info */}
        <section className="lg:col-span-2">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border bg-slate-900 shadow-xl ring-1 ring-slate-200">
            {selectedVideo && currentVideoId ? (
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${currentVideoId}?autoplay=1&rel=0&modestbranding=1`}
                title={selectedVideo.title}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div className="grid h-full place-items-center text-slate-400">
                Select a video to play
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
          </div>

          <div className="mt-5 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900 line-clamp-2">
                  {selectedVideo?.title || "No video selected"}
                </h2>
                <p className="text-sm text-slate-600 mt-0.5">
                  Course: {selectedPackage?.name || "-"} • Sub-course:{" "}
                  {selectedSubCourse?.title || "-"}
                </p>
              </div>
              {selectedSubCourse && selectedVideo && (
                <button
                  onClick={() =>
                    toggleVideoCompleted(selectedSubCourse.id, selectedVideo.id)
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
                >
                  <CheckIcon
                    className={`h-5 w-5 ${
                      progress[selectedSubCourse.id]?.[selectedVideo.id]
                        ? "text-emerald-600"
                        : "text-slate-400"
                    }`}
                  />
                  {progress[selectedSubCourse.id]?.[selectedVideo.id]
                    ? "Completed"
                    : "Mark Completed"}
                </button>
              )}
            </div>
          </div>

          {/* Package certificate card */}
          {selectedPackage && packageCompletion.completed && (
            <div className="mt-6 overflow-hidden rounded-2xl border bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-4 shadow-sm ring-1 ring-amber-200">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <AwardIcon className="h-8 w-8 text-amber-500" />
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Congratulations!
                    </h3>
                    <p className="text-sm text-slate-600">
                      You’ve completed “{selectedPackage.name}”. Generate and
                      download your classical certificate.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCertModal(true)}
                    className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                  >
                    <DownloadIcon className="h-4 w-4" />
                    View Certificate
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Column */}
        <aside className="lg:col-span-1 space-y-5">
          {/* Main course selector */}
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                Your Courses
              </h3>
              {selectedPackage && (
                <span className="text-xs font-semibold text-slate-500">
                  {packageCompletion.pct}%
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
              {accessiblePackageIds.map((pid) => {
                const pkg = packagesMap[pid];
                if (!pkg) return null;
                // Compute progress per package (bar)
                const subIds = Object.keys(pkg.courseIds || {});
                let total = 0;
                let done = 0;
                subIds.forEach((cid) => {
                  const vids = Object.keys(coursesMap[cid]?.videos || {});
                  total += vids.length;
                  done += Object.keys(progress[cid] || {}).filter(
                    (k) => progress[cid]?.[k]
                  ).length;
                });
                const pct =
                  total > 0
                    ? Math.round((Math.min(done, total) / total) * 100)
                    : 0;
                const active = selectedPackageId === pid;

                return (
                  <button
                    key={pid}
                    onClick={() => setSelectedPackageId(pid)}
                    className={`w-full rounded-xl border p-3 text-left transition hover:shadow-sm ${
                      active
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative h-8 w-8 overflow-hidden rounded">
                        {pkg.imageUrl ? (
                          <Image
                            src={pkg.imageUrl}
                            alt={pkg.name}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="h-full w-full bg-slate-200" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div
                          className={`text-sm font-semibold ${
                            active ? "text-indigo-800" : "text-slate-800"
                          }`}
                        >
                          {pkg.name}
                        </div>
                        <div className="mt-1 h-2 w-full rounded-full bg-slate-200">
                          <div
                            className={`h-2 rounded-full ${
                              pct >= 100 ? "bg-emerald-500" : "bg-indigo-500/80"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-slate-500">
                        {pct}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sub-courses for selected package */}
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">Sub-courses</h3>
            <div className="mt-3 grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
              {selectedPackage ? (
                Object.keys(selectedPackage.courseIds || {}).map((cid) => {
                  const sc = coursesMap[cid];
                  if (!sc) return null;
                  const vids = Object.keys(sc.videos || {});
                  const done = Object.keys(progress[cid] || {}).filter(
                    (k) => progress[cid]?.[k]
                  ).length;
                  const pct =
                    vids.length > 0
                      ? Math.round(
                          (Math.min(done, vids.length) / vids.length) * 100
                        )
                      : 0;
                  const active = selectedSubCourseId === cid;
                  return (
                    <button
                      key={cid}
                      onClick={() => setSelectedSubCourseId(cid)}
                      className={`w-full rounded-xl border p-3 text-left transition hover:shadow-sm ${
                        active
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-sm font-semibold ${
                            active ? "text-indigo-800" : "text-slate-800"
                          }`}
                        >
                          {sc.title}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                          {pct}%
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
                        <div
                          className={`h-2 rounded-full ${
                            pct >= 100 ? "bg-emerald-500" : "bg-indigo-500/80"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-md bg-slate-50 p-4 text-center text-sm text-slate-500">
                  No sub-courses.
                </div>
              )}
            </div>
          </div>

          {/* Videos in selected sub-course */}
          <div className="rounded-2xl border bg-white p-3 shadow-sm">
            <h3 className="px-1 text-sm font-semibold text-slate-700">
              {selectedSubCourse?.title || "Videos"}
            </h3>
            <div className="mt-2 space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {selectedSubCourseVideoList.length > 0 ? (
                selectedSubCourseVideoList.map((v) => {
                  const done = !!progress[selectedSubCourse!.id]?.[v.id];
                  const active = selectedVideo?.id === v.id;
                  return (
                    <div
                      key={v.id}
                      className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50"
                    >
                      <button
                        onClick={() =>
                          setSelectedVideo({
                            id: v.id,
                            title: v.title,
                            url: v.url,
                          })
                        }
                        className={`flex-1 text-left text-[13px] ${
                          active
                            ? "text-indigo-700 font-semibold"
                            : "text-slate-700"
                        }`}
                        title={v.title}
                      >
                        {v.title}
                      </button>
                      <button
                        onClick={() =>
                          toggleVideoCompleted(selectedSubCourse!.id, v.id)
                        }
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-slate-200 ${
                          done ? "bg-emerald-100" : "bg-white"
                        }`}
                        title={done ? "Completed" : "Mark as completed"}
                      >
                        <CheckIcon
                          className={`h-4 w-4 ${
                            done ? "text-emerald-600" : "text-slate-400"
                          }`}
                        />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-md bg-slate-50 p-4 text-center text-sm text-slate-500">
                  No videos available.
                </div>
              )}
            </div>
          </div>

          {/* Explore more */}
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">Need more content?</p>
            <Link
              href="/user/upgrade-course"
              className="mt-2 inline-flex items-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Browse Courses
            </Link>
          </div>
        </aside>
      </div>

      {/* ====== Classical Certificate Modal ====== */}
      {showCertModal && selectedPackage && activeCertificate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b px-6 py-4 bg-slate-50 rounded-t-2xl">
              <h3 className="text-lg font-semibold text-slate-800">
                Certificate Preview
              </h3>
              <button
                onClick={() => setShowCertModal(false)}
                className="rounded-full p-1.5 hover:bg-slate-200 text-slate-500"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Certificate Canvas */}
            <div className="flex-1 overflow-auto bg-slate-200/80 p-4 md:p-6 flex justify-center">
              <div
                ref={certRef}
                className="relative overflow-hidden shadow-2xl"
                style={{
                  width: "1200px",
                  height: "800px",
                  backgroundColor: "#fbf7f0",
                  fontFamily: "'Lora', serif",
                }}
              >
                {/* Outer gold borders */}
                <div className="absolute inset-10 border border-[#d4af37]" />
                <div className="absolute inset-16 border border-[#d4af37]/60" />

                {/* Subtle dotted pattern */}
                <div
                  className="absolute inset-16 opacity-25 pointer-events-none"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 1px 1px, rgba(212,175,55,0.35) 1px, transparent 0)",
                    backgroundSize: "18px 18px",
                  }}
                />

                {/* Corner line ornaments */}
                <div className="absolute top-20 left-20 text-[#d4af37]">
                  <div className="h-[2px] w-24 bg-current mb-1" />
                  <div className="h-[2px] w-20 bg-current mb-1" />
                  <div className="h-[2px] w-16 bg-current" />
                </div>
                <div className="absolute bottom-20 left-20 text-[#d4af37]">
                  <div className="h-[2px] w-16 bg-current mb-1" />
                  <div className="h-[2px] w-20 bg-current mb-1" />
                  <div className="h-[2px] w-24 bg-current" />
                </div>
                <div className="absolute top-20 right-20 text-[#d4af37] text-right">
                  <div className="h-[2px] w-24 bg-current mb-1 ml-auto" />
                  <div className="h-[2px] w-20 bg-current mb-1 ml-auto" />
                  <div className="h-[2px] w-16 bg-current ml-auto" />
                </div>
                <div className="absolute bottom-20 right-20 text-[#d4af37] text-right">
                  <div className="h-[2px] w-16 bg-current mb-1 ml-auto" />
                  <div className="h-[2px] w-20 bg-current mb-1 ml-auto" />
                  <div className="h-[2px] w-24 bg-current ml-auto" />
                </div>

                {/* Gold diagonal accents (right side) */}
                <div className="absolute -right-40 -bottom-40 w-96 h-96 bg-gradient-to-br from-[#f6e3ba] via-[#d4af37] to-[#7a5a2a] rotate-45" />
                <div className="absolute -right-64 bottom-10 w-96 h-96 bg-gradient-to-br from-[#4b3b21] via-[#b88a3b] to-[#f7e8c8] rotate-45 opacity-80" />

                {/* Content */}
                <div className="relative z-10 h-full flex flex-col items-center px-32 py-20 text-center">
                  {/* Top heading */}
                  <p className="text-xs tracking-[0.35em] uppercase text-[#b08b3a] font-semibold">
                    {brand}
                  </p>
                  <h1
                    className="mt-6 text-5xl md:text-6xl font-bold tracking-[0.35em] text-slate-900 uppercase"
                    style={{ fontFamily: "'Cinzel', serif" }}
                  >
                    Certificate
                  </h1>
                  <p
                    className="mt-4 text-xl md:text-2xl tracking-[0.4em] uppercase text-[#c79b3b]"
                    style={{ fontFamily: "'Cinzel', serif" }}
                  >
                    of Completion
                  </p>

                  <div className="mt-6 flex flex-col items-center">
                    <div className="h-[1px] w-32 bg-[#c79b3b]" />
                    <div className="h-[3px] w-16 bg-[#c79b3b] mt-1" />
                  </div>

                  <p className="mt-8 text-xs md:text-sm tracking-[0.35em] text-slate-600 uppercase">
                    This certificate is proudly presented to
                  </p>

                  {/* Recipient name in cursive italic */}
                  <div className="mt-6 border-b border-[#c79b3b] pb-3 px-16">
                    <p
                      className="text-4xl md:text-5xl text-slate-900 italic"
                      style={{
                        fontFamily:
                          "'Great Vibes', 'Brush Script MT', cursive",
                      }}
                    >
                      {activeCertificate.recipientName}
                    </p>
                  </div>

                  {/* Description */}
                  <p className="mt-6 text-sm md:text-base text-slate-700 max-w-3xl leading-relaxed">
                    This certificate is awarded to{" "}
                    <span className="font-semibold">
                      {activeCertificate.recipientName}
                    </span>{" "}
                    for successfully completing the online course{" "}
                    <span className="font-semibold">
                      “{activeCertificate.courseTitle}”.
                    </span>{" "}
                    Your dedication, persistence, and commitment to learning are
                    truly commendable. Congratulations on this outstanding
                    achievement.
                  </p>

                  {/* Bottom section */}
                  <div className="mt-auto w-full pt-10">
                    {/* Small divider */}
                    <div className="flex items-center justify-center gap-10 mb-10">
                      <div className="h-[1px] w-32 bg-[#c79b3b]" />
                      <span className="text-[#c79b3b] text-xs tracking-[0.3em] uppercase">
                        Award of Excellence
                      </span>
                      <div className="h-[1px] w-32 bg-[#c79b3b]" />
                    </div>

                    <div className="flex items-end justify-between gap-10">
                      {/* Left signature */}
                      <div className="flex-1 text-left">
                        <div className="h-px w-40 bg-slate-400 mb-2" />
                        <p className="text-sm font-semibold text-slate-800">
                          Plex Courses
                        </p>
                        <p className="text-xs text-slate-500">
                          Head of Learning
                        </p>
                      </div>

                      {/* Laurel / award icon */}
                      <div className="flex-1 flex flex-col items-center justify-center">
                        <AwardIcon className="h-16 w-16 text-[#c79b3b]" />
                      </div>

                      {/* Right signature */}
                      <div className="flex-1 text-right">
                        <div className="h-px w-40 ml-auto bg-slate-400 mb-2" />
                        <p className="text-sm font-semibold text-slate-800">
                          {brand} Mentor
                        </p>
                        <p className="text-xs text-slate-500">
                          Course Instructor
                        </p>
                      </div>
                    </div>

                    {/* Footer ID */}
                    <div className="mt-8 text-[10px] text-slate-500 tracking-[0.3em] uppercase text-center">
                      ID: {activeCertificate.certificateId} • Issued{" "}
                      {displayDate}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t p-3 bg-white rounded-b-2xl">
              <button
                onClick={() => setShowCertModal(false)}
                className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
              <button
                onClick={downloadCertificatePNG}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                <DownloadIcon className="h-4 w-4" />
                Download PNG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================== Icons ================== */
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
function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden fill="currentColor" {...props}>
      <path d="M3 15a1 1 0 001 1h12a1 1 0 001-1v-2h-2v1H5v-1H3v2zm7-12a1 1 0 00-1 1v7.586l-2.293-2.293-1.414 1.414L10 15.414l4.707-4.707-1.414-1.414L11 11.586V4a1 1 0 00-1-1z" />
    </svg>
  );
}
function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      fill="currentColor"
      {...props}
    >
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
function AwardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="currentColor" {...props}>
      <path d="M12 2a7 7 0 00-7 7c0 3.866 3.134 7 7 7s7-3.134 7-7a7 7 0 00-7-7zm-5 7a5 5 0 1110 0 5 5 0 01-10 0z" />
      <path d="M8 15l-3 7 7-3 7 3-3-7" />
    </svg>
  );
}