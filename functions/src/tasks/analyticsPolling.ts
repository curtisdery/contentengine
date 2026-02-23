/**
 * Analytics Polling task — self-chaining decaying interval metrics collection.
 * Intervals: 1h, 6h, 24h, 72h, 168h after publish.
 */

import { onRequest } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { TOKEN_ENCRYPTION_KEY } from "../config/env.js";
import { Collections } from "../shared/collections.js";
import { enqueueTask, getTaskHandlerUrl } from "../lib/taskClient.js";

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
    // For now, create a placeholder snapshot (real implementation would call platform APIs)
    await db.collection(Collections.ANALYTICS_SNAPSHOTS).add({
      workspaceId,
      generatedOutputId: outputId,
      platformId,
      snapshotTime: Timestamp.now(),
      impressions: 0,
      engagements: 0,
      saves: 0,
      shares: 0,
      clicks: 0,
      follows: 0,
      comments: 0,
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

    res.status(200).json({ success: true, pollIndex, nextIndex: nextIndex < POLL_INTERVALS_SECONDS.length ? nextIndex : null });
  } catch (err) {
    console.error("Analytics polling error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});
