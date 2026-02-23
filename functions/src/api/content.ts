/**
 * Content API — 7 onCall functions: getUploadURL, createContent, getContent, listContent, updateContent, triggerGeneration, reanalyzeContent.
 */

import { onCall } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db, storage } from "../config/firebase.js";
import { ANTHROPIC_API_KEY } from "../config/env.js";
import { verifyAuth } from "../middleware/auth.js";
import { assertRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { ContentUploadRequestSchema, ContentUpdateRequestSchema, GenerateRequestSchema } from "../shared/schemas.js";
import { wrapError, NotFoundError } from "../shared/errors.js";
import { docToResponse } from "../shared/transform.js";
import { enqueueTask, getTaskHandlerUrl } from "../lib/taskClient.js";

// ─── getUploadURL ────────────────────────────────────────────────────────────
export const getUploadURL = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");

    const fileName = `content/${ctx.workspaceId}/${uuidv4()}`;
    const bucket = storage.bucket();
    const file = bucket.file(fileName);

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: "application/octet-stream",
    });

    return { upload_url: url, storage_path: fileName };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── createContent ───────────────────────────────────────────────────────────
export const createContent = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const input = validate(ContentUploadRequestSchema, request.data);

    const docRef = db.collection(Collections.CONTENT_UPLOADS).doc();
    const docData = {
      workspaceId: ctx.workspaceId,
      title: input.title,
      contentType: input.content_type,
      rawContent: input.raw_content || "",
      storagePath: input.storage_path || null,
      sourceUrl: input.source_url || null,
      contentDna: null,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(docData);

    // Enqueue content analysis task if content is available
    if (input.raw_content) {
      try {
        await docRef.update({ status: "analyzing" });
        await enqueueTask({
          queue: "content-analysis",
          url: getTaskHandlerUrl("taskContentAnalysis"),
          payload: {
            contentId: docRef.id,
            workspaceId: ctx.workspaceId,
          },
        });
      } catch (taskErr) {
        console.error("Failed to enqueue content analysis:", taskErr);
        // Don't fail the create — the task can be retried manually
      }
    }

    const snap = await docRef.get();
    return docToResponse(docRef.id, snap.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getContent ──────────────────────────────────────────────────────────────
export const getContent = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const contentId = request.data?.content_id as string;
    if (!contentId) throw new NotFoundError("content_id required");

    const snap = await db.collection(Collections.CONTENT_UPLOADS).doc(contentId).get();
    if (!snap.exists) throw new NotFoundError("Content not found");

    const data = snap.data() as Record<string, unknown>;
    if (data.workspaceId !== ctx.workspaceId) throw new NotFoundError("Content not found");

    return docToResponse(snap.id, data);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── listContent ─────────────────────────────────────────────────────────────
export const listContent = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const limit = Math.min(request.data?.limit ?? 20, 100);
    const offset = request.data?.offset ?? 0;

    let query = db
      .collection(Collections.CONTENT_UPLOADS)
      .where("workspaceId", "==", ctx.workspaceId)
      .orderBy("createdAt", "desc");

    // For pagination, use offset approach (simpler, suitable for moderate data)
    if (offset > 0) {
      query = query.offset(offset);
    }
    query = query.limit(limit);

    const snap = await query.get();
    const items = snap.docs.map((doc) => docToResponse(doc.id, doc.data() as Record<string, unknown>));

    // Get total count (separate query)
    const countSnap = await db
      .collection(Collections.CONTENT_UPLOADS)
      .where("workspaceId", "==", ctx.workspaceId)
      .count()
      .get();

    return {
      items,
      total: countSnap.data().count,
    };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── updateContent ───────────────────────────────────────────────────────────
export const updateContent = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const contentId = request.data?.content_id as string;
    if (!contentId) throw new NotFoundError("content_id required");
    const input = validate(ContentUpdateRequestSchema, request.data);

    const docRef = db.collection(Collections.CONTENT_UPLOADS).doc(contentId);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Content not found");
    if ((snap.data() as Record<string, unknown>).workspaceId !== ctx.workspaceId) {
      throw new NotFoundError("Content not found");
    }

    // Store user adjustments in the DNA
    const currentDna = (snap.data() as Record<string, unknown>).contentDna as Record<string, unknown> | null;
    const updatedDna = {
      ...(currentDna || {}),
      userAdjustments: {
        emphasisNotes: input.emphasis_notes ?? null,
        focusHookIndex: input.focus_hook_index ?? null,
        additionalContext: input.additional_context ?? null,
      },
    };

    await docRef.update({
      contentDna: updatedDna,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const updated = await docRef.get();
    return docToResponse(docRef.id, updated.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── triggerGeneration ───────────────────────────────────────────────────────
export const triggerGeneration = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const contentId = request.data?.content_id as string;
    if (!contentId) throw new NotFoundError("content_id required");
    const input = validate(GenerateRequestSchema, request.data);

    const docRef = db.collection(Collections.CONTENT_UPLOADS).doc(contentId);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Content not found");

    const data = snap.data() as Record<string, unknown>;
    if (data.workspaceId !== ctx.workspaceId) throw new NotFoundError("Content not found");

    // Update status to generating
    await docRef.update({ status: "generating", updatedAt: FieldValue.serverTimestamp() });

    // Enqueue output generation task
    await enqueueTask({
      queue: "output-generation",
      url: getTaskHandlerUrl("taskOutputGeneration"),
      payload: {
        contentId: docRef.id,
        workspaceId: ctx.workspaceId,
        voiceProfileId: input.voice_profile_id || null,
        selectedPlatforms: input.selected_platforms || null,
        emphasisNotes: input.emphasis_notes || null,
      },
    });

    return { success: true, message: "Generation started. Outputs will appear shortly." };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── reanalyzeContent ───────────────────────────────────────────────────────
export const reanalyzeContent = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const contentId = request.data?.content_id as string;
    if (!contentId) throw new NotFoundError("content_id required");

    const docRef = db.collection(Collections.CONTENT_UPLOADS).doc(contentId);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Content not found");

    const data = snap.data() as Record<string, unknown>;
    if (data.workspaceId !== ctx.workspaceId) throw new NotFoundError("Content not found");

    await docRef.update({ status: "analyzing", updatedAt: FieldValue.serverTimestamp() });

    await enqueueTask({
      queue: "content-analysis",
      url: getTaskHandlerUrl("taskContentAnalysis"),
      payload: {
        contentId: docRef.id,
        workspaceId: ctx.workspaceId,
      },
    });

    return { success: true, message: "Content re-analysis started." };
  } catch (err) {
    throw wrapError(err);
  }
});
