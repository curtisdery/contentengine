/**
 * Content Analysis task — AI DNA card generation.
 * Triggered via Cloud Tasks after content creation.
 */

import { onRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { ANTHROPIC_API_KEY } from "../config/env.js";
import { Collections } from "../shared/collections.js";
import { analyzeContentDNA } from "../lib/ai/contentDNA.js";

export const taskContentAnalysis = onRequest({ secrets: [ANTHROPIC_API_KEY] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const { contentId, workspaceId } = req.body as { contentId: string; workspaceId: string };

  if (!contentId) {
    res.status(400).json({ error: "contentId required" });
    return;
  }

  try {
    const docRef = db.collection(Collections.CONTENT_UPLOADS).doc(contentId);
    const snap = await docRef.get();

    if (!snap.exists) {
      res.status(404).json({ error: "Content not found" });
      return;
    }

    const data = snap.data() as Record<string, unknown>;
    const rawContent = data.rawContent as string;
    const contentType = data.contentType as string;
    const title = data.title as string;

    if (!rawContent) {
      await docRef.update({
        status: "failed",
        contentDna: { error: "No raw content to analyze" },
        updatedAt: FieldValue.serverTimestamp(),
      });
      res.status(200).json({ success: false, error: "No raw content" });
      return;
    }

    // Run DNA analysis
    const dna = await analyzeContentDNA(rawContent, contentType, title);

    await docRef.update({
      contentDna: dna,
      status: dna.error ? "failed" : "analyzed",
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.status(200).json({ success: true, contentId });
  } catch (err) {
    console.error("Content analysis task error:", err);

    // Update status to failed
    try {
      await db.collection(Collections.CONTENT_UPLOADS).doc(contentId).update({
        status: "failed",
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch {
      // ignore update failure
    }

    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});
