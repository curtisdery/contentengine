/**
 * recalcScores — every 3h: recalculate multiplier scores for all content.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { Collections } from "../shared/collections.js";
import { PLATFORMS } from "../lib/platforms/profiles.js";

export const recalcScores = onSchedule({
  schedule: "every 3 hours",
  timeoutSeconds: 300,
}, async () => {
  // Get all content uploads that have at least one published output
  const publishedOutputsSnap = await db.collection(Collections.GENERATED_OUTPUTS)
    .where("status", "==", "published")
    .get();

  if (publishedOutputsSnap.empty) return;

  // Group outputs by contentUploadId
  const contentOutputs: Record<string, string[]> = {};
  for (const doc of publishedOutputsSnap.docs) {
    const contentId = doc.data().contentUploadId as string;
    if (!contentOutputs[contentId]) contentOutputs[contentId] = [];
    contentOutputs[contentId].push(doc.id);
  }

  console.log(`Recalculating multiplier scores for ${Object.keys(contentOutputs).length} content pieces`);

  for (const [contentUploadId, outputIds] of Object.entries(contentOutputs)) {
    try {
      // Get analytics snapshots for all outputs of this content
      const platformData: Record<string, { reach: number; engagements: number }> = {};
      let totalReach = 0;
      let totalEngagements = 0;
      let platformsPublished = 0;

      for (const outputId of outputIds) {
        // Get the latest snapshot for this output
        const snapshotSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
          .where("generatedOutputId", "==", outputId)
          .orderBy("snapshotTime", "desc")
          .limit(1)
          .get();

        if (snapshotSnap.empty) continue;

        const snapshot = snapshotSnap.docs[0].data();
        const platformId = snapshot.platformId as string;
        const reach = (snapshot.impressions as number) || 0;
        const engagements = (snapshot.engagements as number) || 0;

        if (!platformData[platformId]) {
          platformData[platformId] = { reach: 0, engagements: 0 };
          platformsPublished++;
        }
        platformData[platformId].reach += reach;
        platformData[platformId].engagements += engagements;
        totalReach += reach;
        totalEngagements += engagements;
      }

      // Calculate multiplier: total reach across all platforms / best single platform reach
      const platformReaches = Object.values(platformData).map((p) => p.reach);
      const bestPlatformReach = platformReaches.length > 0 ? Math.max(...platformReaches) : 0;
      const multiplierValue = bestPlatformReach > 0 ? totalReach / bestPlatformReach : platformsPublished > 0 ? platformsPublished : 1;

      // Find best platform
      let bestPlatformId: string | null = null;
      let bestReach = 0;
      for (const [pid, data] of Object.entries(platformData)) {
        if (data.reach > bestReach) {
          bestReach = data.reach;
          bestPlatformId = pid;
        }
      }

      // Build platform breakdown
      const platformBreakdown = Object.entries(platformData).map(([pid, data]) => ({
        platformId: pid,
        platformName: PLATFORMS[pid]?.name || pid,
        reach: data.reach,
        engagements: data.engagements,
        engagementRate: data.reach > 0 ? Math.round((data.engagements / data.reach) * 10000) / 100 : 0,
      }));

      // Get workspace from content upload
      const contentSnap = await db.collection(Collections.CONTENT_UPLOADS).doc(contentUploadId).get();
      if (!contentSnap.exists) continue;
      const workspaceId = contentSnap.data()!.workspaceId as string;

      // Upsert multiplier score
      const existingScore = await db.collection(Collections.MULTIPLIER_SCORES)
        .where("contentUploadId", "==", contentUploadId)
        .limit(1)
        .get();

      const scoreData = {
        workspaceId,
        contentUploadId,
        multiplierValue: Math.round(multiplierValue * 100) / 100,
        originalReach: bestPlatformReach,
        totalReach,
        totalEngagements,
        platformsPublished,
        platformBreakdown,
        bestPlatformId,
        bestPlatformReach: bestReach,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (existingScore.empty) {
        await db.collection(Collections.MULTIPLIER_SCORES).add({
          ...scoreData,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else {
        await existingScore.docs[0].ref.update(scoreData);
      }
    } catch (err) {
      console.error(`Failed to recalculate score for content ${contentUploadId}:`, err);
    }
  }

  console.log("Multiplier score recalculation complete");
});
