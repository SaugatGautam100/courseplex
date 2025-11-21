"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ChangeEvent,
} from "react";
import Image from "next/image";
import { database, storage } from "@/lib/firebase";
import {
  ref as dbRef,
  onValue,
  set,
  push,
  update,
  remove,
} from "firebase/database";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  uploadBytesResumable,
} from "firebase/storage";
import type { SVGProps } from "react";

/**
  ADMIN › COURSES
  - Manage Sub-courses (DB: courses)
  - Manage Tutorials (DB: tutorials) with optional video upload
  - Manage Courses (DB: packages) with default commission percent (default 58%)
  - Manage Special Packages (admin-only) and assign to users
  - Select Featured Courses for Homepage (homepage/topPackageIds)
  - Discounts + Reviews controls per public course (packages)
*/

// ========== TYPES ==========
type Video = { title: string; url: string };
type VideosMap = Record<string, Video>;
type Course = { id: string; title: string; videos?: VideosMap }; // DB: courses (sub-courses)
type CourseDB = Omit<Course, "id">;

type Tutorial = { id: string; title: string; url: string; order?: number };
type TutorialDB = Omit<Tutorial, "id">;

type Package = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  courseIds?: Record<string, boolean>;
  highlight: boolean;
  badge: string;
  commissionPercent?: number;

  // Discounts
  discountActive?: boolean;
  discountPercent?: number;
  discountLabel?: string;

  // Reviews
  showRating?: boolean;
  rating?: number;
  ratingCount?: number;
};
type PackageDB = Omit<Package, "id">;

type SpecialPackage = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  commissionPercent: number;
  assignedUserIds?: Record<string, boolean>;
  note?: string;
};
type SpecialPackageDB = Omit<SpecialPackage, "id">;

type CourseInput = { id?: string; title: string; videos: VideosMap };
type TutorialInput = { id?: string; title: string; url: string; order: number };
type PackageInput = {
  id?: string;
  name: string;
  price: number;
  imageUrl: string;
  courseIds: Record<string, boolean>;
  highlight: boolean;
  badge: string;
  commissionPercent: number;

  // Discounts
  discountActive: boolean;
  discountPercent: number;
  discountLabel: string;

  // Reviews
  showRating: boolean;
  rating: number;
  ratingCount: number;
};

type SpecialPackageInput = {
  id?: string;
  name: string;
  price: number;
  imageUrl: string;
  commissionPercent: number;
  assignedUserIds: Record<string, boolean>;
  note?: string;
};

type ModalState =
  | { type: "course"; data: Course | null }
  | { type: "tutorial"; data: Tutorial | null }
  | { type: "package"; data: Package | null }
  | { type: "special"; data: SpecialPackage | null }
  | { type: null; data: null };

type UserLite = { id: string; name: string; email: string; imageUrl?: string };

