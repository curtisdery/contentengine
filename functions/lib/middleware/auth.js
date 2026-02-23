"use strict";
/**
 * Auth middleware — verifies Firebase Auth, looks up or auto-provisions the user.
 * Port of apps/api/app/middleware/auth.py (lines 43-155).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAuth = verifyAuth;
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const collections_js_1 = require("../shared/collections.js");
const errors_js_1 = require("../shared/errors.js");
function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-");
}
/**
 * Verify the caller's Firebase Auth token and resolve their user/workspace/role.
 * Auto-provisions a new user + org + workspace + subscription on first login.
 */
async function verifyAuth(request) {
    if (!request.auth) {
        throw new errors_js_1.AuthenticationError("Not authenticated", "Authorization required. Please sign in.");
    }
    const uid = request.auth.uid;
    const email = request.auth.token.email;
    const displayName = request.auth.token.name;
    const avatarUrl = request.auth.token.picture ?? null;
    const emailVerified = request.auth.token.email_verified ?? false;
    // 1. Look up user by firebaseUid
    const usersRef = firebase_js_1.db.collection(collections_js_1.Collections.USERS);
    let userSnap = (await usersRef.where("firebaseUid", "==", uid).limit(1).get()).docs[0];
    // 2. If not found, check by email (link existing user)
    if (!userSnap && email) {
        const byEmail = (await usersRef.where("email", "==", email).limit(1).get()).docs[0];
        if (byEmail) {
            await byEmail.ref.update({
                firebaseUid: uid,
                ...(emailVerified ? { emailVerified: true } : {}),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            userSnap = byEmail;
        }
    }
    // 3. Auto-provision new user
    if (!userSnap) {
        if (!email) {
            throw new errors_js_1.AuthenticationError("Email required", "Firebase account must have an email address.");
        }
        const fullName = displayName || email.split("@")[0];
        const now = firestore_1.Timestamp.now();
        // Create user doc first to get the ID
        const userRef = usersRef.doc();
        const userId = userRef.id;
        // Create organization
        const orgSlug = slugify(fullName) + "-" + userId.substring(0, 8);
        const orgRef = firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATIONS).doc();
        // Create workspace
        const wsRef = firebase_js_1.db.collection(collections_js_1.Collections.WORKSPACES).doc();
        // Create subscription
        const subRef = firebase_js_1.db.collection(collections_js_1.Collections.SUBSCRIPTIONS).doc();
        // Create org member
        const memberRef = firebase_js_1.db.collection(collections_js_1.Collections.ORGANIZATION_MEMBERS).doc();
        // Run in a batch for atomicity
        const batch = firebase_js_1.db.batch();
        const orgData = {
            name: `${fullName}'s Organization`,
            slug: orgSlug,
            ownerUid: userId,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        batch.set(orgRef, orgData);
        const wsData = {
            organizationId: orgRef.id,
            name: "Default Workspace",
            slug: "default",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        batch.set(wsRef, wsData);
        const userData = {
            firebaseUid: uid,
            email,
            fullName,
            avatarUrl,
            emailVerified,
            isActive: true,
            defaultWorkspaceId: wsRef.id,
            fcmTokens: [],
            mfaEnabled: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        batch.set(userRef, userData);
        const memberData = {
            organizationId: orgRef.id,
            userId: userRef.id,
            role: "owner",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        batch.set(memberRef, memberData);
        const subData = {
            organizationId: orgRef.id,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            tier: "starter",
            status: "trialing",
            cancelAtPeriodEnd: false,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        batch.set(subRef, subData);
        await batch.commit();
        return {
            uid,
            email,
            userId: userRef.id,
            workspaceId: wsRef.id,
            organizationId: orgRef.id,
            role: "owner",
        };
    }
    // Existing user
    const userData = userSnap.data();
    if (!userData.isActive) {
        throw new errors_js_1.AuthenticationError("Account disabled", "This account has been disabled.");
    }
    const userId = userSnap.id;
    const workspaceId = userData.defaultWorkspaceId;
    // Look up the workspace to get organizationId
    const wsSnap = await firebase_js_1.db.collection(collections_js_1.Collections.WORKSPACES).doc(workspaceId).get();
    const wsData = wsSnap.data();
    const organizationId = wsData?.organizationId ?? "";
    // Look up role from organization members
    let role = "viewer";
    if (organizationId) {
        const memberSnap = await firebase_js_1.db
            .collection(collections_js_1.Collections.ORGANIZATION_MEMBERS)
            .where("organizationId", "==", organizationId)
            .where("userId", "==", userId)
            .limit(1)
            .get();
        if (!memberSnap.empty) {
            role = memberSnap.docs[0].data().role;
        }
    }
    return {
        uid,
        email: userData.email,
        userId,
        workspaceId,
        organizationId,
        role,
    };
}
//# sourceMappingURL=auth.js.map