/**
 * Voice API — 6 onCall functions: createVoiceProfile, getVoiceProfile, listVoiceProfiles, updateVoiceProfile, analyzeSamples, deleteVoiceProfile.
 */

import { onCall } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { ANTHROPIC_API_KEY } from "../config/env.js";
import { verifyAuth } from "../middleware/auth.js";
import { assertRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { VoiceProfileCreateSchema, VoiceProfileUpdateSchema, AnalyzeSamplesSchema } from "../shared/schemas.js";
import { wrapError, NotFoundError } from "../shared/errors.js";
import { docToResponse } from "../shared/transform.js";
import { analyzeVoiceSamples } from "../lib/ai/contentDNA.js";

// ─── createVoiceProfile ──────────────────────────────────────────────────────
export const createVoiceProfile = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const input = validate(VoiceProfileCreateSchema, request.data);

    // If this is the default, un-default any existing default
    if (input.is_default) {
      const existing = await db
        .collection(Collections.BRAND_VOICE_PROFILES)
        .where("workspaceId", "==", ctx.workspaceId)
        .where("isDefault", "==", true)
        .get();
      const batch = db.batch();
      for (const doc of existing.docs) {
        batch.update(doc.ref, { isDefault: false, updatedAt: FieldValue.serverTimestamp() });
      }
      await batch.commit();
    }

    // If samples are provided, analyze them to get tone metrics
    let toneMetrics: Record<string, number> = {};
    let vocabulary: Record<string, unknown> = {};
    if (input.sample_content.length > 0) {
      try {
        const analysis = await analyzeVoiceSamples(input.sample_content);
        toneMetrics = (analysis.tone_metrics as Record<string, number>) ?? {};
        vocabulary = (analysis.vocabulary_patterns as Record<string, unknown>) ?? {};
        if (analysis.signature_phrases) {
          input.signature_phrases = [
            ...input.signature_phrases,
            ...(analysis.signature_phrases as string[]),
          ];
        }
      } catch (err) {
        console.error("Voice sample analysis failed:", err);
      }
    }

    const docRef = db.collection(Collections.BRAND_VOICE_PROFILES).doc();
    const docData = {
      workspaceId: ctx.workspaceId,
      profileName: input.profile_name,
      voiceAttributes: input.voice_attributes,
      sampleContent: input.sample_content,
      toneMetrics,
      vocabulary: {
        ...vocabulary,
        banned_terms: input.banned_terms,
        preferred_terms: input.preferred_terms,
        audience_label: input.audience_label,
      },
      formattingConfig: {
        signature_phrases: input.signature_phrases,
        emoji_policy: input.emoji_policy,
      },
      ctaLibrary: input.cta_library,
      topicBoundaries: {
        approved_topics: input.approved_topics,
        restricted_topics: input.restricted_topics,
      },
      isDefault: input.is_default,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(docData);
    const snap = await docRef.get();
    return docToResponse(docRef.id, snap.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getVoiceProfile ─────────────────────────────────────────────────────────
export const getVoiceProfile = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const profileId = request.data?.profile_id as string;
    if (!profileId) throw new NotFoundError("profile_id required");

    const snap = await db.collection(Collections.BRAND_VOICE_PROFILES).doc(profileId).get();
    if (!snap.exists) throw new NotFoundError("Voice profile not found");
    if ((snap.data() as Record<string, unknown>).workspaceId !== ctx.workspaceId) {
      throw new NotFoundError("Voice profile not found");
    }

    return docToResponse(snap.id, snap.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── listVoiceProfiles ───────────────────────────────────────────────────────
export const listVoiceProfiles = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    const snap = await db
      .collection(Collections.BRAND_VOICE_PROFILES)
      .where("workspaceId", "==", ctx.workspaceId)
      .orderBy("createdAt", "desc")
      .get();

    const items = snap.docs.map((doc) => docToResponse(doc.id, doc.data() as Record<string, unknown>));
    return { items, total: items.length };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── updateVoiceProfile ──────────────────────────────────────────────────────
export const updateVoiceProfile = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const profileId = request.data?.profile_id as string;
    if (!profileId) throw new NotFoundError("profile_id required");
    const input = validate(VoiceProfileUpdateSchema, request.data);

    const docRef = db.collection(Collections.BRAND_VOICE_PROFILES).doc(profileId);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Voice profile not found");
    if ((snap.data() as Record<string, unknown>).workspaceId !== ctx.workspaceId) {
      throw new NotFoundError("Voice profile not found");
    }

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (input.profile_name !== undefined) updates.profileName = input.profile_name;
    if (input.voice_attributes !== undefined) updates.voiceAttributes = input.voice_attributes;
    if (input.is_default !== undefined) {
      updates.isDefault = input.is_default;
      if (input.is_default) {
        // Un-default others
        const existing = await db
          .collection(Collections.BRAND_VOICE_PROFILES)
          .where("workspaceId", "==", ctx.workspaceId)
          .where("isDefault", "==", true)
          .get();
        const batch = db.batch();
        for (const doc of existing.docs) {
          if (doc.id !== profileId) {
            batch.update(doc.ref, { isDefault: false, updatedAt: FieldValue.serverTimestamp() });
          }
        }
        await batch.commit();
      }
    }
    if (input.cta_library !== undefined) updates.ctaLibrary = input.cta_library;
    if (input.sample_content !== undefined) updates.sampleContent = input.sample_content;

    await docRef.update(updates);
    const updated = await docRef.get();
    return docToResponse(docRef.id, updated.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── analyzeSamples ──────────────────────────────────────────────────────────
export const analyzeSamples = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  try {
    await verifyAuth(request);
    const input = validate(AnalyzeSamplesSchema, request.data);

    const result = await analyzeVoiceSamples(input.samples);

    return {
      tone_metrics: result.tone_metrics ?? {},
      vocabulary_patterns: result.vocabulary_patterns ?? {},
      signature_phrases: result.signature_phrases ?? [],
      suggested_attributes: result.suggested_attributes ?? [],
    };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── deleteVoiceProfile ─────────────────────────────────────────────────────
export const deleteVoiceProfile = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const profileId = request.data?.profile_id as string;
    if (!profileId) throw new NotFoundError("profile_id required");

    const docRef = db.collection(Collections.BRAND_VOICE_PROFILES).doc(profileId);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Voice profile not found");
    if ((snap.data() as Record<string, unknown>).workspaceId !== ctx.workspaceId) {
      throw new NotFoundError("Voice profile not found");
    }

    await docRef.delete();
    return { success: true };
  } catch (err) {
    throw wrapError(err);
  }
});
