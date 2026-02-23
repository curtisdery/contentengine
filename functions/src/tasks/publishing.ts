/**
 * Publishing task — platform-specific publish execution.
 * Validates connection → publishes → updates status → enqueues analytics.
 */

import { onRequest } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { TOKEN_ENCRYPTION_KEY } from "../config/env.js";
import { Collections } from "../shared/collections.js";
import { decryptToken } from "../lib/encryption.js";
import { getPublisher } from "../lib/platforms/publishers/registry.js";
import { enqueueTask, getTaskHandlerUrl } from "../lib/taskClient.js";
import type { DecryptedTokens } from "../lib/platforms/publishers/base.js";

export const taskPublishing = onRequest({ secrets: [TOKEN_ENCRYPTION_KEY], timeoutSeconds: 120 }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const { eventId } = req.body as { eventId: string };
  if (!eventId) {
    res.status(400).json({ error: "eventId required" });
    return;
  }

  try {
    const eventRef = db.collection(Collections.SCHEDULED_EVENTS).doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventSnap.data() as Record<string, unknown>;
    const platformId = event.platformId as string;
    const workspaceId = event.workspaceId as string;
    const outputId = event.generatedOutputId as string;

    // Mark as publishing
    await eventRef.update({ status: "publishing", updatedAt: FieldValue.serverTimestamp() });

    // Load output content
    const outputSnap = await db.collection(Collections.GENERATED_OUTPUTS).doc(outputId).get();
    if (!outputSnap.exists) {
      await markFailed(eventRef, outputId, "Output not found");
      res.status(200).json({ success: false, error: "Output not found" });
      return;
    }
    const outputData = outputSnap.data() as Record<string, unknown>;
    const content = outputData.content as string;

    // Load platform connection
    const connSnap = await db
      .collection(Collections.PLATFORM_CONNECTIONS)
      .where("workspaceId", "==", workspaceId)
      .where("platformId", "==", platformId)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (connSnap.empty) {
      await markFailed(eventRef, outputId, `No active connection for platform '${platformId}'.`);
      res.status(200).json({ success: false, error: "No connection" });
      return;
    }

    const connData = connSnap.docs[0].data() as Record<string, unknown>;

    // Decrypt tokens
    const tokens: DecryptedTokens = {
      accessToken: connData.accessTokenEncrypted ? decryptToken(connData.accessTokenEncrypted as string) : "",
      refreshToken: connData.refreshTokenEncrypted ? decryptToken(connData.refreshTokenEncrypted as string) : null,
      platformUserId: (connData.platformUserId as string) || null,
      platformUsername: (connData.platformUsername as string) || null,
    };

    // Get publisher
    const publisher = getPublisher(platformId);
    if (!publisher) {
      await markFailed(eventRef, outputId, `No publisher for platform '${platformId}'.`);
      res.status(200).json({ success: false, error: "No publisher" });
      return;
    }

    // Publish
    const metadata = (outputData.outputMetadata as Record<string, unknown>) || {};
    metadata.format_type = platformId;
    const result = await publisher.publish(content, metadata, tokens);

    if (result.success) {
      const now = Timestamp.now();
      await eventRef.update({
        status: "published",
        publishedAt: now,
        publishError: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      await db.collection(Collections.GENERATED_OUTPUTS).doc(outputId).update({
        status: "published",
        publishedAt: now,
        platformPostId: result.postId,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Enqueue analytics polling (first poll after 1 hour)
      try {
        await enqueueTask({
          queue: "analytics-polling",
          url: getTaskHandlerUrl("taskAnalyticsPolling"),
          payload: {
            outputId,
            workspaceId,
            platformId,
            pollIndex: 0,
          },
          delaySeconds: 3600,
        });
      } catch {
        // non-fatal
      }

      res.status(200).json({ success: true, postId: result.postId, url: result.url });
    } else {
      await markFailed(eventRef, outputId, result.error || "Unknown publish error");
      res.status(200).json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error("Publishing task error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

async function markFailed(eventRef: FirebaseFirestore.DocumentReference, outputId: string, error: string) {
  const snap = await eventRef.get();
  const event = snap.data() as Record<string, unknown>;
  const retryCount = ((event.retryCount as number) || 0) + 1;
  const maxRetries = (event.maxRetries as number) || 3;

  if (retryCount < maxRetries) {
    const backoffSeconds = Math.pow(2, retryCount) * 60;
    const newScheduledAt = Timestamp.fromDate(new Date(Date.now() + backoffSeconds * 1000));
    await eventRef.update({
      retryCount,
      publishError: error,
      scheduledAt: newScheduledAt,
      status: "scheduled",
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    await eventRef.update({
      retryCount,
      publishError: error,
      status: "failed",
      updatedAt: FieldValue.serverTimestamp(),
    });
    await db.collection(Collections.GENERATED_OUTPUTS).doc(outputId).update({
      status: "failed",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
