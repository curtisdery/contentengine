"use strict";
/**
 * Analytics Polling task — self-chaining decaying interval metrics collection.
 * Intervals: 1h, 6h, 24h, 72h, 168h after publish.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskAnalyticsPolling = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const env_js_1 = require("../config/env.js");
const collections_js_1 = require("../shared/collections.js");
const taskClient_js_1 = require("../lib/taskClient.js");
const POLL_INTERVALS_SECONDS = [
    3600, // 1 hour
    21600, // 6 hours
    86400, // 24 hours
    259200, // 72 hours
    604800, // 168 hours (1 week)
];
exports.taskAnalyticsPolling = (0, https_1.onRequest)({ secrets: [env_js_1.TOKEN_ENCRYPTION_KEY], timeoutSeconds: 120 }, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const { outputId, workspaceId, platformId, pollIndex } = req.body;
    if (!outputId) {
        res.status(400).json({ error: "outputId required" });
        return;
    }
    try {
        // For now, create a placeholder snapshot (real implementation would call platform APIs)
        await firebase_js_1.db.collection(collections_js_1.Collections.ANALYTICS_SNAPSHOTS).add({
            workspaceId,
            generatedOutputId: outputId,
            platformId,
            snapshotTime: firestore_1.Timestamp.now(),
            impressions: 0,
            engagements: 0,
            saves: 0,
            shares: 0,
            clicks: 0,
            follows: 0,
            comments: 0,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        // Chain next poll if there are more intervals
        const nextIndex = (pollIndex || 0) + 1;
        if (nextIndex < POLL_INTERVALS_SECONDS.length) {
            await (0, taskClient_js_1.enqueueTask)({
                queue: "analytics-polling",
                url: (0, taskClient_js_1.getTaskHandlerUrl)("taskAnalyticsPolling"),
                payload: { outputId, workspaceId, platformId, pollIndex: nextIndex },
                delaySeconds: POLL_INTERVALS_SECONDS[nextIndex],
            });
        }
        res.status(200).json({ success: true, pollIndex, nextIndex: nextIndex < POLL_INTERVALS_SECONDS.length ? nextIndex : null });
    }
    catch (err) {
        console.error("Analytics polling error:", err);
        res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
});
//# sourceMappingURL=analyticsPolling.js.map