"use strict";
/**
 * trendDetection — weekly: analyze performance trends across platforms.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.trendDetection = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const collections_js_1 = require("../shared/collections.js");
exports.trendDetection = (0, scheduler_1.onSchedule)({
    schedule: "every monday 06:00",
    timeoutSeconds: 300,
}, async () => {
    const now = Date.now();
    const oneWeekAgo = firestore_1.Timestamp.fromDate(new Date(now - 7 * 24 * 60 * 60 * 1000));
    const twoWeeksAgo = firestore_1.Timestamp.fromDate(new Date(now - 14 * 24 * 60 * 60 * 1000));
    // Get all active workspaces (those with recent snapshots)
    const recentSnapshots = await firebase_js_1.db.collection(collections_js_1.Collections.ANALYTICS_SNAPSHOTS)
        .where("snapshotTime", ">=", twoWeeksAgo)
        .get();
    if (recentSnapshots.empty)
        return;
    // Group snapshots by workspace
    const workspaceSnapshots = {};
    for (const doc of recentSnapshots.docs) {
        const data = doc.data();
        const wid = data.workspaceId;
        if (!workspaceSnapshots[wid])
            workspaceSnapshots[wid] = [];
        const snapshotTime = data.snapshotTime.toDate();
        const week = snapshotTime.getTime() >= oneWeekAgo.toDate().getTime() ? "current" : "previous";
        workspaceSnapshots[wid].push({ week, data });
    }
    console.log(`Analyzing trends for ${Object.keys(workspaceSnapshots).length} workspaces`);
    for (const [workspaceId, snapshots] of Object.entries(workspaceSnapshots)) {
        try {
            const currentWeek = snapshots.filter((s) => s.week === "current");
            const previousWeek = snapshots.filter((s) => s.week === "previous");
            const currentReach = currentWeek.reduce((sum, s) => sum + (s.data.impressions || 0), 0);
            const previousReach = previousWeek.reduce((sum, s) => sum + (s.data.impressions || 0), 0);
            const currentEngagements = currentWeek.reduce((sum, s) => sum + (s.data.engagements || 0), 0);
            const previousEngagements = previousWeek.reduce((sum, s) => sum + (s.data.engagements || 0), 0);
            const reachTrend = previousReach > 0 ? ((currentReach - previousReach) / previousReach) * 100 : 0;
            const engagementTrend = previousEngagements > 0 ? ((currentEngagements - previousEngagements) / previousEngagements) * 100 : 0;
            // Detect significant trends and create notifications
            const notifications = [];
            if (reachTrend > 20) {
                notifications.push({
                    title: "Reach is trending up!",
                    body: `Your reach increased by ${Math.round(reachTrend)}% this week. Keep up the momentum!`,
                    type: "trend_positive",
                });
            }
            else if (reachTrend < -20) {
                notifications.push({
                    title: "Reach declined this week",
                    body: `Your reach decreased by ${Math.round(Math.abs(reachTrend))}% this week. Consider adjusting your publishing schedule.`,
                    type: "trend_negative",
                });
            }
            if (engagementTrend > 25) {
                notifications.push({
                    title: "Engagement is booming!",
                    body: `Engagement grew by ${Math.round(engagementTrend)}% compared to last week.`,
                    type: "trend_positive",
                });
            }
            // Store trend notifications
            for (const notification of notifications) {
                // Find workspace owner for notification
                const workspaceSnap = await firebase_js_1.db.collection(collections_js_1.Collections.WORKSPACES).doc(workspaceId).get();
                if (!workspaceSnap.exists)
                    continue;
                const orgId = workspaceSnap.data().organizationId;
                const ownerSnap = await firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATION_MEMBERS)
                    .where("organizationId", "==", orgId)
                    .where("role", "==", "owner")
                    .limit(1)
                    .get();
                if (ownerSnap.empty)
                    continue;
                const ownerId = ownerSnap.docs[0].data().userId;
                await firebase_js_1.db.collection(collections_js_1.Collections.NOTIFICATIONS).add({
                    userId: ownerId,
                    workspaceId,
                    title: notification.title,
                    body: notification.body,
                    type: notification.type,
                    resourceType: "trend",
                    resourceId: null,
                    read: false,
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
        }
        catch (err) {
            console.error(`Failed trend detection for workspace ${workspaceId}:`, err);
        }
    }
    console.log("Trend detection complete");
});
//# sourceMappingURL=trendDetection.js.map