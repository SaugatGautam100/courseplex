"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { database, auth } from "@/lib/firebase";
import { ref as dbRef, get, onValue } from "firebase/database";
import type { SVGProps } from "react";

// Types
type Video = { id: string; title: string; url: string };
type Course = { id: string; title: string; videos?: { [key: string]: Omit<Video, "id"> } };
type Package = { id: string; name: string; imageUrl?: string; courseIds?: { [key: string]: boolean } };
type PackagesDb = Record<string, Omit<Package, "id"> | undefined>;
type SpecialAccess = { active?: boolean; enabled?: boolean; packageId?: string; commissionPercent?: number };

function getYouTubeId(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch {
    // ignore invalid URL
  }
  return null;
}

export default function StudyPage() {
  const [enrolledPackage, setEnrolledPackage] = useState<Package | null>(null);
  const [specialAccess, setSpecialAccess] = useState<SpecialAccess | null>(null);
  const [specialPackage, setSpecialPackage] = useState<Package | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (currentUser) => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      // Live listen to user node for special access and course changes
      const userRef = dbRef(database, `users/${currentUser.uid}`);
      const unsubUser = onValue(
        userRef,
        async (snap) => {
          const userVal = snap.val() || {};
          const userCourseId: string | undefined = userVal?.courseId || undefined;
          const userSpecial: SpecialAccess | null = userVal?.specialAccess || null;

          setSpecialAccess(userSpecial);

          // Determine if special access is active.
          // It's active if `active` is true OR `enabled` is true (for legacy compatibility) AND a `packageId` exists.
          const isSpecialActive = !!(
            userSpecial &&
            (userSpecial.active ?? userSpecial.enabled) &&
            userSpecial.packageId
          );

          try {
            setLoading(true);

            if (isSpecialActive) {
              // Load and display all courses for special access.
              const coursesSnap = await get(dbRef(database, "courses"));
              const coursesObj = (coursesSnap.val() || {}) as Record<string, Omit<Course, "id">>;
              const allCourses: Course[] = Object.entries(coursesObj).map(([id, v]) => ({ id, ...v }));
              setCourses(allCourses);

              // Fetch the special package details to display its name.
              // It might be in /packages or /specialPackages. Try /packages first.
              const specialPkgSnap = await get(dbRef(database, `packages/${userSpecial!.packageId}`));
              if (specialPkgSnap.exists()) {
                const pv = specialPkgSnap.val() as Omit<Package, "id">;
                setSpecialPackage({ id: userSpecial!.packageId!, ...pv });
              } else {
                // Fallback to /specialPackages if not found in /packages.
                const fallbackSnap = await get(dbRef(database, `specialPackages/${userSpecial!.packageId}`));
                if (fallbackSnap.exists()) {
                  const pv = fallbackSnap.val() as Omit<Package, "id">;
                  setSpecialPackage({ id: userSpecial!.packageId!, ...pv });
                } else {
                  setSpecialPackage(null);
                }
              }

              // The enrolled package is the special package when active.
              setEnrolledPackage(specialPackage);

              // Preselect the first course and its first video.
              if (allCourses.length > 0) {
                const firstCourse = allCourses[0];
                setSelectedCourse(firstCourse);
                const firstVideoKey = Object.keys(firstCourse.videos || {})[0];
                if (firstVideoKey) {
                  const v = firstCourse.videos![firstVideoKey];
                  setSelectedVideo({ id: firstVideoKey, title: v.title, url: v.url });
                } else {
                  setSelectedVideo(null);
                }
              } else {
                setSelectedCourse(null);
                setSelectedVideo(null);
              }
            } else if (userCourseId) {
              // Normal path: show courses from the user's purchased package.
              const pkgSnap = await get(dbRef(database, `packages/${userCourseId}`));
              if (!pkgSnap.exists()) {
                setEnrolledPackage(null);
                setCourses([]);
                setSelectedCourse(null);
                setSelectedVideo(null);
                setSpecialPackage(null);
                setLoading(false);
                return;
              }

              const pkgVal = pkgSnap.val() as Omit<Package, "id">;
              const pkg: Package = { id: userCourseId, ...pkgVal };
              setEnrolledPackage(pkg);
              setSpecialPackage(null);

              const courseIds = Object.keys(pkg.courseIds || {});
              if (courseIds.length === 0) {
                setCourses([]);
                setSelectedCourse(null);
                setSelectedVideo(null);
                setLoading(false);
                return;
              }

              const courseSnaps = await Promise.all(
                courseIds.map((cid) => get(dbRef(database, `courses/${cid}`)))
              );

              const coursesArray: Course[] = courseSnaps
                .filter((s) => s.exists())
                .map((s, i) => {
                  const id = courseIds[i];
                  return { id, ...(s.val() as Omit<Course, "id">) };
                });

              setCourses(coursesArray);

              // Preselect the first course and its first video.
              if (coursesArray.length > 0) {
                const firstCourse = coursesArray[0];
                setSelectedCourse(firstCourse);
                const firstVideoKey = Object.keys(firstCourse.videos || {})[0];
                if (firstVideoKey) {
                  const v = firstCourse.videos![firstVideoKey];
                  setSelectedVideo({ id: firstVideoKey, title: v.title, url: v.url });
                } else {
                  setSelectedVideo(null);
                }
              } else {
                setSelectedCourse(null);
                setSelectedVideo(null);
              }
            } else {
              // No package and no special access.
              setEnrolledPackage(null);
              setSpecialPackage(null);
              setCourses([]);
              setSelectedCourse(null);
              setSelectedVideo(null);
            }
          } catch (e) {
            console.error("Failed to load study content:", e);
          } finally {
            setLoading(false);
          }
        },
        () => setLoading(false)
      );

      return () => unsubUser();
    });

    return () => unsubAuth();
  }, []);

  const currentVideoId = useMemo(
    () => (selectedVideo ? getYouTubeId(selectedVideo.url) : null),
    [selectedVideo]
  );

  if (loading) {
    return <p className="p-8 text-center text-slate-500">Loading your courses...</p>;
  }

  // If no package and no special access, prompt the user.
  if (!enrolledPackage && !specialPackage) {
    return (
      <div className="text-center p-8">
        <p className="text-slate-700">You are not enrolled in any course.</p>
        <Link href="/packages" className="mt-4 inline-block rounded-md bg-sky-600 px-4 py-2 text-white">
          Explore Packages
        </Link>
      </div>
    );
  }

  // Determine the header title and whether to show the special access badge.
  const headerTitle = specialPackage
    ? `All Courses (Special Access${specialPackage.name ? ` — ${specialPackage.name}` : ""})`
    : enrolledPackage?.name || "My Courses";
  const showSpecialBadge = !!specialPackage;

  return (
    <div>
      {/* Header */}
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-slate-900">{headerTitle}</h1>
        {showSpecialBadge && (
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-fuchsia-100 px-3 py-1 text-sm font-semibold text-fuchsia-700">
            <StarIcon className="h-4 w-4" />
            Special Access Enabled
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Player + Now playing */}
        <div className="lg:col-span-2">
          <div className="aspect-video w-full rounded-lg overflow-hidden shadow-lg bg-black">
            {currentVideoId ? (
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${currentVideoId}?autoplay=1`}
                title={selectedVideo?.title || "Course video"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              ></iframe>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">Select a video to play</div>
            )}
          </div>
          <div className="mt-4">
            <h2 className="text-2xl font-semibold text-slate-800">
              {selectedVideo?.title || "No video selected"}
            </h2>
            <p className="text-slate-600 mt-1">Course: {selectedCourse?.title || "-"}</p>
          </div>
        </div>

        {/* Courses + videos list */}
        <div className="lg:col-span-1 space-y-6">
          {courses.map((course) => (
            <div key={course.id} className="rounded-lg border bg-white shadow-sm overflow-hidden">
              <button
                onClick={() => setSelectedCourse(course)}
                className="w-full text-left p-4 bg-slate-50 border-b font-semibold text-slate-800"
              >
                {course.title}
              </button>
              <div className={`p-2 space-y-1 ${selectedCourse?.id === course.id ? "block" : "hidden"}`}>
                {Object.entries(course.videos || {}).map(([id, video]) => (
                  <button
                    key={id}
                    onClick={() => setSelectedVideo({ id, ...video })}
                    className={`w-full text-left flex items-center gap-3 p-2 rounded-md transition-colors text-sm ${
                      selectedVideo?.id === id ? "bg-sky-100 text-sky-700" : "hover:bg-slate-100"
                    }`}
                  >
                    <PlayIcon
                      className={`h-5 w-5 ${
                        selectedVideo?.id === id ? "text-sky-500" : "text-slate-400"
                      }`}
                    />
                    <span className="flex-1">{video.title}</span>
                  </button>
                ))}
                {Object.keys(course.videos || {}).length === 0 && (
                  <div className="px-2 py-3 text-sm text-slate-500">No videos available for this course.</div>
                )}
              </div>
            </div>
          ))}
          {courses.length === 0 && (
            <div className="rounded-lg border bg-white p-6 text-center text-slate-500">
              No courses available yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Icons
function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden {...props}>
      <path
        fillRule="evenodd"
        d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.98 0l4.25 3.5a.75.75 0 010 1.116l-4.25 3.5a.75.75 0 01-.98-.92L11.49 10 8.39 7.092a.75.75 0 010-.92z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function StarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden {...props}>
      <path
        fillRule="evenodd"
        d="M10.868 2.884c.321-.662 1.134-.662 1.456 0l1.83 3.778 4.167.606c.73.106 1.022.99.494 1.503l-3.014 2.938.712 4.15c.124.726-.638 1.283-1.296.952L10 15.347l-3.732 1.961c-.658.332-1.42-.226-1.296-.952l.712-4.15-3.014-2.938c-.528-.513-.236-1.397.494-1.503l4.167-.606 1.83-3.778z"
        clipRule="evenodd"
      />
    </svg>
  );
}