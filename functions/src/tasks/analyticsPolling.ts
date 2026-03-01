/**
 * Analytics Polling task — self-chaining decaying interval metrics collection.
 * Intervals: 1h, 6h, 24h, 72h, 168h after publish.
 *
 * Now wired to real platform API fetchers instead of placeholder zeros.
 */

import { onRequest } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { TOKEN_ENCRYPTION_KEY } from "../config/env.js";
import { Collections } from "../shared/collections.js";
import { enqueueTask, getTaskHandlerUrl } from "../lib/taskClient.js";
import { getFetcher } from "../lib/analytics/fetchers/registry.js";
import { decryptToken } from "../lib/encryption.js";
import type { PlatformMetrics } from "../lib/analytics/fetchers/base.js";
import { EMPTY_METRICS, TokenExpiredError, PostNotFoundError, RateLimitError } from "../lib/analytics/fetchers/base.js";

const POLL_INTERVALS_SECONDS = [
  3600,      // 1 hour
  21600,     // 6 hours
  86400,     // 24 hours
  259200,    // 72 hours
  604800,    // 168 hours (1 week)
];

export const taskAnalyticsPolling = onRequest({ secrets: [TOKEN_ENCRYPTION_KEY], timeoutSeconds: 120 }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const { outputId, workspaceId, platformId, pollIndex } = req.body as {
    outputId: string;
    workspaceId: string;
    platformId: string;
    pollIndex: number;
  };

  if (!outputId) {
    res.status(400).json({ error: "outputId required" });
    return;
  }

  try {
    // Load the generated output to get the platformPostId
    const outputSnap = await db.collection(Collections.GENERATED_OUTPUTS).doc(outputId).get();
    if (!outputSnap.exists) {
      res.status(404).json({ error: "Output not found" });
      return;
    }

    const outputData = outputSnap.data() as Record<string, unknown>;
    const platformPostId = outputData.platformPostId as string | null;

    if (!platformPostId) {
      console.warn(`Output ${outputId} has no platformPostId — skipping metrics fetch`);
      res.status(200).json({ success: true, skipped: true, reason: "no platformPostId" });
      return;
    }

    // Fetch real metrics from the platform API
    let metrics: PlatformMetrics = EMPTY_METRICS;
    let fetchError: string | null = null;

    const fetcher = getFetcher(platformId);
    if (fetcher) {
      try {
        // Load platform connection for this workspace + platform to get the access token
        const connectionsSnap = await db.collection(Collections.PLATFORM_CONNECTIONS)
          .where("workspaceId", "==", workspaceId)
          .where("platformId", "==", normalizePlatformId(platformId))
          .where("isActive", "==", true)
          .limit(1)
          .get();

        if (connectionsSnap.empty) {
          console.warn(`No active connection for ${platformId} in workspace ${workspaceId}`);
          fetchError = "no_active_connection";
        } else {
          const connData = connectionsSnap.docs[0].data();
          const encryptedToken = connData.accessTokenEncrypted as string | null;

          if (!encryptedToken) {
            console.warn(`No access token for ${platformId} connection`);
            fetchError = "no_access_token";
          } else {
            const accessToken = decryptToken(encryptedToken);
            metrics = await fetcher.fetchMetrics({
              platformPostId,
              accessToken,
              platformUserId: (connData.platformUserId as string) || undefined,
            });
          }
        }
      } catch (err) {
        if (err instanceof TokenExpiredError) {
          console.warn(`Token expired for ${platformId} in workspace ${workspaceId} — skipping`);
          fetchError = "token_expired";
        } else if (err instanceof PostNotFoundError) {
          console.warn(`Post ${platformPostId} not found on ${platformId} — may be deleted`);
          fetchError = "post_not_found";
        } else if (err instanceof RateLimitError) {
          console.warn(`Rate limited by ${platformId} — will retry on next poll`);
          fetchError = "rate_limited";
        } else {
          console.error(`Metrics fetch error for ${platformId}:`, err);
          fetchError = err instanceof Error ? err.message : "unknown_error";
        }
      }
    } else {
      console.log(`No fetcher for platform ${platformId} — storing zero metrics`);
      fetchError = "no_fetcher";
    }

    // Create analytics snapshot with real (or fallback) metrics
    await db.collection(Collections.ANALYTICS_SNAPSHOTS).add({
      workspaceId,
      generatedOutputId: outputId,
      platformId,
      snapshotTime: Timestamp.now(),
      impressions: metrics.impressions,
      engagements: metrics.engagements,
      saves: metrics.saves,
      shares: metrics.shares,
      clicks: metrics.clicks,
      follows: metrics.follows,
      comments: metrics.comments,
      fetchError,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Chain next poll if there are more intervals
    const nextIndex = (pollIndex || 0) + 1;
    if (nextIndex < POLL_INTERVALS_SECONDS.length) {
      await enqueueTask({
        queue: "analytics-polling",
        url: getTaskHandlerUrl("taskAnalyticsPolling"),
        payload: { outputId, workspaceId, platformId, pollIndex: nextIndex },
        delaySeconds: POLL_INTERVALS_SECONDS[nextIndex],
      });
    }

    res.status(200).json({ success: true, pollIndex, nextIndex: nextIndex < POLL_INTERVALS_SECONDS.length ? nextIndex : null, metrics, fetchError });
  } catch (err) {
    console.error("Analytics polling error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

/**
 * Normalize format-specific platform IDs to the base connection platform ID.
 * e.g., "twitter_single" -> "twitter", "linkedin_post" -> "linkedin"
 */
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
