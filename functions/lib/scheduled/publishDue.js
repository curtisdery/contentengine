"use strict";
/**
 * publishDue — every 1 minute cron: find due events → enqueue publish tasks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishDue = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const env_js_1 = require("../config/env.js");
const collections_js_1 = require("../shared/collections.js");
const taskClient_js_1 = require("../lib/taskClient.js");
exports.publishDue = (0, scheduler_1.onSchedule)({
    schedule: "every 1 minutes",
    secrets: [env_js_1.TOKEN_ENCRYPTION_KEY],
    timeoutSeconds: 60,
}, async () => {
    const now = firestore_1.Timestamp.now();
    const dueEvents = await firebase_js_1.db
        .collection(collections_js_1.Collections.SCHEDULED_EVENTS)
        .where("scheduledAt", "<=", now)
        .where("status", "==", "scheduled")
        .orderBy("scheduledAt", "asc")
        .limit(50)
        .get();
    if (dueEvents.empty)
        return;
    console.log(`Found ${dueEvents.size} due events to publish`);
    for (const doc of dueEvents.docs) {
        try {
            await (0, taskClient_js_1.enqueueTask)({
                queue: "publishing",
                url: (0, taskClient_js_1.getTaskHandlerUrl)("taskPublishing"),
                payload: { eventId: doc.id },
            });
        }
        catch (err) {
            console.error(`Failed to enqueue publish task for event ${doc.id}:`, err);
        }
    }
});
//# sourceMappingURL=publishDue.js.map