"use strict";
/**
 * Output Generation task — per-format AI content generation.
 * Triggered via Cloud Tasks after triggerGeneration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskOutputGeneration = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const env_js_1 = require("../config/env.js");
const collections_js_1 = require("../shared/collections.js");
const profiles_js_1 = require("../lib/platforms/profiles.js");
const generation_js_1 = require("../lib/ai/generation.js");
const voiceScoring_js_1 = require("../lib/ai/voiceScoring.js");
exports.taskOutputGeneration = (0, https_1.onRequest)({ secrets: [env_js_1.ANTHROPIC_API_KEY], timeoutSeconds: 540 }, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const { contentId, workspaceId, voiceProfileId, selectedPlatforms, emphasisNotes } = req.body;
    if (!contentId) {
        res.status(400).json({ error: "contentId required" });
        return;
    }
    try {
        // Load content
        const contentRef = firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS).doc(contentId);
        const contentSnap = await contentRef.get();
        if (!contentSnap.exists) {
            res.status(404).json({ error: "Content not found" });
            return;
        }
        const contentData = contentSnap.data();
        const contentDna = (contentData.contentDna || {});
        const rawContent = contentData.rawContent;
        // Load voice profile if specified
        let voiceProfile = null;
        if (voiceProfileId) {
            const vpSnap = await firebase_js_1.db.collection(collections_js_1.Collections.BRAND_VOICE_PROFILES).doc(voiceProfileId).get();
            if (vpSnap.exists) {
                voiceProfile = vpSnap.data();
            }
        }
        // Determine which platforms to generate for
        let platformIds;
        if (selectedPlatforms && selectedPlatforms.length > 0) {
            platformIds = selectedPlatforms.filter((pid) => (0, profiles_js_1.getPlatform)(pid));
        }
        else {
            platformIds = (0, profiles_js_1.getAllPlatforms)()
                .filter((p) => (0, generation_js_1.evaluatePlatformFit)(contentDna, p) >= generation_js_1.MIN_FIT_SCORE)
                .map((p) => p.platformId);
        }
        // Combine emphasis notes from request and DNA
        const dnaEmphasis = contentDna.userAdjustments
            ? contentDna.userAdjustments.emphasisNotes
            : undefined;
        const combinedEmphasis = emphasisNotes || dnaEmphasis || undefined;
        // Generate outputs for each platform
        let completedCount = 0;
        let failedCount = 0;
        for (const platformId of platformIds) {
            const platform = (0, profiles_js_1.getPlatform)(platformId);
            if (!platform)
                continue;
            try {
                const result = await (0, generation_js_1.generateSingleOutput)(contentDna, platform, voiceProfile, rawContent, combinedEmphasis);
                // Score voice match
                let voiceScore = null;
                if (voiceProfile && result.content) {
                    try {
                        voiceScore = await (0, voiceScoring_js_1.scoreVoiceMatch)(result.content, voiceProfile);
                    }
                    catch {
                        // Non-fatal — skip voice scoring
                    }
                }
                const fitScore = (0, generation_js_1.evaluatePlatformFit)(contentDna, platform);
                const metadata = { ...result.metadata, platform_fit_score: fitScore };
                // Save output
                await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).add({
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
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                if (result.content)
                    completedCount++;
                else
                    failedCount++;
            }
            catch (err) {
                console.error(`Generation failed for ${platformId}:`, err);
                failedCount++;
                // Save failed output record
                await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).add({
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
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
        }
        // Update content status
        await contentRef.update({
            status: "completed",
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        res.status(200).json({
            success: true,
            contentId,
            generated: completedCount,
            failed: failedCount,
            total: platformIds.length,
        });
    }
    catch (err) {
        console.error("Output generation task error:", err);
        try {
            await firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS).doc(contentId).update({
                status: "failed",
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        catch {
            // ignore
        }
        res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
});
//# sourceMappingURL=outputGeneration.js.map