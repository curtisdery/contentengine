/**
 * GDPR API — 2 onCall functions: exportData, deleteAccount.
 */

import { onCall } from "firebase-functions/v2/https";
import { db, auth } from "../config/firebase.js";
import { verifyAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { DeleteAccountSchema } from "../shared/schemas.js";
import { wrapError } from "../shared/errors.js";
import { docToResponse } from "../shared/transform.js";

// ─── exportData ──────────────────────────────────────────────────────────────
export const exportData = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    // Collect all user data across collections
    const userSnap = await db.collection(Collections.USERS).doc(ctx.userId).get();
    const userData = userSnap.exists ? docToResponse(ctx.userId, userSnap.data() as Record<string, unknown>) : null;

    const contentSnap = await db.collection(Collections.CONTENT_UPLOADS)
      .where("workspaceId", "==", ctx.workspaceId).get();
    const content = contentSnap.docs.map((d) => docToResponse(d.id, d.data() as Record<string, unknown>));

    const outputsSnap = await db.collection(Collections.GENERATED_OUTPUTS)
      .where("workspaceId", "==", ctx.workspaceId).get();
    const outputs = outputsSnap.docs.map((d) => docToResponse(d.id, d.data() as Record<string, unknown>));

    const voiceSnap = await db.collection(Collections.BRAND_VOICE_PROFILES)
      .where("workspaceId", "==", ctx.workspaceId).get();
    const voiceProfiles = voiceSnap.docs.map((d) => docToResponse(d.id, d.data() as Record<string, unknown>));

    const eventsSnap = await db.collection(Collections.SCHEDULED_EVENTS)
      .where("workspaceId", "==", ctx.workspaceId).get();
    const events = eventsSnap.docs.map((d) => docToResponse(d.id, d.data() as Record<string, unknown>));

    return {
      user: userData,
      content_uploads: content,
      generated_outputs: outputs,
      voice_profiles: voiceProfiles,
      scheduled_events: events,
      exported_at: new Date().toISOString(),
    };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── deleteAccount ───────────────────────────────────────────────────────────
export const deleteAccount = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    validate(DeleteAccountSchema, request.data);

    // Cascade delete all workspace data
    const collectionsToDelete = [
      { name: Collections.CONTENT_UPLOADS, field: "workspaceId" },
      { name: Collections.GENERATED_OUTPUTS, field: "workspaceId" },
      { name: Collections.BRAND_VOICE_PROFILES, field: "workspaceId" },
      { name: Collections.PLATFORM_CONNECTIONS, field: "workspaceId" },
      { name: Collections.SCHEDULED_EVENTS, field: "workspaceId" },
      { name: Collections.ANALYTICS_SNAPSHOTS, field: "workspaceId" },
      { name: Collections.MULTIPLIER_SCORES, field: "workspaceId" },
      { name: Collections.AUTOPILOT_CONFIGS, field: "workspaceId" },
      { name: Collections.AUDIT_LOGS, field: "workspaceId" },
      { name: Collections.NOTIFICATIONS, field: "workspaceId" },
    ];

    for (const collection of collectionsToDelete) {
      const snap = await db.collection(collection.name)
        .where(collection.field, "==", ctx.workspaceId)
        .get();

      const batch = db.batch();
      let count = 0;
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
        count++;
        if (count >= 500) {
          await batch.commit();
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    }

    // Delete organization members
    const membersSnap = await db.collection(Collections.ORGANIZATION_MEMBERS)
      .where("organizationId", "==", ctx.organizationId).get();
    const memberBatch = db.batch();
    membersSnap.docs.forEach((doc) => memberBatch.delete(doc.ref));
    await memberBatch.commit();

    // Delete subscription
    const subSnap = await db.collection(Collections.SUBSCRIPTIONS)
      .where("organizationId", "==", ctx.organizationId).get();
    const subBatch = db.batch();
    subSnap.docs.forEach((doc) => subBatch.delete(doc.ref));
    await subBatch.commit();

    // Delete workspace
    await db.collection(Collections.WORKSPACES).doc(ctx.workspaceId).delete();

    // Delete organization
    if (ctx.organizationId) {
      await db.collection(Collections.ORGANIZATIONS).doc(ctx.organizationId).delete();
    }

    // Delete user document
    await db.collection(Collections.USERS).doc(ctx.userId).delete();

    // Delete Firebase Auth account
    await auth.deleteUser(ctx.uid);

    return { success: true, message: "Account and all data permanently deleted." };
  } catch (err) {
    throw wrapError(err);
  }
});
