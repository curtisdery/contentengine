"use strict";
/**
 * Content Analysis task — AI DNA card generation.
 * Triggered via Cloud Tasks after content creation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskContentAnalysis = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const env_js_1 = require("../config/env.js");
const collections_js_1 = require("../shared/collections.js");
const contentDNA_js_1 = require("../lib/ai/contentDNA.js");
exports.taskContentAnalysis = (0, https_1.onRequest)({ secrets: [env_js_1.ANTHROPIC_API_KEY] }, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const { contentId, workspaceId } = req.body;
    if (!contentId) {
        res.status(400).json({ error: "contentId required" });
        return;
    }
    try {
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS).doc(contentId);
        const snap = await docRef.get();
        if (!snap.exists) {
            res.status(404).json({ error: "Content not found" });
            return;
        }
        const data = snap.data();
        const rawContent = data.rawContent;
        const contentType = data.contentType;
        const title = data.title;
        if (!rawContent) {
            await docRef.update({
                status: "failed",
                contentDna: { error: "No raw content to analyze" },
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            res.status(200).json({ success: false, error: "No raw content" });
            return;
        }
        // Run DNA analysis
        const dna = await (0, contentDNA_js_1.analyzeContentDNA)(rawContent, contentType, title);
        await docRef.update({
            contentDna: dna,
            status: dna.error ? "failed" : "analyzed",
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        res.status(200).json({ success: true, contentId });
    }
    catch (err) {
        console.error("Content analysis task error:", err);
        // Update status to failed
        try {
            await firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS).doc(contentId).update({
                status: "failed",
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        catch {
            // ignore update failure
        }
        res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
});
//# sourceMappingURL=contentAnalysis.js.map