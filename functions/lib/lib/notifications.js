"use strict";
/**
 * Notification service — FCM push + in-app notification creation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotification = sendNotification;
exports.notifyWorkspace = notifyWorkspace;
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const collections_js_1 = require("../shared/collections.js");
/**
 * Send a notification: creates in-app record and sends FCM push if user has tokens.
 */
async function sendNotification(payload) {
    // Create in-app notification
    const notifRef = await firebase_js_1.db.collection(collections_js_1.Collections.NOTIFICATIONS).add({
        userId: payload.userId,
        workspaceId: payload.workspaceId,
        title: payload.title,
        body: payload.body,
        type: payload.type,
        resourceType: payload.resourceType || null,
        resourceId: payload.resourceId || null,
        read: false,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    // Send FCM push notification
    try {
        const userSnap = await firebase_js_1.db.collection(collections_js_1.Collections.USERS).doc(payload.userId).get();
        if (!userSnap.exists)
            return notifRef.id;
        const fcmTokens = userSnap.data().fcmTokens || [];
        if (fcmTokens.length === 0)
            return notifRef.id;
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
        const response = await firebase_js_1.messaging.sendEachForMulticast(message);
        // Clean up invalid tokens
        if (response.failureCount > 0) {
            const invalidTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success && resp.error?.code === "messaging/registration-token-not-registered") {
                    invalidTokens.push(fcmTokens[idx]);
                }
            });
            if (invalidTokens.length > 0) {
                await userSnap.ref.update({
                    fcmTokens: firestore_1.FieldValue.arrayRemove(...invalidTokens),
                });
            }
        }
    }
    catch (err) {
        // FCM failures are non-fatal — the in-app notification is still created
        console.warn("FCM push failed (non-fatal):", err instanceof Error ? err.message : err);
    }
    return notifRef.id;
}
/**
 * Send a notification to all members of a workspace.
 */
async function notifyWorkspace(workspaceId, title, body, type, resourceType, resourceId) {
    // Find workspace organization
    const workspaceSnap = await firebase_js_1.db.collection(collections_js_1.Collections.WORKSPACES).doc(workspaceId).get();
    if (!workspaceSnap.exists)
        return;
    const orgId = workspaceSnap.data().organizationId;
    // Get all members
    const membersSnap = await firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATION_MEMBERS)
        .where("organizationId", "==", orgId)
        .get();
    // Send to each member
    const promises = membersSnap.docs.map((doc) => {
        const userId = doc.data().userId;
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
//# sourceMappingURL=notifications.js.map