/**
 * Analytics API — 8 onCall functions.
 * Now wired to real metrics data from platform fetchers.
 */

import { onCall } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { verifyAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { AnalyticsQuerySchema, ContentAnalyticsSchema } from "../shared/schemas.js";
import { wrapError, NotFoundError } from "../shared/errors.js";
import { PLATFORMS } from "../lib/platforms/profiles.js";
import type { ContentDNA } from "../shared/types.js";

// ─── getOverview (dashboard) ─────────────────────────────────────────────────
export const getOverview = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(AnalyticsQuerySchema, request.data);
    const sinceDate = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
    const sinceTs = Timestamp.fromDate(sinceDate);

    // Content counts
    const contentCount = (await db.collection(Collections.CONTENT_UPLOADS)
      .where("workspaceId", "==", ctx.workspaceId).count().get()).data().count;

    const outputsCount = (await db.collection(Collections.GENERATED_OUTPUTS)
      .where("workspaceId", "==", ctx.workspaceId).count().get()).data().count;

    const publishedCount = (await db.collection(Collections.GENERATED_OUTPUTS)
      .where("workspaceId", "==", ctx.workspaceId).where("status", "==", "published").count().get()).data().count;

    // Active platforms
    const connectionsSnap = await db.collection(Collections.PLATFORM_CONNECTIONS)
      .where("workspaceId", "==", ctx.workspaceId).where("isActive", "==", true).get();

    // Aggregate analytics
    const snapshotsSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("snapshotTime", ">=", sinceTs)
      .get();

    let totalReach = 0;
    let totalEngagements = 0;
    for (const doc of snapshotsSnap.docs) {
      const d = doc.data();
      totalReach += (d.impressions as number) || 0;
      totalEngagements += (d.engagements as number) || 0;
    }

    // Multiplier scores
    const scoresSnap = await db.collection(Collections.MULTIPLIER_SCORES)
      .where("workspaceId", "==", ctx.workspaceId).get();

    let avgMultiplier = 0;
    let bestMultiplier = 0;
    if (!scoresSnap.empty) {
      const scores = scoresSnap.docs.map((d) => (d.data().multiplierValue as number) || 0);
      avgMultiplier = scores.reduce((a, b) => a + b, 0) / scores.length;
      bestMultiplier = Math.max(...scores);
    }

    // Top performing content
    const topContent = scoresSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          contentUploadId: data.contentUploadId as string,
          multiplierValue: (data.multiplierValue as number) || 0,
          totalReach: (data.totalReach as number) || 0,
        };
      })
      .sort((a, b) => b.multiplierValue - a.multiplierValue)
      .slice(0, 5);

    const topPerforming = await Promise.all(
      topContent.map(async (score) => {
        const contentSnap = await db.collection(Collections.CONTENT_UPLOADS).doc(score.contentUploadId).get();
        return {
          content_id: score.contentUploadId,
          title: contentSnap.exists ? (contentSnap.data() as Record<string, unknown>).title : "Unknown",
          multiplier_value: score.multiplierValue,
          total_reach: score.totalReach,
        };
      })
    );

    return {
      total_content_pieces: contentCount,
      total_outputs_generated: outputsCount,
      total_published: publishedCount,
      total_reach: totalReach,
      total_engagements: totalEngagements,
      avg_multiplier_score: Math.round(avgMultiplier * 100) / 100,
      best_multiplier_score: Math.round(bestMultiplier * 100) / 100,
      platforms_active: connectionsSnap.size,
      top_performing_content: topPerforming,
      recent_performance: [],
    };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getContentAnalytics ─────────────────────────────────────────────────────
