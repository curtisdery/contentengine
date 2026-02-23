"use strict";
/**
 * Content API — 7 onCall functions: getUploadURL, createContent, getContent, listContent, updateContent, triggerGeneration, reanalyzeContent.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.reanalyzeContent = exports.triggerGeneration = exports.updateContent = exports.listContent = exports.getContent = exports.createContent = exports.getUploadURL = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const uuid_1 = require("uuid");
const firebase_js_1 = require("../config/firebase.js");
const env_js_1 = require("../config/env.js");
const auth_js_1 = require("../middleware/auth.js");
const rbac_js_1 = require("../middleware/rbac.js");
const validate_js_1 = require("../middleware/validate.js");
const collections_js_1 = require("../shared/collections.js");
const schemas_js_1 = require("../shared/schemas.js");
const errors_js_1 = require("../shared/errors.js");
const transform_js_1 = require("../shared/transform.js");
const taskClient_js_1 = require("../lib/taskClient.js");
// ─── getUploadURL ────────────────────────────────────────────────────────────
exports.getUploadURL = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const fileName = `content/${ctx.workspaceId}/${(0, uuid_1.v4)()}`;
        const bucket = firebase_js_1.storage.bucket();
        const file = bucket.file(fileName);
        const [url] = await file.getSignedUrl({
            version: "v4",
            action: "write",
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
            contentType: "application/octet-stream",
        });
        return { upload_url: url, storage_path: fileName };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── createContent ───────────────────────────────────────────────────────────
exports.createContent = (0, https_1.onCall)({ secrets: [env_js_1.ANTHROPIC_API_KEY] }, async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const input = (0, validate_js_1.validate)(schemas_js_1.ContentUploadRequestSchema, request.data);
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS).doc();
        const docData = {
            workspaceId: ctx.workspaceId,
            title: input.title,
            contentType: input.content_type,
            rawContent: input.raw_content || "",
            storagePath: input.storage_path || null,
            sourceUrl: input.source_url || null,
            contentDna: null,
            status: "pending",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        await docRef.set(docData);
        // Enqueue content analysis task if content is available
        if (input.raw_content) {
            try {
                await docRef.update({ status: "analyzing" });
                await (0, taskClient_js_1.enqueueTask)({
                    queue: "content-analysis",
                    url: (0, taskClient_js_1.getTaskHandlerUrl)("taskContentAnalysis"),
                    payload: {
                        contentId: docRef.id,
                        workspaceId: ctx.workspaceId,
                    },
                });
            }
            catch (taskErr) {
                console.error("Failed to enqueue content analysis:", taskErr);
                // Don't fail the create — the task can be retried manually
            }
        }
        const snap = await docRef.get();
        return (0, transform_js_1.docToResponse)(docRef.id, snap.data());
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── getContent ──────────────────────────────────────────────────────────────
exports.getContent = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const contentId = request.data?.content_id;
        if (!contentId)
            throw new errors_js_1.NotFoundError("content_id required");
        const snap = await firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS).doc(contentId).get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Content not found");
        const data = snap.data();
        if (data.workspaceId !== ctx.workspaceId)
            throw new errors_js_1.NotFoundError("Content not found");
        return (0, transform_js_1.docToResponse)(snap.id, data);
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── listContent ─────────────────────────────────────────────────────────────
exports.listContent = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const limit = Math.min(request.data?.limit ?? 20, 100);
        const offset = request.data?.offset ?? 0;
        let query = firebase_js_1.db
            .collection(collections_js_1.Collections.CONTENT_UPLOADS)
            .where("workspaceId", "==", ctx.workspaceId)
            .orderBy("createdAt", "desc");
        // For pagination, use offset approach (simpler, suitable for moderate data)
        if (offset > 0) {
            query = query.offset(offset);
        }
        query = query.limit(limit);
        const snap = await query.get();
        const items = snap.docs.map((doc) => (0, transform_js_1.docToResponse)(doc.id, doc.data()));
        // Get total count (separate query)
        const countSnap = await firebase_js_1.db
            .collection(collections_js_1.Collections.CONTENT_UPLOADS)
            .where("workspaceId", "==", ctx.workspaceId)
            .count()
            .get();
        return {
            items,
            total: countSnap.data().count,
        };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── updateContent ───────────────────────────────────────────────────────────
exports.updateContent = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const contentId = request.data?.content_id;
        if (!contentId)
            throw new errors_js_1.NotFoundError("content_id required");
        const input = (0, validate_js_1.validate)(schemas_js_1.ContentUpdateRequestSchema, request.data);
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS).doc(contentId);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Content not found");
        if (snap.data().workspaceId !== ctx.workspaceId) {
            throw new errors_js_1.NotFoundError("Content not found");
        }
        // Store user adjustments in the DNA
        const currentDna = snap.data().contentDna;
        const updatedDna = {
            ...(currentDna || {}),
            userAdjustments: {
                emphasisNotes: input.emphasis_notes ?? null,
                focusHookIndex: input.focus_hook_index ?? null,
                additionalContext: input.additional_context ?? null,
            },
        };
        await docRef.update({
            contentDna: updatedDna,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        const updated = await docRef.get();
        return (0, transform_js_1.docToResponse)(docRef.id, updated.data());
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── triggerGeneration ───────────────────────────────────────────────────────
exports.triggerGeneration = (0, https_1.onCall)({ secrets: [env_js_1.ANTHROPIC_API_KEY] }, async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const contentId = request.data?.content_id;
        if (!contentId)
            throw new errors_js_1.NotFoundError("content_id required");
        const input = (0, validate_js_1.validate)(schemas_js_1.GenerateRequestSchema, request.data);
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS).doc(contentId);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Content not found");
        const data = snap.data();
        if (data.workspaceId !== ctx.workspaceId)
            throw new errors_js_1.NotFoundError("Content not found");
        // Update status to generating
        await docRef.update({ status: "generating", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        // Enqueue output generation task
        await (0, taskClient_js_1.enqueueTask)({
            queue: "output-generation",
            url: (0, taskClient_js_1.getTaskHandlerUrl)("taskOutputGeneration"),
            payload: {
                contentId: docRef.id,
                workspaceId: ctx.workspaceId,
                voiceProfileId: input.voice_profile_id || null,
                selectedPlatforms: input.selected_platforms || null,
                emphasisNotes: input.emphasis_notes || null,
            },
        });
        return { success: true, message: "Generation started. Outputs will appear shortly." };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── reanalyzeContent ───────────────────────────────────────────────────────
exports.reanalyzeContent = (0, https_1.onCall)({ secrets: [env_js_1.ANTHROPIC_API_KEY] }, async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const contentId = request.data?.content_id;
        if (!contentId)
            throw new errors_js_1.NotFoundError("content_id required");
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS).doc(contentId);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Content not found");
        const data = snap.data();
        if (data.workspaceId !== ctx.workspaceId)
            throw new errors_js_1.NotFoundError("Content not found");
        await docRef.update({ status: "analyzing", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        await (0, taskClient_js_1.enqueueTask)({
            queue: "content-analysis",
            url: (0, taskClient_js_1.getTaskHandlerUrl)("taskContentAnalysis"),
            payload: {
                contentId: docRef.id,
                workspaceId: ctx.workspaceId,
            },
        });
        return { success: true, message: "Content re-analysis started." };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
//# sourceMappingURL=content.js.map