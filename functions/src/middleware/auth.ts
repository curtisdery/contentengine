/**
 * Auth middleware — verifies Firebase Auth, looks up or auto-provisions the user.
 * Port of apps/api/app/middleware/auth.py (lines 43-155).
 */

import { CallableRequest } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { Collections } from "../shared/collections.js";
import { AuthenticationError } from "../shared/errors.js";
import type { UserDoc, OrganizationDoc, WorkspaceDoc, SubscriptionDoc, OrganizationMemberDoc } from "../shared/types.js";

export interface AuthContext {
  uid: string; // Firebase Auth UID
  email: string;
  userId: string; // Firestore user document ID
  workspaceId: string;
  organizationId: string;
  role: "owner" | "admin" | "editor" | "viewer";
}

function slugify(text: string): string {
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
export async function verifyAuth(request: CallableRequest): Promise<AuthContext> {
  if (!request.auth) {
    throw new AuthenticationError(
      "Not authenticated",
      "Authorization required. Please sign in."
    );
  }

  const uid = request.auth.uid;
  const email = request.auth.token.email;
  const displayName = request.auth.token.name as string | undefined;
  const avatarUrl = (request.auth.token.picture as string | undefined) ?? null;
  const emailVerified = request.auth.token.email_verified ?? false;

  // 1. Look up user by firebaseUid
  const usersRef = db.collection(Collections.USERS);
  let userSnap = (await usersRef.where("firebaseUid", "==", uid).limit(1).get()).docs[0];

  // 2. If not found, check by email (link existing user)
  if (!userSnap && email) {
    const byEmail = (await usersRef.where("email", "==", email).limit(1).get()).docs[0];
    if (byEmail) {
      await byEmail.ref.update({
        firebaseUid: uid,
        ...(emailVerified ? { emailVerified: true } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      userSnap = byEmail;
    }
  }

  // 3. Auto-provision new user
  if (!userSnap) {
    if (!email) {
      throw new AuthenticationError(
        "Email required",
        "Firebase account must have an email address."
      );
    }

    const fullName = displayName || email.split("@")[0];
    const now = Timestamp.now();

    // Create user doc first to get the ID
    const userRef = usersRef.doc();
    const userId = userRef.id;

    // Create organization
    const orgSlug = slugify(fullName) + "-" + userId.substring(0, 8);
    const orgRef = db.collection(Collections.ORGANIZATIONS).doc();

    // Create workspace
    const wsRef = db.collection(Collections.WORKSPACES).doc();

    // Create subscription
    const subRef = db.collection(Collections.SUBSCRIPTIONS).doc();

    // Create org member
    const memberRef = db.collection(Collections.ORGANIZATION_MEMBERS).doc();

    // Run in a batch for atomicity
    const batch = db.batch();

    const orgData: Omit<OrganizationDoc, "createdAt" | "updatedAt"> & { createdAt: FieldValue; updatedAt: FieldValue } = {
      name: `${fullName}'s Organization`,
      slug: orgSlug,
      ownerUid: userId,
      createdAt: FieldValue.serverTimestamp() as unknown as FieldValue,
      updatedAt: FieldValue.serverTimestamp() as unknown as FieldValue,
    };
    batch.set(orgRef, orgData);

    const wsData: Omit<WorkspaceDoc, "createdAt" | "updatedAt"> & { createdAt: FieldValue; updatedAt: FieldValue } = {
      organizationId: orgRef.id,
      name: "Default Workspace",
      slug: "default",
      createdAt: FieldValue.serverTimestamp() as unknown as FieldValue,
      updatedAt: FieldValue.serverTimestamp() as unknown as FieldValue,
    };
    batch.set(wsRef, wsData);

    const userData: Omit<UserDoc, "createdAt" | "updatedAt"> & { createdAt: FieldValue; updatedAt: FieldValue } = {
      firebaseUid: uid,
      email,
      fullName,
      avatarUrl,
      emailVerified,
      isActive: true,
      defaultWorkspaceId: wsRef.id,
      fcmTokens: [],
      mfaEnabled: false,
      createdAt: FieldValue.serverTimestamp() as unknown as FieldValue,
      updatedAt: FieldValue.serverTimestamp() as unknown as FieldValue,
    };
    batch.set(userRef, userData);

    const memberData: Omit<OrganizationMemberDoc, "createdAt" | "updatedAt"> & { createdAt: FieldValue; updatedAt: FieldValue } = {
      organizationId: orgRef.id,
      userId: userRef.id,
      role: "owner",
      createdAt: FieldValue.serverTimestamp() as unknown as FieldValue,
      updatedAt: FieldValue.serverTimestamp() as unknown as FieldValue,
    };
    batch.set(memberRef, memberData);

    const subData: Omit<SubscriptionDoc, "createdAt" | "updatedAt"> & { createdAt: FieldValue; updatedAt: FieldValue } = {
      organizationId: orgRef.id,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      tier: "starter",
      status: "trialing",
      cancelAtPeriodEnd: false,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      createdAt: FieldValue.serverTimestamp() as unknown as FieldValue,
      updatedAt: FieldValue.serverTimestamp() as unknown as FieldValue,
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
  const userData = userSnap.data() as UserDoc;

  if (!userData.isActive) {
    throw new AuthenticationError(
      "Account disabled",
      "This account has been disabled."
    );
  }

  const userId = userSnap.id;
  const workspaceId = userData.defaultWorkspaceId;

  // Look up the workspace to get organizationId
  const wsSnap = await db.collection(Collections.WORKSPACES).doc(workspaceId).get();
  const wsData = wsSnap.data() as WorkspaceDoc | undefined;
  const organizationId = wsData?.organizationId ?? "";

  // Look up role from organization members
  let role: AuthContext["role"] = "viewer";
  if (organizationId) {
    const memberSnap = await db
      .collection(Collections.ORGANIZATION_MEMBERS)
      .where("organizationId", "==", organizationId)
      .where("userId", "==", userId)
      .limit(1)
      .get();
    if (!memberSnap.empty) {
      role = (memberSnap.docs[0].data() as OrganizationMemberDoc).role;
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
