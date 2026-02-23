"use strict";
/**
 * Calendar API — 8 onCall functions: scheduleOutput, scheduleBatch, autoSchedule, getCalendarEvents, rescheduleOutput, cancelEvent, publishNow, getCalendarStats.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCalendarStats = exports.publishNow = exports.cancelEvent = exports.rescheduleOutput = exports.getCalendarEvents = exports.autoSchedule = exports.scheduleBatch = exports.scheduleOutput = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const auth_js_1 = require("../middleware/auth.js");
const rbac_js_1 = require("../middleware/rbac.js");
const validate_js_1 = require("../middleware/validate.js");
const collections_js_1 = require("../shared/collections.js");
const schemas_js_1 = require("../shared/schemas.js");
const errors_js_1 = require("../shared/errors.js");
const transform_js_1 = require("../shared/transform.js");
const distributionArc_js_1 = require("../lib/distributionArc.js");
const taskClient_js_1 = require("../lib/taskClient.js");
// ─── scheduleOutput ──────────────────────────────────────────────────────────
exports.scheduleOutput = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const input = (0, validate_js_1.validate)(schemas_js_1.ScheduleOutputSchema, request.data);
        // Verify output exists and belongs to workspace
        const outputSnap = await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(input.output_id).get();
        if (!outputSnap.exists)
            throw new errors_js_1.NotFoundError("Output not found");
        const outputData = outputSnap.data();
        if (outputData.workspaceId !== ctx.workspaceId)
            throw new errors_js_1.NotFoundError("Output not found");
        // Check not already scheduled
        const existing = await firebase_js_1.db
            .collection(collections_js_1.Collections.SCHEDULED_EVENTS)
            .where("generatedOutputId", "==", input.output_id)
            .where("status", "in", ["scheduled", "publishing"])
            .limit(1)
            .get();
        if (!existing.empty) {
            throw new errors_js_1.ValidationError("Output already scheduled", "Cancel or reschedule the existing event first.");
        }
        const scheduledAt = firestore_1.Timestamp.fromDate(new Date(input.scheduled_at));
        const eventRef = firebase_js_1.db.collection(collections_js_1.Collections.SCHEDULED_EVENTS).doc();
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        // Update output status
        await outputSnap.ref.update({ status: "scheduled", scheduledAt, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        const snap = await eventRef.get();
        return (0, transform_js_1.docToResponse)(eventRef.id, snap.data());
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── scheduleBatch ───────────────────────────────────────────────────────────
exports.scheduleBatch = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const input = (0, validate_js_1.validate)(schemas_js_1.ScheduleBatchSchema, request.data);
        const results = [];
        for (const item of input.items) {
            try {
                const outputSnap = await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(item.output_id).get();
                if (!outputSnap.exists)
                    continue;
                const outputData = outputSnap.data();
                if (outputData.workspaceId !== ctx.workspaceId)
                    continue;
                const existing = await firebase_js_1.db
                    .collection(collections_js_1.Collections.SCHEDULED_EVENTS)
                    .where("generatedOutputId", "==", item.output_id)
                    .where("status", "in", ["scheduled", "publishing"])
                    .limit(1)
                    .get();
                if (!existing.empty)
                    continue;
                const scheduledAt = firestore_1.Timestamp.fromDate(new Date(item.scheduled_at));
                const eventRef = firebase_js_1.db.collection(collections_js_1.Collections.SCHEDULED_EVENTS).doc();
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
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                await outputSnap.ref.update({ status: "scheduled", scheduledAt, updatedAt: firestore_1.FieldValue.serverTimestamp() });
                const snap = await eventRef.get();
                results.push((0, transform_js_1.docToResponse)(eventRef.id, snap.data()));
            }
            catch (err) {
                console.warn("Batch schedule item error:", err);
            }
        }
        return { events: results, total: results.length };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── autoSchedule ────────────────────────────────────────────────────────────
exports.autoSchedule = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const input = (0, validate_js_1.validate)(schemas_js_1.AutoScheduleSchema, request.data);
        // Get all approved/draft outputs for this content
        const outputsSnap = await firebase_js_1.db
            .collection(collections_js_1.Collections.GENERATED_OUTPUTS)
            .where("contentUploadId", "==", input.content_id)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("status", "in", ["draft", "approved"])
            .get();
        if (outputsSnap.empty) {
            return { events: [], total: 0, message: "No outputs available to schedule." };
        }
        const outputs = outputsSnap.docs.map((doc) => ({
            id: doc.id,
            platformId: doc.data().platformId,
        }));
        // Create distribution arc
        const startDate = new Date(input.start_date);
        const arcItems = (0, distributionArc_js_1.createDistributionArc)(outputs, startDate);
        // Schedule each item
        const results = [];
        for (const item of arcItems) {
            const scheduledAt = firestore_1.Timestamp.fromDate(item.suggestedDatetime);
            const eventRef = firebase_js_1.db.collection(collections_js_1.Collections.SCHEDULED_EVENTS).doc();
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
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(item.outputId).update({
                status: "scheduled",
                scheduledAt,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            const snap = await eventRef.get();
            results.push((0, transform_js_1.docToResponse)(eventRef.id, snap.data()));
        }
        return { events: results, total: results.length };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── getCalendarEvents ───────────────────────────────────────────────────────
exports.getCalendarEvents = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const input = (0, validate_js_1.validate)(schemas_js_1.CalendarQuerySchema, request.data);
        const startTs = firestore_1.Timestamp.fromDate(new Date(input.start));
        const endTs = firestore_1.Timestamp.fromDate(new Date(input.end));
        let query = firebase_js_1.db
            .collection(collections_js_1.Collections.SCHEDULED_EVENTS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("scheduledAt", ">=", startTs)
            .where("scheduledAt", "<=", endTs)
            .orderBy("scheduledAt", "asc");
        const snap = await query.get();
        let events = snap.docs;
        // Filter by platform if specified
        if (input.platform_id) {
            events = events.filter((doc) => doc.data().platformId === input.platform_id);
        }
        // Enrich with output content and title
        const enrichedEvents = await Promise.all(events.map(async (doc) => {
            const eventData = doc.data();
            let outputContent = null;
            let outputFormatName = null;
            let contentTitle = null;
            try {
                const outputSnap = await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(eventData.generatedOutputId).get();
                if (outputSnap.exists) {
                    const outputData = outputSnap.data();
                    outputContent = outputData.content || null;
                    outputFormatName = outputData.formatName || null;
                    const contentSnap = await firebase_js_1.db.collection(collections_js_1.Collections.CONTENT_UPLOADS).doc(outputData.contentUploadId).get();
                    if (contentSnap.exists) {
                        contentTitle = contentSnap.data().title || null;
                    }
                }
            }
            catch {
                // non-fatal
            }
            return {
                ...(0, transform_js_1.docToResponse)(doc.id, eventData),
                output_content: outputContent,
                output_format_name: outputFormatName,
                content_title: contentTitle,
            };
        }));
        return { events: enrichedEvents, total: enrichedEvents.length };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── rescheduleOutput ────────────────────────────────────────────────────────
exports.rescheduleOutput = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const eventId = request.data?.event_id;
        if (!eventId)
            throw new errors_js_1.NotFoundError("event_id required");
        const input = (0, validate_js_1.validate)(schemas_js_1.RescheduleSchema, request.data);
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.SCHEDULED_EVENTS).doc(eventId);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Scheduled event not found");
        const data = snap.data();
        if (data.workspaceId !== ctx.workspaceId)
            throw new errors_js_1.NotFoundError("Scheduled event not found");
        if (!["scheduled", "failed"].includes(data.status)) {
            throw new errors_js_1.ValidationError("Cannot reschedule", `Event is in '${data.status}' status.`);
        }
        const newScheduledAt = firestore_1.Timestamp.fromDate(new Date(input.scheduled_at));
        await docRef.update({
            scheduledAt: newScheduledAt,
            status: "scheduled",
            publishError: null,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        // Update output too
        const outputRef = firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(data.generatedOutputId);
        await outputRef.update({ scheduledAt: newScheduledAt, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        const updated = await docRef.get();
        return (0, transform_js_1.docToResponse)(docRef.id, updated.data());
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── cancelEvent ────────────────────────────────────────────────────────────
exports.cancelEvent = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const eventId = request.data?.event_id;
        if (!eventId)
            throw new errors_js_1.NotFoundError("event_id required");
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.SCHEDULED_EVENTS).doc(eventId);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Scheduled event not found");
        const data = snap.data();
        if (data.workspaceId !== ctx.workspaceId)
            throw new errors_js_1.NotFoundError("Scheduled event not found");
        if (!["scheduled", "failed"].includes(data.status)) {
            throw new errors_js_1.ValidationError("Cannot cancel", `Event is in '${data.status}' status.`);
        }
        await docRef.update({ status: "cancelled", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        // Revert the output status back to approved
        const outputRef = firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS).doc(data.generatedOutputId);
        await outputRef.update({ status: "approved", scheduledAt: null, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        return { success: true };
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── publishNow ─────────────────────────────────────────────────────────────
exports.publishNow = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        (0, rbac_js_1.assertRole)(ctx, "editor");
        const eventId = request.data?.event_id;
        if (!eventId)
            throw new errors_js_1.NotFoundError("event_id required");
        const docRef = firebase_js_1.db.collection(collections_js_1.Collections.SCHEDULED_EVENTS).doc(eventId);
        const snap = await docRef.get();
        if (!snap.exists)
            throw new errors_js_1.NotFoundError("Scheduled event not found");
        const data = snap.data();
        if (data.workspaceId !== ctx.workspaceId)
            throw new errors_js_1.NotFoundError("Scheduled event not found");
        if (!["scheduled", "failed"].includes(data.status)) {
            throw new errors_js_1.ValidationError("Cannot publish now", `Event is in '${data.status}' status.`);
        }
        // Mark as publishing
        await docRef.update({ status: "publishing", updatedAt: firestore_1.FieldValue.serverTimestamp() });
        // Enqueue the publishing task for immediate execution
        await (0, taskClient_js_1.enqueueTask)({
            queue: "publishing",
            url: (0, taskClient_js_1.getTaskHandlerUrl)("taskPublishing"),
            payload: {
                eventId: docRef.id,
                workspaceId: ctx.workspaceId,
                outputId: data.generatedOutputId,
                platformId: data.platformId,
            },
        });
        const updated = await docRef.get();
        return (0, transform_js_1.docToResponse)(docRef.id, updated.data());
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
// ─── getCalendarStats ───────────────────────────────────────────────────────
exports.getCalendarStats = (0, https_1.onCall)(async (request) => {
    try {
        const ctx = await (0, auth_js_1.verifyAuth)(request);
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const todayStartTs = firestore_1.Timestamp.fromDate(todayStart);
        const todayEndTs = firestore_1.Timestamp.fromDate(todayEnd);
        const weekEndTs = firestore_1.Timestamp.fromDate(weekEnd);
        // Upcoming today
        const todaySnap = await firebase_js_1.db.collection(collections_js_1.Collections.SCHEDULED_EVENTS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("status", "==", "scheduled")
            .where("scheduledAt", ">=", todayStartTs)
            .where("scheduledAt", "<", todayEndTs)
            .count()
            .get();
        // Upcoming this week
        const weekSnap = await firebase_js_1.db.collection(collections_js_1.Collections.SCHEDULED_EVENTS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("status", "==", "scheduled")
            .where("scheduledAt", ">=", todayStartTs)
            .where("scheduledAt", "<", weekEndTs)
            .count()
            .get();
        // Total published
        const publishedSnap = await firebase_js_1.db.collection(collections_js_1.Collections.SCHEDULED_EVENTS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("status", "==", "published")
            .count()
            .get();
        // Total failed
        const failedSnap = await firebase_js_1.db.collection(collections_js_1.Collections.SCHEDULED_EVENTS)
            .where("workspaceId", "==", ctx.workspaceId)
            .where("status", "==", "failed")
            .count()
            .get();
        // Content gaps: approved outputs with no scheduled event
        const approvedOutputs = await firebase_js_1.db.collection(collections_js_1.Collections.GENERATED_OUTPUTS)
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
    }
    catch (err) {
        throw (0, errors_js_1.wrapError)(err);
    }
});
//# sourceMappingURL=calendar.js.map