/**
 * Output Generation task — per-format AI content generation.
 * Triggered via Cloud Tasks after triggerGeneration.
 */

import { onRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { ANTHROPIC_API_KEY } from "../config/env.js";
import { Collections } from "../shared/collections.js";
import { getAllPlatforms, getPlatform } from "../lib/platforms/profiles.js";
import { generateSingleOutput, evaluatePlatformFit, MIN_FIT_SCORE } from "../lib/ai/generation.js";
import { scoreVoiceMatch } from "../lib/ai/voiceScoring.js";
import type { ContentDNA, BrandVoiceProfileDoc } from "../shared/types.js";

export const taskOutputGeneration = onRequest({ secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540 }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const { contentId, workspaceId, voiceProfileId, selectedPlatforms, emphasisNotes } = req.body as {
    contentId: string;
    workspaceId: string;
    voiceProfileId: string | null;
    selectedPlatforms: string[] | null;
    emphasisNotes: string | null;
  };

  if (!contentId) {
    res.status(400).json({ error: "contentId required" });
    return;
  }

  try {
    // Load content
    const contentRef = db.collection(Collections.CONTENT_UPLOADS).doc(contentId);
    const contentSnap = await contentRef.get();
    if (!contentSnap.exists) {
      res.status(404).json({ error: "Content not found" });
      return;
    }

    const contentData = contentSnap.data() as Record<string, unknown>;
    const contentDna = (contentData.contentDna || {}) as ContentDNA;
    const rawContent = contentData.rawContent as string;

    // Load voice profile if specified
    let voiceProfile: BrandVoiceProfileDoc | null = null;
    if (voiceProfileId) {
      const vpSnap = await db.collection(Collections.BRAND_VOICE_PROFILES).doc(voiceProfileId).get();
      if (vpSnap.exists) {
        voiceProfile = vpSnap.data() as BrandVoiceProfileDoc;
      }
    }

    // Determine which platforms to generate for
    let platformIds: string[];
    if (selectedPlatforms && selectedPlatforms.length > 0) {
      platformIds = selectedPlatforms.filter((pid) => getPlatform(pid));
    } else {
      platformIds = getAllPlatforms()
        .filter((p) => evaluatePlatformFit(contentDna, p) >= MIN_FIT_SCORE)
        .map((p) => p.platformId);
    }

    // Combine emphasis notes from request and DNA
    const dnaEmphasis = (contentDna as unknown as Record<string, unknown>).userAdjustments
      ? ((contentDna as unknown as Record<string, unknown>).userAdjustments as Record<string, unknown>).emphasisNotes as string | undefined
      : undefined;
    const combinedEmphasis = emphasisNotes || dnaEmphasis || undefined;

    // Generate outputs for each platform
    let completedCount = 0;
    let failedCount = 0;

    for (const platformId of platformIds) {
      const platform = getPlatform(platformId);
      if (!platform) continue;

      try {
        const result = await generateSingleOutput(
          contentDna,
          platform,
          voiceProfile,
          rawContent,
          combinedEmphasis
        );

        // Score voice match
        let voiceScore: number | null = null;
        if (voiceProfile && result.content) {
          try {
            voiceScore = await scoreVoiceMatch(result.content, voiceProfile);
          } catch {
            // Non-fatal — skip voice scoring
          }
        }

        const fitScore = evaluatePlatformFit(contentDna, platform);
        const metadata = { ...result.metadata, platform_fit_score: fitScore };

        // Save output
        await db.collection(Collections.GENERATED_OUTPUTS).add({
          workspaceId,
          contentUploadId: contentId,
          platformId: platform.platformId,
          formatName: platform.name,
          content: result.content,
          outputMetadata: metadata,
          voiceMatchScore: voiceScore,
          status: result.content ? "draft" : "failed",
          scheduledAt: null,
          publishedAt: null,
          platformPostId: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (result.content) completedCount++;
        else failedCount++;
      } catch (err) {
        console.error(`Generation failed for ${platformId}:`, err);
        failedCount++;

        // Save failed output record
        await db.collection(Collections.GENERATED_OUTPUTS).add({
          workspaceId,
          contentUploadId: contentId,
          platformId: platform.platformId,
          formatName: platform.name,
          content: "",
          outputMetadata: { error: err instanceof Error ? err.message : String(err) },
          voiceMatchScore: null,
          status: "failed",
          scheduledAt: null,
          publishedAt: null,
          platformPostId: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // Update content status
    await contentRef.update({
      status: "completed",
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.status(200).json({
      success: true,
      contentId,
      generated: completedCount,
      failed: failedCount,
      total: platformIds.length,
    });
  } catch (err) {
    console.error("Output generation task error:", err);

    try {
      await db.collection(Collections.CONTENT_UPLOADS).doc(contentId).update({
        status: "failed",
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch {
      // ignore
    }

    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});
