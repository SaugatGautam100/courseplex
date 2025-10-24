"use client";

import React, { useEffect, useMemo, useState, type FormEvent, type ChangeEvent } from "react";
import Image from "next/image";
import { database, storage } from "@/lib/firebase";
import {
  ref as dbRef,
  onValue,
  set,
  push,
  update,
  remove,
  get,
} from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import type { SVGProps } from "react";

/**
  ADMIN › COURSES
  - Manage Courses
  - Manage Public Packages (with default commission percent, editable; default 58%)
  - Manage Special Packages (admin-only) and assign to users
  Notes:
  - Commission logic: Public packages store commissionPercent (default 58).
  - Special packages store commissionPercent per special package.
  - Assign/Revoke in the Special Package modal is LOCAL ONLY now.
  - Users are granted/revoked special access only after clicking "Save Special Package".
*/

// ========== TYPES ==========
type Video = { title: string; url: string };
type VideosMap = Record<string, Video>;
type Course = { id: string; title: string; videos?: VideosMap };
type CourseDB = Omit<Course, "id">;

type Package = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  courseIds?: Record<string, boolean>;
  highlight: boolean;
  badge: string;
  commissionPercent?: number; // default 58%
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
type PackageInput = {
  id?: string;
  name: string;
  price: number;
  imageUrl: string;
  courseIds: Record<string, boolean>;
  highlight: boolean;
  badge: string;
  commissionPercent: number;
};

type SpecialPackageInput = {
  id?: string;
  name: string;
  price: number;
  imageUrl: string;
  commissionPercent: number; // 0..100
  assignedUserIds: Record<string, boolean>;
  note?: string;
};

type ModalState =
  | { type: "course"; data: Course | null }
  | { type: "package"; data: Package | null }
  | { type: "special"; data: SpecialPackage | null }
  | { type: null; data: null };

type UserLite = { id: string; name: string; email: string; imageUrl?: string };