export const getContentAnalytics = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(ContentAnalyticsSchema, request.data);

    const contentSnap = await db.collection(Collections.CONTENT_UPLOADS).doc(input.content_id).get();
    if (!contentSnap.exists) throw new NotFoundError("Content not found");
    if ((contentSnap.data() as Record<string, unknown>).workspaceId !== ctx.workspaceId) {
      throw new NotFoundError("Content not found");
    }

    // Get multiplier score for this content
    const scoreSnap = await db.collection(Collections.MULTIPLIER_SCORES)
      .where("contentUploadId", "==", input.content_id)
      .limit(1)
      .get();

    const score = scoreSnap.empty ? null : {
      ...scoreSnap.docs[0].data(),
      id: scoreSnap.docs[0].id,
    };

    // Get outputs
    const outputsSnap = await db.collection(Collections.GENERATED_OUTPUTS)
      .where("contentUploadId", "==", input.content_id)
      .get();

    const outputs = outputsSnap.docs.map((d) => ({
      id: d.id,
      platform_id: d.data().platformId,
      format_name: d.data().formatName,
      status: d.data().status,
      voice_match_score: d.data().voiceMatchScore,
    }));

    return {
      content_id: input.content_id,
      title: (contentSnap.data() as Record<string, unknown>).title,
      multiplier_score: score,
      outputs,
    };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getPlatformAnalytics ────────────────────────────────────────────────────
export const getPlatformAnalytics = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(AnalyticsQuerySchema, request.data);
    const sinceDate = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
    const sinceTs = Timestamp.fromDate(sinceDate);

    const snapshotsSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("snapshotTime", ">=", sinceTs)
      .get();

    // Group by platform
    const platformData: Record<string, { impressions: number; engagements: number; saves: number; shares: number; clicks: number; follows: number; count: number }> = {};

    for (const doc of snapshotsSnap.docs) {
      const d = doc.data();
      const pid = d.platformId as string;
      if (!platformData[pid]) {
        platformData[pid] = { impressions: 0, engagements: 0, saves: 0, shares: 0, clicks: 0, follows: 0, count: 0 };
      }
      platformData[pid].impressions += (d.impressions as number) || 0;
      platformData[pid].engagements += (d.engagements as number) || 0;
      platformData[pid].saves += (d.saves as number) || 0;
      platformData[pid].shares += (d.shares as number) || 0;
      platformData[pid].clicks += (d.clicks as number) || 0;
      platformData[pid].follows += (d.follows as number) || 0;
      platformData[pid].count += 1;
    }

    const platforms = Object.entries(platformData).map(([pid, data]) => ({
      platform_id: pid,
      platform_name: PLATFORMS[pid]?.name || pid,
      total_impressions: data.impressions,
      total_engagements: data.engagements,
      avg_engagement_rate: data.impressions > 0 ? Math.round((data.engagements / data.impressions) * 10000) / 100 : 0,
      total_saves: data.saves,
      total_shares: data.shares,
      total_clicks: data.clicks,
      total_follows: data.follows,
      post_count: data.count,
      trend: "stable" as const,
    }));

    return { platforms };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getHeatmap ──────────────────────────────────────────────────────────────
