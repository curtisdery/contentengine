/**
 * Outputs API — 7 onCall functions: listOutputs, getOutput, editOutput, approveOutput, rejectOutput, regenerateOutput, bulkApproveOutputs.
 */

import { onCall } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { ANTHROPIC_API_KEY } from "../config/env.js";
import { verifyAuth } from "../middleware/auth.js";
import { assertRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { OutputUpdateSchema, BulkApproveSchema } from "../shared/schemas.js";
import { wrapError, NotFoundError } from "../shared/errors.js";
import { docToResponse } from "../shared/transform.js";
import { enqueueTask, getTaskHandlerUrl } from "../lib/taskClient.js";

// ─── listOutputs ─────────────────────────────────────────────────────────────
export const listOutputs = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const contentId = request.data?.content_id as string;
    if (!contentId) throw new NotFoundError("content_id required");

    // Verify content belongs to workspace
    const contentSnap = await db.collection(Collections.CONTENT_UPLOADS).doc(contentId).get();
    if (!contentSnap.exists) throw new NotFoundError("Content not found");
    if ((contentSnap.data() as Record<string, unknown>).workspaceId !== ctx.workspaceId) {
      throw new NotFoundError("Content not found");
    }

    const snap = await db
      .collection(Collections.GENERATED_OUTPUTS)
      .where("contentUploadId", "==", contentId)
      .orderBy("createdAt", "desc")
      .get();

    const items = snap.docs.map((doc) => docToResponse(doc.id, doc.data() as Record<string, unknown>));

    return {
      items,
      total: items.length,
      content_title: (contentSnap.data() as Record<string, unknown>).title || "",
      content_id: contentId,
    };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getOutput ───────────────────────────────────────────────────────────────
export const getOutput = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const outputId = request.data?.output_id as string;
    if (!outputId) throw new NotFoundError("output_id required");

    const snap = await db.collection(Collections.GENERATED_OUTPUTS).doc(outputId).get();
    if (!snap.exists) throw new NotFoundError("Output not found");
    const outputData = snap.data() as Record<string, unknown>;
    if (outputData.workspaceId !== ctx.workspaceId) {
      throw new NotFoundError("Output not found");
    }

    const response = docToResponse(snap.id, outputData);

    // Add predicted performance score for draft/approved outputs
    if (outputData.status === "draft" || outputData.status === "approved") {
      try {
        const { predictContentScore } = await import("../lib/analytics/contentScoring.js");
        const contentSnap = await db.collection(Collections.CONTENT_UPLOADS).doc(outputData.contentUploadId as string).get();
        const contentDna = contentSnap.exists
          ? (contentSnap.data() as Record<string, unknown>).contentDna ?? {}
          : {};

        const platformFitScore = (outputData.outputMetadata as Record<string, unknown> | null)?.platform_fit_score as number | undefined;
        const prediction = await predictContentScore(
          ctx.workspaceId,
          outputData.platformId as string,
          contentDna as unknown as import("../shared/types.js").ContentDNA,
          (outputData.voiceMatchScore as number) || null,
          platformFitScore ?? null,
          (outputData.content as string) || ""
        );
        (response as Record<string, unknown>).predicted_score = prediction;
      } catch {
        // Non-fatal
      }
    }

    return response;
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── editOutput ──────────────────────────────────────────────────────────────
export const editOutput = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const outputId = request.data?.output_id as string;
    if (!outputId) throw new NotFoundError("output_id required");
    const input = validate(OutputUpdateSchema, request.data);

    const docRef = db.collection(Collections.GENERATED_OUTPUTS).doc(outputId);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Output not found");
    if ((snap.data() as Record<string, unknown>).workspaceId !== ctx.workspaceId) {
      throw new NotFoundError("Output not found");
    }

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (input.content !== undefined) updates.content = input.content;
    if (input.status !== undefined) updates.status = input.status;

    await docRef.update(updates);
    const updated = await docRef.get();
    return docToResponse(docRef.id, updated.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── approveOutput ───────────────────────────────────────────────────────────
export const approveOutput = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const outputId = request.data?.output_id as string;
    if (!outputId) throw new NotFoundError("output_id required");

    const docRef = db.collection(Collections.GENERATED_OUTPUTS).doc(outputId);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Output not found");
    if ((snap.data() as Record<string, unknown>).workspaceId !== ctx.workspaceId) {
      throw new NotFoundError("Output not found");
    }

    await docRef.update({ status: "approved", updatedAt: FieldValue.serverTimestamp() });

    // Update autopilot tracking
    const data = snap.data() as Record<string, unknown>;
    const platformId = data.platformId as string;
    try {
      const configSnap = await db
        .collection(Collections.AUTOPILOT_CONFIGS)
        .where("workspaceId", "==", ctx.workspaceId)
        .where("platformId", "==", platformId)
        .limit(1)
        .get();

      if (!configSnap.empty) {
        await configSnap.docs[0].ref.update({
          totalOutputsReviewed: FieldValue.increment(1),
          approvedWithoutEdit: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } catch {
      // non-fatal
    }

    const updated = await docRef.get();
    return docToResponse(docRef.id, updated.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── rejectOutput ────────────────────────────────────────────────────────────
export const rejectOutput = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const outputId = request.data?.output_id as string;
    if (!outputId) throw new NotFoundError("output_id required");

    const docRef = db.collection(Collections.GENERATED_OUTPUTS).doc(outputId);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Output not found");
    if ((snap.data() as Record<string, unknown>).workspaceId !== ctx.workspaceId) {
      throw new NotFoundError("Output not found");
    }

    await docRef.update({ status: "rejected", updatedAt: FieldValue.serverTimestamp() });

    // Update autopilot tracking (reviewed but not approved)
    const data = snap.data() as Record<string, unknown>;
    try {
      const configSnap = await db
        .collection(Collections.AUTOPILOT_CONFIGS)
        .where("workspaceId", "==", ctx.workspaceId)
        .where("platformId", "==", data.platformId)
        .limit(1)
        .get();

      if (!configSnap.empty) {
        await configSnap.docs[0].ref.update({
          totalOutputsReviewed: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } catch {
      // non-fatal
    }

    const updated = await docRef.get();
    return docToResponse(docRef.id, updated.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── regenerateOutput ────────────────────────────────────────────────────────
export const regenerateOutput = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const outputId = request.data?.output_id as string;
    if (!outputId) throw new NotFoundError("output_id required");

    const docRef = db.collection(Collections.GENERATED_OUTPUTS).doc(outputId);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Output not found");

    const data = snap.data() as Record<string, unknown>;
    if (data.workspaceId !== ctx.workspaceId) throw new NotFoundError("Output not found");

    // Enqueue regeneration for just this platform
    await enqueueTask({
      queue: "output-generation",
      url: getTaskHandlerUrl("taskOutputGeneration"),
      payload: {
        contentId: data.contentUploadId,
        workspaceId: ctx.workspaceId,
        voiceProfileId: null,
        selectedPlatforms: [data.platformId],
        emphasisNotes: null,
      },
    });

    // Mark current output as rejected (will be replaced)
    await docRef.update({ status: "rejected", updatedAt: FieldValue.serverTimestamp() });

    return { success: true, message: "Regeneration started." };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── bulkApproveOutputs ─────────────────────────────────────────────────────
export const bulkApproveOutputs = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const input = validate(BulkApproveSchema, request.data);

    let approvedCount = 0;

    for (const outputId of input.output_ids) {
      try {
        const docRef = db.collection(Collections.GENERATED_OUTPUTS).doc(outputId);
        const snap = await docRef.get();
        if (!snap.exists) continue;

        const data = snap.data() as Record<string, unknown>;
        if (data.workspaceId !== ctx.workspaceId) continue;
        if (data.status === "approved") continue;

        await docRef.update({ status: "approved", updatedAt: FieldValue.serverTimestamp() });
        approvedCount++;

        // Update autopilot tracking
        try {
          const configSnap = await db
            .collection(Collections.AUTOPILOT_CONFIGS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("platformId", "==", data.platformId)
            .limit(1)
            .get();

          if (!configSnap.empty) {
            await configSnap.docs[0].ref.update({
              totalOutputsReviewed: FieldValue.increment(1),
              approvedWithoutEdit: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        } catch {
          // non-fatal
        }
      } catch (err) {
        console.warn("Bulk approve item error:", err);
      }
    }

    return { approved_count: approvedCount };
  } catch (err) {
    throw wrapError(err);
  }
});
