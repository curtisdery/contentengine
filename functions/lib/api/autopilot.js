"use strict";
/**
 * Autopilot API — 4 onCall functions: getEligibility, toggleAutopilot, getAutopilotSummary, panicStop.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.panicStop = exports.getAutopilotSummary = exports.toggleAutopilot = exports.getEligibility = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const auth_js_1 = require("../middleware/auth.js");
const rbac_js_1 = require("../middleware/rbac.js");
const validate_js_1 = require("../middleware/validate.js");
const collections_js_1 = require("../shared/collections.js");
const schemas_js_1 = require("../shared/schemas.js");
const errors_js_1 = require("../shared/errors.js");
const transform_js_1 = require("../shared/transform.js");
const REQUIRED_APPROVAL_RATE = 0.85;
const REQUIRED_MINIMUM_REVIEWS = 10;
// ─── getEligibility ──────────────────────────────────────────────────────────
exports.getEligibility = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const input = (0, validate_js_1.validate)(schemas_js_1.AutopilotEligibilitySchema, request.data);
        const configSnap = await firebase_js_1.db.collection(collections_js_1.Collections.AUTOPILOT_CONFIGS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("platformId", "==", input.platform_id)
            .limit(1)
            .get();
        let totalReviewed = 0;
        let approvedWithoutEdit = 0;
        if (!configSnap.empty) {
            const data = configSnap.docs[0].data();
            totalReviewed = data.totalOutputsReviewed || 0;
            approvedWithoutEdit = data.approvedWithoutEdit || 0;
        }
        const approvalRate = totalReviewed > 0 ? approvedWithoutEdit / totalReviewed : 0;
        const eligible = approvalRate >= REQUIRED_APPROVAL_RATE && totalReviewed >= REQUIRED_MINIMUM_REVIEWS;
        let message;
        if (eligible) {
            message = `Autopilot eligible! ${Math.round(approvalRate * 100)}% approval rate across ${totalReviewed} reviews.`;
        }
        else if (totalReviewed < REQUIRED_MINIMUM_REVIEWS) {
            message = `Need ${REQUIRED_MINIMUM_REVIEWS - totalReviewed} more reviews to qualify. Current: ${totalReviewed}/${REQUIRED_MINIMUM_REVIEWS}.`;
        }
        else {
            message = `Approval rate ${Math.round(approvalRate * 100)}% is below the ${Math.round(REQUIRED_APPROVAL_RATE * 100)}% threshold.`;
        }
        return {
            eligible,
            current_approval_rate: Math.round(approvalRate * 100) / 100,
            required_approval_rate: REQUIRED_APPROVAL_RATE,
            reviews_completed: totalReviewed,
            reviews_required: REQUIRED_MINIMUM_REVIEWS,
            message,
        };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── toggleAutopilot ─────────────────────────────────────────────────────────
exports.toggleAutopilot = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "admin");
        const input = (0, validate_js_1.validate)(schemas_js_1.AutopilotToggleSchema, request.data);
        const configSnap = await firebase_js_1.db.collection(collections_js_1.Collections.AUTOPILOT_CONFIGS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("platformId", "==", input.platform_id)
            .limit(1)
            .get();
        if (input.enabled) {
            // Check eligibility before enabling
            let totalReviewed = 0;
            let approvedWithoutEdit = 0;
            if (!configSnap.empty) {
                const data = configSnap.docs[0].data();
                totalReviewed = data.totalOutputsReviewed || 0;
                approvedWithoutEdit = data.approvedWithoutEdit || 0;
            }
            const approvalRate = totalReviewed > 0 ? approvedWithoutEdit / totalReviewed : 0;
            if (approvalRate < REQUIRED_APPROVAL_RATE || totalReviewed < REQUIRED_MINIMUM_REVIEWS) {
                throw new errors_js_1.ValidationError("Not eligible", "Autopilot requires sufficient review history.");
            }
        }
        if (configSnap.empty) {
            await firebase_js_1.db.collection(collections_js_1.Collections.AUTOPILOT_CONFIGS).add({
                workspaceId: ctx.workspaceId,
                platformId: input.platform_id,
                enabled: input.enabled,
                totalOutputsReviewed: 0,
                approvedWithoutEdit: 0,
                approvalRate: 0,
                requiredApprovalRate: REQUIRED_APPROVAL_RATE,
                requiredMinimumReviews: REQUIRED_MINIMUM_REVIEWS,
                enabledAt: input.enabled ? firestore_1.Timestamp.now() : null,
                autoPublishCount: 0,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        else {
            await configSnap.docs[0].ref.update({
                enabled: input.enabled,
                enabledAt: input.enabled ? firestore_1.Timestamp.now() : null,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        return { success: true, enabled: input.enabled };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── getAutopilotSummary ────────────────────────────────────────────────────
exports.getAutopilotSummary = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const configSnap = await firebase_js_1.db.collection(collections_js_1.Collections.AUTOPILOT_CONFIGS)
            .where("workspaceId", "==", ctx.workspaceId)
            .get();
        const platforms = configSnap.docs.map((doc) => {
            const data = doc.data();
            const totalReviewed = data.totalOutputsReviewed || 0;
            const approvedWithoutEdit = data.approvedWithoutEdit || 0;
            const approvalRate = totalReviewed > 0 ? approvedWithoutEdit / totalReviewed : 0;
            return {
                ...(0, transform_js_1.docToResponse)(doc.id, data),
                platform_id: data.platformId,
                enabled: data.enabled,
                approval_rate: Math.round(approvalRate * 100) / 100,
                reviews_completed: totalReviewed,
                auto_publish_count: data.autoPublishCount || 0,
                eligible: approvalRate >= REQUIRED_APPROVAL_RATE && totalReviewed >= REQUIRED_MINIMUM_REVIEWS,
            };
        });
        const enabledCount = platforms.filter((p) => p.enabled).length;
        const totalAutoPublished = platforms.reduce((sum, p) => sum + p.auto_publish_count, 0);
        return {
            platforms,
            enabled_count: enabledCount,
            total_auto_published: totalAutoPublished,
        };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── panicStop ──────────────────────────────────────────────────────────────
exports.panicStop = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "admin");
        // Disable all autopilot configs for this workspace
        const configSnap = await firebase_js_1.db.collection(collections_js_1.Collections.AUTOPILOT_CONFIGS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("enabled", "==", true)
            .get();
        const batch = firebase_js_1.db.batch();
        for (const doc of configSnap.docs) {
            batch.update(doc.ref, { enabled: false, enabledAt: null, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        }
        // Cancel all scheduled events
        const scheduledSnap = await firebase_js_1.db.collection(collections_js_1.Collections.SCHEDULED_EVENTS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("status", "==", "scheduled")
            .get();
        for (const doc of scheduledSnap.docs) {
            batch.update(doc.ref, { status: "cancelled", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        }
        await batch.commit();
        return {
            success: true,
            autopilots_disabled: configSnap.size,
            events_cancelled: scheduledSnap.size,
        };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
//# sourceMappingURL=autopilot.js.map