"use strict";
/**
 * Outputs API — 7 onCall functions: listOutputs, getOutput, editOutput, approveOutput, rejectOutput, regenerateOutput, bulkApproveOutputs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkApproveOutputs = exports.regenerateOutput = exports.rejectOutput = exports.approveOutput = exports.editOutput = exports.getOutput = exports.listOutputs = void 0;
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
const taskClient_js_1 = require("../lib/taskClient.js");
// ─── listOutputs ─────────────────────────────────────────────────────────────
exports.listOutputs = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const contentId = request.data?.content_id;
        if (!contentId)
            throw new errors_js_1.NotFoundError("content_id required");
        // Verify content belongs to workspace
        const contentSnap = await firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS).doc(contentId).get();
        if (!contentSnap.exists)
            throw new errors_js_1.NotFoundError("Content not found");
        if (contentSnap.data().workspaceId !== ctx.workspaceId) {
            throw new errors_js_1.NotFoundError("Content not found");
        }
        const snap = await firebase_js_1.db
            .collection(collections_js_1.Collections.GENERATED_OUTPUTS)
            .where("contentUploadId", "==", contentId)
            .orderBy("createdAt", "desc")
            .get();
        const items = snap.docs.map((doc) => (0, transform_js_1.docToResponse)(doc.id, doc.data()));
        return {
            items,
            total: items.length,
            content_title: contentSnap.data().title || "",
            content_id: contentId,
        };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── getOutput ───────────────────────────────────────────────────────────────
exports.getOutput = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const outputId = request.data?.output_id;
        if (!outputId)
            throw new errors_js_1.NotFoundError("output_id required");
        const snap = await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(outputId).get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Output not found");
        if (snap.data().workspaceId !== ctx.workspaceId) {
            throw new errors_js_1.NotFoundError("Output not found");
        }
        return (0, transform_js_1.docToResponse)(snap.id, snap.data());
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── editOutput ──────────────────────────────────────────────────────────────
exports.editOutput = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const outputId = request.data?.output_id;
        if (!outputId)
            throw new errors_js_1.NotFoundError("output_id required");
        const input = (0, validate_js_1.validate)(schemas_js_1.OutputUpdateSchema, request.data);
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(outputId);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Output not found");
        if (snap.data().workspaceId !== ctx.workspaceId) {
            throw new errors_js_1.NotFoundError("Output not found");
        }
        const updates = { updatedAt: firestore_1.FieldValue.serverTimestamp() };
        if (input.content !== undefined)
            updates.content = input.content;
        if (input.status !== undefined)
            updates.status = input.status;
        await docRef.update(updates);
        const updated = await docRef.get();
        return (0, transform_js_1.docToResponse)(docRef.id, updated.data());
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── approveOutput ───────────────────────────────────────────────────────────
exports.approveOutput = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const outputId = request.data?.output_id;
        if (!outputId)
            throw new errors_js_1.NotFoundError("output_id required");
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(outputId);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Output not found");
        if (snap.data().workspaceId !== ctx.workspaceId) {
            throw new errors_js_1.NotFoundError("Output not found");
        }
        await docRef.update({ status: "approved", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        // Update autopilot tracking
        const data = snap.data();
        const platformId = data.platformId;
        try {
            const configSnap = await firebase_js_1.db
                .collection(collections_js_1.Collections.AUTOPILOT_CONFIGS)
                .where("workspaceId", "==", ctx.workspaceId)
                .where("platformId", "==", platformId)
                .limit(1)
                .get();
            if (!configSnap.empty) {
                await configSnap.docs[0].ref.update({
                    totalOutputsReviewed: firestore_1.FieldValue.increment(1),
                    approvedWithoutEdit: firestore_1.FieldValue.increment(1),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
        }
        catch {
            // non-fatal
        }
        const updated = await docRef.get();
        return (0, transform_js_1.docToResponse)(docRef.id, updated.data());
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── rejectOutput ────────────────────────────────────────────────────────────
exports.rejectOutput = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const outputId = request.data?.output_id;
        if (!outputId)
            throw new errors_js_1.NotFoundError("output_id required");
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(outputId);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Output not found");
        if (snap.data().workspaceId !== ctx.workspaceId) {
            throw new errors_js_1.NotFoundError("Output not found");
        }
        await docRef.update({ status: "rejected", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        // Update autopilot tracking (reviewed but not approved)
        const data = snap.data();
        try {
            const configSnap = await firebase_js_1.db
                .collection(collections_js_1.Collections.AUTOPILOT_CONFIGS)
                .where("workspaceId", "==", ctx.workspaceId)
                .where("platformId", "==", data.platformId)
                .limit(1)
                .get();
            if (!configSnap.empty) {
                await configSnap.docs[0].ref.update({
                    totalOutputsReviewed: firestore_1.FieldValue.increment(1),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
        }
        catch {
            // non-fatal
        }
        const updated = await docRef.get();
        return (0, transform_js_1.docToResponse)(docRef.id, updated.data());
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── regenerateOutput ────────────────────────────────────────────────────────
exports.regenerateOutput = (0, https_1.onCall)({ secrets: [env_js_1.ANTHROPIC_API_KEY] }, async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const outputId = request.data?.output_id;
        if (!outputId)
            throw new errors_js_1.NotFoundError("output_id required");
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(outputId);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Output not found");
        const data = snap.data();
        if (data.workspaceId !== ctx.workspaceId)
            throw new errors_js_1.NotFoundError("Output not found");
        // Enqueue regeneration for just this platform
        await (0, taskClient_js_1.enqueueTask)({
            queue: "output-generation",
            url: (0, taskClient_js_1.getTaskHandlerUrl)("taskOutputGeneration"),
            payload: {
                contentId: data.contentUploadId,
                workspaceId: ctx.workspaceId,
                voiceProfileId: null,
                selectedPlatforms: [data.platformId],
                emphasisNotes: null,
            },
        });
        // Mark current output as rejected (will be replaced)
        await docRef.update({ status: "rejected", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        return { success: true, message: "Regeneration started." };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── bulkApproveOutputs ─────────────────────────────────────────────────────
exports.bulkApproveOutputs = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const input = (0, validate_js_1.validate)(schemas_js_1.BulkApproveSchema, request.data);
        let approvedCount = 0;
        for (const outputId of input.output_ids) {
            try {
                const docRef = firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(outputId);
                const snap = await docRef.get();
                if (!snap.exists)
                    continue;
                const data = snap.data();
                if (data.workspaceId !== ctx.workspaceId)
                    continue;
                if (data.status === "approved")
                    continue;
                await docRef.update({ status: "approved", updatedAt: firestore_1.FieldValue.serverTimestamp() });
                approvedCount++;
                // Update autopilot tracking
                try {
                    const configSnap = await firebase_js_1.db
                        .collection(collections_js_1.Collections.AUTOPILOT_CONFIGS)
                        .where("workspaceId", "==", ctx.workspaceId)
                        .where("platformId", "==", data.platformId)
                        .limit(1)
                        .get();
                    if (!configSnap.empty) {
                        await configSnap.docs[0].ref.update({
                            totalOutputsReviewed: firestore_1.FieldValue.increment(1),
                            approvedWithoutEdit: firestore_1.FieldValue.increment(1),
                            updatedAt: firestore_1.FieldValue.serverTimestamp(),
                        });
                    }
                }
                catch {
                    // non-fatal
                }
            }
            catch (err) {
                console.warn("Bulk approve item error:", err);
            }
        }
        return { approved_count: approvedCount };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
//# sourceMappingURL=outputs.js.map