/**
 * trendDetection — weekly: analyze performance trends across platforms.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { Collections } from "../shared/collections.js";

export const trendDetection = onSchedule({
  schedule: "every monday 06:00",
  timeoutSeconds: 300,
}, async () => {
  const now = Date.now();
  const oneWeekAgo = Timestamp.fromDate(new Date(now - 7 * 24 * 60 * 60 * 1000));
  const twoWeeksAgo = Timestamp.fromDate(new Date(now - 14 * 24 * 60 * 60 * 1000));

  // Get all active workspaces (those with recent snapshots)
  const recentSnapshots = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
    .where("snapshotTime", ">=", twoWeeksAgo)
    .get();

  if (recentSnapshots.empty) return;

  // Group snapshots by workspace
  const workspaceSnapshots: Record<string, Array<{ week: "current" | "previous"; data: FirebaseFirestore.DocumentData }>> = {};

  for (const doc of recentSnapshots.docs) {
    const data = doc.data();
    const wid = data.workspaceId as string;
    if (!workspaceSnapshots[wid]) workspaceSnapshots[wid] = [];

    const snapshotTime = (data.snapshotTime as Timestamp).toDate();
    const week = snapshotTime.getTime() >= oneWeekAgo.toDate().getTime() ? "current" : "previous";
    workspaceSnapshots[wid].push({ week, data });
  }

  console.log(`Analyzing trends for ${Object.keys(workspaceSnapshots).length} workspaces`);

  for (const [workspaceId, snapshots] of Object.entries(workspaceSnapshots)) {
    try {
      const currentWeek = snapshots.filter((s) => s.week === "current");
      const previousWeek = snapshots.filter((s) => s.week === "previous");

      const currentReach = currentWeek.reduce((sum, s) => sum + ((s.data.impressions as number) || 0), 0);
      const previousReach = previousWeek.reduce((sum, s) => sum + ((s.data.impressions as number) || 0), 0);
      const currentEngagements = currentWeek.reduce((sum, s) => sum + ((s.data.engagements as number) || 0), 0);
      const previousEngagements = previousWeek.reduce((sum, s) => sum + ((s.data.engagements as number) || 0), 0);

      const reachTrend = previousReach > 0 ? ((currentReach - previousReach) / previousReach) * 100 : 0;
      const engagementTrend = previousEngagements > 0 ? ((currentEngagements - previousEngagements) / previousEngagements) * 100 : 0;

      // Detect significant trends and create notifications
      const notifications: Array<{ title: string; body: string; type: string }> = [];

      if (reachTrend > 20) {
        notifications.push({
          title: "Reach is trending up!",
          body: `Your reach increased by ${Math.round(reachTrend)}% this week. Keep up the momentum!`,
          type: "trend_positive",
        });
      } else if (reachTrend < -20) {
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

      // Cross-platform opportunity detection
      try {
        const { detectCrossPlatformOpportunities } = await import("../lib/analytics/crossPlatformInsights.js");
        const opportunities = await detectCrossPlatformOpportunities(workspaceId);
        for (const opp of opportunities.slice(0, 2)) {
          notifications.push({
            title: "Cross-platform opportunity detected",
            body: opp.reason,
            type: "cross_platform_opportunity",
          });
        }
      } catch (crossErr) {
        console.warn(`Cross-platform analysis failed for workspace ${workspaceId}:`, crossErr);
      }

      // Store trend notifications
      for (const notification of notifications) {
        // Find workspace owner for notification
        const workspaceSnap = await db.collection(Collections.WORKSPACES).doc(workspaceId).get();
        if (!workspaceSnap.exists) continue;

        const orgId = workspaceSnap.data()!.organizationId as string;
        const ownerSnap = await db.collection(Collections.ORGANIZATION_MEMBERS)
          .where("organizationId", "==", orgId)
          .where("role", "==", "owner")
          .limit(1)
          .get();

        if (ownerSnap.empty) continue;

        const ownerId = ownerSnap.docs[0].data().userId as string;

        await db.collection(Collections.NOTIFICATIONS).add({
          userId: ownerId,
          workspaceId,
          title: notification.title,
          body: notification.body,
          type: notification.type,
          resourceType: "trend",
          resourceId: null,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } catch (err) {
      console.error(`Failed trend detection for workspace ${workspaceId}:`, err);
    }
  }

  console.log("Trend detection complete");
});
