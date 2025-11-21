"use client";

import { useEffect, useState, useCallback, FormEvent, useRef } from "react";
import { database, auth } from "@/lib/firebase";
import { ref as dbRef, onValue, update, get, push } from "firebase/database";
import Image from "next/image";
import type { SVGProps } from "react";

// Types
type OrderStatus = "Pending Approval" | "Completed" | "Rejected";
type Order = {
  id: string;
  userId: string;
  customerName: string;
  product: string;
  status: OrderStatus;
  paymentMethod: string;
  transactionCode: string;
  courseId: string;
  referrerId?: string;
  createdAt: string;
  email: string;
  commissionAmount?: number;
  cashbackAmount?: number; // cashback for the customer
  paymentProofUrl?: string;
};
type OrderDB = Partial<Omit<Order, "id">>;

type User = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  imageUrl?: string;
  courseId?: string;
  status?: string;
  totalEarnings?: number;
  balance?: number;
  specialAccess?: {
    active?: boolean;
    packageId?: string;
    commissionPercent?: number;
    previousCourseId?: string | null;
  };
};
type UserDB = Partial<Omit<User, "id">>;

type Package = {
  id: string;
  name: string;
  price?: number;
  imageUrl?: string;
  features?: string[];
  highlight?: boolean;
  badge?: string;
  commissionPercent?: number;
};
type PackageDB = Omit<Package, "id">;

type PackagesMap = Record<string, PackageDB>;
type UsersMap = Record<string, UserDB>;

type EnrichedOrder = Order & {
  referrerName?: string;
  coursePrice?: number;
  customerImageUrl?: string;
  referrerSpecialPct?: number; // display-only
};

const formatCurrency = (n?: number) => (n != null && isFinite(n) ? `Rs ${n.toLocaleString()}` : "N/A");
const startOfTodayTs = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const startOfWeekTs = () => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const startOfMonthTs = () => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Force numeric coercion for DB values
const toNumber = (v: unknown) => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
};

