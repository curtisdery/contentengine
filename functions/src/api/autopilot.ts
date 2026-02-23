/**
 * Autopilot API — 4 onCall functions: getEligibility, toggleAutopilot, getAutopilotSummary, panicStop.
 */

import { onCall } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { verifyAuth } from "../middleware/auth.js";
import { assertRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { AutopilotEligibilitySchema, AutopilotToggleSchema } from "../shared/schemas.js";
import { wrapError, ValidationError } from "../shared/errors.js";
import { docToResponse } from "../shared/transform.js";

const REQUIRED_APPROVAL_RATE = 0.85;
const REQUIRED_MINIMUM_REVIEWS = 10;

// ─── getEligibility ──────────────────────────────────────────────────────────
export const getEligibility = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(AutopilotEligibilitySchema, request.data);

    const configSnap = await db.collection(Collections.AUTOPILOT_CONFIGS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("platformId", "==", input.platform_id)
      .limit(1)
      .get();

    let totalReviewed = 0;
    let approvedWithoutEdit = 0;

    if (!configSnap.empty) {
      const data = configSnap.docs[0].data();
      totalReviewed = (data.totalOutputsReviewed as number) || 0;
      approvedWithoutEdit = (data.approvedWithoutEdit as number) || 0;
    }

    const approvalRate = totalReviewed > 0 ? approvedWithoutEdit / totalReviewed : 0;
    const eligible = approvalRate >= REQUIRED_APPROVAL_RATE && totalReviewed >= REQUIRED_MINIMUM_REVIEWS;

    let message: string;
    if (eligible) {
      message = `Autopilot eligible! ${Math.round(approvalRate * 100)}% approval rate across ${totalReviewed} reviews.`;
    } else if (totalReviewed < REQUIRED_MINIMUM_REVIEWS) {
      message = `Need ${REQUIRED_MINIMUM_REVIEWS - totalReviewed} more reviews to qualify. Current: ${totalReviewed}/${REQUIRED_MINIMUM_REVIEWS}.`;
    } else {
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
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── toggleAutopilot ─────────────────────────────────────────────────────────
export const toggleAutopilot = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "admin");
    const input = validate(AutopilotToggleSchema, request.data);

    const configSnap = await db.collection(Collections.AUTOPILOT_CONFIGS)
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
        totalReviewed = (data.totalOutputsReviewed as number) || 0;
        approvedWithoutEdit = (data.approvedWithoutEdit as number) || 0;
      }

      const approvalRate = totalReviewed > 0 ? approvedWithoutEdit / totalReviewed : 0;
      if (approvalRate < REQUIRED_APPROVAL_RATE || totalReviewed < REQUIRED_MINIMUM_REVIEWS) {
        throw new ValidationError("Not eligible", "Autopilot requires sufficient review history.");
      }
    }

    if (configSnap.empty) {
      await db.collection(Collections.AUTOPILOT_CONFIGS).add({
        workspaceId: ctx.workspaceId,
        platformId: input.platform_id,
        enabled: input.enabled,
        totalOutputsReviewed: 0,
        approvedWithoutEdit: 0,
        approvalRate: 0,
        requiredApprovalRate: REQUIRED_APPROVAL_RATE,
        requiredMinimumReviews: REQUIRED_MINIMUM_REVIEWS,
        enabledAt: input.enabled ? Timestamp.now() : null,
        autoPublishCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await configSnap.docs[0].ref.update({
        enabled: input.enabled,
        enabledAt: input.enabled ? Timestamp.now() : null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return { success: true, enabled: input.enabled };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getAutopilotSummary ────────────────────────────────────────────────────
export const getAutopilotSummary = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    const configSnap = await db.collection(Collections.AUTOPILOT_CONFIGS)
      .where("workspaceId", "==", ctx.workspaceId)
      .get();

    const platforms = configSnap.docs.map((doc) => {
      const data = doc.data();
      const totalReviewed = (data.totalOutputsReviewed as number) || 0;
      const approvedWithoutEdit = (data.approvedWithoutEdit as number) || 0;
      const approvalRate = totalReviewed > 0 ? approvedWithoutEdit / totalReviewed : 0;

      return {
        ...docToResponse(doc.id, data),
        platform_id: data.platformId as string,
        enabled: data.enabled as boolean,
        approval_rate: Math.round(approvalRate * 100) / 100,
        reviews_completed: totalReviewed,
        auto_publish_count: (data.autoPublishCount as number) || 0,
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
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── panicStop ──────────────────────────────────────────────────────────────
export const panicStop = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "admin");

    // Disable all autopilot configs for this workspace
    const configSnap = await db.collection(Collections.AUTOPILOT_CONFIGS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("enabled", "==", true)
      .get();

    const batch = db.batch();
    for (const doc of configSnap.docs) {
      batch.update(doc.ref, { enabled: false, enabledAt: null, updatedAt: FieldValue.serverTimestamp() });
    }

    // Cancel all scheduled events
    const scheduledSnap = await db.collection(Collections.SCHEDULED_EVENTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("status", "==", "scheduled")
      .get();

    for (const doc of scheduledSnap.docs) {
      batch.update(doc.ref, { status: "cancelled", updatedAt: FieldValue.serverTimestamp() });
    }

    await batch.commit();

    return {
      success: true,
      autopilots_disabled: configSnap.size,
      events_cancelled: scheduledSnap.size,
    };
  } catch (err) {
    throw wrapError(err);
  }
});
