import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

type UsersNode = Record<
  string,
  {
    name?: string;
    email?: string;
    referrals?: Record<string, { name?: string; email?: string; joinedAt?: string }>;
  }
>;

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const db = getAdminDb();

    // Verify admin
    const decoded = await adminAuth.verifyIdToken(idToken);
    let isAdmin = decoded.admin === true;
    if (!isAdmin) {
      const adminSnap = await db.ref(`admins/${decoded.uid}`).get();
      isAdmin = adminSnap.exists() && adminSnap.val() === true;
    }
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: "Forbidden: Not an admin" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const uidToDelete: string | undefined = body?.uidToDelete;
    if (!uidToDelete) {
      return NextResponse.json({ success: false, error: "User ID to delete is required" }, { status: 400 });
    }

    // Load users to resolve name/email and clean up referrals
    const usersSnap = await db.ref("users").get();
    const usersVal: UsersNode = (usersSnap.exists() ? usersSnap.val() : {}) as UsersNode;
    const deletedUserEmail = (usersVal[uidToDelete]?.email || "").trim().toLowerCase();
    const deletedUserName = usersVal[uidToDelete]?.name || "";

    // Two non-overlapping update batches
    const updatesReferralsOnly: Record<string, any> = {};
    const updatesMain: Record<string, any> = {};

    // Summary counters
    let removedOrders = 0;
    let clearedReferrerInOrders = 0;
    let removedCommissions = 0;
    let removedCashbacks = 0;
    let clearedSpecialAssignments = 0;
    let removedReferrals = 0;

    // Preload heavy nodes
    const [ordersSnap, commissionsSnap, cashbacksSnap, spSnap] = await Promise.all([
      db.ref("orders").get(),
      db.ref("commissions").get(),
      db.ref("cashbacks").get(),
      db.ref("specialPackages").get(),
    ]);

    // MAIN: remove the user + KYC/withdrawal nodes
    updatesMain[`/users/${uidToDelete}`] = null;
    updatesMain[`/kycRequests/${uidToDelete}`] = null;
    updatesMain[`/withdrawalRequests/${uidToDelete}`] = null;

    // Track if this user had any "completed transaction"
    // - Completed order where user is buyer
    // - Any commission/cashback rows (these represent completed events)
    let hadCompletedTransaction = false;

    // MAIN: orders
    if (ordersSnap.exists()) {
      const ordersVal = ordersSnap.val() as Record<string, any>;
      for (const [oid, o] of Object.entries(ordersVal)) {
        if (!o) continue;
        // If user is buyer: delete their order
        if (String(o.userId) === uidToDelete) {
          updatesMain[`/orders/${oid}`] = null;
          removedOrders++;
          if (o.status === "Completed") hadCompletedTransaction = true;
        } else if (String(o.referrerId) === uidToDelete) {
          // If user is referrer: keep order but clear referrerId
          updatesMain[`/orders/${oid}/referrerId`] = null;
          clearedReferrerInOrders++;
          // Referrer relation being cleared does not necessarily mean buyer completed,
          // but we will rely on commissions/cashbacks below to mark "completed".
        }
      }
    }

    // MAIN: commissions - remove any rows referencing deleted user
    if (commissionsSnap.exists()) {
      const commissionsVal = commissionsSnap.val() as Record<string, any>;
      for (const [cid, c] of Object.entries(commissionsVal)) {
        if (!c) continue;
        if (String(c.referrerId) === uidToDelete || String(c.userId) === uidToDelete) {
          updatesMain[`/commissions/${cid}`] = null;
          removedCommissions++;
          hadCompletedTransaction = true; // commission rows represent completed events
        }
      }
    }

    // MAIN: cashbacks - remove any rows referencing deleted user
    if (cashbacksSnap.exists()) {
      const cashbacksVal = cashbacksSnap.val() as Record<string, any>;
      for (const [cid, c] of Object.entries(cashbacksVal)) {
        if (!c) continue;
        if (String(c.userId) === uidToDelete || String(c.referrerId) === uidToDelete) {
          updatesMain[`/cashbacks/${cid}`] = null;
          removedCashbacks++;
          hadCompletedTransaction = true; // cashback rows represent completed events
        }
      }
    }

    // MAIN: remove from specialPackages assignments
    if (spSnap.exists()) {
      const spVal = spSnap.val() as Record<string, any>;
      for (const [spid, sp] of Object.entries(spVal)) {
        if (!sp?.assignedUserIds) continue;
        if (sp.assignedUserIds[uidToDelete]) {
          updatesMain[`/specialPackages/${spid}/assignedUserIds/${uidToDelete}`] = null;
          clearedSpecialAssignments++;
        }
      }
    }

    // REFERRALS ONLY: remove references to this user from other users (by uid key or email)
    if (usersSnap.exists()) {
      for (const [otherUid, u] of Object.entries(usersVal)) {
        if (otherUid === uidToDelete) continue; // skip the user being deleted
        const refs = u?.referrals || {};
        for (const [rk, rec] of Object.entries(refs)) {
          const pointsByUid = rk === uidToDelete;
          const recEm = (rec?.email || "").trim().toLowerCase();
          const pointsByEmail = deletedUserEmail && recEm === deletedUserEmail;
          if (pointsByUid || pointsByEmail) {
            updatesReferralsOnly[`/users/${otherUid}/referrals/${rk}`] = null;
            removedReferrals++;
          }
        }
      }
    }

    // If there are any completed transactions, write an entry under withdrawalRequests/_deleted/<uid>
    if (hadCompletedTransaction) {
      updatesMain[`/withdrawalRequests/_deleted/${uidToDelete}`] = {
        name: deletedUserName || "",
        email: deletedUserEmail || "",
        deletedAt: Date.now(),
        hadCompletedTransaction: true,
      };
    }

    // Apply updates (referrals first, then main) to avoid ancestor/descendant overlap
    if (Object.keys(updatesReferralsOnly).length > 0) {
      await db.ref().update(updatesReferralsOnly);
    }
    if (Object.keys(updatesMain).length > 0) {
      await db.ref().update(updatesMain);
    }

    // Delete Auth user (ONLY the target UID)
    try {
      await adminAuth.deleteUser(uidToDelete);
    } catch {
      // ignore if already removed or not found
    }

    return NextResponse.json({
      success: true,
      message: `Deleted 1 user (no cascade).`,
      summary: {
        removedOrders,
        clearedReferrerInOrders,
        removedCommissions,
        removedCashbacks,
        clearedSpecialAssignments,
        removedReferrals,
        wroteDeletedList: hadCompletedTransaction,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An unknown error occurred.";
    console.error("Error deleting user:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}