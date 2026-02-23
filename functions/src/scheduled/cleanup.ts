/**
 * cleanup — daily: purge expired data (old invites, stale oauth states, old audit logs).
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { Collections } from "../shared/collections.js";

export const cleanup = onSchedule({
  schedule: "every day 03:00",
  timeoutSeconds: 300,
}, async () => {
  const now = Date.now();
  let totalDeleted = 0;

  // 1. Expire old pending invites (older than 7 days)
  const inviteExpiry = Timestamp.fromDate(new Date(now - 7 * 24 * 60 * 60 * 1000));
  const oldInvites = await db.collection(Collections.INVITES)
    .where("status", "==", "pending")
    .where("createdAt", "<=", inviteExpiry)
    .get();

  if (!oldInvites.empty) {
    const batch = db.batch();
    let count = 0;
    for (const doc of oldInvites.docs) {
      batch.update(doc.ref, { status: "expired" });
      count++;
      if (count >= 500) {
        await batch.commit();
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
    totalDeleted += oldInvites.size;
    console.log(`Expired ${oldInvites.size} old invites`);
  }

  // 2. Delete stale OAuth state docs (older than 15 minutes)
  const oauthStateExpiry = Timestamp.fromDate(new Date(now - 15 * 60 * 1000));
  const staleStates = await db.collection("oauthStates")
    .where("createdAt", "<=", oauthStateExpiry)
    .get();

  if (!staleStates.empty) {
    const batch = db.batch();
    let count = 0;
    for (const doc of staleStates.docs) {
      batch.delete(doc.ref);
      count++;
      if (count >= 500) {
        await batch.commit();
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
    totalDeleted += staleStates.size;
    console.log(`Deleted ${staleStates.size} stale OAuth states`);
  }

  // 3. Delete old audit logs (older than 90 days)
  const auditExpiry = Timestamp.fromDate(new Date(now - 90 * 24 * 60 * 60 * 1000));
  const oldAuditLogs = await db.collection(Collections.AUDIT_LOGS)
    .where("createdAt", "<=", auditExpiry)
    .limit(500)
    .get();

  if (!oldAuditLogs.empty) {
    const batch = db.batch();
    for (const doc of oldAuditLogs.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    totalDeleted += oldAuditLogs.size;
    console.log(`Deleted ${oldAuditLogs.size} old audit logs`);
  }

  // 4. Delete read notifications older than 30 days
  const notifExpiry = Timestamp.fromDate(new Date(now - 30 * 24 * 60 * 60 * 1000));
  const oldNotifications = await db.collection(Collections.NOTIFICATIONS)
    .where("read", "==", true)
    .where("createdAt", "<=", notifExpiry)
    .limit(500)
    .get();

  if (!oldNotifications.empty) {
    const batch = db.batch();
    for (const doc of oldNotifications.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    totalDeleted += oldNotifications.size;
    console.log(`Deleted ${oldNotifications.size} old notifications`);
  }

  // 5. Clean up failed scheduled events older than 7 days with max retries exceeded
  const failedExpiry = Timestamp.fromDate(new Date(now - 7 * 24 * 60 * 60 * 1000));
  const failedEvents = await db.collection(Collections.SCHEDULED_EVENTS)
    .where("status", "==", "failed")
    .where("updatedAt", "<=", failedExpiry)
    .limit(500)
    .get();

  if (!failedEvents.empty) {
    const batch = db.batch();
    for (const doc of failedEvents.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    totalDeleted += failedEvents.size;
    console.log(`Deleted ${failedEvents.size} old failed events`);
  }

  console.log(`Daily cleanup complete. Total items processed: ${totalDeleted}`);
});
