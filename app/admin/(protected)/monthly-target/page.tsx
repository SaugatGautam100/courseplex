"use client";

import { useEffect, useMemo, useState, type FormEvent, type ChangeEvent, type InputHTMLAttributes, type SVGProps } from "react";
import { database, storage } from "@/lib/firebase";
import { ref as dbRef, onValue, set, push } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import Image from "next/image";

// Types
type Target = { goalAmount: number; prize: string; imageUrl?: string };
type CommissionDB = { referrerId: string; amount: number | string; timestamp: number | string };
type CommissionEvent = { referrerId: string; amount: number; timestamp: number };
type RawUser = { name?: string; email?: string; imageUrl?: string; status?: string } | null | undefined;
type User = { id: string; name: string; email: string; imageUrl?: string };
type Achiever = User & { monthlyEarnings: number; prizeGiven?: boolean; prizeGivenAt?: string };
type PrizeRecord = {
  userId: string;
  userName: string;
  userEmail: string;
  prize: string;
  goalAmount: number;
  monthlyEarnings: number;
  givenAt: string;
  month: number;
  year: number;
};

const normalizeCommission = (c: CommissionDB): CommissionEvent | null => {
  if (!c?.referrerId) return null;
  const amount = typeof c.amount === "number" ? c.amount : parseFloat(String(c.amount));
  const ts = typeof c.timestamp === "number" ? c.timestamp : Date.parse(String(c.timestamp));
  if (!isFinite(amount) || !isFinite(ts)) return null;
  return { referrerId: c.referrerId, amount, timestamp: ts };
};

