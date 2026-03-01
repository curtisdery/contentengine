/**
 * A/B Testing API — create, list, evaluate A/B tests.
 */

import { onCall } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { ANTHROPIC_API_KEY } from "../config/env.js";
import { verifyAuth } from "../middleware/auth.js";
import { assertRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { wrapError, NotFoundError } from "../shared/errors.js";
import { docToResponse } from "../shared/transform.js";
import { getPlatform } from "../lib/platforms/profiles.js";
import { generateVariantPair } from "../lib/ai/variantGeneration.js";
import type { ContentDNA, BrandVoiceProfileDoc, ABTestVariant } from "../shared/types.js";
import { z } from "zod";

const CreateABTestSchema = z.object({
  content_id: z.string(),
  platform_id: z.string(),
  voice_profile_id: z.string().optional(),
  evaluation_hours: z.number().int().min(24).max(168).default(72),
});

const ABTestIdSchema = z.object({
  test_id: z.string(),
});

// ─── createABTest ──────────────────────────────────────────────────────────
export const createABTest = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const input = validate(CreateABTestSchema, request.data);

    // Verify content exists
    const contentSnap = await db.collection(Collections.CONTENT_UPLOADS).doc(input.content_id).get();
    if (!contentSnap.exists) throw new NotFoundError("Content not found");
    const contentData = contentSnap.data() as Record<string, unknown>;
    if (contentData.workspaceId !== ctx.workspaceId) throw new NotFoundError("Content not found");

    const platform = getPlatform(input.platform_id);
    if (!platform) throw new NotFoundError("Platform not found");

    const contentDna = (contentData.contentDna || {}) as ContentDNA;
    const rawContent = contentData.rawContent as string;

    // Load voice profile
    let voiceProfile: BrandVoiceProfileDoc | null = null;
    if (input.voice_profile_id) {
      const vpSnap = await db.collection(Collections.BRAND_VOICE_PROFILES).doc(input.voice_profile_id).get();
      if (vpSnap.exists) voiceProfile = vpSnap.data() as BrandVoiceProfileDoc;
    }

    // Generate two variants
    const variants = await generateVariantPair(contentDna, platform, voiceProfile, rawContent);

    // Save both variants as GeneratedOutputs
    const outputARef = db.collection(Collections.GENERATED_OUTPUTS).doc();
    const outputBRef = db.collection(Collections.GENERATED_OUTPUTS).doc();

    const baseOutput = {
      workspaceId: ctx.workspaceId,
      contentUploadId: input.content_id,
      platformId: input.platform_id,
      formatName: platform.name,
      outputMetadata: { abTest: true },
      voiceMatchScore: null,
      status: "draft" as const,
      scheduledAt: null,
      publishedAt: null,
      platformPostId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await outputARef.set({ ...baseOutput, content: variants.variantA.content });
    await outputBRef.set({ ...baseOutput, content: variants.variantB.content });

    // Create the A/B test document
    const variantA: ABTestVariant = {
      outputId: outputARef.id,
      label: variants.variantA.label,
      hookType: variants.variantA.hookType,
      impressions: 0,
      engagements: 0,
      engagementRate: 0,
    };

    const variantB: ABTestVariant = {
      outputId: outputBRef.id,
      label: variants.variantB.label,
      hookType: variants.variantB.hookType,
      impressions: 0,
      engagements: 0,
      engagementRate: 0,
    };

    const testRef = db.collection(Collections.AB_TESTS).doc();
    await testRef.set({
      workspaceId: ctx.workspaceId,
      contentUploadId: input.content_id,
      platformId: input.platform_id,
      name: `${variants.variantA.hookType} vs ${variants.variantB.hookType}`,
      hypothesis: variants.hypothesis,
      status: "running",
      variantA,
      variantB,
      winnerId: null,
      winnerMargin: null,
      insight: null,
      startedAt: Timestamp.now(),
      completedAt: null,
      evaluationHours: input.evaluation_hours,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const snap = await testRef.get();
    return docToResponse(testRef.id, snap.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── listABTests ──────────────────────────────────────────────────────────
export const listABTests = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    const snap = await db.collection(Collections.AB_TESTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const items = snap.docs.map((doc) => docToResponse(doc.id, doc.data() as Record<string, unknown>));
    return { items, total: items.length };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── evaluateABTest ───────────────────────────────────────────────────────
export const evaluateABTest = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(ABTestIdSchema, request.data);

    const testRef = db.collection(Collections.AB_TESTS).doc(input.test_id);
    const testSnap = await testRef.get();
    if (!testSnap.exists) throw new NotFoundError("A/B test not found");

    const testData = testSnap.data() as Record<string, unknown>;
    if (testData.workspaceId !== ctx.workspaceId) throw new NotFoundError("A/B test not found");

    const variantA = testData.variantA as ABTestVariant;
    const variantB = testData.variantB as ABTestVariant;

    // Get latest analytics for each variant
    const [snapsA, snapsB] = await Promise.all([
      db.collection(Collections.ANALYTICS_SNAPSHOTS)
        .where("generatedOutputId", "==", variantA.outputId)
        .orderBy("snapshotTime", "desc")
        .limit(1)
        .get(),
      db.collection(Collections.ANALYTICS_SNAPSHOTS)
        .where("generatedOutputId", "==", variantB.outputId)
        .orderBy("snapshotTime", "desc")
        .limit(1)
        .get(),
    ]);

    const metricsA = snapsA.empty ? { impressions: 0, engagements: 0 } : snapsA.docs[0].data();
    const metricsB = snapsB.empty ? { impressions: 0, engagements: 0 } : snapsB.docs[0].data();

    const impA = (metricsA.impressions as number) || 0;
    const engA = (metricsA.engagements as number) || 0;
    const rateA = impA > 0 ? (engA / impA) * 100 : 0;

    const impB = (metricsB.impressions as number) || 0;
    const engB = (metricsB.engagements as number) || 0;
    const rateB = impB > 0 ? (engB / impB) * 100 : 0;

    // Determine winner based on engagement rate
    let winnerId: string | null = null;
    let winnerMargin = 0;
    let insight: string;

    const minImpressions = 50;
    if (impA < minImpressions && impB < minImpressions) {
      insight = "Not enough data yet — both variants need more impressions for a reliable comparison.";
    } else if (rateA > rateB) {
      winnerId = variantA.outputId;
      winnerMargin = rateB > 0 ? Math.round(((rateA - rateB) / rateB) * 100) : 100;
      insight = `${variantA.label} outperformed ${variantB.label} by ${winnerMargin}% on engagement rate.`;
    } else if (rateB > rateA) {
      winnerId = variantB.outputId;
      winnerMargin = rateA > 0 ? Math.round(((rateB - rateA) / rateA) * 100) : 100;
      insight = `${variantB.label} outperformed ${variantA.label} by ${winnerMargin}% on engagement rate.`;
    } else {
      insight = "Both variants performed equally — no significant difference detected.";
    }

    // Update the test with results
    await testRef.update({
      "variantA.impressions": impA,
      "variantA.engagements": engA,
      "variantA.engagementRate": Math.round(rateA * 100) / 100,
      "variantB.impressions": impB,
      "variantB.engagements": engB,
      "variantB.engagementRate": Math.round(rateB * 100) / 100,
      winnerId,
      winnerMargin,
      insight,
      status: winnerId ? "completed" : "running",
      completedAt: winnerId ? Timestamp.now() : null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const updated = await testRef.get();
    return docToResponse(testRef.id, updated.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});
