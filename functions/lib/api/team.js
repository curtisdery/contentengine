"use strict";
/**
 * Team API — 6 onCall functions: inviteMember, acceptInvite, listMembers, updateRole, removeMember, transferOwnership.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferOwnership = exports.removeMember = exports.updateRole = exports.listMembers = exports.acceptInvite = exports.inviteMember = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = require("crypto");
const firebase_js_1 = require("../config/firebase.js");
const auth_js_1 = require("../middleware/auth.js");
const rbac_js_1 = require("../middleware/rbac.js");
const validate_js_1 = require("../middleware/validate.js");
const collections_js_1 = require("../shared/collections.js");
const schemas_js_1 = require("../shared/schemas.js");
const errors_js_1 = require("../shared/errors.js");
// ─── inviteMember ────────────────────────────────────────────────────────────
exports.inviteMember = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "admin");
        const input = (0, validate_js_1.validate)(schemas_js_1.InviteMemberSchema, request.data);
        // Check if already a member
        const existingUser = await firebase_js_1.db.collection(collections_js_1.Collections.USERS).where("email", "==", input.email).limit(1).get();
        if (!existingUser.empty) {
            const userId = existingUser.docs[0].id;
            const existingMember = await firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATION_MEMBERS)
                .where("organizationId", "==", ctx.organizationId)
                .where("userId", "==", userId)
                .limit(1)
                .get();
            if (!existingMember.empty) {
                throw new errors_js_1.ValidationError("Already a member", "This user is already a member of this organization.");
            }
        }
        const token = (0, crypto_1.randomBytes)(32).toString("hex");
        const inviteRef = firebase_js_1.db.collection(collections_js_1.Collections.INVITES).doc();
        await inviteRef.set({
            organizationId: ctx.organizationId,
            email: input.email,
            role: input.role,
            invitedBy: ctx.userId,
            status: "pending",
            token,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true, invite_id: inviteRef.id, token };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── acceptInvite ────────────────────────────────────────────────────────────
exports.acceptInvite = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const input = (0, validate_js_1.validate)(schemas_js_1.AcceptInviteSchema, request.data);
        const inviteSnap = await firebase_js_1.db.collection(collections_js_1.Collections.INVITES)
            .where("token", "==", input.token)
            .where("status", "==", "pending")
            .limit(1)
            .get();
        if (inviteSnap.empty) {
            throw new errors_js_1.NotFoundError("Invite not found or expired");
        }
        const invite = inviteSnap.docs[0];
        const inviteData = invite.data();
        // Add as organization member
        await firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATION_MEMBERS).add({
            organizationId: inviteData.organizationId,
            userId: ctx.userId,
            role: inviteData.role,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        // Mark invite as accepted
        await invite.ref.update({ status: "accepted", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        return { success: true, organization_id: inviteData.organizationId };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── listMembers ─────────────────────────────────────────────────────────────
exports.listMembers = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const membersSnap = await firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATION_MEMBERS)
            .where("organizationId", "==", ctx.organizationId)
            .get();
        const members = await Promise.all(membersSnap.docs.map(async (doc) => {
            const data = doc.data();
            const userSnap = await firebase_js_1.db.collection(collections_js_1.Collections.USERS).doc(data.userId).get();
            const userData = userSnap.exists ? userSnap.data() : null;
            return {
                id: doc.id,
                user_id: data.userId,
                role: data.role,
                email: userData?.email ?? "",
                full_name: userData?.fullName ?? "",
                avatar_url: userData?.avatarUrl ?? null,
            };
        }));
        return { members, total: members.length };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── updateRole ──────────────────────────────────────────────────────────────
exports.updateRole = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "admin");
        const input = (0, validate_js_1.validate)(schemas_js_1.UpdateRoleSchema, request.data);
        const memberRef = firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATION_MEMBERS).doc(input.member_id);
        const memberSnap = await memberRef.get();
        if (!memberSnap.exists)
            throw new errors_js_1.NotFoundError("Member not found");
        const memberData = memberSnap.data();
        if (memberData.organizationId !== ctx.organizationId)
            throw new errors_js_1.NotFoundError("Member not found");
        if (memberData.role === "owner")
            throw new errors_js_1.PermissionError("Cannot change owner role", "Use transferOwnership instead.");
        await memberRef.update({ role: input.role, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        return { success: true };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── removeMember ────────────────────────────────────────────────────────────
exports.removeMember = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "admin");
        const input = (0, validate_js_1.validate)(schemas_js_1.RemoveMemberSchema, request.data);
        const memberRef = firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATION_MEMBERS).doc(input.member_id);
        const memberSnap = await memberRef.get();
        if (!memberSnap.exists)
            throw new errors_js_1.NotFoundError("Member not found");
        const memberData = memberSnap.data();
        if (memberData.organizationId !== ctx.organizationId)
            throw new errors_js_1.NotFoundError("Member not found");
        if (memberData.role === "owner")
            throw new errors_js_1.PermissionError("Cannot remove owner");
        if (memberData.userId === ctx.userId)
            throw new errors_js_1.ValidationError("Cannot remove yourself");
        await memberRef.delete();
        return { success: true };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── transferOwnership ───────────────────────────────────────────────────────
exports.transferOwnership = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "owner");
        const input = (0, validate_js_1.validate)(schemas_js_1.TransferOwnershipSchema, request.data);
        // Find the new owner's membership
        const newOwnerSnap = await firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATION_MEMBERS)
            .where("organizationId", "==", ctx.organizationId)
            .where("userId", "==", input.new_owner_id)
            .limit(1)
            .get();
        if (newOwnerSnap.empty)
            throw new errors_js_1.NotFoundError("User is not a member of this organization");
        // Find current owner's membership
        const currentOwnerSnap = await firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATION_MEMBERS)
            .where("organizationId", "==", ctx.organizationId)
            .where("userId", "==", ctx.userId)
            .limit(1)
            .get();
        if (currentOwnerSnap.empty)
            throw new errors_js_1.NotFoundError("Current owner membership not found");
        // Swap roles
        const batch = firebase_js_1.db.batch();
        batch.update(newOwnerSnap.docs[0].ref, { role: "owner", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        batch.update(currentOwnerSnap.docs[0].ref, { role: "admin", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        // Update organization owner
        const orgRef = firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATIONS).doc(ctx.organizationId);
        batch.update(orgRef, { ownerUid: input.new_owner_id, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        await batch.commit();
        return { success: true };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
//# sourceMappingURL=team.js.map