/**
 * Performance Context — feeds historical performance data back into content generation.
 * Queries analytics to build a "what works" context block for the generation prompt.
 */

import { Timestamp } from "firebase-admin/firestore";
import { db } from "../../config/firebase.js";
import { Collections } from "../../shared/collections.js";
import type { ContentDNA } from "../../shared/types.js";
import { PLATFORMS } from "../platforms/profiles.js";

export interface PerformanceContextData {
  topHookTypes: Array<{ hookType: string; relativePerformance: number }>;
  topContentTypes: Array<{ contentType: string; avgEngagementRate: number }>;
  optimalLength: { min: number; max: number; avg: number } | null;
  platformInsights: string[];
  hasEnoughData: boolean;
}

/**
 * Build a performance context string for injection into generation prompts.
 * Returns null if there isn't enough data to be useful.
 */
export async function buildPerformanceContext(
  workspaceId: string,
  platformId: string
): Promise<string | null> {
  const data = await getPerformanceData(workspaceId, platformId);
  if (!data.hasEnoughData) return null;

  const lines: string[] = [`## Historical Performance on ${PLATFORMS[platformId]?.name || platformId}`];

  if (data.topHookTypes.length > 0) {
    const top = data.topHookTypes.slice(0, 3);
    const avoid = data.topHookTypes.filter((h) => h.relativePerformance < 0.7);
    lines.push(`Top-performing hook types: ${top.map((h) => `${h.hookType} (${h.relativePerformance}x avg engagement)`).join(", ")}`);
    if (avoid.length > 0) {
      lines.push(`Avoid: ${avoid.map((h) => `${h.hookType} hooks (${h.relativePerformance}x avg engagement)`).join(", ")}`);
    }
  }

  if (data.topContentTypes.length > 0) {
    lines.push(`Best performing content types: ${data.topContentTypes.slice(0, 3).map((c) => c.contentType).join(", ")}`);
  }

  if (data.optimalLength) {
    lines.push(`Optimal length: ${data.optimalLength.min}-${data.optimalLength.max} characters (top posts average ${data.optimalLength.avg})`);
  }

  for (const insight of data.platformInsights) {
    lines.push(insight);
  }

  return lines.join("\n");
}

