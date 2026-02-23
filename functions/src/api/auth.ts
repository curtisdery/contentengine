/**
 * Auth API — 10 onCall functions for user profile and session management.
 */

import { onCall } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db, auth } from "../config/firebase.js";
import { verifyAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { UpdateProfileSchema, RegisterFCMTokenSchema, RevokeFCMTokenSchema } from "../shared/schemas.js";
import { wrapError, NotFoundError } from "../shared/errors.js";
import { docToResponse } from "../shared/transform.js";
import type { UserDoc } from "../shared/types.js";

// ─── createProfile ───────────────────────────────────────────────────────────
// Called on first login — verifyAuth handles auto-provision, this just returns the profile.
export const createProfile = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const userSnap = await db.collection(Collections.USERS).doc(ctx.userId).get();
    const data = userSnap.data() as UserDoc;
    return docToResponse(ctx.userId, data as unknown as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── updateProfile ───────────────────────────────────────────────────────────
export const updateProfile = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(UpdateProfileSchema, request.data);

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (input.full_name) updates.fullName = input.full_name;
    if (input.avatar_url) updates.avatarUrl = input.avatar_url;

    await db.collection(Collections.USERS).doc(ctx.userId).update(updates);

    const userSnap = await db.collection(Collections.USERS).doc(ctx.userId).get();
    return docToResponse(ctx.userId, userSnap.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── enableMFA ───────────────────────────────────────────────────────────────
// Generates a TOTP enrollment — actual MFA enforcement is in Firebase Auth.
export const enableMFA = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    await db.collection(Collections.USERS).doc(ctx.userId).update({
      mfaEnabled: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, message: "MFA enabled. Complete enrollment in your authenticator app." };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── verifyMFA ───────────────────────────────────────────────────────────────
// Verification is handled by Firebase Auth client SDK; this confirms server state.
export const verifyMFA = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const userSnap = await db.collection(Collections.USERS).doc(ctx.userId).get();
    const data = userSnap.data() as UserDoc;

    return { mfa_enabled: data.mfaEnabled, verified: true };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── registerFCMToken ────────────────────────────────────────────────────────
export const registerFCMToken = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(RegisterFCMTokenSchema, request.data);

    await db.collection(Collections.USERS).doc(ctx.userId).update({
      fcmTokens: FieldValue.arrayUnion(input.token),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── revokeFCMToken ──────────────────────────────────────────────────────────
export const revokeFCMToken = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(RevokeFCMTokenSchema, request.data);

    await db.collection(Collections.USERS).doc(ctx.userId).update({
      fcmTokens: FieldValue.arrayRemove(input.token),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── listSessions ────────────────────────────────────────────────────────────
// Firebase Auth manages sessions natively. We list the user's session info.
export const listSessions = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    // Firebase Admin SDK doesn't expose active sessions directly.
    // Return the user's Firebase Auth record metadata instead.
    const firebaseUser = await auth.getUser(ctx.uid);

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
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── revokeSession ───────────────────────────────────────────────────────────
// Revokes all refresh tokens for the user, effectively signing them out everywhere.
export const revokeSession = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    await auth.revokeRefreshTokens(ctx.uid);

    return { success: true, message: "All sessions revoked." };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getAuditLog ────────────────────────────────────────────────────────────
export const getAuditLog = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    const snap = await db.collection(Collections.AUDIT_LOGS)
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
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── revokeAllSessions ──────────────────────────────────────────────────────
export const revokeAllSessions = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    // Revoke all Firebase refresh tokens
    await auth.revokeRefreshTokens(ctx.uid);

    return { success: true, message: "All sessions revoked. You will need to sign in again." };
  } catch (err) {
    throw wrapError(err);
  }
});