// =================== VIDEO UPLOADER (for Tutorials) ===================
function VideoUploader({
  onUploadComplete,
}: {
  onUploadComplete: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setError("Please select a valid video file.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    const fileRef = storageRef(storage, `videos/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(fileRef, file, {
      contentType: file.type,
    });

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const prog = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        setProgress(prog);
      },
      (err) => {
        console.error("Upload error:", err);
        setError("Upload failed. Please try again.");
        setUploading(false);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref)
          .then((url) => {
            onUploadComplete(url);
            setUploading(false);
          })
          .catch((err) => {
            console.error("Download URL error:", err);
            setError("Could not get download URL.");
            setUploading(false);
          });
      }
    );

    e.target.value = "";
  };

  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <label
        htmlFor="tutorial-video-upload"
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        Or upload a video file
      </label>
      <input
        id="tutorial-video-upload"
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        disabled={uploading}
        className="text-sm text-slate-700 file:mr-4 file:rounded-md file:bg-white file:px-3 file:py-1.5 file:text-slate-700 hover:file:bg-slate-100 file:shadow-sm file:border file:border-slate-300"
      />
      {uploading && (
        <div className="mt-2">
          <p className="text-sm font-medium text-slate-600">
            Uploading... {progress}%
          </p>
          <div className="mt-1 h-2 w-full rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}

// =================== PAGE: Admin Courses & Packages ===================
export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [specialPackages, setSpecialPackages] = useState<SpecialPackage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modal, setModal] = useState<ModalState>({ type: null, data: null });
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Homepage Featured Courses state
  const [homeTopPkgMap, setHomeTopPkgMap] = useState<Record<string, boolean>>(
    {}
  );
  const [homeTopPkgInitial, setHomeTopPkgInitial] = useState<
    Record<string, boolean>
  >({});
  const [savingTop, setSavingTop] = useState<boolean>(false);
  const [topQuery, setTopQuery] = useState<string>("");

  useEffect(() => {
    const coursesRef = dbRef(database, "courses/");
    const tutorialsRef = dbRef(database, "tutorials/");
    const packagesRef = dbRef(database, "packages/");
    const specialsRef = dbRef(database, "specialPackages/");
    const topPackagesRef = dbRef(database, "homepage/topPackageIds");

    const unsubCourses = onValue(coursesRef, (snapshot) => {
      const val = (snapshot.val() || {}) as Record<string, CourseDB>;
      const list: Course[] = Object.entries(val).map(([id, data]) => ({
        id,
        ...data,
      }));
      setCourses(list);
    });

    const unsubTutorials = onValue(tutorialsRef, (snapshot) => {
      const val = (snapshot.val() || {}) as Record<string, TutorialDB>;
      const list: Tutorial[] = Object.entries(val)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      setTutorials(list);
    });

    const unsubPackages = onValue(packagesRef, (snapshot) => {
      const val = (snapshot.val() || {}) as Record<string, PackageDB>;
      const list: Package[] = Object.entries(val).map(([id, data]) => ({
        id,
        name: data.name,
        price: data.price,
        imageUrl: data.imageUrl,
        courseIds: data.courseIds,
        highlight: data.highlight,
        badge: data.badge,
        commissionPercent:
          typeof data.commissionPercent === "number"
            ? data.commissionPercent
            : 58,
        discountActive: Boolean(data.discountActive),
        discountPercent:
          typeof data.discountPercent === "number" ? data.discountPercent : 0,
        discountLabel: data.discountLabel || "",
        showRating: Boolean(data.showRating),
        rating: typeof data.rating === "number" ? data.rating : 0,
        ratingCount:
          typeof data.ratingCount === "number" ? data.ratingCount : 0,
      }));
      setPackages(list);
      setLoading(false);
    });

    const unsubSpecials = onValue(specialsRef, (snapshot) => {
      const val = (snapshot.val() || {}) as Record<string, SpecialPackageDB>;
      const list: SpecialPackage[] = Object.entries(val).map(([id, data]) => ({
        id,
        ...data,
      }));
      setSpecialPackages(list);
    });

    const unsubTop = onValue(topPackagesRef, (snapshot) => {
      const val = (snapshot.val() || {}) as Record<string, boolean>;
      setHomeTopPkgMap(val || {});
      setHomeTopPkgInitial(val || {});
    });

    return () => {
      unsubCourses();
      unsubTutorials();
      unsubPackages();
      unsubSpecials();
      unsubTop();
    };
  }, []);

  // --- SUB-COURSES ---
  const handleSaveCourse = async (formData: CourseInput) => {
    setIsSaving(true);
    try {
      const { id, ...courseData } = formData;
      if (id) {
        await update(dbRef(database, `courses/${id}`), courseData);
      } else {
        await push(dbRef(database, "courses"), courseData);
      }
      setModal({ type: null, data: null });
    } catch (e) {
      console.error(e);
      alert("Failed to save sub-course.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCourse = async (id: string) => {
    if (
      window.confirm(
        "Delete this sub-course? This will remove it from all courses (bundles)."
      )
    ) {
      await remove(dbRef(database, `courses/${id}`));
    }
  };

  // --- TUTORIALS ---
  const handleSaveTutorial = async (formData: TutorialInput) => {
    setIsSaving(true);
    try {
      const { id, ...data } = formData;
      const toWrite = {
        title: data.title,
        url: data.url,
        order: Number(data.order) || 0,
      };
      if (id) {
        await update(dbRef(database, `tutorials/${id}`), toWrite);
      } else {
        await push(dbRef(database, "tutorials"), toWrite);
      }
      setModal({ type: null, data: null });
    } catch (e) {
      console.error(e);
      alert("Failed to save tutorial.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTutorial = async (id: string) => {
    if (!window.confirm("Delete this tutorial?")) return;
    try {
      await remove(dbRef(database, `tutorials/${id}`));
    } catch (e) {
      console.error(e);
      alert("Failed to delete tutorial.");
    }
  };

  // --- HOMEPAGE FEATURED COURSES ---
  const toggleTopPackage = (packageId: string) => {
    setHomeTopPkgMap((prev) => {
      const next = { ...prev };
      next[packageId] = !prev[packageId];
      if (!next[packageId]) delete next[packageId];
      return next;
    });
  };

  const selectedTopCount = useMemo(
    () => Object.values(homeTopPkgMap || {}).filter(Boolean).length,
    [homeTopPkgMap]
  );

  const isHomeTopDirty = useMemo(
    () =>
      JSON.stringify(homeTopPkgMap || {}) !==
      JSON.stringify(homeTopPkgInitial || {}),
    [homeTopPkgMap, homeTopPkgInitial]
  );

  const filteredTopPackages = useMemo(() => {
    const q = topQuery.trim().toLowerCase();
    if (!q) return packages;
    return packages.filter((p) => p.name.toLowerCase().includes(q));
  }, [topQuery, packages]);

  const saveTopPackages = async () => {
    setSavingTop(true);
    try {
      const payload: Record<string, boolean> = {};
      for (const [pid, val] of Object.entries(homeTopPkgMap || {})) {
        if (val) payload[pid] = true;
      }
      await set(dbRef(database, "homepage/topPackageIds"), payload);
      setHomeTopPkgInitial(payload);
      alert("Homepage Featured Courses updated.");
    } catch (e) {
      console.error(e);
      alert("Failed to update homepage Featured Courses.");
    } finally {
      setSavingTop(false);
    }
  };

  const selectAllTop = () => {
    const all: Record<string, boolean> = {};
    for (const p of packages) all[p.id] = true;
    setHomeTopPkgMap(all);
  };

  const clearAllTop = () => setHomeTopPkgMap({});

  // --- PUBLIC COURSES (packages) ---
  const handleSavePackage = async (
    formData: PackageInput,
    imageFile: File | null
  ) => {
    setIsSaving(true);
    try {
      let finalImageUrl = formData.imageUrl;
      if (imageFile) {
        const fileRef = storageRef(
          storage,
          `package-images/${Date.now()}_${imageFile.name}`
        );
        const snapshot = await uploadBytes(fileRef, imageFile);
        finalImageUrl = await getDownloadURL(snapshot.ref);
      }
      if (!finalImageUrl) {
        alert("A cover image is required.");
        setIsSaving(false);
        return;
      }

      const toWrite: PackageDB = {
        name: formData.name,
        price: Number(formData.price) || 0,
        imageUrl: finalImageUrl,
        courseIds: formData.courseIds || {},
        highlight: Boolean(formData.highlight),
        badge: formData.badge || "",
        commissionPercent: Math.max(
          0,
          Math.min(100, Number(formData.commissionPercent) || 58)
        ),

        discountActive: Boolean(formData.discountActive),
        discountPercent: Math.max(
          0,
          Math.min(100, Number(formData.discountPercent) || 0)
        ),
        discountLabel: (formData.discountLabel || "").trim(),

        showRating: Boolean(formData.showRating),
        rating: Math.max(0, Math.min(5, Number(formData.rating) || 0)),
        ratingCount: Math.max(
          0,
          Math.floor(Number(formData.ratingCount) || 0)
        ),
      };

      if (formData.id) {
        await update(dbRef(database, `packages/${formData.id}`), toWrite);
      } else {
        await push(dbRef(database, "packages"), toWrite);
      }
      setModal({ type: null, data: null });
    } catch (e) {
      console.error(e);
      alert("Failed to save course.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePackage = async (id: string) => {
    if (window.confirm("Delete this course?")) {
      await remove(dbRef(database, `packages/${id}`));
    }
  };

  // --- SPECIAL PACKAGES ---
  const handleSaveSpecialPackage = async (
    formData: SpecialPackageInput,
    imageFile: File | null
  ) => {
    setIsSaving(true);
    try {
      let finalImageUrl = formData.imageUrl;
      if (imageFile) {
        const fileRef = storageRef(
          storage,
          `package-images/${Date.now()}_${imageFile.name}`
        );
        const snapshot = await uploadBytes(fileRef, imageFile);
        finalImageUrl = await getDownloadURL(snapshot.ref);
      }
      if (!finalImageUrl) {
        alert("A cover image is required.");
        setIsSaving(false);
        return;
      }

      const toWrite: Omit<SpecialPackageDB, "id"> = {
        name: formData.name,
        price: Number(formData.price) || 0,
        imageUrl: finalImageUrl,
        commissionPercent: Math.max(
          0,
          Math.min(100, Number(formData.commissionPercent) || 58)
        ),
        assignedUserIds: formData.assignedUserIds || {},
        note: formData.note || "",
      };

      let spId = formData.id;
      if (spId) {
        await update(dbRef(database, `specialPackages/${spId}`), toWrite);
      } else {
        const newRef = push(dbRef(database, "specialPackages"));
        spId = newRef.key || undefined;
        await set(newRef, toWrite);
      }

      if (!spId) throw new Error("Failed to resolve special package ID.");

      // Diff assign/revoke users
      const prev =
        specialPackages.find((p) => p.id === spId)?.assignedUserIds || {};
      const next = formData.assignedUserIds || {};
      const toAssign = Object.keys(next).filter((uid) => !prev[uid]);
      const toRevoke = Object.keys(prev).filter((uid) => !next[uid]);

      const updates: Record<string, any> = {};
      for (const uid of toAssign) {
        updates[`/users/${uid}/specialAccess`] = {
          active: true,
          packageId: spId,
          commissionPercent: toWrite.commissionPercent ?? 58,
        };
      }
      for (const uid of toRevoke) {
        updates[`/users/${uid}/specialAccess/active`] = false;
      }
      if (Object.keys(updates).length > 0) {
        await update(dbRef(database), updates);
      }

      setModal({ type: null, data: null });
    } catch (e) {
      console.error(e);
      alert("Failed to save special package.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSpecialPackage = async (id: string) => {
    if (!id) return;
    if (!window.confirm("Delete this special package?")) return;
    try {
      await remove(dbRef(database, `specialPackages/${id}`));
    } catch (e) {
      console.error(e);
      alert("Failed to delete special package.");
    }
  };

  // helpers
  const effectivePrice = (pkg: Package) => {
    const p = Number(pkg.price || 0);
    const pct = Number(pkg.discountPercent || 0);
    if (pkg.discountActive && pct > 0) {
      const discounted = Math.round(p - (p * pct) / 100);
      return Math.max(0, discounted);
    }
    return p;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900">
          Sub-courses, Tutorials & Courses
        </h2>
        <p className="mt-1 text-base text-slate-500">
          Manage reusable sub-courses, platform tutorials, public courses
          (bundles), special packages (admin-only), choose Featured Courses,
          set discounts, and control review stars.
        </p>
      </header>

      {/* Sub-course Library */}
      <div className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-800">
            Sub-course Library
          </h3>
          <button
            onClick={() => setModal({ type: "course", data: null })}
            className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <PlusIcon />
            New Sub-course
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b bg-slate-50">
                <tr className="text-xs font-medium uppercase text-slate-500">
                  <th className="px-6 py-3">Sub-course Title</th>
                  <th className="px-6 py-3">Videos</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="p-8 text-center text-slate-500"
                    >
                      Loading Sub-courses...
                    </td>
                  </tr>
                ) : (
                  courses.map((course) => (
                    <tr key={course.id}>
                      <td className="px-6 py-4 font-medium">{course.title}</td>
                      <td className="px-6 py-4">
                        {Object.keys(course.videos || {}).length}
                      </td>
                      <td className="space-x-4 px-6 py-4 text-right">
                        <button
                          onClick={() =>
                            setModal({ type: "course", data: course })
                          }
                          className="text-sky-600 hover:text-sky-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteCourse(course.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Platform Tutorials */}
      <div className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-800">
            Platform Tutorials
          </h3>
          <button
            onClick={() => setModal({ type: "tutorial", data: null })}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <PlusIcon />
            New Tutorial
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b bg-slate-50">
                <tr className="text-xs font-medium uppercase text-slate-500">
                  <th className="px-6 py-3">Tutorial Title</th>
                  <th className="px-6 py-3">Order</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="p-8 text-center text-slate-500"
                    >
                      Loading Tutorials...
                    </td>
                  </tr>
                ) : tutorials.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="p-6 text-center text-slate-500"
                    >
                      No tutorials added yet.
                    </td>
                  </tr>
                ) : (
                  tutorials.map((t) => (
                    <tr key={t.id}>
                      <td className="px-6 py-4 font-medium">{t.title}</td>
                      <td className="px-6 py-4 font-mono">{t.order ?? 0}</td>
                      <td className="px-6 py-4 text-right space-x-4">
                        <button
                          onClick={() =>
                            setModal({ type: "tutorial", data: t })
                          }
                          className="text-indigo-600 hover:text-indigo-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTutorial(t.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          These videos appear on the user-facing Tutorials page. Use the{" "}
          <span className="font-semibold">Order</span> field to control sort
          order (lower appears first).
        </p>
      </div>

      {/* Homepage Featured Courses */}
      <div className="mb-12">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-800">
              Homepage: Featured Courses
            </h3>
            <p className="text-sm text-slate-500">
              Select which Courses (bundles) appear on the homepage. Saved to{" "}
              <code className="font-mono">homepage/topPackageIds</code>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAllTop}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Select All
            </button>
            <button
              onClick={clearAllTop}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear All
            </button>
            <button
              onClick={saveTopPackages}
              disabled={savingTop || !isHomeTopDirty}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              title={!isHomeTopDirty ? "No changes to save" : "Save Featured"}
            >
              {savingTop ? "Saving..." : "Save Featured"}
            </button>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={topQuery}
              onChange={(e) => setTopQuery(e.currentTarget.value)}
              placeholder="Search courses (bundles)..."
              className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="hidden text-sm text-slate-500 sm:block">
            Selected:{" "}
            <span className="font-semibold text-slate-700">
              {selectedTopCount}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTopPackages.length === 0 ? (
            <div className="col-span-full rounded-md border bg-white p-6 text-center text-slate-500">
              No courses match your search.
            </div>
          ) : (
            filteredTopPackages.map((pkg) => {
              const selected = !!homeTopPkgMap[pkg.id];
              const finalPrice = effectivePrice(pkg);
              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => toggleTopPackage(pkg.id)}
                  className={[
                    "flex items-center gap-3 rounded-lg border p-3 text-left transition",
                    selected
                      ? "border-indigo-300 bg-indigo-50/60 ring-2 ring-indigo-500/60"
                      : "border-slate-200 hover:bg-slate-50",
                  ].join(" ")}
                  title={
                    selected
                      ? "Click to remove from Featured"
                      : "Click to feature on home"
                  }
                >
                  <Image
                    src={pkg.imageUrl || "/default-avatar.png"}
                    alt={pkg.name}
                    width={56}
                    height={40}
                    className="h-10 w-14 rounded object-cover bg-slate-100"
                  />
                  <div className="flex-1">
                    <div className="line-clamp-1 text-sm font-semibold text-slate-800">
                      {pkg.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {Object.keys(pkg.courseIds || {}).length} sub-courses •
                      Rs {Number(finalPrice || 0).toLocaleString()}
                      {pkg.discountActive &&
                      (pkg.discountPercent || 0) > 0 ? (
                        <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          -{Number(pkg.discountPercent || 0).toFixed(0)}%
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div
                    className={[
                      "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
                      selected
                        ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
                    ].join(" ")}
                  >
                    {selected ? (
                      <CheckIcon className="h-4 w-4 text-emerald-600" />
                    ) : null}
                    {selected ? "Featured" : "Feature"}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="mt-3 text-sm text-slate-500 sm:hidden">
          Selected:{" "}
          <span className="font-semibold text-slate-700">
            {selectedTopCount}
          </span>
        </div>
      </div>

      {/* Public Courses */}
      <div className="mb-12">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-800">
            Public Courses (Default Commission)
          </h3>
          <button
            onClick={() => setModal({ type: "package", data: null })}
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            <PlusIcon />
            New Course
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b bg-slate-50">
                <tr className="text-xs font-medium uppercase text-slate-500">
                  <th className="px-6 py-3">Course Name</th>
                  <th className="px-6 py-3">Sub-courses</th>
                  <th className="px-6 py-3">Price</th>
                  <th className="px-6 py-3">Commission</th>
                  <th className="px-6 py-3">Discount</th>
                  <th className="px-6 py-3">Rating</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-slate-500"
                    >
                      Loading Courses...
                    </td>
                  </tr>
                ) : (
                  packages.map((pkg) => {
                    const finalPrice = effectivePrice(pkg);
                    return (
                      <tr key={pkg.id}>
                        <td className="flex items-center gap-4 px-6 py-4 font-medium">
                          <Image
                            src={pkg.imageUrl || "/default-avatar.png"}
                            alt={pkg.name}
                            width={48}
                            height={27}
                            className="h-7 w-12 rounded object-cover bg-slate-100"
                          />
                          {pkg.name}
                        </td>
                        <td className="px-6 py-4">
                          {Object.keys(pkg.courseIds || {}).length}
                        </td>
                        <td className="px-6 py-4 font-mono">
                          {pkg.discountActive &&
                          (pkg.discountPercent || 0) > 0 ? (
                            <div>
                              <div className="text-slate-400 line-through">
                                Rs{" "}
                                {Number(pkg.price || 0).toLocaleString()}
                              </div>
                              <div className="font-semibold text-emerald-700">
                                Rs {Number(finalPrice || 0).toLocaleString()}
                              </div>
                            </div>
                          ) : (
                            <>Rs {Number(pkg.price || 0).toLocaleString()}</>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {(pkg.commissionPercent ?? 58).toFixed(0)}%
                        </td>
                        <td className="px-6 py-4">
                          {pkg.discountActive &&
                          (pkg.discountPercent || 0) > 0 ? (
                            <div className="text-emerald-700 font-semibold">
                              -{Number(pkg.discountPercent || 0).toFixed(0)}%
                              {pkg.discountLabel ? (
                                <span className="ml-2 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium ring-1 ring-emerald-200">
                                  {pkg.discountLabel}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {pkg.showRating ? (
                            <span className="font-medium text-slate-800">
                              {Number(pkg.rating || 0).toFixed(1)} / 5
                              {typeof pkg.ratingCount === "number" &&
                              pkg.ratingCount > 0 ? (
                                <span className="ml-1 text-xs text-slate-500">
                                  ({pkg.ratingCount})
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-slate-500">Hidden</span>
                          )}
                        </td>
                        <td className="space-x-4 px-6 py-4 text-right">
                          <button
                            onClick={() =>
                              setModal({ type: "package", data: pkg })
                            }
                            className="text-sky-600 hover:text-sky-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeletePackage(pkg.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Commission is the default for referrers without special access.
        </p>
      </div>

      {/* Special Packages (Admin-only) */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-800">
            Special Packages (Admin-only)
          </h3>
          <button
            onClick={() => setModal({ type: "special", data: null })}
            className="flex items-center gap-2 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-700"
          >
            <PlusIcon />
            New Special Package
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b bg-slate-50">
                <tr className="text-xs font-medium uppercase text-slate-500">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Price</th>
                  <th className="px-6 py-3">Commission</th>
                  <th className="px-6 py-3">Assigned Users</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {specialPackages.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-6 text-center text-slate-500"
                    >
                      No special packages yet.
                    </td>
                  </tr>
                ) : (
                  specialPackages.map((sp) => (
                    <tr key={sp.id}>
                      <td className="flex items-center gap-3 px-6 py-4">
                        <Image
                          src={sp.imageUrl || "/default-avatar.png"}
                          alt={sp.name}
                          width={44}
                          height={24}
                          className="h-6 w-11 rounded object-cover bg-slate-100"
                        />
                        <span className="font-medium">{sp.name}</span>
                      </td>
                      <td className="px-6 py-4 font-mono">
                        Rs {(sp.price || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        {(sp.commissionPercent || 0).toFixed(0)}%
                      </td>
                      <td className="px-6 py-4">
                        {Object.keys(sp.assignedUserIds || {}).length}
                      </td>
                      <td className="space-x-3 px-6 py-4 text-right">
                        <button
                          onClick={() =>
                            setModal({ type: "special", data: sp })
                          }
                          className="text-fuchsia-600 hover:text-fuchsia-800 text-sm"
                        >
                          Edit / Assign
                        </button>
                        <button
                          onClick={() => handleDeleteSpecialPackage(sp.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Assign users here, then click <strong>Save Special Package</strong> in
          the modal to apply changes.
        </p>
      </div>

      {/* Modals */}
      {modal.type === "course" && (
        <CourseFormModal
          course={modal.data as Course | null}
          onClose={() => setModal({ type: null, data: null })}
          onSave={handleSaveCourse}
          isSaving={isSaving}
        />
      )}
      {modal.type === "tutorial" && (
        <TutorialFormModal
          tutorial={modal.data as Tutorial | null}
          onClose={() => setModal({ type: null, data: null })}
          onSave={handleSaveTutorial}
          isSaving={isSaving}
        />
      )}
      {modal.type === "package" && (
        <PackageFormModal
          pkg={modal.data as Package | null}
          allCourses={courses}
          onClose={() => setModal({ type: null, data: null })}
          onSave={handleSavePackage}
          isSaving={isSaving}
        />
      )}
      {modal.type === "special" && (
        <SpecialPackageFormModal
          specialPkg={modal.data as SpecialPackage | null}
          onClose={() => setModal({ type: null, data: null })}
          onSave={handleSaveSpecialPackage}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}

// ================== MODAL FOR SUB-COURSES ==================
function CourseFormModal({
  course,
  onClose,
  onSave,
  isSaving,
}: {
  course: Course | null;
  onClose: () => void;
  onSave: (data: CourseInput) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<CourseInput>({
    id: course?.id,
    title: course?.title || "",
    videos: course?.videos || {},
  });
  const [newVideo, setNewVideo] = useState<{ title: string; url: string }>({
    title: "",
    url: "",
  });
  const [videoError, setVideoError] = useState<string>("");
  const [fetchingTitle, setFetchingTitle] = useState<boolean>(false);

  // Playlist import
  const [playlistUrl, setPlaylistUrl] = useState<string>("");
  const [importingPlaylist, setImportingPlaylist] = useState<boolean>(false);
  const [playlistMsg, setPlaylistMsg] = useState<string>("");
  const [playlistError, setPlaylistError] = useState<string>("");

  const extractVideoId = (url: string): string | null => {
    try {
      const u = new URL(url);
      if (u.hostname === "youtu.be") {
        const id = u.pathname.split("/")[1];
        return id && id.length >= 8 ? id : null;
      }
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
      return null;
    } catch {
      const m = url.match(
        /(?:v=|\/shorts\/|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{6,})/
      );
      return m?.[1] || null;
    }
  };

  const extractPlaylistId = (url: string): string | null => {
    try {
      const u = new URL(url);
      const list = u.searchParams.get("list");
      if (list) return list;
      return null;
    } catch {
      const m = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
      return m?.[1] || null;
    }
  };

  const fetchVideoTitle = async (videoId: string): Promise<string | null> => {
    try {
      const res = await fetch(
        `/api/youtube/video?id=${encodeURIComponent(videoId)}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.title || null;
    } catch {
      return null;
    }
  };

  const handleUrlBlur = async () => {
    setVideoError("");
    if (newVideo.title.trim()) return;
    if (!newVideo.url.trim()) return;
    const vid = extractVideoId(newVideo.url);
    if (!vid) {
      setVideoError("Please enter a valid YouTube video URL.");
      return;
    }
    setFetchingTitle(true);
    const title = await fetchVideoTitle(vid);
    setFetchingTitle(false);
    if (title) {
      setNewVideo((prev) => ({ ...prev, title }));
    } else {
      setVideoError("Could not fetch title. You can still type it manually.");
    }
  };

  const handleAddVideo = async () => {
    setVideoError("");
    if (!newVideo.url.trim()) {
      setVideoError("Please provide a YouTube video URL.");
      return;
    }
    let { title, url } = newVideo;
    const vid = extractVideoId(url);
    if (!vid) {
      setVideoError("Please enter a valid YouTube video URL.");
      return;
    }
    if (!title.trim()) {
      setFetchingTitle(true);
      const fetched = await fetchVideoTitle(vid);
      setFetchingTitle(false);
      title = fetched || "";
    }
    if (!title.trim()) {
      setVideoError("Could not fetch title. Please type it.");
      return;
    }

    const newKey = `video_${Date.now()}`;
    setFormData((prev) => ({
      ...prev,
      videos: {
        ...prev.videos,
        [newKey]: {
          title,
          url: `https://www.youtube.com/watch?v=${vid}`,
        },
      },
    }));
    setNewVideo({ title: "", url: "" });
  };

  const handleRemoveVideo = (videoId: string) => {
    const { [videoId]: _removed, ...remainingVideos } = formData.videos;
    setFormData((prev) => ({ ...prev, videos: remainingVideos }));
  };

  const handleImportPlaylist = async () => {
    setPlaylistError("");
    setPlaylistMsg("");
    const pid = extractPlaylistId(playlistUrl);
    if (!pid) {
      setPlaylistError(
        "Please paste a valid playlist (or watch URL containing list=...)"
      );
      return;
    }
    setImportingPlaylist(true);
    try {
      const res = await fetch(
        `/api/youtube/playlist?playlistId=${encodeURIComponent(
          pid
        )}&limit=200`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to fetch playlist items");
      }
      const data = (await res.json()) as {
        items: { title: string; videoId: string }[];
      };
      const existingIds = new Set<string>(
        Object.values(formData.videos || {})
          .map((v) => extractVideoId(v.url))
          .filter((x): x is string => !!x)
      );

      let added = 0;
      let skipped = 0;
      const toAdd: VideosMap = {};
      for (const it of data.items || []) {
        if (!it.videoId || !it.title) continue;
        if (existingIds.has(it.videoId)) {
          skipped++;
          continue;
        }
        const key = `video_${it.videoId}_${Date.now()}_${added}`;
        toAdd[key] = {
          title: it.title,
          url: `https://www.youtube.com/watch?v=${it.videoId}`,
        };
        added++;
      }

      if (added === 0) {
        setPlaylistMsg(
          `No new videos imported. ${
            skipped > 0 ? `${skipped} duplicates skipped.` : ""
          }`
        );
      } else {
        setFormData((prev) => ({
          ...prev,
          videos: { ...(prev.videos || {}), ...toAdd },
        }));
        setPlaylistMsg(
          `Imported ${added} videos ${
            skipped ? `(skipped ${skipped} duplicates)` : ""
          }.`
        );
      }
    } catch (e: any) {
      setPlaylistError(e?.message || "Failed to import playlist.");
    } finally {
      setImportingPlaylist(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-xl font-semibold">
          {course ? "Edit Sub-course" : "Create New Sub-course"}
        </h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-6">
          <InputField
            label="Sub-course Title"
            id="title"
            value={formData.title}
            onChange={(e) =>
              setFormData({
                ...formData,
                title: (e.currentTarget as HTMLInputElement).value,
              })
            }
            required
          />
          <div className="space-y-4 rounded-md border p-4">
            <h4 className="font-semibold">Videos</h4>
            {Object.entries(formData.videos).map(([videoId, video]) => (
              <div
                key={videoId}
                className="flex items-center justify-between rounded bg-slate-50 p-2 text-sm"
              >
                <span
                  className="font-medium text-slate-700 line-clamp-1"
                  title={video.title}
                >
                  {video.title}
                </span>
                <div className="flex items-center gap-3">
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-sky-600 hover:text-sky-800"
                  >
                    Watch
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemoveVideo(videoId)}
                    className="font-semibold text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {/* Single video add with auto-title */}
            <div className="border-t pt-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InputField
                  label="YouTube Video URL"
                  id="newVidUrl"
                  value={newVideo.url}
                  onChange={(e) =>
                    setNewVideo({
                      ...newVideo,
                      url: (e.currentTarget as HTMLInputElement).value,
                    })
                  }
                  onBlur={handleUrlBlur}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                <InputField
                  label={`Video Title ${fetchingTitle ? "(Fetching...)" : ""}`}
                  id="newVidTitle"
                  value={newVideo.title}
                  onChange={(e) =>
                    setNewVideo({
                      ...newVideo,
                      title: (e.currentTarget as HTMLInputElement).value,
                    })
                  }
                  placeholder="Auto-filled from YouTube (or type)"
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddVideo}
                  className="h-9 shrink-0 rounded-md bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  Add Video
                </button>
                {videoError && (
                  <span className="text-xs text-red-500">{videoError}</span>
                )}
              </div>
            </div>

            {/* Playlist import */}
            <div className="border-t pt-4">
              <h5 className="mb-1 text-sm font-semibold text-slate-700">
                Import YouTube Playlist
              </h5>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={playlistUrl}
                  onChange={(e) =>
                    setPlaylistUrl(e.currentTarget.value)
                  }
                  placeholder="https://www.youtube.com/playlist?list=... (or a watch URL with list=...)"
                  className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <button
                  type="button"
                  onClick={handleImportPlaylist}
                  disabled={importingPlaylist || !playlistUrl.trim()}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {importingPlaylist ? "Importing..." : "Import Playlist"}
                </button>
              </div>
              <div className="mt-2 text-xs">
                {playlistMsg ? (
                  <span className="font-medium text-emerald-600">
                    {playlistMsg}
                  </span>
                ) : null}
                {playlistError ? (
                  <span className="font-medium text-red-600">
                    {playlistError}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                We’ll pull titles and links for up to 200 items. Duplicates are
                skipped.
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-green-400"
            >
              {isSaving ? "Saving..." : "Save Sub-course"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ================== MODAL FOR TUTORIALS ==================
function TutorialFormModal({
  tutorial,
  onClose,
  onSave,
  isSaving,
}: {
  tutorial: Tutorial | null;
  onClose: () => void;
  onSave: (data: TutorialInput) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<TutorialInput>({
    id: tutorial?.id,
    title: tutorial?.title || "",
    url: tutorial?.url || "",
    order: tutorial?.order ?? 0,
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-xl font-semibold">
          {tutorial ? "Edit Tutorial" : "Create New Tutorial"}
        </h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-6">
          <InputField
            label="Tutorial Title"
            id="tut-title"
            value={formData.title}
            onChange={(e) =>
              setFormData({
                ...formData,
                title: (e.currentTarget as HTMLInputElement).value,
              })
            }
            required
          />
          <div>
            <InputField
              label="Video URL"
              id="tut-url"
              value={formData.url}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  url: (e.currentTarget as HTMLInputElement).value,
                })
              }
              required
              placeholder="Paste YouTube URL or upload below"
            />
            <div className="mt-4">
              <VideoUploader
                onUploadComplete={(url) =>
                  setFormData((prev) => ({ ...prev, url }))
                }
              />
            </div>
          </div>
          <InputField
            label="Order"
            id="tut-order"
            type="number"
            value={formData.order}
            onChange={(e) =>
              setFormData({
                ...formData,
                order: Number(e.currentTarget.value) || 0,
              })
            }
            placeholder="0"
          />
          <p className="text-xs text-slate-500">
            Tutorials are sorted by order (ascending).
          </p>
          <div className="mt-6 flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-slate-100 px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Tutorial"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ================== MODAL FOR PUBLIC COURSES (packages) ==================
function PackageFormModal({
  pkg,
  allCourses,
  onClose,
  onSave,
  isSaving,
}: {
  pkg: Package | null;
  allCourses: Course[];
  onClose: () => void;
  onSave: (data: PackageInput, file: File | null) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<PackageInput>({
    id: pkg?.id,
    name: pkg?.name || "",
    price: pkg?.price || 0,
    imageUrl: pkg?.imageUrl || "",
    courseIds: pkg?.courseIds || {},
    highlight: pkg?.highlight || false,
    badge: pkg?.badge || "",
    commissionPercent:
      typeof pkg?.commissionPercent === "number"
        ? pkg!.commissionPercent!
        : 58,

    discountActive: Boolean(pkg?.discountActive) || false,
    discountPercent:
      typeof pkg?.discountPercent === "number"
        ? pkg!.discountPercent!
        : 0,
    discountLabel: pkg?.discountLabel || "",

    showRating: Boolean(pkg?.showRating) || false,
    rating: typeof pkg?.rating === "number" ? pkg!.rating! : 0,
    ratingCount:
      typeof pkg?.ratingCount === "number" ? pkg!.ratingCount! : 0,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    pkg?.imageUrl || null
  );

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(String(reader.result));
      };
      reader.readAsDataURL(file);
    }
  };
  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setFormData((prev) => ({ ...prev, imageUrl: "" }));
    const fileInput = document.getElementById(
      "image-upload"
    ) as HTMLInputElement | null;
    if (fileInput) fileInput.value = "";
  };
  const handleToggleCourse = (courseId: string) => {
    setFormData((prev) => {
      const newCourseIds = { ...prev.courseIds };
      if (newCourseIds[courseId]) delete newCourseIds[courseId];
      else newCourseIds[courseId] = true;
      return { ...prev, courseIds: newCourseIds };
    });
  };
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave(formData, imageFile);
  };

  const computedDiscounted = useMemo(() => {
    const p = Number(formData.price || 0);
    const pct = Number(formData.discountPercent || 0);
    if (formData.discountActive && pct > 0) {
      return Math.max(0, Math.round(p - (p * pct) / 100));
    }
    return p;
  }, [formData.price, formData.discountActive, formData.discountPercent]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-xl font-semibold">
          {pkg ? "Edit Course" : "Create New Course"}
        </h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField
              label="Course Name"
              id="name"
              value={formData.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFormData({ ...formData, name: e.currentTarget.value })
              }
              required
            />
            <InputField
              label="Price (Rs)"
              id="price"
              type="number"
              value={formData.price}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFormData({
                  ...formData,
                  price: Number(e.currentTarget.value),
                })
              }
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Cover Image
            </label>
            <input
              type="file"
              id="image-upload"
              accept="image/*"
              onChange={handleImageChange}
              className="mt-1 w-full text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-sky-50 file:px-4 file:py-2 file:text-sky-700 hover:file:bg-sky-100"
            />
            {imagePreview && (
              <div className="relative mt-4 w-40">
                <p className="mb-1 text-xs font-medium text-slate-500">
                  Preview:
                </p>
                <Image
                  src={imagePreview}
                  alt="Preview"
                  width={160}
                  height={90}
                  className="h-20 w-36 rounded-md border object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
                >
                  <CloseIcon />
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Included Sub-courses
            </label>
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
              {allCourses.map((course) => (
                <label
                  key={course.id}
                  className="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={!!formData.courseIds?.[course.id]}
                    onChange={() => handleToggleCourse(course.id)}
                    className="h-4 w-4 rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span>{course.title}</span>
                </label>
              ))}
              {allCourses.length === 0 && (
                <div className="p-2 text-sm text-slate-500">
                  No sub-courses available.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={formData.highlight}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const checked = e.target.checked;
                  setFormData((prev) => ({ ...prev, highlight: checked }));
                }}
                className="h-4 w-4 rounded text-sky-600 focus:ring-sky-500"
              />
              Highlight (mark as popular)
            </label>
            <InputField
              label="Badge (optional)"
              id="badge"
              value={formData.badge}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFormData({ ...formData, badge: e.currentTarget.value })
              }
              placeholder="e.g., Best Value"
            />
          </div>

          {/* Commission */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField
              label="Commission Percent (%)"
              id="commissionPercent"
              type="number"
              min={0}
              max={100}
              value={formData.commissionPercent}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFormData({
                  ...formData,
                  commissionPercent: Math.max(
                    0,
                    Math.min(100, Number(e.currentTarget.value) || 0)
                  ),
                })
              }
              required
              placeholder="Default 58"
            />
          </div>

          {/* Discount */}
          <div className="rounded-md border p-4">
            <h4 className="mb-2 font-semibold text-slate-800">Discount</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.discountActive}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const checked = e.target.checked;
                    setFormData((prev) => ({
                      ...prev,
                      discountActive: checked,
                    }));
                  }}
                  className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                Enable Discount
              </label>
              <InputField
                label="Discount Percent (%)"
                id="discountPercent"
                type="number"
                min={0}
                max={100}
                value={formData.discountPercent}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFormData({
                    ...formData,
                    discountPercent: Math.max(
                      0,
                      Math.min(100, Number(e.currentTarget.value) || 0)
                    ),
                  })
                }
                disabled={!formData.discountActive}
              />
              <InputField
                label="Discount Label (optional)"
                id="discountLabel"
                value={formData.discountLabel}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFormData({
                    ...formData,
                    discountLabel: e.currentTarget.value,
                  })
                }
                placeholder="e.g., Summer Sale"
                disabled={!formData.discountActive}
              />
            </div>
            <div className="mt-3 text-sm">
              <span className="text-slate-600">Effective price: </span>
              {formData.discountActive &&
              (formData.discountPercent || 0) > 0 ? (
                <span className="font-semibold text-emerald-700">
                  Rs {Number(computedDiscounted).toLocaleString()}
                  <span className="ml-2 line-through text-slate-400">
                    Rs {Number(formData.price || 0).toLocaleString()}
                  </span>
                  <span className="ml-2 rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                    -{Number(formData.discountPercent || 0).toFixed(0)}%
                  </span>
                </span>
              ) : (
                <span className="font-semibold text-slate-800">
                  Rs {Number(formData.price || 0).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Reviews */}
          <div className="rounded-md border p-4">
            <h4 className="mb-2 font-semibold text-slate-800">Reviews</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.showRating}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const checked = e.target.checked;
                    setFormData((prev) => ({
                      ...prev,
                      showRating: checked,
                    }));
                  }}
                  className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500"
                />
                Show rating stars publicly
              </label>
              <InputField
                label="Rating (0 - 5)"
                id="rating"
                type="number"
                step="0.1"
                min={0}
                max={5}
                value={formData.rating}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFormData({
                    ...formData,
                    rating: Math.max(
                      0,
                      Math.min(5, Number(e.currentTarget.value) || 0)
                    ),
                  })
                }
                disabled={!formData.showRating}
              />
              <InputField
                label="Rating Count"
                id="ratingCount"
                type="number"
                min={0}
                value={formData.ratingCount}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFormData({
                    ...formData,
                    ratingCount: Math.max(
                      0,
                      Math.floor(Number(e.currentTarget.value) || 0)
                    ),
                  })
                }
                disabled={!formData.showRating}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              These values are shown on public pages when enabled.
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-slate-100 px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm text-white"
            >
              {isSaving ? "Saving..." : "Save Course"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Commission is used when the referrer has no special access.
          </p>
        </form>
      </div>
    </div>
  );
}

// ================== MODAL FOR SPECIAL PACKAGES ==================
function SpecialPackageFormModal({
  specialPkg,
  onClose,
  onSave,
  isSaving,
}: {
  specialPkg: SpecialPackage | null;
  onClose: () => void;
  onSave: (data: SpecialPackageInput, file: File | null) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<SpecialPackageInput>({
    id: specialPkg?.id,
    name: specialPkg?.name || "",
    price: specialPkg?.price || 0,
    imageUrl: specialPkg?.imageUrl || "",
    commissionPercent: specialPkg?.commissionPercent ?? 58,
    assignedUserIds: specialPkg?.assignedUserIds || {},
    note: specialPkg?.note || "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    specialPkg?.imageUrl || null
  );

  // Load all users for searching & assigning
  const [allUsers, setAllUsers] = useState<UserLite[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const usersRef = dbRef(database, "users");
    const unsub = onValue(usersRef, (snap) => {
      const data = (snap.val() || {}) as Record<string, any>;
      const list: UserLite[] = Object.entries(data).map(([id, v]) => ({
        id,
        name: String(v?.name || ""),
        email: String(v?.email || ""),
        imageUrl: v?.imageUrl,
      }));
      setAllUsers(list);
    });
    return () => unsub();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allUsers
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, allUsers]);

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(String(reader.result));
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setFormData((prev) => ({ ...prev, imageUrl: "" }));
    const fileInput = document.getElementById(
      "sp-image-upload"
    ) as HTMLInputElement | null;
    if (fileInput) fileInput.value = "";
  };

  // Local-only assign/revoke; actual DB updates happen on Save Special Package
  const handleAssignUser = (uid: string) => {
    setFormData((prev) => ({
      ...prev,
      assignedUserIds: { ...(prev.assignedUserIds || {}), [uid]: true },
    }));
  };

  const handleRevokeUser = (uid: string) => {
    setFormData((prev) => {
      const copy = { ...(prev.assignedUserIds || {}) };
      delete copy[uid];
      return { ...prev, assignedUserIds: copy };
    });
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave(formData, imageFile);
  };

  // Dirty check
  const initialBaseline = useMemo<SpecialPackageInput>(() => {
    return {
      id: specialPkg?.id,
      name: specialPkg?.name || "",
      price: specialPkg?.price || 0,
      imageUrl: specialPkg?.imageUrl || "",
      commissionPercent: specialPkg?.commissionPercent ?? 58,
      assignedUserIds: specialPkg?.assignedUserIds || {},
      note: specialPkg?.note || "",
    };
  }, [
    specialPkg?.id,
    specialPkg?.name,
    specialPkg?.price,
    specialPkg?.imageUrl,
    specialPkg?.commissionPercent,
    specialPkg?.assignedUserIds,
    specialPkg?.note,
  ]);

  const shallowEqualMap = (
    a: Record<string, boolean>,
    b: Record<string, boolean>
  ) => {
    const ak = Object.keys(a || {});
    const bk = Object.keys(b || {});
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (a[k] !== b[k]) return false;
    }
    return true;
  };

  const isDirty = useMemo(() => {
    const same =
      (formData.name || "").trim() ===
        (initialBaseline.name || "").trim() &&
      Number(formData.price || 0) ===
        Number(initialBaseline.price || 0) &&
      (formData.imageUrl || "") === (initialBaseline.imageUrl || "") &&
      Number(formData.commissionPercent || 0) ===
        Number(initialBaseline.commissionPercent || 0) &&
      (formData.note || "") === (initialBaseline.note || "") &&
      shallowEqualMap(
        formData.assignedUserIds || {},
        initialBaseline.assignedUserIds || {}
      ) &&
      imageFile === null;
    return !same;
  }, [formData, initialBaseline, imageFile]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-xl font-semibold">
          {specialPkg ? "Edit Special Package" : "Create Special Package"}
        </h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField
              label="Package Name"
              id="special-name"
              value={formData.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFormData({ ...formData, name: e.currentTarget.value })
              }
              required
            />
            <InputField
              label="Price (Rs)"
              id="special-price"
              type="number"
              value={formData.price}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFormData({
                  ...formData,
                  price: Number(e.currentTarget.value),
                })
              }
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField
              label="Commission Percent (%)"
              id="special-commission"
              type="number"
              min={0}
              max={100}
              value={formData.commissionPercent}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFormData({
                  ...formData,
                  commissionPercent: Math.max(
                    0,
                    Math.min(100, Number(e.currentTarget.value))
                  ),
                })
              }
              required
              placeholder="e.g., 58"
            />
            <InputField
              label="Note (optional)"
              id="special-note"
              value={formData.note || ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFormData({ ...formData, note: e.currentTarget.value })
              }
              placeholder="Internal note only visible to admin"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Cover Image
            </label>
            <input
              type="file"
              id="sp-image-upload"
              accept="image/*"
              onChange={handleImageChange}
              className="mt-1 w-full text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-fuchsia-50 file:px-4 file:py-2 file:text-fuchsia-700 hover:file:bg-fuchsia-100"
            />
            {imagePreview && (
              <div className="relative mt-4 w-40">
                <p className="mb-1 text-xs font-medium text-slate-500">
                  Preview:
                </p>
                <Image
                  src={imagePreview}
                  alt="Preview"
                  width={160}
                  height={90}
                  className="h-20 w-36 rounded-md border object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
                >
                  <CloseIcon />
                </button>
              </div>
            )}
          </div>

          {/* Assign Users (LOCAL ONLY) */}
          <div className="rounded-md border p-4">
            <h4 className="mb-2 font-semibold">Assign to Specific Users</h4>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder="Search by name or email..."
                className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder-slate-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
              />
            </div>
            {query && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-md border">
                {filteredUsers.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500">
                    No matches.
                  </div>
                ) : (
                  filteredUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-2 hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-slate-200">
                          {u.imageUrl ? (
                            <Image
                              src={u.imageUrl}
                              alt={u.name}
                              width={32}
                              height={32}
                              className="object-cover"
                            />
                          ) : (
                            <UserIcon className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium">
                            {u.name || "-"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {u.email}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAssignUser(u.id)}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <UserPlusIcon className="h-4 w-4" />
                        Assign
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Assigned Users list */}
            <div className="mt-4">
              <h5 className="text-sm font-semibold text-slate-700">
                Assigned Users (
                {Object.keys(formData.assignedUserIds || {}).length})
              </h5>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                {Object.keys(formData.assignedUserIds || {}).length === 0 ? (
                  <div className="text-sm text-slate-500">
                    No users assigned yet.
                  </div>
                ) : (
                  Object.keys(formData.assignedUserIds || {}).map((uid) => (
                    <AssignedUserRow
                      key={uid}
                      uid={uid}
                      onRevoke={() => handleRevokeUser(uid)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-slate-100 px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !isDirty}
              className="rounded-md bg-fuchsia-600 px-4 py-2 text-sm text-white hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-60"
              title={!isDirty ? "No changes to save" : "Save Special Package"}
            >
              {isSaving ? "Saving..." : "Save Special Package"}
            </button>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Assign/revoke changes are applied only after you click “Save
            Special Package”.
          </p>
        </form>
      </div>
    </div>
  );
}

function AssignedUserRow({
  uid,
  onRevoke,
}: {
  uid: string;
  onRevoke: () => void;
}) {
  const [user, setUser] = useState<UserLite | null>(null);
  useEffect(() => {
    const uref = dbRef(database, `users/${uid}`);
    const unsub = onValue(uref, (snap) => {
      const v = snap.val() || {};
      setUser({
        id: uid,
        name: String(v?.name || ""),
        email: String(v?.email || ""),
        imageUrl: v?.imageUrl,
      });
    });
    return () => unsub();
  }, [uid]);

  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-slate-200">
          {user?.imageUrl ? (
            <Image
              src={user.imageUrl}
              alt={user.name}
              width={32}
              height={32}
              className="object-cover"
            />
          ) : (
            <UserIcon className="h-5 w-5 text-slate-400" />
          )}
        </div>
        <div>
          <div className="text-sm font-medium">{user?.name || uid}</div>
          <div className="text-xs text-slate-500">
            {user?.email || "-"}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onRevoke}
        className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
      >
        Remove
      </button>
    </div>
  );
}

// ================== INPUT & ICONS ==================
function InputField({
  id,
  label,
  ...props
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      <input
        id={id}
        {...props}
        className="mt-1 w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-100"
      />
    </div>
  );
}

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
    </svg>
  );
}
function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function UserPlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 14c-3.5 0-6 2-6 4v2h8m6-8v6m3-3h-6M12 14a4 4 0 10-4-4 4 4 0 004 4z"
      />
    </svg>
  );
}
function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path
        fillRule="evenodd"
        d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
        clipRule="evenodd"
      />
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