export const getHeatmap = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(AnalyticsQuerySchema, request.data);
    const sinceDate = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
    const sinceTs = Timestamp.fromDate(sinceDate);

    // Use published output timestamps for heatmap (when posts were published)
    const publishedOutputsSnap = await db.collection(Collections.GENERATED_OUTPUTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("status", "==", "published")
      .get();

    // Build output -> publishedAt map
    const outputPublishTimes: Record<string, Date> = {};
    for (const doc of publishedOutputsSnap.docs) {
      const publishedAt = doc.data().publishedAt as Timestamp | null;
      if (publishedAt) {
        outputPublishTimes[doc.id] = publishedAt.toDate();
      }
    }

    const snapshotsSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("snapshotTime", ">=", sinceTs)
      .get();

    // Group by day_of_week + hour of the PUBLISH time
    const heatmap: Record<string, { engagements: number; impressions: number; count: number }> = {};

    for (const doc of snapshotsSnap.docs) {
      const d = doc.data();
      const outputId = d.generatedOutputId as string;
      const publishTime = outputPublishTimes[outputId];
      // Fall back to snapshot time if no publish time
      const time = publishTime || (d.snapshotTime as Timestamp).toDate();
      const key = `${time.getUTCDay()}-${time.getUTCHours()}`;
      if (!heatmap[key]) heatmap[key] = { engagements: 0, impressions: 0, count: 0 };
      heatmap[key].engagements += (d.engagements as number) || 0;
      heatmap[key].impressions += (d.impressions as number) || 0;
      heatmap[key].count += 1;
    }

    const entries = Object.entries(heatmap).map(([key, data]) => {
      const [dayStr, hourStr] = key.split("-");
      return {
        day_of_week: Number(dayStr),
        hour: Number(hourStr),
        avg_engagement_rate: data.impressions > 0 ? Math.round((data.engagements / data.impressions) * 10000) / 100 : 0,
        total_engagements: data.engagements,
        total_impressions: data.impressions,
        post_count: data.count,
      };
    });

    return { heatmap: entries };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getAudienceIntelligence ─────────────────────────────────────────────────
export const getAudienceIntelligence = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    const connectionsSnap = await db.collection(Collections.PLATFORM_CONNECTIONS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("isActive", "==", true)
      .get();

    if (connectionsSnap.empty) {
      return {
        fastest_growing_platform: null,
        best_engagement_platform: null,
        platform_rankings: [],
        recommendations: ["Connect platforms to get audience intelligence insights."],
      };
    }

    // Get recent analytics snapshots to calculate engagement rates
    const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const snapshotsSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("snapshotTime", ">=", thirtyDaysAgo)
      .get();

    // Aggregate engagement data per platform
    const platformEngagement: Record<string, { impressions: number; engagements: number; count: number }> = {};
    for (const doc of snapshotsSnap.docs) {
      const d = doc.data();
      const pid = normalizePlatformId(d.platformId as string);
      if (!platformEngagement[pid]) platformEngagement[pid] = { impressions: 0, engagements: 0, count: 0 };
      platformEngagement[pid].impressions += (d.impressions as number) || 0;
      platformEngagement[pid].engagements += (d.engagements as number) || 0;
      platformEngagement[pid].count += 1;
    }

    // Build rankings with real data
    const rankings = connectionsSnap.docs.map((doc) => {
      const d = doc.data();
      const pid = d.platformId as string;
      const followerCount = (d.followerCount as number) || 0;
      const engagement = platformEngagement[pid] || { impressions: 0, engagements: 0, count: 0 };
      const engagementRate = engagement.impressions > 0
        ? Math.round((engagement.engagements / engagement.impressions) * 10000) / 100
        : 0;

      return {
        platform_id: pid,
        name: PLATFORMS[pid]?.name || pid,
        follower_count: followerCount,
        engagement_rate: engagementRate,
        total_impressions: engagement.impressions,
        total_engagements: engagement.engagements,
        post_count: engagement.count,
        score: engagementRate * Math.log10(Math.max(followerCount, 10)), // Composite score
      };
    }).sort((a, b) => b.score - a.score);

    // Find fastest growing (by engagement velocity)
    const fastestGrowing = rankings.reduce((best, r) =>
      r.total_engagements > (best?.total_engagements ?? 0) ? r : best, rankings[0]);

    // Find best engagement rate
    const bestEngagement = rankings.reduce((best, r) =>
      r.engagement_rate > (best?.engagement_rate ?? 0) ? r : best, rankings[0]);

    // Generate recommendations
    const recommendations: string[] = [];

    if (bestEngagement && bestEngagement.engagement_rate > 0) {
      const lowEngagement = rankings.filter((r) => r.engagement_rate < bestEngagement.engagement_rate * 0.5 && r.post_count > 0);
      if (lowEngagement.length > 0) {
        recommendations.push(
          `Your ${bestEngagement.name} engagement rate (${bestEngagement.engagement_rate}%) is ${Math.round(bestEngagement.engagement_rate / (lowEngagement[0].engagement_rate || 1))}x higher than ${lowEngagement[0].name}. Consider allocating more content to ${bestEngagement.name}.`
        );
      }
    }

    if (rankings.some((r) => r.post_count === 0 && r.follower_count > 0)) {
      const inactive = rankings.filter((r) => r.post_count === 0 && r.follower_count > 0);
      recommendations.push(
        `You have ${inactive.length} connected platform(s) with no recent posts: ${inactive.map((r) => r.name).join(", ")}. Publishing here could expand your reach.`
      );
    }

    if (rankings.length < 3) {
      recommendations.push("Connect more platforms to maximize your content multiplier effect.");
    }

    if (recommendations.length === 0) {
      recommendations.push("Your cross-platform strategy is well-balanced. Keep publishing consistently!");
    }

    return {
      fastest_growing_platform: fastestGrowing ? {
        platform_id: fastestGrowing.platform_id,
        name: fastestGrowing.name,
        growth_rate: fastestGrowing.engagement_rate,
        total_engagements: fastestGrowing.total_engagements,
      } : null,
      best_engagement_platform: bestEngagement ? {
        platform_id: bestEngagement.platform_id,
        name: bestEngagement.name,
        avg_engagement_rate: bestEngagement.engagement_rate,
      } : null,
      platform_rankings: rankings,
      recommendations,
    };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getContentTypeAnalytics ──────────────────────────────────────────────────
export const getContentTypeAnalytics = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(AnalyticsQuerySchema, request.data);
    const sinceDate = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
    const sinceTs = Timestamp.fromDate(sinceDate);

    // Get outputs with their content type from the parent content upload's DNA
    const outputsSnap = await db.collection(Collections.GENERATED_OUTPUTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("status", "==", "published")
      .get();

    // Build outputId -> contentUploadId map
    const outputContentMap: Record<string, string> = {};
    for (const doc of outputsSnap.docs) {
      outputContentMap[doc.id] = doc.data().contentUploadId as string;
    }

    // Get unique content upload IDs and load their DNA
    const contentIds = [...new Set(Object.values(outputContentMap))];
    const contentTypeMap: Record<string, string> = {};
    for (const contentId of contentIds) {
      try {
        const contentSnap = await db.collection(Collections.CONTENT_UPLOADS).doc(contentId).get();
        if (contentSnap.exists) {
          const data = contentSnap.data() as Record<string, unknown>;
          const dna = data.contentDna as ContentDNA | null;
          contentTypeMap[contentId] = dna?.contentTypeClassification || "unknown";
        }
      } catch {
        // Skip missing content
      }
    }

    // Build outputId -> contentType map
    const outputTypeMap: Record<string, string> = {};
    for (const [outputId, contentId] of Object.entries(outputContentMap)) {
      outputTypeMap[outputId] = contentTypeMap[contentId] || "unknown";
    }

    // Get snapshots and aggregate by content type
    const snapshotsSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("snapshotTime", ">=", sinceTs)
      .get();

    const typeData: Record<string, { reach: number; engagements: number; count: number; platforms: Set<string> }> = {};

    for (const doc of snapshotsSnap.docs) {
      const d = doc.data();
      const outputId = d.generatedOutputId as string;
      const ct = outputTypeMap[outputId] || "unknown";
      if (!typeData[ct]) {
        typeData[ct] = { reach: 0, engagements: 0, count: 0, platforms: new Set() };
      }
      typeData[ct].reach += (d.impressions as number) || 0;
      typeData[ct].engagements += (d.engagements as number) || 0;
      typeData[ct].count += 1;
      typeData[ct].platforms.add(d.platformId as string);
    }

    // Also include content types that have outputs but no snapshots yet
    for (const [outputId, ct] of Object.entries(outputTypeMap)) {
      if (!typeData[ct]) {
        typeData[ct] = { reach: 0, engagements: 0, count: 0, platforms: new Set() };
      }
    }

    return Object.entries(typeData).map(([ct, data]) => ({
      content_type: ct,
      avg_engagement_rate: data.reach > 0 ? Math.round((data.engagements / data.reach) * 10000) / 100 : 0,
      total_reach: data.reach,
      total_engagements: data.engagements,
      post_count: data.count,
      platforms_used: [...data.platforms],
    }));
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getHookAnalytics ─────────────────────────────────────────────────────────
export const getHookAnalytics = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(AnalyticsQuerySchema, request.data);
    const sinceTs = Timestamp.fromDate(new Date(Date.now() - input.days * 24 * 60 * 60 * 1000));

    // Get all content with DNA that has hooks
    const contentSnap = await db.collection(Collections.CONTENT_UPLOADS)
      .where("workspaceId", "==", ctx.workspaceId)
      .get();

    // Map contentId -> hookTypes
    const contentHookMap: Record<string, string[]> = {};
    for (const doc of contentSnap.docs) {
      const dna = doc.data().contentDna as ContentDNA | null;
      if (dna?.bestHooks?.length) {
        contentHookMap[doc.id] = dna.bestHooks.map((h) => h.hookType);
      }
    }

    // Get published outputs to map outputId -> contentId
    const outputsSnap = await db.collection(Collections.GENERATED_OUTPUTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("status", "==", "published")
      .get();

    const outputContentMap: Record<string, string> = {};
    const outputPlatformMap: Record<string, string> = {};
    for (const doc of outputsSnap.docs) {
      const data = doc.data();
      outputContentMap[doc.id] = data.contentUploadId as string;
      outputPlatformMap[doc.id] = data.platformId as string;
    }

    // Get snapshots
    const snapshotsSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("snapshotTime", ">=", sinceTs)
      .get();

    // Aggregate by hookType and by hookType+platform
    const hookData: Record<string, { reach: number; engagements: number; count: number; platformBreakdown: Record<string, { reach: number; engagements: number; count: number }> }> = {};

    for (const doc of snapshotsSnap.docs) {
      const d = doc.data();
      const outputId = d.generatedOutputId as string;
      const contentId = outputContentMap[outputId];
      const platformId = outputPlatformMap[outputId] || (d.platformId as string);
      if (!contentId) continue;

      const hookTypes = contentHookMap[contentId];
      if (!hookTypes?.length) continue;

      // Attribute metrics to all hook types used in this content
      // (since we can't know which specific hook was used in which output)
      for (const hookType of hookTypes) {
        if (!hookData[hookType]) {
          hookData[hookType] = { reach: 0, engagements: 0, count: 0, platformBreakdown: {} };
        }
        hookData[hookType].reach += (d.impressions as number) || 0;
        hookData[hookType].engagements += (d.engagements as number) || 0;
        hookData[hookType].count += 1;

        if (!hookData[hookType].platformBreakdown[platformId]) {
          hookData[hookType].platformBreakdown[platformId] = { reach: 0, engagements: 0, count: 0 };
        }
        hookData[hookType].platformBreakdown[platformId].reach += (d.impressions as number) || 0;
        hookData[hookType].platformBreakdown[platformId].engagements += (d.engagements as number) || 0;
        hookData[hookType].platformBreakdown[platformId].count += 1;
      }
    }

    // Calculate avg engagement rate across all hooks for relative comparison
    const allRates = Object.values(hookData)
      .filter((h) => h.reach > 0)
      .map((h) => h.engagements / h.reach);
    const avgRate = allRates.length > 0 ? allRates.reduce((a, b) => a + b, 0) / allRates.length : 0;

    return Object.entries(hookData).map(([hookType, data]) => {
      const rate = data.reach > 0 ? data.engagements / data.reach : 0;
      // Find best platform for this hook type
      let bestPlatform: string | null = null;
      let bestPlatformRate = 0;
      for (const [pid, pData] of Object.entries(data.platformBreakdown)) {
        const pRate = pData.reach > 0 ? pData.engagements / pData.reach : 0;
        if (pRate > bestPlatformRate) {
          bestPlatformRate = pRate;
          bestPlatform = pid;
        }
      }

      return {
        hook_type: hookType,
        avg_engagement_rate: Math.round(rate * 10000) / 100,
        relative_performance: avgRate > 0 ? Math.round((rate / avgRate) * 100) / 100 : 1,
        total_reach: data.reach,
        total_engagements: data.engagements,
        usage_count: data.count,
        best_platform_for_hook: bestPlatform,
        best_platform_name: bestPlatform ? (PLATFORMS[bestPlatform]?.name || bestPlatform) : null,
        platform_breakdown: Object.entries(data.platformBreakdown).map(([pid, pData]) => ({
          platform_id: pid,
          platform_name: PLATFORMS[pid]?.name || pid,
          engagement_rate: pData.reach > 0 ? Math.round((pData.engagements / pData.reach) * 10000) / 100 : 0,
          post_count: pData.count,
        })),
      };
    }).sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getContentStrategy ───────────────────────────────────────────────────────
export const getContentStrategy = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    const suggestions: Array<{
      type: "topic" | "format" | "timing" | "platform" | "hook";
      suggestion: string;
      confidence: number;
      data_points: number;
    }> = [];

    const connectionsSnap = await db.collection(Collections.PLATFORM_CONNECTIONS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("isActive", "==", true)
      .get();

    if (connectionsSnap.size < 3) {
      suggestions.push({
        type: "platform",
        suggestion: "Connect more platforms to maximize your content reach. You're currently using " + connectionsSnap.size + " platform(s).",
        confidence: 0.9,
        data_points: connectionsSnap.size,
      });
    }

    const contentCount = (await db.collection(Collections.CONTENT_UPLOADS)
      .where("workspaceId", "==", ctx.workspaceId).count().get()).data().count;

    if (contentCount < 5) {
      suggestions.push({
        type: "topic",
        suggestion: "Upload more content to build a consistent publishing cadence. Creators who post 3+ times per week see 2x engagement.",
        confidence: 0.85,
        data_points: contentCount,
      });
    }

    const outputsSnap = await db.collection(Collections.GENERATED_OUTPUTS)
      .where("workspaceId", "==", ctx.workspaceId).get();

    const approvedCount = outputsSnap.docs.filter((d) => d.data().status === "approved" || d.data().status === "published").length;

    if (outputsSnap.size > 0 && approvedCount / outputsSnap.size < 0.5) {
      suggestions.push({
        type: "format",
        suggestion: "Consider refining your voice profile. Only " + Math.round((approvedCount / outputsSnap.size) * 100) + "% of generated outputs are approved.",
        confidence: 0.8,
        data_points: outputsSnap.size,
      });
    }

    // Add data-driven hook suggestion if we have enough data
    const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const snapshotsSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("snapshotTime", ">=", thirtyDaysAgo)
      .get();

    if (snapshotsSnap.size >= 10) {
      // Calculate best posting times from real data
      const hourEngagements: Record<number, { total: number; count: number }> = {};
      for (const doc of snapshotsSnap.docs) {
        const d = doc.data();
        const hour = (d.snapshotTime as Timestamp).toDate().getUTCHours();
        if (!hourEngagements[hour]) hourEngagements[hour] = { total: 0, count: 0 };
        hourEngagements[hour].total += (d.engagements as number) || 0;
        hourEngagements[hour].count += 1;
      }

      const bestHour = Object.entries(hourEngagements)
        .map(([h, data]) => ({ hour: Number(h), avg: data.count > 0 ? data.total / data.count : 0 }))
        .sort((a, b) => b.avg - a.avg)[0];

      if (bestHour && bestHour.avg > 0) {
        suggestions.push({
          type: "timing",
          suggestion: `Your content performs best when published around ${bestHour.hour}:00 UTC. Consider scheduling your most important posts for this window.`,
          confidence: Math.min(0.9, 0.5 + snapshotsSnap.size * 0.01),
          data_points: snapshotsSnap.size,
        });
      }
    }

    if (suggestions.length === 0) {
      suggestions.push({
        type: "timing",
        suggestion: "Keep publishing consistently! Check the heatmap above for optimal posting times.",
        confidence: 0.7,
        data_points: 0,
      });
    }

    return suggestions;
  } catch (err) {
    throw wrapError(err);
  }
});

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
