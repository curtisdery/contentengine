/**
 * Analytics Backfill task — one-time task to fetch metrics for all published outputs
 * that don't yet have analytics snapshots with real data.
 */

import { onRequest } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { TOKEN_ENCRYPTION_KEY } from "../config/env.js";
import { Collections } from "../shared/collections.js";
import { getFetcher } from "../lib/analytics/fetchers/registry.js";
import { decryptToken } from "../lib/encryption.js";
import { TokenExpiredError, PostNotFoundError, RateLimitError } from "../lib/analytics/fetchers/base.js";

export const taskAnalyticsBackfill = onRequest({ secrets: [TOKEN_ENCRYPTION_KEY], timeoutSeconds: 540 }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    // Find all published outputs with a platformPostId
    const outputsSnap = await db.collection(Collections.GENERATED_OUTPUTS)
      .where("status", "==", "published")
      .get();

    const outputs = outputsSnap.docs.filter((doc) => {
      const data = doc.data();
      return data.platformPostId != null && data.platformPostId !== "";
    });

    console.log(`Backfilling analytics for ${outputs.length} published outputs`);

    // Cache platform connections per workspace+platform to avoid repeated lookups
    const connectionCache: Record<string, { accessToken: string; platformUserId: string | null } | null> = {};
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const outputDoc of outputs) {
      const data = outputDoc.data();
      const outputId = outputDoc.id;
      const workspaceId = data.workspaceId as string;
      const platformId = data.platformId as string;
      const platformPostId = data.platformPostId as string;

      const fetcher = getFetcher(platformId);
      if (!fetcher) {
        skipCount++;
        continue;
      }

      // Normalize platform ID for connection lookup
      const connPlatformId = normalizePlatformId(platformId);
      const cacheKey = `${workspaceId}:${connPlatformId}`;

      if (!(cacheKey in connectionCache)) {
        try {
          const connSnap = await db.collection(Collections.PLATFORM_CONNECTIONS)
            .where("workspaceId", "==", workspaceId)
            .where("platformId", "==", connPlatformId)
            .where("isActive", "==", true)
            .limit(1)
            .get();

          if (connSnap.empty) {
            connectionCache[cacheKey] = null;
          } else {
            const connData = connSnap.docs[0].data();
            const encrypted = connData.accessTokenEncrypted as string | null;
            connectionCache[cacheKey] = encrypted
              ? { accessToken: decryptToken(encrypted), platformUserId: (connData.platformUserId as string) || null }
              : null;
          }
        } catch {
          connectionCache[cacheKey] = null;
        }
      }

      const conn = connectionCache[cacheKey];
      if (!conn) {
        skipCount++;
        continue;
      }

      try {
        const metrics = await fetcher.fetchMetrics({
          platformPostId,
          accessToken: conn.accessToken,
          platformUserId: conn.platformUserId || undefined,
        });

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
          fetchError: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        successCount++;
      } catch (err) {
        if (err instanceof TokenExpiredError || err instanceof PostNotFoundError) {
          skipCount++;
        } else if (err instanceof RateLimitError) {
          console.warn(`Rate limited during backfill for ${platformId} — stopping this platform`);
          connectionCache[cacheKey] = null; // Skip remaining outputs for this connection
          skipCount++;
        } else {
          console.error(`Backfill error for output ${outputId}:`, err);
          errorCount++;
        }
      }
    }

    console.log(`Backfill complete: ${successCount} success, ${skipCount} skipped, ${errorCount} errors`);

    res.status(200).json({
      success: true,
      total: outputs.length,
      fetched: successCount,
      skipped: skipCount,
      errors: errorCount,
    });
  } catch (err) {
    console.error("Analytics backfill error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
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
