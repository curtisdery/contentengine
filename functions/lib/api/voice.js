"use strict";
/**
 * Voice API — 6 onCall functions: createVoiceProfile, getVoiceProfile, listVoiceProfiles, updateVoiceProfile, analyzeSamples, deleteVoiceProfile.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteVoiceProfile = exports.analyzeSamples = exports.updateVoiceProfile = exports.listVoiceProfiles = exports.getVoiceProfile = exports.createVoiceProfile = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const env_js_1 = require("../config/env.js");
const auth_js_1 = require("../middleware/auth.js");
const rbac_js_1 = require("../middleware/rbac.js");
const validate_js_1 = require("../middleware/validate.js");
const collections_js_1 = require("../shared/collections.js");
const schemas_js_1 = require("../shared/schemas.js");
const errors_js_1 = require("../shared/errors.js");
const transform_js_1 = require("../shared/transform.js");
const contentDNA_js_1 = require("../lib/ai/contentDNA.js");
// ─── createVoiceProfile ──────────────────────────────────────────────────────
exports.createVoiceProfile = (0, https_1.onCall)({ secrets: [env_js_1.ANTHROPIC_API_KEY] }, async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const input = (0, validate_js_1.validate)(schemas_js_1.VoiceProfileCreateSchema, request.data);
        // If this is the default, un-default any existing default
        if (input.is_default) {
            const existing = await firebase_js_1.db
                .collection(collections_js_1.Collections.BRAND_VOICE_PROFILES)
                .where("workspaceId", "==", ctx.workspaceId)
                .where("isDefault", "==", true)
                .get();
            const batch = firebase_js_1.db.batch();
            for (const doc of existing.docs) {
                batch.update(doc.ref, { isDefault: false, updatedAt: firestore_1.FieldValue.serverTimestamp() });
            }
            await batch.commit();
        }
        // If samples are provided, analyze them to get tone metrics
        let toneMetrics = {};
        let vocabulary = {};
        if (input.sample_content.length > 0) {
            try {
                const analysis = await (0, contentDNA_js_1.analyzeVoiceSamples)(input.sample_content);
                toneMetrics = analysis.tone_metrics ?? {};
                vocabulary = analysis.vocabulary_patterns ?? {};
                if (analysis.signature_phrases) {
                    input.signature_phrases = [
                        ...input.signature_phrases,
                        ...analysis.signature_phrases,
                    ];
                }
            }
            catch (err) {
                console.error("Voice sample analysis failed:", err);
            }
        }
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.BRAND_VOICE_PROFILES).doc();
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        await docRef.set(docData);
        const snap = await docRef.get();
        return (0, transform_js_1.docToResponse)(docRef.id, snap.data());
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── getVoiceProfile ─────────────────────────────────────────────────────────
exports.getVoiceProfile = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const profileId = request.data?.profile_id;
        if (!profileId)
            throw new errors_js_1.NotFoundError("profile_id required");
        const snap = await firebase_js_1.db.collection(collections_js_1.Collections.BRAND_VOICE_PROFILES).doc(profileId).get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Voice profile not found");
        if (snap.data().workspaceId !== ctx.workspaceId) {
            throw new errors_js_1.NotFoundError("Voice profile not found");
        }
        return (0, transform_js_1.docToResponse)(snap.id, snap.data());
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── listVoiceProfiles ───────────────────────────────────────────────────────
exports.listVoiceProfiles = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const snap = await firebase_js_1.db
            .collection(collections_js_1.Collections.BRAND_VOICE_PROFILES)
            .where("workspaceId", "==", ctx.workspaceId)
            .orderBy("createdAt", "desc")
            .get();
        const items = snap.docs.map((doc) => (0, transform_js_1.docToResponse)(doc.id, doc.data()));
        return { items, total: items.length };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── updateVoiceProfile ──────────────────────────────────────────────────────
exports.updateVoiceProfile = (0, https_1.onCall)({ secrets: [env_js_1.ANTHROPIC_API_KEY] }, async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const profileId = request.data?.profile_id;
        if (!profileId)
            throw new errors_js_1.NotFoundError("profile_id required");
        const input = (0, validate_js_1.validate)(schemas_js_1.VoiceProfileUpdateSchema, request.data);
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.BRAND_VOICE_PROFILES).doc(profileId);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Voice profile not found");
        if (snap.data().workspaceId !== ctx.workspaceId) {
            throw new errors_js_1.NotFoundError("Voice profile not found");
        }
        const updates = { updatedAt: firestore_1.FieldValue.serverTimestamp() };
        if (input.profile_name !== undefined)
            updates.profileName = input.profile_name;
        if (input.voice_attributes !== undefined)
            updates.voiceAttributes = input.voice_attributes;
        if (input.is_default !== undefined) {
            updates.isDefault = input.is_default;
            if (input.is_default) {
                // Un-default others
                const existing = await firebase_js_1.db
                    .collection(collections_js_1.Collections.BRAND_VOICE_PROFILES)
                    .where("workspaceId", "==", ctx.workspaceId)
                    .where("isDefault", "==", true)
                    .get();
                const batch = firebase_js_1.db.batch();
                for (const doc of existing.docs) {
                    if (doc.id !== profileId) {
                        batch.update(doc.ref, { isDefault: false, updatedAt: firestore_1.FieldValue.serverTimestamp() });
                    }
                }
                await batch.commit();
            }
        }
        if (input.cta_library !== undefined)
            updates.ctaLibrary = input.cta_library;
        if (input.sample_content !== undefined)
            updates.sampleContent = input.sample_content;
        await docRef.update(updates);
        const updated = await docRef.get();
        return (0, transform_js_1.docToResponse)(docRef.id, updated.data());
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── analyzeSamples ──────────────────────────────────────────────────────────
exports.analyzeSamples = (0, https_1.onCall)({ secrets: [env_js_1.ANTHROPIC_API_KEY] }, async (request) => {
    try {
        await (0, auth_js_1.verifyAuth)(request);
        const input = (0, validate_js_1.validate)(schemas_js_1.AnalyzeSamplesSchema, request.data);
        const result = await (0, contentDNA_js_1.analyzeVoiceSamples)(input.samples);
        return {
            tone_metrics: result.tone_metrics ?? {},
            vocabulary_patterns: result.vocabulary_patterns ?? {},
            signature_phrases: result.signature_phrases ?? [],
            suggested_attributes: result.suggested_attributes ?? [],
        };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── deleteVoiceProfile ─────────────────────────────────────────────────────
exports.deleteVoiceProfile = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const profileId = request.data?.profile_id;
        if (!profileId)
            throw new errors_js_1.NotFoundError("profile_id required");
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.BRAND_VOICE_PROFILES).doc(profileId);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Voice profile not found");
        if (snap.data().workspaceId !== ctx.workspaceId) {
            throw new errors_js_1.NotFoundError("Voice profile not found");
        }
        await docRef.delete();
        return { success: true };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
//# sourceMappingURL=voice.js.map