export default function MonthlyTargetPage() {
  const [target, setTarget] = useState<Target>({ goalAmount: 30000, prize: "T-Shirt + Gift Hamper", imageUrl: "" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [allCommissions, setAllCommissions] = useState<CommissionEvent[]>([]);
  const [allUsers, setAllUsers] = useState<Record<string, User>>({});
  const [prizeRecords, setPrizeRecords] = useState<Record<string, PrizeRecord>>({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [givingPrizeToUser, setGivingPrizeToUser] = useState<string | null>(null);

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const targetRef = dbRef(database, "monthlyTarget");
    const commissionsRef = dbRef(database, "commissions");
    const usersRef = dbRef(database, "users");
    const prizeRecordsRef = dbRef(database, "prizeRecords");

    const unTarget = onValue(targetRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() as Target;
        setTarget(val);
        setImagePreview(val.imageUrl || null);
      }
    });

    const unCommissions = onValue(commissionsRef, (snapshot) => {
      const data = (snapshot.val() || {}) as Record<string, CommissionDB>;
      const list = Object.values(data).map(normalizeCommission).filter(Boolean) as CommissionEvent[];
      setAllCommissions(list);
    });

    const unUsers = onValue(usersRef, (snapshot) => {
      const data = (snapshot.val() || {}) as Record<string, RawUser>;
      const users: Record<string, User> = {};
      Object.entries(data).forEach(([id, u]) => {
        if (!u) return;
        const name = typeof u.name === "string" ? u.name.trim() : "";
        const email = typeof u.email === "string" ? u.email.trim() : "";
        // Skip deleted/rejected/nameless users to avoid "Unknown"
        if (!name) return;
        if (u.status && (u.status === "deleted" || u.status === "rejected")) return;

        users[id] = { id, name, email, imageUrl: u.imageUrl || undefined };
      });
      setAllUsers(users);
      setLoading(false);
    });

    const unPrizeRecords = onValue(prizeRecordsRef, (snapshot) => {
      setPrizeRecords(snapshot.val() || {});
    });

    return () => {
      unTarget();
      unCommissions();
      unUsers();
      unPrizeRecords();
    };
  }, []);

  const achievers: Achiever[] = useMemo(() => {
    const monthStart = new Date(currentYear, currentMonth, 1).getTime();
    const monthlyCommissions = allCommissions.filter((c) => c.timestamp >= monthStart);

    // Only accumulate earnings for users that exist (prevents Unknown)
    const earningsMap = monthlyCommissions.reduce((acc: Record<string, number>, commission) => {
      if (!allUsers[commission.referrerId]) return acc;
      acc[commission.referrerId] = (acc[commission.referrerId] || 0) + commission.amount;
      return acc;
    }, {});

    const currentMonthPrizeRecords = Object.values(prizeRecords).filter(
      (record) => record.month === currentMonth && record.year === currentYear
    );

    return Object.entries(earningsMap)
      .filter(([, earnings]) => earnings >= target.goalAmount)
      .map(([userId, monthlyEarnings]) => {
        const user = allUsers[userId];
        if (!user) return null; // safeguard, though filtered above
        const prizeRecord = currentMonthPrizeRecords.find((record) => record.userId === userId);
        return {
          ...user,
          monthlyEarnings,
          prizeGiven: !!prizeRecord,
          prizeGivenAt: prizeRecord?.givenAt,
        } as Achiever;
      })
      .filter((x): x is Achiever => x !== null)
      .sort((a, b) => b.monthlyEarnings - a.monthlyEarnings);
  }, [allCommissions, allUsers, target.goalAmount, prizeRecords, currentMonth, currentYear]);

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(String(reader.result));
      reader.readAsDataURL(file);
    }
  };

  const handleSaveTarget = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      let finalImageUrl = target.imageUrl || "";
      if (imageFile) {
        const fileRef = storageRef(storage, `target-prizes/${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(fileRef, imageFile);
        finalImageUrl = await getDownloadURL(snapshot.ref);
      }
      const newTarget = { ...target, imageUrl: finalImageUrl };
      await set(dbRef(database, "monthlyTarget"), newTarget);
      alert("Monthly target updated successfully!");
    } catch (error) {
      alert("Failed to update target.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGivePrize = async (achiever: Achiever) => {
    if (!window.confirm(`Mark prize as given to ${achiever.name}?`)) return;

    setGivingPrizeToUser(achiever.id);
    try {
      const now = new Date();
      const prizeRecord: PrizeRecord = {
        userId: achiever.id,
        userName: achiever.name,
        userEmail: achiever.email,
        prize: target.prize,
        goalAmount: target.goalAmount,
        monthlyEarnings: achiever.monthlyEarnings,
        givenAt: now.toISOString(),
        month: now.getMonth(),
        year: now.getFullYear(),
      };

      await push(dbRef(database, "prizeRecords"), prizeRecord);
      const userPrizeRef = dbRef(database, `users/${achiever.id}/monthlyPrizes/${currentYear}_${currentMonth}`);
      await set(userPrizeRef, {
        prize: target.prize,
        collectedAt: now.toISOString(),
        goalAmount: target.goalAmount,
        earnings: achiever.monthlyEarnings,
      });

      // Send email if we have a valid email
      if (achiever.email && achiever.email.includes("@")) {
        await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: achiever.email,
            subject: `🎉 Congratulations! You have won this month's prize!`,
            htmlContent: `<h1>Congratulations ${achiever.name}!</h1><p>You have successfully achieved the monthly target of Rs ${target.goalAmount.toLocaleString()}!</p><p>Your prize: <strong>${target.prize}</strong></p><p>Your earnings this month: <strong>Rs ${achiever.monthlyEarnings.toLocaleString()}</strong></p><p>Please contact our support team to arrange collection of your prize.</p><p>Thank you for being an amazing affiliate!</p>`,
          }),
        });
      }

      alert(`Prize marked as given to ${achiever.name}!`);
    } catch (error) {
      console.error("Error giving prize:", error);
      alert("Failed to mark prize as given.");
    } finally {
      setGivingPrizeToUser(null);
    }
  };

  return (
    <>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900">Monthly Affiliate Target</h2>
        <p className="mt-1 text-base text-slate-500">Set a monthly goal and reward top-performing affiliates.</p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <form onSubmit={handleSaveTarget} className="rounded-lg border bg-white p-6 shadow-sm space-y-6">
            <h3 className="text-lg font-semibold text-slate-800">Target Settings</h3>
            <InputField
              label="Goal Amount (Rs)"
              id="goalAmount"
              type="number"
              value={target.goalAmount}
              onChange={(e) => setTarget({ ...target, goalAmount: Number(e.target.value) })}
            />
            <InputField
              label="Prize Description"
              id="prize"
              type="text"
              value={target.prize}
              onChange={(e) => setTarget({ ...target, prize: e.target.value })}
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prize Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100"
              />
              {imagePreview && (
                <Image
                  src={imagePreview}
                  alt="Prize preview"
                  width={128}
                  height={128}
                  className="mt-4 rounded-md object-contain border bg-slate-50"
                />
              )}
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-sky-400"
            >
              {isSaving ? "Saving..." : "Save Target"}
            </button>
          </form>
        </div>
        <div className="lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">This Month&apos;s Achievers ({achievers.length})</h3>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">User</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Monthly Earnings</th>
                    <th className="px-6 py-3 text-center text-xs font-medium uppercase text-slate-500">Prize Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-slate-500">
                        Loading data...
                      </td>
                    </tr>
                  ) : achievers.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-slate-500">
                        No users have reached the target yet this month.
                      </td>
                    </tr>
                  ) : (
                    achievers.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-4">
                            <div className="relative h-10 w-10 flex-shrink-0">
                              <Image
                                src={user.imageUrl || "/default-avatar.png"}
                                alt={user.name}
                                fill
                                className="rounded-full object-cover"
                              />
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">{user.name}</div>
                              <div className="text-sm text-slate-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-semibold text-green-600">
                          Rs {user.monthlyEarnings.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {user.prizeGiven ? (
                            <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1">
                              <CheckCircleIcon className="h-4 w-4 text-green-600" />
                              <span className="text-xs font-semibold text-green-700">Prize Given</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleGivePrize(user)}
                              disabled={givingPrizeToUser === user.id}
                              className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:bg-amber-300 transition-colors"
                            >
                              {givingPrizeToUser === user.id ? (
                                <>
                                  <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                                  Processing...
                                </>
                              ) : (
                                <>
                                  <GiftIcon className="h-4 w-4" />
                                  Give Prize
                                </>
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function InputField({ id, label, ...props }: { id: string; label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input id={id} {...props} className="mt-1 w-full rounded-md border-slate-300 shadow-sm focus:border-sky-500 focus:ring-sky-500" />
    </div>
  );
}
function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="currentColor" viewBox="0 0 20 20" {...props}>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function GiftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="currentColor" viewBox="0 0 20 20" {...props}>
      <path d="M5 5a3 3 0 015-2.236A3 3 0 0114.83 6H16a2 2 0 110 4h-5V9a1 1 0 10-2 0v1H4a2 2 0 110-4h1.17C5.06 5.687 5 5.35 5 5zm4 1V5a1 1 0 10-1 1h1zm3 0a1 1 0 10-1-1v1h1z" />
      <path d="M9 11H3v5a2 2 0 002 2h4v-7zM11 18h4a2 2 0 002-2v-5h-6v7z" />
    </svg>
  );
}