async function getPerformanceData(
  workspaceId: string,
  platformId: string
): Promise<PerformanceContextData> {
  const ninetyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

  // Get published outputs for this platform
  const outputsSnap = await db.collection(Collections.GENERATED_OUTPUTS)
    .where("workspaceId", "==", workspaceId)
    .where("platformId", "==", platformId)
    .where("status", "==", "published")
    .get();

  if (outputsSnap.size < 5) {
    return { topHookTypes: [], topContentTypes: [], optimalLength: null, platformInsights: [], hasEnoughData: false };
  }

  // Get analytics for these outputs
  const outputIds = outputsSnap.docs.map((d) => d.id);
  const snapshotsSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
    .where("workspaceId", "==", workspaceId)
    .where("platformId", "==", platformId)
    .where("snapshotTime", ">=", ninetyDaysAgo)
    .get();

  // Build output -> latest metrics map
  const outputMetrics: Record<string, { impressions: number; engagements: number }> = {};
  for (const doc of snapshotsSnap.docs) {
    const d = doc.data();
    const oid = d.generatedOutputId as string;
    if (!outputIds.includes(oid)) continue;
    // Use the latest snapshot (highest impressions)
    const existing = outputMetrics[oid];
    const impressions = (d.impressions as number) || 0;
    if (!existing || impressions > existing.impressions) {
      outputMetrics[oid] = { impressions, engagements: (d.engagements as number) || 0 };
    }
  }

  if (Object.keys(outputMetrics).length < 5) {
    return { topHookTypes: [], topContentTypes: [], optimalLength: null, platformInsights: [], hasEnoughData: false };
  }

  // Get content DNA for hook type analysis
  const contentIds = [...new Set(outputsSnap.docs.map((d) => d.data().contentUploadId as string))];
  const contentHookMap: Record<string, string[]> = {};
  const contentTypeMap: Record<string, string> = {};

  for (const contentId of contentIds) {
    try {
      const contentSnap = await db.collection(Collections.CONTENT_UPLOADS).doc(contentId).get();
      if (contentSnap.exists) {
        const dna = contentSnap.data()!.contentDna as ContentDNA | null;
        if (dna?.bestHooks?.length) {
          contentHookMap[contentId] = dna.bestHooks.map((h) => h.hookType);
        }
        if (dna?.contentTypeClassification) {
          contentTypeMap[contentId] = dna.contentTypeClassification;
        }
      }
    } catch {
      // Skip
    }
  }

  // Analyze hook performance
  const hookStats: Record<string, { totalRate: number; count: number }> = {};
  for (const outputDoc of outputsSnap.docs) {
    const contentId = outputDoc.data().contentUploadId as string;
    const metrics = outputMetrics[outputDoc.id];
    if (!metrics || metrics.impressions === 0) continue;

    const rate = metrics.engagements / metrics.impressions;
    const hooks = contentHookMap[contentId] || [];
    for (const hookType of hooks) {
      if (!hookStats[hookType]) hookStats[hookType] = { totalRate: 0, count: 0 };
      hookStats[hookType].totalRate += rate;
      hookStats[hookType].count += 1;
    }
  }

  const avgEngagementRate = Object.values(hookStats).reduce((s, h) => s + h.totalRate, 0) /
    Math.max(Object.values(hookStats).reduce((s, h) => s + h.count, 0), 1);

  const topHookTypes = Object.entries(hookStats)
    .filter(([, s]) => s.count >= 2)
    .map(([hookType, s]) => ({
      hookType,
      relativePerformance: Math.round((s.totalRate / s.count / Math.max(avgEngagementRate, 0.001)) * 10) / 10,
    }))
    .sort((a, b) => b.relativePerformance - a.relativePerformance);

  // Analyze content type performance
  const typeStats: Record<string, { totalRate: number; count: number }> = {};
  for (const outputDoc of outputsSnap.docs) {
    const contentId = outputDoc.data().contentUploadId as string;
    const metrics = outputMetrics[outputDoc.id];
    if (!metrics || metrics.impressions === 0) continue;

    const ct = contentTypeMap[contentId] || "unknown";
    if (!typeStats[ct]) typeStats[ct] = { totalRate: 0, count: 0 };
    typeStats[ct].totalRate += metrics.engagements / metrics.impressions;
    typeStats[ct].count += 1;
  }

  const topContentTypes = Object.entries(typeStats)
    .filter(([, s]) => s.count >= 2)
    .map(([contentType, s]) => ({
      contentType,
      avgEngagementRate: Math.round((s.totalRate / s.count) * 10000) / 100,
    }))
    .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);

  // Analyze optimal content length
  const topOutputs = Object.entries(outputMetrics)
    .filter(([, m]) => m.impressions > 0)
    .sort((a, b) => (b[1].engagements / b[1].impressions) - (a[1].engagements / a[1].impressions))
    .slice(0, Math.ceil(Object.keys(outputMetrics).length * 0.25)); // Top 25%

  let optimalLength: { min: number; max: number; avg: number } | null = null;
  if (topOutputs.length >= 3) {
    const lengths = topOutputs.map(([oid]) => {
      const doc = outputsSnap.docs.find((d) => d.id === oid);
      return doc ? (doc.data().content as string || "").length : 0;
    }).filter((l) => l > 0);

    if (lengths.length >= 3) {
      optimalLength = {
        min: Math.min(...lengths),
        max: Math.max(...lengths),
        avg: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
      };
    }
  }

  // Platform-specific insights
  const platformInsights: string[] = [];
  const totalEngagement = Object.values(outputMetrics).reduce((s, m) => s + (m.impressions > 0 ? m.engagements / m.impressions : 0), 0);
  const avgRate = totalEngagement / Object.keys(outputMetrics).length;
  if (avgRate > 0.05) {
    platformInsights.push(`Your average engagement rate on this platform is ${Math.round(avgRate * 10000) / 100}% — above average.`);
  }

  return { topHookTypes, topContentTypes, optimalLength, platformInsights, hasEnoughData: true };
}
