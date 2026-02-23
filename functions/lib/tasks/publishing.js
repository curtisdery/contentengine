"use strict";
/**
 * Publishing task — platform-specific publish execution.
 * Validates connection → publishes → updates status → enqueues analytics.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskPublishing = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const env_js_1 = require("../config/env.js");
const collections_js_1 = require("../shared/collections.js");
const encryption_js_1 = require("../lib/encryption.js");
const registry_js_1 = require("../lib/platforms/publishers/registry.js");
const taskClient_js_1 = require("../lib/taskClient.js");
exports.taskPublishing = (0, https_1.onRequest)({ secrets: [env_js_1.TOKEN_ENCRYPTION_KEY], timeoutSeconds: 120 }, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const { eventId } = req.body;
    if (!eventId) {
        res.status(400).json({ error: "eventId required" });
        return;
    }
    try {
        const eventRef = firebase_js_1.db.collection(collections_js_1.Collections.SCHEDULED_EVENTS).doc(eventId);
        const eventSnap = await eventRef.get();
        if (!eventSnap.exists) {
            res.status(404).json({ error: "Event not found" });
            return;
        }
        const event = eventSnap.data();
        const platformId = event.platformId;
        const workspaceId = event.workspaceId;
        const outputId = event.generatedOutputId;
        // Mark as publishing
        await eventRef.update({ status: "publishing", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        // Load output content
        const outputSnap = await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(outputId).get();
        if (!outputSnap.exists) {
            await markFailed(eventRef, outputId, "Output not found");
            res.status(200).json({ success: false, error: "Output not found" });
            return;
        }
        const outputData = outputSnap.data();
        const content = outputData.content;
        // Load platform connection
        const connSnap = await firebase_js_1.db
            .collection(collections_js_1.Collections.PLATFORM_CONNECTIONS)
            .where("workspaceId", "==", workspaceId)
            .where("platformId", "==", platformId)
            .where("isActive", "==", true)
            .limit(1)
            .get();
        if (connSnap.empty) {
            await markFailed(eventRef, outputId, `No active connection for platform '${platformId}'.`);
            res.status(200).json({ success: false, error: "No connection" });
            return;
        }
        const connData = connSnap.docs[0].data();
        // Decrypt tokens
        const tokens = {
            accessToken: connData.accessTokenEncrypted ? (0, encryption_js_1.decryptToken)(connData.accessTokenEncrypted) : "",
            refreshToken: connData.refreshTokenEncrypted ? (0, encryption_js_1.decryptToken)(connData.refreshTokenEncrypted) : null,
            platformUserId: connData.platformUserId || null,
            platformUsername: connData.platformUsername || null,
        };
        // Get publisher
        const publisher = (0, registry_js_1.getPublisher)(platformId);
        if (!publisher) {
            await markFailed(eventRef, outputId, `No publisher for platform '${platformId}'.`);
            res.status(200).json({ success: false, error: "No publisher" });
            return;
        }
        // Publish
        const metadata = outputData.outputMetadata || {};
        metadata.format_type = platformId;
        const result = await publisher.publish(content, metadata, tokens);
        if (result.success) {
            const now = firestore_1.Timestamp.now();
            await eventRef.update({
                status: "published",
                publishedAt: now,
                publishError: null,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(outputId).update({
                status: "published",
                publishedAt: now,
                platformPostId: result.postId,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            // Enqueue analytics polling (first poll after 1 hour)
            try {
                await (0, taskClient_js_1.enqueueTask)({
                    queue: "analytics-polling",
                    url: (0, taskClient_js_1.getTaskHandlerUrl)("taskAnalyticsPolling"),
                    payload: {
                        outputId,
                        workspaceId,
                        platformId,
                        pollIndex: 0,
                    },
                    delaySeconds: 3600,
                });
            }
            catch {
                // non-fatal
            }
            res.status(200).json({ success: true, postId: result.postId, url: result.url });
        }
        else {
            await markFailed(eventRef, outputId, result.error || "Unknown publish error");
            res.status(200).json({ success: false, error: result.error });
        }
    }
    catch (err) {
        console.error("Publishing task error:", err);
        res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
});
async function markFailed(eventRef, outputId, error) {
    const snap = await eventRef.get();
    const event = snap.data();
    const retryCount = (event.retryCount || 0) + 1;
    const maxRetries = event.maxRetries || 3;
    if (retryCount < maxRetries) {
        const backoffSeconds = Math.pow(2, retryCount) * 60;
        const newScheduledAt = firestore_1.Timestamp.fromDate(new Date(Date.now() + backoffSeconds * 1000));
        await eventRef.update({
            retryCount,
            publishError: error,
            scheduledAt: newScheduledAt,
            status: "scheduled",
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    else {
        await eventRef.update({
            retryCount,
            publishError: error,
            status: "failed",
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(outputId).update({
            status: "failed",
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
}
//# sourceMappingURL=publishing.js.map