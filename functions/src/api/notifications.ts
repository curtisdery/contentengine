/**
 * Notifications API — 3 onCall functions for listing, marking read, and clearing.
 */

import { onCall } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { verifyAuth } from "../middleware/auth.js";
import { Collections } from "../shared/collections.js";
import { wrapError, NotFoundError } from "../shared/errors.js";
import { docToResponse } from "../shared/transform.js";

// ─── listNotifications ───────────────────────────────────────────────────────
export const listNotifications = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const limit = Math.min(Number(request.data?.limit) || 20, 50);

    const snap = await db
      .collection(Collections.NOTIFICATIONS)
      .where("userId", "==", ctx.userId)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const items = snap.docs.map((doc) =>
      docToResponse(doc.id, doc.data() as Record<string, unknown>),
    );

    // Count unread
    const unreadSnap = await db
      .collection(Collections.NOTIFICATIONS)
      .where("userId", "==", ctx.userId)
      .where("read", "==", false)
      .count()
      .get();

    const unreadCount = unreadSnap.data().count;

    return { items, unread_count: unreadCount };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── markNotificationRead ────────────────────────────────────────────────────
export const markNotificationRead = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const notificationId = request.data?.notification_id as string;

    if (!notificationId) {
      throw new NotFoundError("notification_id is required");
    }

    const ref = db.collection(Collections.NOTIFICATIONS).doc(notificationId);
    const snap = await ref.get();

    if (!snap.exists || snap.data()!.userId !== ctx.userId) {
      throw new NotFoundError("Notification not found");
    }

    await ref.update({
      read: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── markAllNotificationsRead ────────────────────────────────────────────────
export const markAllNotificationsRead = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    const snap = await db
      .collection(Collections.NOTIFICATIONS)
      .where("userId", "==", ctx.userId)
      .where("read", "==", false)
      .get();

    const batch = db.batch();
    snap.docs.forEach((doc) => {
      batch.update(doc.ref, {
        read: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    return { success: true, marked_count: snap.size };
  } catch (err) {
    throw wrapError(err);
  }
});
