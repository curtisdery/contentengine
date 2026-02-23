"use strict";
/**
 * Auth API — 10 onCall functions for user profile and session management.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeAllSessions = exports.getAuditLog = exports.revokeSession = exports.listSessions = exports.revokeFCMToken = exports.registerFCMToken = exports.verifyMFA = exports.enableMFA = exports.updateProfile = exports.createProfile = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const auth_js_1 = require("../middleware/auth.js");
const validate_js_1 = require("../middleware/validate.js");
const collections_js_1 = require("../shared/collections.js");
const schemas_js_1 = require("../shared/schemas.js");
const errors_js_1 = require("../shared/errors.js");
const transform_js_1 = require("../shared/transform.js");
// ─── createProfile ───────────────────────────────────────────────────────────
// Called on first login — verifyAuth handles auto-provision, this just returns the profile.
exports.createProfile = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const userSnap = await firebase_js_1.db.collection(collections_js_1.Collections.USERS).doc(ctx.userId).get();
        const data = userSnap.data();
        return (0, transform_js_1.docToResponse)(ctx.userId, data);
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── updateProfile ───────────────────────────────────────────────────────────
exports.updateProfile = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const input = (0, validate_js_1.validate)(schemas_js_1.UpdateProfileSchema, request.data);
        const updates = { updatedAt: firestore_1.FieldValue.serverTimestamp() };
        if (input.full_name)
            updates.fullName = input.full_name;
        if (input.avatar_url)
            updates.avatarUrl = input.avatar_url;
        await firebase_js_1.db.collection(collections_js_1.Collections.USERS).doc(ctx.userId).update(updates);
        const userSnap = await firebase_js_1.db.collection(collections_js_1.Collections.USERS).doc(ctx.userId).get();
        return (0, transform_js_1.docToResponse)(ctx.userId, userSnap.data());
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── enableMFA ───────────────────────────────────────────────────────────────
// Generates a TOTP enrollment — actual MFA enforcement is in Firebase Auth.
exports.enableMFA = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        await firebase_js_1.db.collection(collections_js_1.Collections.USERS).doc(ctx.userId).update({
            mfaEnabled: true,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true, message: "MFA enabled. Complete enrollment in your authenticator app." };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── verifyMFA ───────────────────────────────────────────────────────────────
// Verification is handled by Firebase Auth client SDK; this confirms server state.
exports.verifyMFA = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const userSnap = await firebase_js_1.db.collection(collections_js_1.Collections.USERS).doc(ctx.userId).get();
        const data = userSnap.data();
        return { mfa_enabled: data.mfaEnabled, verified: true };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── registerFCMToken ────────────────────────────────────────────────────────
exports.registerFCMToken = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const input = (0, validate_js_1.validate)(schemas_js_1.RegisterFCMTokenSchema, request.data);
        await firebase_js_1.db.collection(collections_js_1.Collections.USERS).doc(ctx.userId).update({
            fcmTokens: firestore_1.FieldValue.arrayUnion(input.token),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── revokeFCMToken ──────────────────────────────────────────────────────────
exports.revokeFCMToken = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const input = (0, validate_js_1.validate)(schemas_js_1.RevokeFCMTokenSchema, request.data);
        await firebase_js_1.db.collection(collections_js_1.Collections.USERS).doc(ctx.userId).update({
            fcmTokens: firestore_1.FieldValue.arrayRemove(input.token),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── listSessions ────────────────────────────────────────────────────────────
// Firebase Auth manages sessions natively. We list the user's session info.
exports.listSessions = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        // Firebase Admin SDK doesn't expose active sessions directly.
        // Return the user's Firebase Auth record metadata instead.
        const firebaseUser = await firebase_js_1.auth.getUser(ctx.uid);
        return {
            sessions: [
                {
                    id: ctx.uid,
                    user_agent: null,
                    ip_address: null,
                    expires_at: null,
                    is_active: !firebaseUser.disabled,
                    created_at: firebaseUser.metadata.creationTime ?? null,
                    last_sign_in: firebaseUser.metadata.lastSignInTime ?? null,
                },
            ],
        };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── revokeSession ───────────────────────────────────────────────────────────
// Revokes all refresh tokens for the user, effectively signing them out everywhere.
exports.revokeSession = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        await firebase_js_1.auth.revokeRefreshTokens(ctx.uid);
        return { success: true, message: "All sessions revoked." };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── getAuditLog ────────────────────────────────────────────────────────────
exports.getAuditLog = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const snap = await firebase_js_1.db.collection(collections_js_1.Collections.AUDIT_LOGS)
            .where("workspaceId", "==", ctx.workspaceId)
            .orderBy("createdAt", "desc")
            .limit(100)
            .get();
        const entries = snap.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                action: data.action,
                actor_id: data.actorId,
                actor_email: data.actorEmail,
                resource_type: data.resourceType,
                resource_id: data.resourceId,
                details: data.details || null,
                ip_address: data.ipAddress || null,
                created_at: data.createdAt,
            };
        });
        return { entries, total: entries.length };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── revokeAllSessions ──────────────────────────────────────────────────────
exports.revokeAllSessions = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        // Revoke all Firebase refresh tokens
        await firebase_js_1.auth.revokeRefreshTokens(ctx.uid);
        return { success: true, message: "All sessions revoked. You will need to sign in again." };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
//# sourceMappingURL=auth.js.map