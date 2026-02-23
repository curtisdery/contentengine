"use strict";
/**
 * Analytics API — 5 onCall functions: getOverview, getContentAnalytics, getPlatformAnalytics, getHeatmap, getAudienceIntelligence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAudienceIntelligence = exports.getHeatmap = exports.getPlatformAnalytics = exports.getContentAnalytics = exports.getOverview = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const auth_js_1 = require("../middleware/auth.js");
const validate_js_1 = require("../middleware/validate.js");
const collections_js_1 = require("../shared/collections.js");
const schemas_js_1 = require("../shared/schemas.js");
const errors_js_1 = require("../shared/errors.js");
const profiles_js_1 = require("../lib/platforms/profiles.js");
// ─── getOverview (dashboard) ─────────────────────────────────────────────────
exports.getOverview = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const input = (0, validate_js_1.validate)(schemas_js_1.AnalyticsQuerySchema, request.data);
        const sinceDate = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
        const sinceTs = firestore_1.Timestamp.fromDate(sinceDate);
        // Content counts
        const contentCount = (await firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS)
            .where("workspaceId", "==", ctx.workspaceId).count().get()).data().count;
        const outputsCount = (await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS)
            .where("workspaceId", "==", ctx.workspaceId).count().get()).data().count;
        const publishedCount = (await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS)
            .where("workspaceId", "==", ctx.workspaceId).where("status", "==", "published").count().get()).data().count;
        // Active platforms
        const connectionsSnap = await firebase_js_1.db.collection(collections_js_1.Collections.PLATFORM_CONNECTIONS)
            .where("workspaceId", "==", ctx.workspaceId).where("isActive", "==", true).get();
        // Aggregate analytics
        const snapshotsSnap = await firebase_js_1.db.collection(collections_js_1.Collections.ANALYTICS_SNAPSHOTS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("snapshotTime", ">=", sinceTs)
            .get();
        let totalReach = 0;
        let totalEngagements = 0;
        for (const doc of snapshotsSnap.docs) {
            const d = doc.data();
            totalReach += d.impressions || 0;
            totalEngagements += d.engagements || 0;
        }
        // Multiplier scores
        const scoresSnap = await firebase_js_1.db.collection(collections_js_1.Collections.MULTIPLIER_SCORES)
            .where("workspaceId", "==", ctx.workspaceId).get();
        let avgMultiplier = 0;
        let bestMultiplier = 0;
        if (!scoresSnap.empty) {
            const scores = scoresSnap.docs.map((d) => d.data().multiplierValue || 0);
            avgMultiplier = scores.reduce((a, b) => a + b, 0) / scores.length;
            bestMultiplier = Math.max(...scores);
        }
        // Top performing content
        const topContent = scoresSnap.docs
            .map((d) => {
            const data = d.data();
            return {
                id: d.id,
                contentUploadId: data.contentUploadId,
                multiplierValue: data.multiplierValue || 0,
                totalReach: data.totalReach || 0,
            };
        })
            .sort((a, b) => b.multiplierValue - a.multiplierValue)
            .slice(0, 5);
        const topPerforming = await Promise.all(topContent.map(async (score) => {
            const contentSnap = await firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS).doc(score.contentUploadId).get();
            return {
                content_id: score.contentUploadId,
                title: contentSnap.exists ? contentSnap.data().title : "Unknown",
                multiplier_value: score.multiplierValue,
                total_reach: score.totalReach,
            };
        }));
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
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── getContentAnalytics ─────────────────────────────────────────────────────
exports.getContentAnalytics = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const input = (0, validate_js_1.validate)(schemas_js_1.ContentAnalyticsSchema, request.data);
        const contentSnap = await firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS).doc(input.content_id).get();
        if (!contentSnap.exists)
            throw new errors_js_1.NotFoundError("Content not found");
        if (contentSnap.data().workspaceId !== ctx.workspaceId) {
            throw new errors_js_1.NotFoundError("Content not found");
        }
        // Get multiplier score for this content
        const scoreSnap = await firebase_js_1.db.collection(collections_js_1.Collections.MULTIPLIER_SCORES)
            .where("contentUploadId", "==", input.content_id)
            .limit(1)
            .get();
        const score = scoreSnap.empty ? null : {
            ...scoreSnap.docs[0].data(),
            id: scoreSnap.docs[0].id,
        };
        // Get outputs
        const outputsSnap = await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS)
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
            title: contentSnap.data().title,
            multiplier_score: score,
            outputs,
        };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── getPlatformAnalytics ────────────────────────────────────────────────────
exports.getPlatformAnalytics = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const input = (0, validate_js_1.validate)(schemas_js_1.AnalyticsQuerySchema, request.data);
        const sinceDate = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
        const sinceTs = firestore_1.Timestamp.fromDate(sinceDate);
        const snapshotsSnap = await firebase_js_1.db.collection(collections_js_1.Collections.ANALYTICS_SNAPSHOTS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("snapshotTime", ">=", sinceTs)
            .get();
        // Group by platform
        const platformData = {};
        for (const doc of snapshotsSnap.docs) {
            const d = doc.data();
            const pid = d.platformId;
            if (!platformData[pid]) {
                platformData[pid] = { impressions: 0, engagements: 0, saves: 0, shares: 0, clicks: 0, follows: 0, count: 0 };
            }
            platformData[pid].impressions += d.impressions || 0;
            platformData[pid].engagements += d.engagements || 0;
            platformData[pid].saves += d.saves || 0;
            platformData[pid].shares += d.shares || 0;
            platformData[pid].clicks += d.clicks || 0;
            platformData[pid].follows += d.follows || 0;
            platformData[pid].count += 1;
        }
        const platforms = Object.entries(platformData).map(([pid, data]) => ({
            platform_id: pid,
            platform_name: profiles_js_1.PLATFORMS[pid]?.name || pid,
            total_impressions: data.impressions,
            total_engagements: data.engagements,
            avg_engagement_rate: data.impressions > 0 ? Math.round((data.engagements / data.impressions) * 10000) / 100 : 0,
            total_saves: data.saves,
            total_shares: data.shares,
            total_clicks: data.clicks,
            total_follows: data.follows,
            post_count: data.count,
            trend: "stable",
        }));
        return { platforms };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── getHeatmap ──────────────────────────────────────────────────────────────
exports.getHeatmap = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const input = (0, validate_js_1.validate)(schemas_js_1.AnalyticsQuerySchema, request.data);
        const sinceDate = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
        const sinceTs = firestore_1.Timestamp.fromDate(sinceDate);
        const snapshotsSnap = await firebase_js_1.db.collection(collections_js_1.Collections.ANALYTICS_SNAPSHOTS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("snapshotTime", ">=", sinceTs)
            .get();
        // Group by day_of_week + hour
        const heatmap = {};
        for (const doc of snapshotsSnap.docs) {
            const d = doc.data();
            const time = d.snapshotTime.toDate();
            const key = `${time.getUTCDay()}-${time.getUTCHours()}`;
            if (!heatmap[key])
                heatmap[key] = { engagements: 0, impressions: 0, count: 0 };
            heatmap[key].engagements += d.engagements || 0;
            heatmap[key].impressions += d.impressions || 0;
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
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── getAudienceIntelligence ─────────────────────────────────────────────────
exports.getAudienceIntelligence = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const connectionsSnap = await firebase_js_1.db.collection(collections_js_1.Collections.PLATFORM_CONNECTIONS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("isActive", "==", true)
            .get();
        const rankings = connectionsSnap.docs.map((doc) => {
            const d = doc.data();
            return {
                platform_id: d.platformId,
                name: profiles_js_1.PLATFORMS[d.platformId]?.name || d.platformId,
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
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
//# sourceMappingURL=analytics.js.map