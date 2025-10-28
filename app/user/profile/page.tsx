"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent, ChangeEvent } from "react";
import { database, auth, storage } from "@/lib/firebase";
import { ref as dbRef, onValue, update } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";

type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  imageUrl?: string | null;
};

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [formData, setFormData] = useState({ name: "", phone: "", email: "" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Password change states
  const [passwordData, setPasswordData] = useState({ current: "", new: "", confirm: "" });
  const [passError, setPassError] = useState("");
  const [passSuccess, setPassSuccess] = useState("");

  // Saving states
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [isSavingPass, setIsSavingPass] = useState(false);
  const [infoSuccess, setInfoSuccess] = useState("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      const userRef = dbRef(database, `users/${currentUser.uid}`);
      const unsubscribe = onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.val();
          const profile: UserProfile = {
            id: currentUser.uid,
            name: userData.name || "",
            email: userData.email || currentUser.email || "",
            phone: userData.phone || "",
            imageUrl: userData.imageUrl ?? null,
          };
          setUser(profile);
          setFormData({
            name: profile.name,
            phone: profile.phone,
            email: profile.email, // read-only
          });
          setImagePreview(profile.imageUrl || null);
        }
        setLoading(false);
      });

      return () => unsubscribe();
    });

    return () => unsubAuth();
  }, []);

  const handlePictureChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleInfoSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSavingInfo(true);
    setInfoSuccess("");

    try {
      let imageUrl = user.imageUrl || "";

      // Upload image if changed
      if (imageFile) {
        const fileRef = storageRef(storage, `profile-pictures/${user.id}`);
        const result = await uploadBytes(fileRef, imageFile);
        imageUrl = await getDownloadURL(result.ref);
      }

      // Update database (do NOT update email)
      await update(dbRef(database, `users/${user.id}`), {
        name: formData.name,
        phone: formData.phone,
        imageUrl: imageUrl || null,
      });

      setInfoSuccess("Profile updated successfully!");
      setImageFile(null);
    } catch (err) {
      console.error(err);
      alert("Failed to update profile.");
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handlePassSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPassError("");
    setPassSuccess("");

    if (passwordData.new !== passwordData.confirm) {
      return setPassError("New passwords do not match.");
    }

    if (passwordData.new.length < 6) {
      return setPassError("New password must be at least 6 characters.");
    }

    setIsSavingPass(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) throw new Error("No user found.");

      const credential = EmailAuthProvider.credential(currentUser.email, passwordData.current);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, passwordData.new);

      setPassSuccess("Password changed successfully!");
      setPasswordData({ current: "", new: "", confirm: "" });
    } catch (error: unknown) {
      setPassError(error instanceof Error ? error.message : "Failed to change password.");
    } finally {
      setIsSavingPass(false);
    }
  };

  const handleRemovePicture = async () => {
    if (!user) return;

    try {
      await update(dbRef(database, `users/${user.id}`), {
        imageUrl: null,
      });
      setImagePreview(null);
      setImageFile(null);
      setInfoSuccess("Profile picture removed!");
    } catch (err) {
      console.error(err);
      alert("Failed to remove profile picture.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading Profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <div className="p-10 text-center text-red-500">Could not load user data. Please log in again.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-4 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col-reverse sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Profile Settings</h1>
        <Link
          href="/user/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dashboard
        </Link>
      </div>

      {/* Profile Picture Section */}
      <div className="bg-white rounded-lg border shadow-sm p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-3 sm:mb-4">Profile Picture</h2>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
          <div className="relative h-20 w-20 sm:h-24 sm:w-24">
            {imagePreview ? (
              <Image src={imagePreview} alt="Profile picture" fill className="rounded-full object-cover" />
            ) : (
              <div className="h-full w-full rounded-full bg-slate-200 flex items-center justify-center">
                <svg className="h-10 w-10 sm:h-12 sm:w-12 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <label
              htmlFor="picture-upload"
              className="cursor-pointer inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 sm:px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Change Picture
              <input id="picture-upload" type="file" className="sr-only" accept="image/*" onChange={handlePictureChange} />
            </label>

            {imagePreview && (
              <button
                onClick={handleRemovePicture}
                className="inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-2 sm:px-4 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Personal Information Section */}
      <div className="bg-white rounded-lg border shadow-sm p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-3 sm:mb-4">Personal Information</h2>

        <form onSubmit={handleInfoSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                autoComplete="tel"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email Address (read-only)
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              readOnly
              disabled
              aria-readonly="true"
              className="w-full rounded-md border-slate-300 bg-slate-100 text-slate-500 shadow-sm cursor-not-allowed"
            />
            <p className="text-xs text-slate-500 mt-1">Email cannot be changed from here.</p>
          </div>

          {infoSuccess && (
            <div className="rounded-md bg-green-50 p-3">
              <p className="text-sm text-green-700">{infoSuccess}</p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingInfo}
              className="w-full sm:w-auto rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-sky-400 disabled:cursor-not-allowed"
            >
              {isSavingInfo ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Password Section */}
      <div className="bg-white rounded-lg border shadow-sm p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-3 sm:mb-4">Change Password</h2>

        <form onSubmit={handlePassSubmit} className="space-y-4">
          <div>
            <label htmlFor="current-pass" className="block text-sm font-medium text-slate-700 mb-1">
              Current Password
            </label>
            <input
              id="current-pass"
              type="password"
              value={passwordData.current}
              onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })}
              className="w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label htmlFor="new-pass" className="block text-sm font-medium text-slate-700 mb-1">
                New Password
              </label>
              <input
                id="new-pass"
                type="password"
                value={passwordData.new}
                onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })}
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                placeholder="Min. 6 characters"
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <label htmlFor="confirm-pass" className="block text-sm font-medium text-slate-700 mb-1">
                Confirm New Password
              </label>
              <input
                id="confirm-pass"
                type="password"
                value={passwordData.confirm}
                onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })}
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          {passError && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-700">{passError}</p>
            </div>
          )}

          {passSuccess && (
            <div className="rounded-md bg-green-50 p-3">
              <p className="text-sm text-green-700">{passSuccess}</p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingPass}
              className="w-full sm:w-auto rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
            >
              {isSavingPass ? "Updating..." : "Change Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}