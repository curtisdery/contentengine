/**
 * Cross-Platform Insights — detects when content performs well on one platform
 * but wasn't published to similar platforms with high affinity.
 */

import { Timestamp } from "firebase-admin/firestore";
import { db } from "../../config/firebase.js";
import { Collections } from "../../shared/collections.js";
import { PLATFORMS } from "../platforms/profiles.js";
import type { ContentDNA } from "../../shared/types.js";
import { CONTENT_TYPE_PLATFORM_AFFINITY } from "../ai/generation.js";

export interface CrossPlatformInsight {
  contentUploadId: string;
  contentTitle: string;
  sourcePlatformId: string;
  sourcePlatformName: string;
  sourceEngagementRate: number;
  avgEngagementRate: number;
  performanceMultiplier: number;
  suggestedPlatformId: string;
  suggestedPlatformName: string;
  suggestedAffinity: number;
  reason: string;
}

/**
 * Analyze recent high-performing content and find cross-platform opportunities.
 * Returns insights where content significantly outperformed on one platform
 * but wasn't published to another platform with high affinity.
 */
export async function detectCrossPlatformOpportunities(
  workspaceId: string
): Promise<CrossPlatformInsight[]> {
  const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  // Get recent analytics snapshots
  const snapshotsSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
    .where("workspaceId", "==", workspaceId)
    .where("snapshotTime", ">=", thirtyDaysAgo)
    .get();

  if (snapshotsSnap.size < 10) return [];

  // Build output -> latest metrics
  const outputMetrics: Record<string, { impressions: number; engagements: number; platformId: string }> = {};
  for (const doc of snapshotsSnap.docs) {
    const d = doc.data();
    const oid = d.generatedOutputId as string;
    const impressions = (d.impressions as number) || 0;
    if (!outputMetrics[oid] || impressions > outputMetrics[oid].impressions) {
      outputMetrics[oid] = {
        impressions,
        engagements: (d.engagements as number) || 0,
        platformId: d.platformId as string,
      };
    }
  }

  // Calculate average engagement rate across all outputs
  const rates = Object.values(outputMetrics)
    .filter((m) => m.impressions > 0)
    .map((m) => m.engagements / m.impressions);
  if (rates.length < 5) return [];
  const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;

  // Find high-performing outputs (>2x average)
  const highPerformers = Object.entries(outputMetrics)
    .filter(([, m]) => m.impressions > 0 && (m.engagements / m.impressions) > avgRate * 2)
    .map(([outputId, m]) => ({
      outputId,
      ...m,
      engagementRate: m.engagements / m.impressions,
    }));

  if (highPerformers.length === 0) return [];

  // Get output details and content DNA
  const insights: CrossPlatformInsight[] = [];

  for (const performer of highPerformers.slice(0, 10)) { // Cap at 10
    try {
      const outputSnap = await db.collection(Collections.GENERATED_OUTPUTS).doc(performer.outputId).get();
      if (!outputSnap.exists) continue;

      const outputData = outputSnap.data() as Record<string, unknown>;
      const contentUploadId = outputData.contentUploadId as string;

      // Get content DNA
      const contentSnap = await db.collection(Collections.CONTENT_UPLOADS).doc(contentUploadId).get();
      if (!contentSnap.exists) continue;

      const contentData = contentSnap.data() as Record<string, unknown>;
      const contentDna = contentData.contentDna as ContentDNA | null;
      const contentTitle = (contentData.title as string) || "Untitled";

      if (!contentDna?.contentTypeClassification) continue;

      // Find all platforms this content was published to
      const allOutputsSnap = await db.collection(Collections.GENERATED_OUTPUTS)
        .where("contentUploadId", "==", contentUploadId)
        .where("status", "==", "published")
        .get();

      const publishedPlatforms = new Set(allOutputsSnap.docs.map((d) => d.data().platformId as string));

      // Find high-affinity platforms it WASN'T published to
      const affinityMap = CONTENT_TYPE_PLATFORM_AFFINITY[contentDna.contentTypeClassification] ?? {};

      for (const [pid, affinity] of Object.entries(affinityMap)) {
        if (affinity < 0.7) continue; // Only suggest high-affinity platforms
        if (publishedPlatforms.has(pid)) continue; // Already published here

        // Check if workspace has this platform connected
        const connSnap = await db.collection(Collections.PLATFORM_CONNECTIONS)
          .where("workspaceId", "==", workspaceId)
          .where("platformId", "==", normalizePlatformId(pid))
          .where("isActive", "==", true)
          .limit(1)
          .get();

        if (connSnap.empty) continue; // Not connected

        insights.push({
          contentUploadId,
          contentTitle,
          sourcePlatformId: performer.platformId,
          sourcePlatformName: PLATFORMS[performer.platformId]?.name || performer.platformId,
          sourceEngagementRate: Math.round(performer.engagementRate * 10000) / 100,
          avgEngagementRate: Math.round(avgRate * 10000) / 100,
          performanceMultiplier: Math.round((performer.engagementRate / avgRate) * 10) / 10,
          suggestedPlatformId: pid,
          suggestedPlatformName: PLATFORMS[pid]?.name || pid,
          suggestedAffinity: affinity,
          reason: `"${contentTitle}" got ${Math.round(performer.engagementRate / avgRate)}x your average engagement on ${PLATFORMS[performer.platformId]?.name || performer.platformId} — it has ${Math.round(affinity * 100)}% affinity with ${PLATFORMS[pid]?.name || pid} but wasn't published there.`,
        });
      }
    } catch {
      // Skip individual failures
    }
  }

  return insights.sort((a, b) => b.performanceMultiplier - a.performanceMultiplier).slice(0, 5);
}

function normalizePlatformId(platformId: string): string {
  const map: Record<string, string> = {
    twitter_single: "twitter",
    twitter_thread: "twitter",
    linkedin_post: "linkedin",
    linkedin_article: "linkedin",
    instagram_carousel: "instagram",
    instagram_caption: "instagram",
    youtube_longform: "youtube",
    short_form_video: "tiktok",
    bluesky_post: "bluesky",
  };
  return map[platformId] ?? platformId;
}
