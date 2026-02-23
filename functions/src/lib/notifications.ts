/**
 * Notification service — FCM push + in-app notification creation.
 */

import { FieldValue } from "firebase-admin/firestore";
import { db, messaging } from "../config/firebase.js";
import { Collections } from "../shared/collections.js";

interface NotificationPayload {
  userId: string;
  workspaceId: string;
  title: string;
  body: string;
  type: string;
  resourceType?: string;
  resourceId?: string;
}

/**
 * Send a notification: creates in-app record and sends FCM push if user has tokens.
 */
export async function sendNotification(payload: NotificationPayload): Promise<string> {
  // Create in-app notification
  const notifRef = await db.collection(Collections.NOTIFICATIONS).add({
    userId: payload.userId,
    workspaceId: payload.workspaceId,
    title: payload.title,
    body: payload.body,
    type: payload.type,
    resourceType: payload.resourceType || null,
    resourceId: payload.resourceId || null,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Send FCM push notification
  try {
    const userSnap = await db.collection(Collections.USERS).doc(payload.userId).get();
    if (!userSnap.exists) return notifRef.id;

    const fcmTokens = (userSnap.data()!.fcmTokens as string[]) || [];
    if (fcmTokens.length === 0) return notifRef.id;

    const message = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        type: payload.type,
        notificationId: notifRef.id,
        ...(payload.resourceType ? { resourceType: payload.resourceType } : {}),
        ...(payload.resourceId ? { resourceId: payload.resourceId } : {}),
      },
      tokens: fcmTokens,
    };

    const response = await messaging.sendEachForMulticast(message);

    // Clean up invalid tokens
    if (response.failureCount > 0) {
      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error?.code === "messaging/registration-token-not-registered") {
          invalidTokens.push(fcmTokens[idx]);
        }
      });

      if (invalidTokens.length > 0) {
        await userSnap.ref.update({
          fcmTokens: FieldValue.arrayRemove(...invalidTokens),
        });
      }
    }
  } catch (err) {
    // FCM failures are non-fatal — the in-app notification is still created
    console.warn("FCM push failed (non-fatal):", err instanceof Error ? err.message : err);
  }

  return notifRef.id;
}

/**
 * Send a notification to all members of a workspace.
 */
export async function notifyWorkspace(
  workspaceId: string,
  title: string,
  body: string,
  type: string,
  resourceType?: string,
  resourceId?: string,
): Promise<void> {
  // Find workspace organization
  const workspaceSnap = await db.collection(Collections.WORKSPACES).doc(workspaceId).get();
  if (!workspaceSnap.exists) return;

  const orgId = workspaceSnap.data()!.organizationId as string;

  // Get all members
  const membersSnap = await db.collection(Collections.ORGANIZATION_MEMBERS)
    .where("organizationId", "==", orgId)
    .get();

  // Send to each member
  const promises = membersSnap.docs.map((doc) => {
    const userId = doc.data().userId as string;
    return sendNotification({
      userId,
      workspaceId,
      title,
      body,
      type,
      resourceType,
      resourceId,
    });
  });

  await Promise.allSettled(promises);
}