export default function AdminOrdersPage() {
  const [allOrders, setAllOrders] = useState<EnrichedOrder[]>([]);
  const [allUsers, setAllUsers] = useState<Record<string, User>>({});
  const [allPackages, setAllPackages] = useState<Record<string, Package>>({});
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<User | null>(null);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

  const fetchDataAndCombine = useCallback(async () => {
    try {
      const [ordersSnapshot, usersSnapshot, packagesSnapshot] = await Promise.all([
        get(dbRef(database, "orders")),
        get(dbRef(database, "users")),
        get(dbRef(database, "packages")),
      ]);

      const usersData = (usersSnapshot.val() || {}) as UsersMap;
      const packagesData = (packagesSnapshot.val() || {}) as PackagesMap;

      const usersMap: Record<string, User> = {};
      Object.entries(usersData).forEach(([uid, u]) => {
        usersMap[uid] = {
          id: uid,
          name: String(u.name || ""),
          email: String(u.email || ""),
          phone: u.phone ? String(u.phone) : undefined,
          imageUrl: u.imageUrl ? String(u.imageUrl) : undefined,
          courseId: u.courseId ? String(u.courseId) : undefined,
          status: u.status ? String(u.status) : undefined,
          totalEarnings: toNumber(u.totalEarnings),
          balance: toNumber(u.balance),
          specialAccess: u.specialAccess || undefined,
        };
      });
      setAllUsers(usersMap);

      const pkMap: Record<string, Package> = {};
      Object.entries(packagesData).forEach(([pid, p]) => {
        pkMap[pid] = {
          id: pid,
          name: String(p.name || ""),
          price: toNumber(p.price),
          imageUrl: p.imageUrl || "",
          highlight: Boolean(p.highlight),
          badge: p.badge || "",
          features: Array.isArray(p.features) ? p.features : undefined,
          commissionPercent:
            typeof p.commissionPercent === "number" ? p.commissionPercent : toNumber(p.commissionPercent) || 58,
        };
      });
      setAllPackages(pkMap);

      const ordersData = (ordersSnapshot.val() || {}) as Record<string, OrderDB>;
      const enrichedOrdersArray: EnrichedOrder[] = Object.entries(ordersData).map(([id, order]) => {
        const base: EnrichedOrder = {
          id,
          userId: String(order.userId || ""),
          customerName: String(order.customerName || ""),
          product: String(order.product || ""),
          status: (order.status as OrderStatus) || "Pending Approval",
          paymentMethod: String(order.paymentMethod || ""),
          transactionCode: String(order.transactionCode || ""),
          courseId: String(order.courseId || ""),
          referrerId: order.referrerId ? String(order.referrerId) : undefined,
          createdAt: String(order.createdAt || new Date().toISOString()),
          email: String(order.email || ""),
          commissionAmount:
            typeof order.commissionAmount === "number" ? order.commissionAmount : toNumber(order.commissionAmount) || undefined,
          cashbackAmount:
            typeof order.cashbackAmount === "number" ? order.cashbackAmount : toNumber(order.cashbackAmount) || undefined,
          paymentProofUrl: order.paymentProofUrl,
        };

        const customerUser = usersData[base.userId];
        const displayName = customerUser?.name ? String(customerUser.name) : base.customerName;
        const displayEmail = customerUser?.email ? String(customerUser.email) : base.email;

        const refU = base.referrerId ? usersData[base.referrerId] : undefined;
        const refName = base.referrerId && refU ? String(refU?.name || "") : undefined;

        const price =
          base.courseId && packagesData[base.courseId]?.price ? toNumber(packagesData[base.courseId]?.price) : undefined;

        const customerImageUrl =
          base.userId && usersData[base.userId]?.imageUrl ? String(usersData[base.userId].imageUrl) : undefined;

        const sa = refU?.specialAccess;
        const referrerSpecialPct =
          sa && sa.active !== false && typeof sa.commissionPercent === "number"
            ? Number(sa.commissionPercent)
            : undefined;

        return {
          ...base,
          customerName: displayName,
          email: displayEmail,
          referrerName: refName,
          coursePrice: price,
          customerImageUrl,
          referrerSpecialPct,
        };
      });

      enrichedOrdersArray.sort((a, b) => {
        const statusOrder: Record<OrderStatus, number> = { "Pending Approval": 0, Completed: 1, Rejected: 2 };
        if (statusOrder[a.status] !== statusOrder[b.status])
          return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      setAllOrders(enrichedOrdersArray);
    } catch (error) {
      console.error("Failed to fetch admin data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ordersRef = dbRef(database, "orders");
    const usersRef = dbRef(database, "users");
    const packagesRef = dbRef(database, "packages");

    const unsubOrders = onValue(ordersRef, () => {
      fetchDataAndCombine();
    });
    const unsubUsers = onValue(usersRef, () => {
      fetchDataAndCombine();
    });
    const unsubPk = onValue(packagesRef, () => {
      fetchDataAndCombine();
    });

    return () => {
      unsubOrders();
      unsubUsers();
      unsubPk();
    };
  }, [fetchDataAndCombine]);

  const filteredOrders = allOrders.filter(
    (o) =>
      o.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.product?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stats
  const stats = {
    total: filteredOrders.length,
    pending: filteredOrders.filter((o) => o.status === "Pending Approval").length,
    completed: filteredOrders.filter((o) => o.status === "Completed").length,
    rejected: filteredOrders.filter((o) => o.status === "Rejected").length,
  };

  const handleApproveOrder = async (order: EnrichedOrder) => {
    if (
      !window.confirm(
        "Approve this request? This will activate/upgrade the user, award commission, and apply cashback."
      )
    )
      return;
    try {
      const updates: Record<string, unknown> = {};
      const isUpgrade = typeof order.product === "string" && order.product.startsWith("Upgrade");

      // Basic order/user state updates
      updates[`/orders/${order.id}/status`] = "Completed";
      if (isUpgrade) {
        updates[`/users/${order.userId}/courseId`] = order.courseId;
      } else {
        updates[`/users/${order.userId}/status`] = "active";
        if (order.courseId) updates[`/users/${order.userId}/courseId`] = order.courseId;
      }

      // Determine purchased package price
      let purchasedPackagePrice = toNumber(order.coursePrice);
      if (!purchasedPackagePrice) {
        const pkgSnap = await get(dbRef(database, `packages/${order.courseId}`));
        if (pkgSnap.exists()) purchasedPackagePrice = toNumber(pkgSnap.val()?.price);
      }

      // Referral commission (course-defined percent) + 10% cashback to the customer
      let commissionAmount = 0;
      let cashbackAmount = 0;
      const cashbackPct = 10;

      if (purchasedPackagePrice > 0 && order.referrerId) {
        // Commission percent strictly from the course (fallback 58)
        let coursePct = allPackages[order.courseId]?.commissionPercent;
        if (typeof coursePct !== "number") {
          const pkgSnap = await get(dbRef(database, `packages/${order.courseId}`));
          coursePct = pkgSnap.exists() ? toNumber(pkgSnap.val()?.commissionPercent) : 58;
        }
        if (!coursePct || coursePct <= 0) coursePct = 58;

        // Referrer commission
        commissionAmount = Math.floor(purchasedPackagePrice * (coursePct / 100));

        // Credit commission to referrer (and counters)
        const refSnap = await get(dbRef(database, `users/${order.referrerId}`));
        if (refSnap.exists()) {
          const d = refSnap.val() || {};
          const today = startOfTodayTs();
          const week = startOfWeekTs();
          const month = startOfMonthTs();

          const lastDailyReset = toNumber(d.lastDailyReset);
          const lastWeeklyReset = toNumber(d.lastWeeklyReset);
          const lastMonthlyReset = toNumber(d.lastMonthlyReset);

          const dailyBase = lastDailyReset >= today ? toNumber(d.dailyEarnings) : 0;
          const weeklyBase = lastWeeklyReset >= week ? toNumber(d.weeklyEarnings) : 0;
          const monthlyBase = lastMonthlyReset >= month ? toNumber(d.monthlyEarnings) : 0;

          updates[`/users/${order.referrerId}/balance`] = toNumber(d.balance) + commissionAmount;
          updates[`/users/${order.referrerId}/totalEarnings`] = toNumber(d.totalEarnings) + commissionAmount;
          updates[`/users/${order.referrerId}/dailyEarnings`] = dailyBase + commissionAmount;
          updates[`/users/${order.referrerId}/weeklyEarnings`] = weeklyBase + commissionAmount;
          updates[`/users/${order.referrerId}/monthlyEarnings`] = monthlyBase + commissionAmount;
          updates[`/users/${order.referrerId}/lastDailyReset`] = today;
          updates[`/users/${order.referrerId}/lastWeeklyReset`] = week;
          updates[`/users/${order.referrerId}/lastMonthlyReset`] = month;
        }
        updates[`/orders/${order.id}/commissionAmount`] = commissionAmount;

        // 10% cashback to the customer (referred person)
        cashbackAmount = Math.floor(purchasedPackagePrice * (cashbackPct / 100));
        const custSnap = await get(dbRef(database, `users/${order.userId}`));
        if (custSnap.exists()) {
          const cust = custSnap.val() || {};
          // Balance
          updates[`/users/${order.userId}/balance`] = toNumber(cust.balance) + cashbackAmount;

          // Also update customer's earnings counters and lifetime
          const cToday = startOfTodayTs();
          const cWeek = startOfWeekTs();
          const cMonth = startOfMonthTs();

          const cLastDailyReset = toNumber(cust.lastDailyReset);
          const cLastWeeklyReset = toNumber(cust.lastWeeklyReset);
          const cLastMonthlyReset = toNumber(cust.lastMonthlyReset);

          const cDailyBase = cLastDailyReset >= cToday ? toNumber(cust.dailyEarnings) : 0;
          const cWeeklyBase = cLastWeeklyReset >= cWeek ? toNumber(cust.weeklyEarnings) : 0;
          const cMonthlyBase = cLastMonthlyReset >= cMonth ? toNumber(cust.monthlyEarnings) : 0;

          updates[`/users/${order.userId}/dailyEarnings`] = cDailyBase + cashbackAmount;
          updates[`/users/${order.userId}/weeklyEarnings`] = cWeeklyBase + cashbackAmount;
          updates[`/users/${order.userId}/monthlyEarnings`] = cMonthlyBase + cashbackAmount;
          updates[`/users/${order.userId}/lastDailyReset`] = cToday;
          updates[`/users/${order.userId}/lastWeeklyReset`] = cWeek;
          updates[`/users/${order.userId}/lastMonthlyReset`] = cMonth;

          updates[`/users/${order.userId}/totalEarnings`] = toNumber(cust.totalEarnings) + cashbackAmount;
        }
        updates[`/orders/${order.id}/cashbackAmount`] = cashbackAmount;
      }

      await update(dbRef(database), updates);

      // Log commission and cashback entries
      if (order.referrerId && commissionAmount > 0) {
        await push(dbRef(database, "commissions"), {
          orderId: order.id,
          referrerId: order.referrerId,
          amount: commissionAmount,
          timestamp: Date.now(),
          courseId: order.courseId,
          userId: order.userId,
        });
      }
      if (order.referrerId && cashbackAmount > 0) {
        await push(dbRef(database, "cashbacks"), {
          orderId: order.id,
          userId: order.userId,
          referrerId: order.referrerId,
          amount: cashbackAmount,
          timestamp: Date.now(),
          courseId: order.courseId,
        });
      }

      // Email (domain fixed to plexcourses.com)
      const subject = isUpgrade
        ? "Your Package Upgrade is Complete!"
        : "Your Plex Courses Account is Activated!";
      const htmlContent = `<h1>Congratulations, ${order.customerName}!</h1><p>${
        isUpgrade
          ? `Your upgrade to <strong>${order.product.replace("Upgrade to: ", "")}</strong> has been approved.`
          : "Your account has been approved and is now active. Please log in again to access your dashboard."
      }</p>${order.referrerId ? `<p>A 10% cashback has been credited to your account balance.</p>` : ""}<p><a href="https://plexcourses.com/login">Log in to Dashboard</a></p>`;

      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: order.email, subject, htmlContent }),
      });

      alert("Order approved successfully!");
    } catch (error) {
      console.error("Error approving order:", error);
      alert("Failed to approve order.");
    }
  };

  const handleRejectOrder = async (order: EnrichedOrder) => {
    const isUpgrade = typeof order.product === "string" && order.product.startsWith("Upgrade");
    const confirmMsg = isUpgrade
      ? "Reject this upgrade request?"
      : "Reject this signup request? This will mark the user as rejected.";
    if (!window.confirm(confirmMsg)) return;

    try {
      const updates: Record<string, unknown> = {};
      updates[`/orders/${order.id}/status`] = "Rejected";
      if (!isUpgrade) updates[`/users/${order.userId}/status`] = "rejected";

      if (order.referrerId) {
        const refRef = dbRef(database, `users/${order.referrerId}/referrals`);
        const refSnap = await get(refRef);
        if (refSnap.exists()) {
          const referrals = refSnap.val() || {};
          const keyToRemove = Object.keys(referrals).find((k) => referrals[k]?.email === order.email);
          if (keyToRemove) updates[`/users/${order.referrerId}/referrals/${keyToRemove}`] = null;
        }
      }

      await update(dbRef(database), updates);

      const subject = isUpgrade
        ? "Your Upgrade Request Was Not Approved"
        : "Your Account Request Was Not Approved";
      const htmlContent = isUpgrade
        ? `<h1>Upgrade Not Approved</h1><p>Your upgrade request was not approved.</p>`
        : `<h1>Account Not Approved</h1><p>Your account request was not approved.</p>`;

      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: order.email, subject, htmlContent }),
      });

      alert("Order rejected successfully!");
    } catch (error) {
      console.error("Error rejecting order:", error);
      alert("Failed to reject order.");
    }
  };

  const handleOpenEditModal = async (userId: string) => {
    const snapshot = await get(dbRef(database, `users/${userId}`));
    if (snapshot.exists()) {
      const v = snapshot.val() as UserDB;
      setSelectedUserForEdit({
        id: userId,
        name: v.name || "",
        email: v.email || "",
        phone: v.phone,
        imageUrl: v.imageUrl,
        courseId: v.courseId,
        status: v.status,
        totalEarnings: toNumber(v.totalEarnings),
        balance: toNumber(v.balance),
        specialAccess: v.specialAccess,
      });
      setIsEditModalOpen(true);
    } else {
      alert("Could not find user data to edit.");
    }
  };

  const handleSaveUserDetails = async (userData: Partial<User>) => {
    if (!selectedUserForEdit) return;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Admin not authenticated.");
      const response = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ userId: selectedUserForEdit.id, ...userData }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Failed to update user.");
      alert("User details updated!");
      setIsEditModalOpen(false);
      await fetchDataAndCombine();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Update failed";
      alert(`Error: ${errMsg}`);
    }
  };

  const handleDeleteUser = async (userToDelete: User) => {
    if (!window.confirm(`This will permanently delete the account for ${userToDelete.name}. Continue?`)) return;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Admin not authenticated.");

      const response = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uidToDelete: userToDelete.id, cascadeAffiliates: false }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Failed to delete user.");

      alert(`User ${userToDelete.name} has been deleted. Related data cleaned up.`);
      setIsEditModalOpen(false);
      await fetchDataAndCombine();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Deletion failed";
      alert(`Error: ${errMsg}`);
    }
  };

  const openProofModal = (url: string) => setSelectedProofUrl(url);
  const closeProofModal = () => setSelectedProofUrl(null);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Orders Management</h1>
          <p className="mt-2 text-sm text-slate-600">Manage all signup and upgrade requests</p>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Total Orders</p>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            </div>
            <div className="rounded-full bg-slate-100 p-3">
              <ShoppingBagIcon className="h-6 w-6 text-slate-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-yellow-600">Pending</p>
              <p className="text-2xl font-bold text-slate-900">{stats.pending}</p>
            </div>
            <div className="rounded-full bg-yellow-100 p-3">
              <ClockIcon className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600">Completed</p>
              <p className="text-2xl font-bold text-slate-900">{stats.completed}</p>
            </div>
            <div className="rounded-full bg-green-100 p-3">
              <CheckCircleIcon className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-600">Rejected</p>
              <p className="text-2xl font-bold text-slate-900">{stats.rejected}</p>
            </div>
            <div className="rounded-full bg-red-100 p-3">
              <XCircleIcon className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or product..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block">
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Profile
                  </th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Customer
                  </th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Request
                  </th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Payment
                  </th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Proof
                  </th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Referred By
                  </th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-500 text-center">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <div className="flex justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-600"></div>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">Loading orders...</p>
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      No orders found.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="h-10 w-10 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center">
                          {order.customerImageUrl ? (
                            <Image
                              src={order.customerImageUrl}
                              alt={`${order.customerName}'s profile`}
                              width={40}
                              height={40}
                              className="object-cover"
                            />
                          ) : (
                            <UserIcon className="h-6 w-6 text-slate-400" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-slate-900">{order.customerName}</div>
                          <div className="mt-1 text-sm text-slate-500">{order.email}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {order.createdAt ? new Date(order.createdAt).toLocaleString() : "-"}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-slate-900">{order.product}</div>
                          <div className="mt-1 text-sm font-semibold text-slate-600">
                            {formatCurrency(order.coursePrice)}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{order.paymentMethod}</div>
                          <div
                            className="mt-1 max-w-[180px] truncate text-xs text-slate-500 font-mono"
                            title={order.transactionCode}
                          >
                            {order.transactionCode}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {order.paymentProofUrl ? (
                          <button
                            onClick={() => openProofModal(order.paymentProofUrl!)}
                            className="text-sky-600 hover:text-sky-700 underline text-sm"
                          >
                            View Proof
                          </button>
                        ) : (
                          "N/A"
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900">
                        {order.referrerName ? (
                          <>
                            {order.referrerName}
                            {typeof order.referrerSpecialPct === "number" && (
                              <span className="ml-2 rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-semibold text-fuchsia-700">
                                {order.referrerSpecialPct}% special
                              </span>
                            )}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <ActionsDropdown
                          order={order}
                          onEdit={handleOpenEditModal}
                          onApprove={handleApproveOrder}
                          onReject={handleRejectOrder}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-600"></div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-lg border bg-white p-6 text-center text-slate-500">No orders found.</div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center">
                    {order.customerImageUrl ? (
                      <Image
                        src={order.customerImageUrl}
                        alt={`${order.customerName}'s profile`}
                        width={40}
                        height={40}
                        className="object-cover"
                      />
                    ) : (
                      <UserIcon className="h-6 w-6 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{order.customerName}</h3>
                    <p className="text-sm text-slate-500">{order.email}</p>
                  </div>
                </div>
                <StatusBadge status={order.status} />
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Product:</span>
                  <span className="font-medium text-slate-900">{order.product}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Price:</span>
                  <span className="font-medium text-slate-900">{formatCurrency(order.coursePrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment:</span>
                  <span className="font-medium text-slate-900">{order.paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Transaction:</span>
                  <span className="text-slate-900 font-mono">{order.transactionCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Proof:</span>
                  {order.paymentProofUrl ? (
                    <button
                      onClick={() => openProofModal(order.paymentProofUrl!)}
                      className="text-sky-600 hover:text-sky-700 underline text-sm"
                    >
                      View
                    </button>
                  ) : (
                    <span className="text-slate-500">N/A</span>
                  )}
                </div>
                {order.referrerName && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Referred by:</span>
                    <span className="font-medium text-slate-900">
                      {order.referrerName}
                      {typeof order.referrerSpecialPct === "number" && (
                        <span className="ml-2 rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-semibold text-fuchsia-700">
                          {order.referrerSpecialPct}% special
                        </span>
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Date:</span>
                  <span className="text-slate-900">
                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "-"}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleOpenEditModal(order.userId)}
                  className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Edit User
                </button>
                {order.status === "Pending Approval" && (
                  <>
                    <button
                      onClick={() => handleApproveOrder(order)}
                      className="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleRejectOrder(order)}
                      className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Payment Proof Modal */}
      {selectedProofUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75" onClick={closeProofModal}>
          <div className="relative max-w-3xl w-full p-4" onClick={(e) => e.stopPropagation()}>
            <Image
              src={selectedProofUrl}
              alt="Payment Proof"
              width={800}
              height={600}
              className="w-full h-auto rounded-lg shadow-lg"
            />
            <button
              onClick={closeProofModal}
              className="absolute top-2 right-2 bg-white rounded-full p-1 text-slate-600 hover:text-slate-800"
            >
              <XIcon className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && selectedUserForEdit && (
        <EditUserModal
          user={selectedUserForEdit}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleSaveUserDetails}
          onDelete={handleDeleteUser}
        />
      )}
    </div>
  );
}

// Actions Dropdown Component
function ActionsDropdown({
  order,
  onEdit,
  onApprove,
  onReject,
}: {
  order: EnrichedOrder;
  onEdit: (uid: string) => void;
  onApprove: (order: EnrichedOrder) => void;
  onReject: (order: EnrichedOrder) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
      >
        Actions
        <ChevronDownIcon className="ml-2 h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5">
          <div className="py-1">
            <button
              onClick={() => {
                onEdit(order.userId);
                setIsOpen(false);
              }}
              className="flex w-full items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              <PencilIcon className="mr-3 h-4 w-4" />
              Edit User
            </button>
            {order.status === "Pending Approval" && (
              <>
                <button
                  onClick={() => {
                    onApprove(order);
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center px-4 py-2 text-sm text-green-700 hover:bg-green-50"
                >
                  <CheckIcon className="mr-3 h-4 w-4" />
                  Approve
                </button>
                <button
                  onClick={() => {
                    onReject(order);
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  <XIcon className="mr-3 h-4 w-4" />
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Edit User Modal (shows Lifetime Earnings)
function EditUserModal({
  user,
  onClose,
  onSave,
  onDelete,
}: {
  user: User;
  onClose: () => void;
  onSave: (data: Partial<User>) => void;
  onDelete: (user: User) => void;
}) {
  const [formData, setFormData] = useState({
    name: user.name || "",
    phone: user.phone || "",
    email: user.email || "",
    newPassword: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave(formData);
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-30" onClick={onClose} />
        <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Edit User Details</h2>
            <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
              <XIcon className="h-5 w-5 text-slate-500" />
            </button>
          </div>

          {/* Lifetime earnings panel */}
          <div className="mb-4 rounded-lg border bg-slate-50 p-3">
            <div className="text-xs font-medium text-slate-500">Lifetime Earnings</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {formatCurrency(Number(user.totalEarnings || 0))}
            </div>
            {typeof user.balance === "number" && (
              <div className="mt-2 text-xs text-slate-500">
                Current Balance:{" "}
                <span className="font-semibold text-slate-700">{formatCurrency(user.balance)}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <InputField
              id="name"
              label="Name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
              required
            />
            <InputField
              id="email"
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.currentTarget.value })}
              required
            />
            <InputField
              id="phone"
              label="Phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.currentTarget.value })}
            />
            <InputField
              id="password"
              label="New Password (leave blank to keep current)"
              type="password"
              value={formData.newPassword}
              onChange={(e) => setFormData({ ...formData, newPassword: e.currentTarget.value })}
              placeholder="Enter new password"
            />

            <div className="mt-6 flex justify-between border-t pt-4">
              <button
                type="button"
                onClick={() => onDelete(user)}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete User
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </form>

          {user.specialAccess && user.specialAccess.active !== false && (
            <div className="mt-4 rounded-md bg-fuchsia-50 p-3 text-xs text-fuchsia-700">
              Special access active — package: {user.specialAccess.packageId} •{" "}
              {user.specialAccess.commissionPercent ?? 58}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Reusable components
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
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
    </div>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";
  if (status === "Completed")
    return <span className={`${base} bg-green-100 text-green-800`}>Completed</span>;
  if (status === "Rejected")
    return <span className={`${base} bg-red-100 text-red-800`}>Rejected</span>;
  return <span className={`${base} bg-yellow-100 text-yellow-800`}>Pending</span>;
}

// Icons
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
function ShoppingBagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}
function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function XCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}
function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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