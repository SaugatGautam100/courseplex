import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const auth = getAdminAuth();
    const db = getAdminDb();

    // Verify admin token
    const decoded = await auth.verifyIdToken(idToken);
    let isAdmin = decoded.admin === true;
    if (!isAdmin) {
      // Optional fallback to admins/<uid> in DB if you still keep that list
      const adminSnap = await db.ref(`admins/${decoded.uid}`).get();
      isAdmin = adminSnap.exists() && adminSnap.val() === true;
    }
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: "Forbidden: Not an admin" }, { status: 403 });
    }

    const { uidToDelete } = await req.json();
    if (!uidToDelete) {
      return NextResponse.json({ success: false, error: "User ID to delete is required" }, { status: 400 });
    }

    // Build batched updates for cleanup
    const updates: Record<string, null> = {};

    // Core user and related nodes
    updates[`/users/${uidToDelete}`] = null;
    updates[`/kycRequests/${uidToDelete}`] = null;

    // Withdrawal paths (covering multiple spellings/legacy)
   
    updates[`/withdrawalRequests/${uidToDelete}`] = null;
    

    // Orders cleanup: remove orders where this user is buyer OR referrer
    let removedOrders = 0;
    const ordersSnap = await db.ref("orders").get();
    if (ordersSnap.exists()) {
      const ordersVal = ordersSnap.val() as Record<string, any>;
      for (const [oid, o] of Object.entries(ordersVal)) {
        if (o?.userId === uidToDelete || o?.referrerId === uidToDelete) {
          updates[`/orders/${oid}`] = null;
          removedOrders++;
        }
      }
    }

   

    // Special packages reverse index cleanup
    let clearedSpecialAssignments = 0;
    const spSnap = await db.ref("specialPackages").get();
    if (spSnap.exists()) {
      const spVal = spSnap.val() as Record<string, any>;
      for (const [spid, sp] of Object.entries(spVal)) {
        if (sp?.assignedUserIds && sp.assignedUserIds[uidToDelete]) {
          updates[`/specialPackages/${spid}/assignedUserIds/${uidToDelete}`] = null;
          clearedSpecialAssignments++;
        }
      }
    }

    // IMPORTANT: Do NOT remove any data from referrals entries (as requested).
    // No cleanup on /users/*/referrals.

    // Apply DB cleanup and delete the Auth user
    await Promise.all([
      Object.keys(updates).length > 0 ? db.ref().update(updates) : Promise.resolve(),
      auth.deleteUser(uidToDelete),
    ]);

    return NextResponse.json({
      success: true,
      message: `User ${uidToDelete} deleted and related data cleaned (excluding referrals).`,
      summary: {
        removedOrders,
       
        clearedSpecialAssignments,
        clearedKyc: true,
        clearedWithdrawals: true,
        referralsUntouched: true,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An unknown error occurred.";
    console.error("Error deleting user:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}