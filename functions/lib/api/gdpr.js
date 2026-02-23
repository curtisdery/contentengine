"use strict";
/**
 * GDPR API — 2 onCall functions: exportData, deleteAccount.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccount = exports.exportData = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_js_1 = require("../config/firebase.js");
const auth_js_1 = require("../middleware/auth.js");
const validate_js_1 = require("../middleware/validate.js");
const collections_js_1 = require("../shared/collections.js");
const schemas_js_1 = require("../shared/schemas.js");
const errors_js_1 = require("../shared/errors.js");
const transform_js_1 = require("../shared/transform.js");
// ─── exportData ──────────────────────────────────────────────────────────────
exports.exportData = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        // Collect all user data across collections
        const userSnap = await firebase_js_1.db.collection(collections_js_1.Collections.USERS).doc(ctx.userId).get();
        const userData = userSnap.exists ? (0, transform_js_1.docToResponse)(ctx.userId, userSnap.data()) : null;
        const contentSnap = await firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS)
            .where("workspaceId", "==", ctx.workspaceId).get();
        const content = contentSnap.docs.map((d) => (0, transform_js_1.docToResponse)(d.id, d.data()));
        const outputsSnap = await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS)
            .where("workspaceId", "==", ctx.workspaceId).get();
        const outputs = outputsSnap.docs.map((d) => (0, transform_js_1.docToResponse)(d.id, d.data()));
        const voiceSnap = await firebase_js_1.db.collection(collections_js_1.Collections.BRAND_VOICE_PROFILES)
            .where("workspaceId", "==", ctx.workspaceId).get();
        const voiceProfiles = voiceSnap.docs.map((d) => (0, transform_js_1.docToResponse)(d.id, d.data()));
        const eventsSnap = await firebase_js_1.db.collection(collections_js_1.Collections.SCHEDULED_EVENTS)
            .where("workspaceId", "==", ctx.workspaceId).get();
        const events = eventsSnap.docs.map((d) => (0, transform_js_1.docToResponse)(d.id, d.data()));
        return {
            user: userData,
            content_uploads: content,
            generated_outputs: outputs,
            voice_profiles: voiceProfiles,
            scheduled_events: events,
            exported_at: new Date().toISOString(),
        };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── deleteAccount ───────────────────────────────────────────────────────────
exports.deleteAccount = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, validate_js_1.validate)(schemas_js_1.DeleteAccountSchema, request.data);
        // Cascade delete all workspace data
        const collectionsToDelete = [
            { name: collections_js_1.Collections.CONTENT_UPLOADS, field: "workspaceId" },
            { name: collections_js_1.Collections.GENERATED_OUTPUTS, field: "workspaceId" },
            { name: collections_js_1.Collections.BRAND_VOICE_PROFILES, field: "workspaceId" },
            { name: collections_js_1.Collections.PLATFORM_CONNECTIONS, field: "workspaceId" },
            { name: collections_js_1.Collections.SCHEDULED_EVENTS, field: "workspaceId" },
            { name: collections_js_1.Collections.ANALYTICS_SNAPSHOTS, field: "workspaceId" },
            { name: collections_js_1.Collections.MULTIPLIER_SCORES, field: "workspaceId" },
            { name: collections_js_1.Collections.AUTOPILOT_CONFIGS, field: "workspaceId" },
            { name: collections_js_1.Collections.AUDIT_LOGS, field: "workspaceId" },
            { name: collections_js_1.Collections.NOTIFICATIONS, field: "workspaceId" },
        ];
        for (const collection of collectionsToDelete) {
            const snap = await firebase_js_1.db.collection(collection.name)
                .where(collection.field, "==", ctx.workspaceId)
                .get();
            const batch = firebase_js_1.db.batch();
            let count = 0;
            for (const doc of snap.docs) {
                batch.delete(doc.ref);
                count++;
                if (count >= 500) {
                    await batch.commit();
                    count = 0;
                }
            }
            if (count > 0)
                await batch.commit();
        }
        // Delete organization members
        const membersSnap = await firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATION_MEMBERS)
            .where("organizationId", "==", ctx.organizationId).get();
        const memberBatch = firebase_js_1.db.batch();
        membersSnap.docs.forEach((doc) => memberBatch.delete(doc.ref));
        await memberBatch.commit();
        // Delete subscription
        const subSnap = await firebase_js_1.db.collection(collections_js_1.Collections.SUBSCRIPTIONS)
            .where("organizationId", "==", ctx.organizationId).get();
        const subBatch = firebase_js_1.db.batch();
        subSnap.docs.forEach((doc) => subBatch.delete(doc.ref));
        await subBatch.commit();
        // Delete workspace
        await firebase_js_1.db.collection(collections_js_1.Collections.WORKSPACES).doc(ctx.workspaceId).delete();
        // Delete organization
        if (ctx.organizationId) {
            await firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATIONS).doc(ctx.organizationId).delete();
        }
        // Delete user document
        await firebase_js_1.db.collection(collections_js_1.Collections.USERS).doc(ctx.userId).delete();
        // Delete Firebase Auth account
        await firebase_js_1.auth.deleteUser(ctx.uid);
        return { success: true, message: "Account and all data permanently deleted." };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
//# sourceMappingURL=gdpr.js.map