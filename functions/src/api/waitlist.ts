/**
 * Waitlist API — 1 onCall function: captureEmail.
 * Unauthenticated — allows anyone to submit their email for launch notifications.
 */

import { onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { db } from "../config/firebase.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { wrapError } from "../shared/errors.js";

const CaptureEmailSchema = z.object({
  email: z.string().email("Invalid email address").max(320),
});

// ─── captureEmail ────────────────────────────────────────────────────────────
export const captureEmail = onCall(async (request) => {
  try {
    const { email } = validate(CaptureEmailSchema, request.data);
    const normalizedEmail = email.toLowerCase().trim();

    // Dedupe by email — use email as document ID
    const docRef = db.collection(Collections.WAITLIST_EMAILS).doc(normalizedEmail);
    const existing = await docRef.get();

    if (existing.exists) {
      return { success: true, message: "Already on the list!" };
    }

    await docRef.set({
      email: normalizedEmail,
      source: "landing_page",
      createdAt: new Date().toISOString(),
    });

    return { success: true, message: "You're on the list!" };
  } catch (err) {
    throw wrapError(err);
  }
});
