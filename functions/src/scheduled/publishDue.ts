/**
 * publishDue — every 1 minute cron: find due events → enqueue publish tasks.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { TOKEN_ENCRYPTION_KEY } from "../config/env.js";
import { Collections } from "../shared/collections.js";
import { enqueueTask, getTaskHandlerUrl } from "../lib/taskClient.js";

export const publishDue = onSchedule({
  schedule: "every 1 minutes",
  secrets: [TOKEN_ENCRYPTION_KEY],
  timeoutSeconds: 60,
}, async () => {
  const now = Timestamp.now();

  const dueEvents = await db
    .collection(Collections.SCHEDULED_EVENTS)
    .where("scheduledAt", "<=", now)
    .where("status", "==", "scheduled")
    .orderBy("scheduledAt", "asc")
    .limit(50)
    .get();

  if (dueEvents.empty) return;

  console.log(`Found ${dueEvents.size} due events to publish`);

  for (const doc of dueEvents.docs) {
    try {
      await enqueueTask({
        queue: "publishing",
        url: getTaskHandlerUrl("taskPublishing"),
        payload: { eventId: doc.id },
      });
    } catch (err) {
      console.error(`Failed to enqueue publish task for event ${doc.id}:`, err);
    }
  }
});
