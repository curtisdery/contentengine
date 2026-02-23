/**
 * Team API — 6 onCall functions: inviteMember, acceptInvite, listMembers, updateRole, removeMember, transferOwnership.
 */

import { onCall } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "crypto";
import { db } from "../config/firebase.js";
import { verifyAuth } from "../middleware/auth.js";
import { assertRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { InviteMemberSchema, AcceptInviteSchema, UpdateRoleSchema, RemoveMemberSchema, TransferOwnershipSchema } from "../shared/schemas.js";
import { wrapError, NotFoundError, ValidationError, PermissionError } from "../shared/errors.js";
import type { OrganizationMemberDoc, UserDoc } from "../shared/types.js";

// ─── inviteMember ────────────────────────────────────────────────────────────
export const inviteMember = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "admin");
    const input = validate(InviteMemberSchema, request.data);

    // Check if already a member
    const existingUser = await db.collection(Collections.USERS).where("email", "==", input.email).limit(1).get();
    if (!existingUser.empty) {
      const userId = existingUser.docs[0].id;
      const existingMember = await db.collection(Collections.ORGANIZATION_MEMBERS)
        .where("organizationId", "==", ctx.organizationId)
        .where("userId", "==", userId)
        .limit(1)
        .get();
      if (!existingMember.empty) {
        throw new ValidationError("Already a member", "This user is already a member of this organization.");
      }
    }

    const token = randomBytes(32).toString("hex");
    const inviteRef = db.collection(Collections.INVITES).doc();
    await inviteRef.set({
      organizationId: ctx.organizationId,
      email: input.email,
      role: input.role,
      invitedBy: ctx.userId,
      status: "pending",
      token,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, invite_id: inviteRef.id, token };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── acceptInvite ────────────────────────────────────────────────────────────
export const acceptInvite = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(AcceptInviteSchema, request.data);

    const inviteSnap = await db.collection(Collections.INVITES)
      .where("token", "==", input.token)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (inviteSnap.empty) {
      throw new NotFoundError("Invite not found or expired");
    }

    const invite = inviteSnap.docs[0];
    const inviteData = invite.data() as Record<string, unknown>;

    // Add as organization member
    await db.collection(Collections.ORGANIZATION_MEMBERS).add({
      organizationId: inviteData.organizationId,
      userId: ctx.userId,
      role: inviteData.role,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Mark invite as accepted
    await invite.ref.update({ status: "accepted", updatedAt: FieldValue.serverTimestamp() });

    return { success: true, organization_id: inviteData.organizationId };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── listMembers ─────────────────────────────────────────────────────────────
export const listMembers = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    const membersSnap = await db.collection(Collections.ORGANIZATION_MEMBERS)
      .where("organizationId", "==", ctx.organizationId)
      .get();

    const members = await Promise.all(
      membersSnap.docs.map(async (doc) => {
        const data = doc.data() as OrganizationMemberDoc;
        const userSnap = await db.collection(Collections.USERS).doc(data.userId).get();
        const userData = userSnap.exists ? userSnap.data() as UserDoc : null;

        return {
          id: doc.id,
          user_id: data.userId,
          role: data.role,
          email: userData?.email ?? "",
          full_name: userData?.fullName ?? "",
          avatar_url: userData?.avatarUrl ?? null,
        };
      })
    );

    return { members, total: members.length };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── updateRole ──────────────────────────────────────────────────────────────
export const updateRole = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "admin");
    const input = validate(UpdateRoleSchema, request.data);

    const memberRef = db.collection(Collections.ORGANIZATION_MEMBERS).doc(input.member_id);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) throw new NotFoundError("Member not found");

    const memberData = memberSnap.data() as OrganizationMemberDoc;
    if (memberData.organizationId !== ctx.organizationId) throw new NotFoundError("Member not found");
    if (memberData.role === "owner") throw new PermissionError("Cannot change owner role", "Use transferOwnership instead.");

    await memberRef.update({ role: input.role, updatedAt: FieldValue.serverTimestamp() });

    return { success: true };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── removeMember ────────────────────────────────────────────────────────────
export const removeMember = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "admin");
    const input = validate(RemoveMemberSchema, request.data);

    const memberRef = db.collection(Collections.ORGANIZATION_MEMBERS).doc(input.member_id);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) throw new NotFoundError("Member not found");

    const memberData = memberSnap.data() as OrganizationMemberDoc;
    if (memberData.organizationId !== ctx.organizationId) throw new NotFoundError("Member not found");
    if (memberData.role === "owner") throw new PermissionError("Cannot remove owner");
    if (memberData.userId === ctx.userId) throw new ValidationError("Cannot remove yourself");

    await memberRef.delete();

    return { success: true };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── transferOwnership ───────────────────────────────────────────────────────
export const transferOwnership = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "owner");
    const input = validate(TransferOwnershipSchema, request.data);

    // Find the new owner's membership
    const newOwnerSnap = await db.collection(Collections.ORGANIZATION_MEMBERS)
      .where("organizationId", "==", ctx.organizationId)
      .where("userId", "==", input.new_owner_id)
      .limit(1)
      .get();

    if (newOwnerSnap.empty) throw new NotFoundError("User is not a member of this organization");

    // Find current owner's membership
    const currentOwnerSnap = await db.collection(Collections.ORGANIZATION_MEMBERS)
      .where("organizationId", "==", ctx.organizationId)
      .where("userId", "==", ctx.userId)
      .limit(1)
      .get();

    if (currentOwnerSnap.empty) throw new NotFoundError("Current owner membership not found");

    // Swap roles
    const batch = db.batch();
    batch.update(newOwnerSnap.docs[0].ref, { role: "owner", updatedAt: FieldValue.serverTimestamp() });
    batch.update(currentOwnerSnap.docs[0].ref, { role: "admin", updatedAt: FieldValue.serverTimestamp() });

    // Update organization owner
    const orgRef = db.collection(Collections.ORGANIZATIONS).doc(ctx.organizationId);
    batch.update(orgRef, { ownerUid: input.new_owner_id, updatedAt: FieldValue.serverTimestamp() });

    await batch.commit();

    return { success: true };
  } catch (err) {
    throw wrapError(err);
  }
});
