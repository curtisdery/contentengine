/**
 * Calendar API — 8 onCall functions: scheduleOutput, scheduleBatch, autoSchedule, getCalendarEvents, rescheduleOutput, cancelEvent, publishNow, getCalendarStats.
 */

import { onCall } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { verifyAuth } from "../middleware/auth.js";
import { assertRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { ScheduleOutputSchema, ScheduleBatchSchema, AutoScheduleSchema, CalendarQuerySchema, RescheduleSchema } from "../shared/schemas.js";
import { wrapError, NotFoundError, ValidationError } from "../shared/errors.js";
import { docToResponse } from "../shared/transform.js";
import { createDistributionArc } from "../lib/distributionArc.js";
import type { EngagementSlot } from "../lib/distributionArc.js";
import { enqueueTask, getTaskHandlerUrl } from "../lib/taskClient.js";

// ─── scheduleOutput ──────────────────────────────────────────────────────────
export const scheduleOutput = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const input = validate(ScheduleOutputSchema, request.data);

    // Verify output exists and belongs to workspace
    const outputSnap = await db.collection(Collections.GENERATED_OUTPUTS).doc(input.output_id).get();
    if (!outputSnap.exists) throw new NotFoundError("Output not found");
    const outputData = outputSnap.data() as Record<string, unknown>;
    if (outputData.workspaceId !== ctx.workspaceId) throw new NotFoundError("Output not found");

    // Check not already scheduled
    const existing = await db
      .collection(Collections.SCHEDULED_EVENTS)
      .where("generatedOutputId", "==", input.output_id)
      .where("status", "in", ["scheduled", "publishing"])
      .limit(1)
      .get();

    if (!existing.empty) {
      throw new ValidationError("Output already scheduled", "Cancel or reschedule the existing event first.");
    }

    const scheduledAt = Timestamp.fromDate(new Date(input.scheduled_at));

    const eventRef = db.collection(Collections.SCHEDULED_EVENTS).doc();
    await eventRef.set({
      workspaceId: ctx.workspaceId,
      generatedOutputId: input.output_id,
      platformId: outputData.platformId,
      scheduledAt,
      publishedAt: null,
      status: "scheduled",
      publishError: null,
      retryCount: 0,
      maxRetries: 3,
      priority: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update output status
    await outputSnap.ref.update({ status: "scheduled", scheduledAt, updatedAt: FieldValue.serverTimestamp() });

    const snap = await eventRef.get();
    return docToResponse(eventRef.id, snap.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── scheduleBatch ───────────────────────────────────────────────────────────
export const scheduleBatch = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const input = validate(ScheduleBatchSchema, request.data);

    const results: Array<Record<string, unknown>> = [];

    for (const item of input.items) {
      try {
        const outputSnap = await db.collection(Collections.GENERATED_OUTPUTS).doc(item.output_id).get();
        if (!outputSnap.exists) continue;
        const outputData = outputSnap.data() as Record<string, unknown>;
        if (outputData.workspaceId !== ctx.workspaceId) continue;

        const existing = await db
          .collection(Collections.SCHEDULED_EVENTS)
          .where("generatedOutputId", "==", item.output_id)
          .where("status", "in", ["scheduled", "publishing"])
          .limit(1)
          .get();
        if (!existing.empty) continue;

        const scheduledAt = Timestamp.fromDate(new Date(item.scheduled_at));
        const eventRef = db.collection(Collections.SCHEDULED_EVENTS).doc();
        await eventRef.set({
          workspaceId: ctx.workspaceId,
          generatedOutputId: item.output_id,
          platformId: outputData.platformId,
          scheduledAt,
          publishedAt: null,
          status: "scheduled",
          publishError: null,
          retryCount: 0,
          maxRetries: 3,
          priority: 5,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        await outputSnap.ref.update({ status: "scheduled", scheduledAt, updatedAt: FieldValue.serverTimestamp() });

        const snap = await eventRef.get();
        results.push(docToResponse(eventRef.id, snap.data() as Record<string, unknown>));
      } catch (err) {
        console.warn("Batch schedule item error:", err);
      }
    }

    return { events: results, total: results.length };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── autoSchedule ────────────────────────────────────────────────────────────
export const autoSchedule = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const input = validate(AutoScheduleSchema, request.data);

    // Get all approved/draft outputs for this content
    const outputsSnap = await db
      .collection(Collections.GENERATED_OUTPUTS)
      .where("contentUploadId", "==", input.content_id)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("status", "in", ["draft", "approved"])
      .get();

    if (outputsSnap.empty) {
      return { events: [], total: 0, message: "No outputs available to schedule." };
    }

    const outputs = outputsSnap.docs.map((doc) => ({
      id: doc.id,
      platformId: (doc.data() as Record<string, unknown>).platformId as string,
    }));

    // Load real engagement data for smarter scheduling
    let engagementSlots: EngagementSlot[] | undefined;
    try {
      const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const snapshotsSnap = await db.collection(Collections.ANALYTICS_SNAPSHOTS)
        .where("workspaceId", "==", ctx.workspaceId)
        .where("snapshotTime", ">=", thirtyDaysAgo)
        .get();

      if (snapshotsSnap.size >= 10) {
        const slotMap: Record<string, { engagements: number; impressions: number; count: number }> = {};
        for (const doc of snapshotsSnap.docs) {
          const d = doc.data();
          const time = (d.snapshotTime as Timestamp).toDate();
          const key = `${time.getUTCDay()}-${time.getUTCHours()}`;
          if (!slotMap[key]) slotMap[key] = { engagements: 0, impressions: 0, count: 0 };
          slotMap[key].engagements += (d.engagements as number) || 0;
          slotMap[key].impressions += (d.impressions as number) || 0;
          slotMap[key].count += 1;
        }

        engagementSlots = Object.entries(slotMap).map(([key, data]) => {
          const [dayStr, hourStr] = key.split("-");
          return {
            dayOfWeek: Number(dayStr),
            hour: Number(hourStr),
            engagementRate: data.impressions > 0 ? data.engagements / data.impressions : 0,
            postCount: data.count,
          };
        });
      }
    } catch {
      // Non-fatal — fall back to default arc times
    }

    // Create distribution arc (uses real engagement data if available)
    const startDate = new Date(input.start_date);
    const arcItems = createDistributionArc(outputs, startDate, engagementSlots);

    // Schedule each item
    const results: Array<Record<string, unknown>> = [];
    for (const item of arcItems) {
      const scheduledAt = Timestamp.fromDate(item.suggestedDatetime);
      const eventRef = db.collection(Collections.SCHEDULED_EVENTS).doc();

      await eventRef.set({
        workspaceId: ctx.workspaceId,
        generatedOutputId: item.outputId,
        platformId: item.platformId,
        scheduledAt,
        publishedAt: null,
        status: "scheduled",
        publishError: null,
        retryCount: 0,
        maxRetries: 3,
        priority: 5,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      await db.collection(Collections.GENERATED_OUTPUTS).doc(item.outputId).update({
        status: "scheduled",
        scheduledAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const snap = await eventRef.get();
      results.push(docToResponse(eventRef.id, snap.data() as Record<string, unknown>));
    }

    return { events: results, total: results.length };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getCalendarEvents ───────────────────────────────────────────────────────
export const getCalendarEvents = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    const input = validate(CalendarQuerySchema, request.data);

    const startTs = Timestamp.fromDate(new Date(input.start));
    const endTs = Timestamp.fromDate(new Date(input.end));

    let query = db
      .collection(Collections.SCHEDULED_EVENTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("scheduledAt", ">=", startTs)
      .where("scheduledAt", "<=", endTs)
      .orderBy("scheduledAt", "asc");

    const snap = await query.get();
    let events = snap.docs;

    // Filter by platform if specified
    if (input.platform_id) {
      events = events.filter((doc) => (doc.data() as Record<string, unknown>).platformId === input.platform_id);
    }

    // Enrich with output content and title
    const enrichedEvents = await Promise.all(
      events.map(async (doc) => {
        const eventData = doc.data() as Record<string, unknown>;
        let outputContent: string | null = null;
        let outputFormatName: string | null = null;
        let contentTitle: string | null = null;

        try {
          const outputSnap = await db.collection(Collections.GENERATED_OUTPUTS).doc(eventData.generatedOutputId as string).get();
          if (outputSnap.exists) {
            const outputData = outputSnap.data() as Record<string, unknown>;
            outputContent = (outputData.content as string) || null;
            outputFormatName = (outputData.formatName as string) || null;

            const contentSnap = await db.collection(Collections.CONTENT_UPLOADS).doc(outputData.contentUploadId as string).get();
            if (contentSnap.exists) {
              contentTitle = ((contentSnap.data() as Record<string, unknown>).title as string) || null;
            }
          }
        } catch {
          // non-fatal
        }

        return {
          ...docToResponse(doc.id, eventData),
          output_content: outputContent,
          output_format_name: outputFormatName,
          content_title: contentTitle,
        };
      })
    );

    return { events: enrichedEvents, total: enrichedEvents.length };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── rescheduleOutput ────────────────────────────────────────────────────────
export const rescheduleOutput = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const eventId = request.data?.event_id as string;
    if (!eventId) throw new NotFoundError("event_id required");
    const input = validate(RescheduleSchema, request.data);

    const docRef = db.collection(Collections.SCHEDULED_EVENTS).doc(eventId);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Scheduled event not found");

    const data = snap.data() as Record<string, unknown>;
    if (data.workspaceId !== ctx.workspaceId) throw new NotFoundError("Scheduled event not found");
    if (!["scheduled", "failed"].includes(data.status as string)) {
      throw new ValidationError("Cannot reschedule", `Event is in '${data.status}' status.`);
    }

    const newScheduledAt = Timestamp.fromDate(new Date(input.scheduled_at));

    await docRef.update({
      scheduledAt: newScheduledAt,
      status: "scheduled",
      publishError: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update output too
    const outputRef = db.collection(Collections.GENERATED_OUTPUTS).doc(data.generatedOutputId as string);
    await outputRef.update({ scheduledAt: newScheduledAt, updatedAt: FieldValue.serverTimestamp() });

    const updated = await docRef.get();
    return docToResponse(docRef.id, updated.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── cancelEvent ────────────────────────────────────────────────────────────
export const cancelEvent = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const eventId = request.data?.event_id as string;
    if (!eventId) throw new NotFoundError("event_id required");

    const docRef = db.collection(Collections.SCHEDULED_EVENTS).doc(eventId);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Scheduled event not found");

    const data = snap.data() as Record<string, unknown>;
    if (data.workspaceId !== ctx.workspaceId) throw new NotFoundError("Scheduled event not found");
    if (!["scheduled", "failed"].includes(data.status as string)) {
      throw new ValidationError("Cannot cancel", `Event is in '${data.status}' status.`);
    }

    await docRef.update({ status: "cancelled", updatedAt: FieldValue.serverTimestamp() });

    // Revert the output status back to approved
    const outputRef = db.collection(Collections.GENERATED_OUTPUTS).doc(data.generatedOutputId as string);
    await outputRef.update({ status: "approved", scheduledAt: null, updatedAt: FieldValue.serverTimestamp() });

    return { success: true };
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── publishNow ─────────────────────────────────────────────────────────────
export const publishNow = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);
    assertRole(ctx, "editor");
    const eventId = request.data?.event_id as string;
    if (!eventId) throw new NotFoundError("event_id required");

    const docRef = db.collection(Collections.SCHEDULED_EVENTS).doc(eventId);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundError("Scheduled event not found");

    const data = snap.data() as Record<string, unknown>;
    if (data.workspaceId !== ctx.workspaceId) throw new NotFoundError("Scheduled event not found");
    if (!["scheduled", "failed"].includes(data.status as string)) {
      throw new ValidationError("Cannot publish now", `Event is in '${data.status}' status.`);
    }

    // Mark as publishing
    await docRef.update({ status: "publishing", updatedAt: FieldValue.serverTimestamp() });

    // Enqueue the publishing task for immediate execution
    await enqueueTask({
      queue: "publishing",
      url: getTaskHandlerUrl("taskPublishing"),
      payload: {
        eventId: docRef.id,
        workspaceId: ctx.workspaceId,
        outputId: data.generatedOutputId,
        platformId: data.platformId,
      },
    });

    const updated = await docRef.get();
    return docToResponse(docRef.id, updated.data() as Record<string, unknown>);
  } catch (err) {
    throw wrapError(err);
  }
});

// ─── getCalendarStats ───────────────────────────────────────────────────────
export const getCalendarStats = onCall(async (request) => {
  try {
    const ctx = await verifyAuth(request);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const todayStartTs = Timestamp.fromDate(todayStart);
    const todayEndTs = Timestamp.fromDate(todayEnd);
    const weekEndTs = Timestamp.fromDate(weekEnd);

    // Upcoming today
    const todaySnap = await db.collection(Collections.SCHEDULED_EVENTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("status", "==", "scheduled")
      .where("scheduledAt", ">=", todayStartTs)
      .where("scheduledAt", "<", todayEndTs)
      .count()
      .get();

    // Upcoming this week
    const weekSnap = await db.collection(Collections.SCHEDULED_EVENTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("status", "==", "scheduled")
      .where("scheduledAt", ">=", todayStartTs)
      .where("scheduledAt", "<", weekEndTs)
      .count()
      .get();

    // Total published
    const publishedSnap = await db.collection(Collections.SCHEDULED_EVENTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("status", "==", "published")
      .count()
      .get();

    // Total failed
    const failedSnap = await db.collection(Collections.SCHEDULED_EVENTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("status", "==", "failed")
      .count()
      .get();

    // Content gaps: approved outputs with no scheduled event
    const approvedOutputs = await db.collection(Collections.GENERATED_OUTPUTS)
      .where("workspaceId", "==", ctx.workspaceId)
      .where("status", "==", "approved")
      .count()
      .get();

    return {
      upcoming_today: todaySnap.data().count,
      upcoming_this_week: weekSnap.data().count,
      total_published: publishedSnap.data().count,
      total_failed: failedSnap.data().count,
      content_gaps: approvedOutputs.data().count,
    };
  } catch (err) {
    throw wrapError(err);
  }
});