// =================== PAGE: Admin Courses & Packages ===================
export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [specialPackages, setSpecialPackages] = useState<SpecialPackage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modal, setModal] = useState<ModalState>({ type: null, data: null });
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    const coursesRef = dbRef(database, "courses/");
    const packagesRef = dbRef(database, "packages/");
    const specialsRef = dbRef(database, "specialPackages/");

    const unsubCourses = onValue(coursesRef, (snapshot) => {
      const val = (snapshot.val() || {}) as Record<string, CourseDB>;
      const list: Course[] = Object.entries(val).map(([id, data]) => ({ id, ...data }));
      setCourses(list);
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
        commissionPercent: typeof data.commissionPercent === "number" ? data.commissionPercent : 58,
      }));
      setPackages(list);
      setLoading(false);
    });

    const unsubSpecials = onValue(specialsRef, (snapshot) => {
      const val = (snapshot.val() || {}) as Record<string, SpecialPackageDB>;
      const list: SpecialPackage[] = Object.entries(val).map(([id, data]) => ({ id, ...data }));
      setSpecialPackages(list);
    });

    return () => {
      unsubCourses();
      unsubPackages();
      unsubSpecials();
    };
  }, []);

  // --- COURSES ---
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
      alert("Failed to save course.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCourse = async (id: string) => {
    if (window.confirm("Delete this course? This will remove it from all packages.")) {
      await remove(dbRef(database, `courses/${id}`));
    }
  };

  // --- PACKAGES (PUBLIC)
  const handleSavePackage = async (formData: PackageInput, imageFile: File | null) => {
    setIsSaving(true);
    try {
      let finalImageUrl = formData.imageUrl;
      if (imageFile) {
        const fileRef = storageRef(storage, `package-images/${Date.now()}_${imageFile.name}`);
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
        commissionPercent: Math.max(0, Math.min(100, Number(formData.commissionPercent) || 58)),
      };

      if (formData.id) {
        await update(dbRef(database, `packages/${formData.id}`), toWrite);
      } else {
        await push(dbRef(database, "packages"), toWrite);
      }
      setModal({ type: null, data: null });
    } catch (e) {
      console.error(e);
      alert("Failed to save package.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePackage = async (id: string) => {
    if (window.confirm("Delete this package?")) {
      await remove(dbRef(database, `packages/${id}`));
    }
  };

  // --- SPECIAL PACKAGES (ADMIN ONLY)
  // IMPORTANT: Assignment is applied to users only after saving.
  const handleSaveSpecialPackage = async (formData: SpecialPackageInput, imageFile: File | null) => {
    setIsSaving(true);
    try {
      // Prepare image
      let finalImageUrl = formData.imageUrl;
      if (imageFile) {
        const fileRef = storageRef(storage, `package-images/${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(fileRef, imageFile);
        finalImageUrl = await getDownloadURL(snapshot.ref);
      }
      if (!finalImageUrl) {
        alert("A cover image is required.");
        setIsSaving(false);
        return;
      }

      // Build payload
      const toWrite: Omit<SpecialPackageDB, "id"> = {
        name: formData.name,
        price: Number(formData.price) || 0,
        imageUrl: finalImageUrl,
        commissionPercent: Math.max(0, Math.min(100, Number(formData.commissionPercent) || 58)),
        assignedUserIds: formData.assignedUserIds || {},
        note: formData.note || "",
      };

      // Upsert special package
      let spId = formData.id;
      if (spId) {
        await update(dbRef(database, `specialPackages/${spId}`), toWrite);
      } else {
        const newRef = push(dbRef(database, "specialPackages"));
        spId = newRef.key || undefined;
        await set(newRef, toWrite);
      }

      if (!spId) throw new Error("Failed to resolve special package ID.");

      // Compute assignment diff vs previous DB state
      const prev = specialPackages.find((p) => p.id === spId)?.assignedUserIds || {};
      const next = formData.assignedUserIds || {};

      const toAssign = Object.keys(next).filter((uid) => !prev[uid]);
      const toRevoke = Object.keys(prev).filter((uid) => !next[uid]);

      // Batch user updates
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

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900">Courses & Packages</h2>
        <p className="mt-1 text-base text-slate-500">
          Manage reusable courses, public packages (with default commission%), and special packages (admin-only).
        </p>
      </header>

      {/* Course Library Section */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-slate-800">Course Library</h3>
          <button
            onClick={() => setModal({ type: "course", data: null })}
            className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
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
                  <th className="px-6 py-3">Course Title</th>
                  <th className="px-6 py-3">Videos</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-slate-500">
                      Loading Courses...
                    </td>
                  </tr>
                ) : (
                  courses.map((course) => (
                    <tr key={course.id}>
                      <td className="px-6 py-4 font-medium">{course.title}</td>
                      <td className="px-6 py-4">{Object.keys(course.videos || {}).length}</td>
                      <td className="px-6 py-4 text-right space-x-4">
                        <button
                          onClick={() => setModal({ type: "course", data: course })}
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

      {/* Package Management Section (Public) */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-slate-800">Public Packages (Default Commission)</h3>
          <button
            onClick={() => setModal({ type: "package", data: null })}
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            <PlusIcon />
            New Package
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b bg-slate-50">
                <tr className="text-xs font-medium uppercase text-slate-500">
                  <th className="px-6 py-3">Package Name</th>
                  <th className="px-6 py-3">Courses</th>
                  <th className="px-6 py-3">Price</th>
                  <th className="px-6 py-3">Commission</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      Loading Packages...
                    </td>
                  </tr>
                ) : (
                  packages.map((pkg) => (
                    <tr key={pkg.id}>
                      <td className="px-6 py-4 font-medium flex items-center gap-4">
                        <Image
                          src={pkg.imageUrl || "/default-avatar.png"}
                          alt={pkg.name}
                          width={48}
                          height={27}
                          className="h-7 w-12 rounded object-cover bg-slate-100"
                        />
                        {pkg.name}
                      </td>
                      <td className="px-6 py-4">{Object.keys(pkg.courseIds || {}).length}</td>
                      <td className="px-6 py-4 font-mono">Rs {pkg.price.toLocaleString()}</td>
                      <td className="px-6 py-4">{(pkg.commissionPercent ?? 58).toFixed(0)}%</td>
                      <td className="px-6 py-4 text-right space-x-4">
                        <button
                          onClick={() => setModal({ type: "package", data: pkg })}
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          This commission is the default for referrers without special access.
        </p>
      </div>

      {/* Special Packages (Admin-only) */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-800">Special Packages (Admin-only)</h3>
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
                    <td colSpan={5} className="p-6 text-center text-slate-500">No special packages yet.</td>
                  </tr>
                ) : (
                  specialPackages.map(sp => (
                    <tr key={sp.id}>
                      <td className="px-6 py-4 flex items-center gap-3">
                        <Image
                          src={sp.imageUrl || "/default-avatar.png"}
                          alt={sp.name}
                          width={44}
                          height={24}
                          className="h-6 w-11 rounded object-cover bg-slate-100"
                        />
                        <span className="font-medium">{sp.name}</span>
                      </td>
                      <td className="px-6 py-4 font-mono">Rs {(sp.price || 0).toLocaleString()}</td>
                      <td className="px-6 py-4">{(sp.commissionPercent || 0).toFixed(0)}%</td>
                      <td className="px-6 py-4">{Object.keys(sp.assignedUserIds || {}).length}</td>
                      <td className="px-6 py-4 text-right space-x-3">
                        <button
                          onClick={() => setModal({ type: "special", data: sp })}
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
          Assign users here, then click Save Special Package to apply. Changes aren’t granted until you save.
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
          // pass current list so modal can dirty-check accurately if needed
        />
      )}
    </div>
  );
}

// ================== MODAL FOR COURSES ==================
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
  const [newVideo, setNewVideo] = useState<{ title: string; url: string }>({ title: "", url: "" });
  const [videoError, setVideoError] = useState<string>("");

  const handleAddVideo = () => {
    setVideoError("");
    if (!newVideo.title.trim() || !newVideo.url.trim()) {
      setVideoError("Please provide both a video title and a URL.");
      return;
    }
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/;
    if (!youtubeRegex.test(newVideo.url)) {
      setVideoError("Please enter a valid YouTube URL.");
      return;
    }
    const newVideoId = `video_${Date.now()}`;
    setFormData((prev) => ({
      ...prev,
      videos: { ...prev.videos, [newVideoId]: { title: newVideo.title, url: newVideo.url } },
    }));
    setNewVideo({ title: "", url: "" });
  };

  const handleRemoveVideo = (videoId: string) => {
    const { [videoId]: _removed, ...remainingVideos } = formData.videos;
    setFormData((prev) => ({ ...prev, videos: remainingVideos }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold">{course ? "Edit Course" : "Create New Course"}</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-6">
          <InputField
            label="Course Title"
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: (e.currentTarget as HTMLInputElement).value })}
            required
          />
          <div className="space-y-4 rounded-md border p-4">
            <h4 className="font-semibold">Videos</h4>
            {Object.entries(formData.videos).map(([videoId, video]) => (
              <div key={videoId} className="flex items-center justify-between text-sm bg-slate-50 p-2 rounded">
                <span className="font-medium text-slate-700">{video.title}</span>
                <div className="flex items-center gap-3">
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-600 hover:text-sky-800 font-semibold"
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
            <div className="border-t pt-4">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <InputField
                    label="Video Title"
                    id="newVidTitle"
                    value={newVideo.title}
                    onChange={(e) =>
                      setNewVideo({ ...newVideo, title: (e.currentTarget as HTMLInputElement).value })
                    }
                    placeholder="e.g., Module 1"
                  />
                </div>
                <div className="flex-1">
                  <InputField
                    label="YouTube URL"
                    id="newVidUrl"
                    value={newVideo.url}
                    onChange={(e) =>
                      setNewVideo({ ...newVideo, url: (e.currentTarget as HTMLInputElement).value })
                    }
                    placeholder="https://youtube.com/..."
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddVideo}
                  className="h-9 shrink-0 rounded-md bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  Add
                </button>
              </div>
              {videoError && <p className="text-xs text-red-500 mt-1">{videoError}</p>}
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
              {isSaving ? "Saving..." : "Save Course"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ================== MODAL FOR PUBLIC PACKAGES ==================
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
    commissionPercent: typeof pkg?.commissionPercent === "number" ? pkg!.commissionPercent! : 58,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(pkg?.imageUrl || null);

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
    const fileInput = document.getElementById("image-upload") as HTMLInputElement | null;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold">{pkg ? "Edit Package" : "Create New Package"}</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              label="Package Name"
              id="name"
              value={formData.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.currentTarget.value })}
              required
            />
            <InputField
              label="Price (Rs)"
              id="price"
              type="number"
              value={formData.price}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, price: Number(e.currentTarget.value) })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Cover Image</label>
            <input
              type="file"
              id="image-upload"
              accept="image/*"
              onChange={handleImageChange}
              className="mt-1 w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100"
            />
            {imagePreview && (
              <div className="mt-4 relative w-40">
                <p className="text-xs font-medium text-slate-500 mb-1">Preview:</p>
                <Image src={imagePreview} alt="Preview" width={160} height={90} className="h-20 w-36 rounded-md object-cover border" />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
                >
                  <CloseIcon />
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Included Courses</label>
            <div className="mt-2 space-y-2 rounded-md border p-2 max-h-56 overflow-y-auto">
              {allCourses.map((course) => (
                <label key={course.id} className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!formData.courseIds?.[course.id]}
                    onChange={() => handleToggleCourse(course.id)}
                    className="h-4 w-4 rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span>{course.title}</span>
                </label>
              ))}
              {allCourses.length === 0 && <div className="text-sm text-slate-500 p-2">No courses available.</div>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={formData.highlight}
                onChange={(e) => setFormData((prev) => ({ ...prev, highlight: e.currentTarget.checked }))}
                className="h-4 w-4 text-sky-600 focus:ring-sky-500 rounded"
              />
              Highlight (mark as popular)
            </label>
            <InputField
              label="Badge (optional)"
              id="badge"
              value={formData.badge}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, badge: e.currentTarget.value })}
              placeholder="e.g., Best Value"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  commissionPercent: Math.max(0, Math.min(100, Number(e.currentTarget.value) || 0)),
                })
              }
              required
              placeholder="Default 58"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t pt-4">
            <button type="button" onClick={onClose} className="rounded-md bg-slate-100 px-4 py-2 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="rounded-md bg-sky-600 px-4 py-2 text-sm text-white">
              {isSaving ? "Saving..." : "Save Package"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            This commission is used when the referrer has no special access.
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
  const [imagePreview, setImagePreview] = useState<string | null>(specialPkg?.imageUrl || null);

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
      .filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
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
    setFormData(prev => ({ ...prev, imageUrl: "" }));
    const fileInput = document.getElementById("sp-image-upload") as HTMLInputElement | null;
    if (fileInput) fileInput.value = "";
  };

  // Local-only assign/revoke; actual DB updates happen on Save Special Package
  const handleAssignUser = (uid: string) => {
    setFormData(prev => ({
      ...prev,
      assignedUserIds: { ...(prev.assignedUserIds || {}), [uid]: true },
    }));
  };

  const handleRevokeUser = (uid: string) => {
    setFormData(prev => {
      const copy = { ...(prev.assignedUserIds || {}) };
      delete copy[uid];
      return { ...prev, assignedUserIds: copy };
    });
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave(formData, imageFile);
  };

  // Dirty check (only for special package)
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

  const shallowEqualMap = (a: Record<string, boolean>, b: Record<string, boolean>) => {
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
      (formData.name || "").trim() === (initialBaseline.name || "").trim() &&
      Number(formData.price || 0) === Number(initialBaseline.price || 0) &&
      (formData.imageUrl || "") === (initialBaseline.imageUrl || "") &&
      Number(formData.commissionPercent || 0) === Number(initialBaseline.commissionPercent || 0) &&
      (formData.note || "") === (initialBaseline.note || "") &&
      shallowEqualMap(formData.assignedUserIds || {}, initialBaseline.assignedUserIds || {}) &&
      imageFile === null;
    return !same;
  }, [formData, initialBaseline, imageFile]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold">{specialPkg ? "Edit Special Package" : "Create Special Package"}</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              label="Package Name"
              id="special-name"
              value={formData.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.currentTarget.value })}
              required
            />
            <InputField
              label="Price (Rs)"
              id="special-price"
              type="number"
              value={formData.price}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, price: Number(e.currentTarget.value) })}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  commissionPercent: Math.max(0, Math.min(100, Number(e.currentTarget.value))),
                })
              }
              required
              placeholder="e.g., 58"
            />
            <InputField
              label="Note (optional)"
              id="special-note"
              value={formData.note || ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, note: e.currentTarget.value })}
              placeholder="Internal note only visible to admin"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Cover Image</label>
            <input
              type="file"
              id="sp-image-upload"
              accept="image/*"
              onChange={handleImageChange}
              className="mt-1 w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-fuchsia-50 file:text-fuchsia-700 hover:file:bg-fuchsia-100"
            />
            {imagePreview && (
              <div className="mt-4 relative w-40">
                <p className="text-xs font-medium text-slate-500 mb-1">Preview:</p>
                <Image src={imagePreview} alt="Preview" width={160} height={90} className="h-20 w-36 rounded-md object-cover border" />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
                >
                  <CloseIcon />
                </button>
              </div>
            )}
          </div>

          {/* Assign Users (LOCAL ONLY) */}
          <div className="rounded-md border p-4">
            <h4 className="font-semibold mb-2">Assign to Specific Users</h4>
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
                  <div className="p-3 text-sm text-slate-500">No matches.</div>
                ) : (
                  filteredUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-2 hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center">
                          {u.imageUrl ? (
                            <Image src={u.imageUrl} alt={u.name} width={32} height={32} className="object-cover" />
                          ) : (
                            <UserIcon className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{u.name || "-"}</div>
                          <div className="text-xs text-slate-500">{u.email}</div>
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
                Assigned Users ({Object.keys(formData.assignedUserIds || {}).length})
              </h5>
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {Object.keys(formData.assignedUserIds || {}).length === 0 ? (
                  <div className="text-sm text-slate-500">No users assigned yet.</div>
                ) : (
                  Object.keys(formData.assignedUserIds || {}).map((uid) => (
                    <AssignedUserRow key={uid} uid={uid} onRevoke={() => handleRevokeUser(uid)} />
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t pt-4">
            <button type="button" onClick={onClose} className="rounded-md bg-slate-100 px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !isDirty}
              className="rounded-md bg-fuchsia-600 px-4 py-2 text-sm text-white hover:bg-fuchsia-700 disabled:opacity-60 disabled:cursor-not-allowed"
              title={!isDirty ? "No changes to save" : "Save Special Package"}
            >
              {isSaving ? "Saving..." : "Save Special Package"}
            </button>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Assign/revoke changes are applied only after you click “Save Special Package”.
          </p>
        </form>
      </div>
    </div>
  );
}

function AssignedUserRow({ uid, onRevoke }: { uid: string; onRevoke: () => void }) {
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
        <div className="h-8 w-8 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center">
          {user?.imageUrl ? (
            <Image src={user.imageUrl} alt={user.name} width={32} height={32} className="object-cover" />
          ) : (
            <UserIcon className="h-5 w-5 text-slate-400" />
          )}
        </div>
        <div>
          <div className="text-sm font-medium">{user?.name || uid}</div>
          <div className="text-xs text-slate-500">{user?.email || "-"}</div>
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
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        {...props}
        className="mt-1 w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
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
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 14c-3.5 0-6 2-6 4v2h8m6-8v6m3-3h-6M12 14a4 4 0 10-4-4 4 4 0 004 4z" />
    </svg>
  );
}
function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  );
}