/**
 * Analytics API — 8 onCall functions.
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

    const snapshotsSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("snapshotTime", ">=", sinceTs)
      .get();

    // Group by day_of_week + hour
    const heatmap: Record<string, { engagements: number; impressions: number; count: number }> = {};

    for (const doc of snapshotsSnap.docs) {
      const d = doc.data();
      const time = (d.snapshotTime as Timestamp).toDate();
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

    const rankings = connectionsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        platform_id: d.platformId as string,
        name: PLATFORMS[d.platformId as string]?.name || d.platformId,
        score: 0,
        follows_gained: 0,
        engagement_rate: 0,
      };
    });

    return {
      fastest_growing_platform: rankings.length > 0 ? { platform_id: rankings[0].platform_id, name: rankings[0].name, growth_rate: 0, follows_gained: 0 } : null,
      best_engagement_platform: rankings.length > 0 ? { platform_id: rankings[0].platform_id, name: rankings[0].name, avg_engagement_rate: 0 } : null,
      platform_rankings: rankings,
      recommendations: ["Connect more platforms to get audience intelligence insights."],
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

    // Get outputs grouped by content type
    const outputsSnap = await db.collection(Collections.GENERATED_OUTPUTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .get();

    const typeData: Record<string, { reach: number; engagements: number; count: number }> = {};

    for (const doc of outputsSnap.docs) {
      const d = doc.data();
      const contentType = (d.contentType as string) || "unknown";
      if (!typeData[contentType]) {
        typeData[contentType] = { reach: 0, engagements: 0, count: 0 };
      }
      typeData[contentType].count += 1;
    }

    // Enrich with analytics snapshots
    const snapshotsSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("snapshotTime", ">=", sinceTs)
      .get();

    const outputTypeMap: Record<string, string> = {};
    for (const doc of outputsSnap.docs) {
      outputTypeMap[doc.id] = (doc.data().contentType as string) || "unknown";
    }

    for (const doc of snapshotsSnap.docs) {
      const d = doc.data();
      const outputId = d.generatedOutputId as string;
      const ct = outputTypeMap[outputId];
      if (ct && typeData[ct]) {
        typeData[ct].reach += (d.impressions as number) || 0;
        typeData[ct].engagements += (d.engagements as number) || 0;
      }
    }

    return Object.entries(typeData).map(([ct, data]) => ({
      content_type: ct,
      avg_engagement_rate: data.reach > 0 ? Math.round((data.engagements / data.reach) * 10000) / 100 : 0,
      total_reach: data.reach,
      post_count: data.count,
      avg_multiplier_score: 0,
    }));
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getHookAnalytics ─────────────────────────────────────────────────────────
export const getHookAnalytics = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    validate(AnalyticsQuerySchema, request.data);

    const contentSnap = await db.collection(Collections.CONTENT_UPLOADS)
      .where("workspaceId", "==", ctx.workspaceId)
      .get();

    const hookData: Record<string, { reach: number; engagements: number; count: number; bestPlatform: string | null }> = {};

    for (const doc of contentSnap.docs) {
      const d = doc.data();
      const hooks = d.hooks as Array<{ type?: string }> | undefined;
      if (!hooks || !Array.isArray(hooks)) continue;
      for (const hook of hooks) {
        const hookType = hook.type || "unknown";
        if (!hookData[hookType]) {
          hookData[hookType] = { reach: 0, engagements: 0, count: 0, bestPlatform: null };
        }
        hookData[hookType].count += 1;
      }
    }

    return Object.entries(hookData).map(([hookType, data]) => ({
      hook_type: hookType,
      avg_engagement_rate: data.reach > 0 ? Math.round((data.engagements / data.reach) * 10000) / 100 : 0,
      total_reach: data.reach,
      usage_count: data.count,
      best_platform_for_hook: data.bestPlatform,
    }));
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getContentStrategy ───────────────────────────────────────────────────────
export const getContentStrategy = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    const suggestions: Array<{
      type: "topic" | "format" | "timing" | "platform";
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
