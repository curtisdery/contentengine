/**
 * Waitlist API — 3 onCall functions: captureEmail, joinWaitlist, subscribeToUpdates.
 * captureEmail: Unauthenticated — allows anyone to submit their email for launch notifications.
 * joinWaitlist: Authenticated — allows logged-in users to join the Growth plan waitlist.
 * subscribeToUpdates: Authenticated — allows users to subscribe to feature update notifications.
 */

import { onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { db, auth } from "../config/firebase.js";
import { validate } from "../middleware/validate.js";
import { Collections } from "../shared/collections.js";
import { wrapError } from "../shared/errors.js";
import * as admin from "firebase-admin";

const CaptureEmailSchema = z.object({
    email: z.string().email("Invalid email address").max(320),
});

const JoinWaitlistSchema = z.object({
    plan: z.string().min(1).max(50),
    source: z.string().min(1).max(100),
});

const SubscribeToUpdatesSchema = z.object({
    email: z.string().email("Invalid email address").max(320),
    type: z.string().min(1).max(100),
});

// —— captureEmail ————————————————————————————————————————
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

// —— joinWaitlist ————————————————————————————————————————
export const joinWaitlist = onCall(async (request) => {
    try {
          if (!request.auth) {
                  throw new Error("Authentication required");
          }

      const { plan, source } = validate(JoinWaitlistSchema, request.data);
          const uid = request.auth.uid;

      // Get user email from auth record
      const userRecord = await auth.getUser(uid);
          const email = userRecord.email || "";

      // Write to waitlist collection
      await db.collection("waitlist").add({
              uid,
              email,
              plan,
              source,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Set flag on user profile
      await db.collection(Collections.USERS).doc(uid).set(
        { waitlistJoined: true },
        { merge: true }
            );

      return { success: true };
    } catch (err) {
          throw wrapError(err);
    }
});

// —— subscribeToUpdates ——————————————————————————————————
export const subscribeToUpdates = onCall(async (request) => {
    try {
          if (!request.auth) {
                  throw new Error("Authentication required");
          }

      const { email, type } = validate(SubscribeToUpdatesSchema, request.data);
          const uid = request.auth.uid;

      // Write to notifications collection
      await db.collection("notifications").add({
              uid,
              email,
              type,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Set flag on user profile based on type
      const profileUpdate: Record<string, boolean> = {};
          if (type === "platform-integrations") {
                  profileUpdate.notifyIntegrations = true;
          }

      if (Object.keys(profileUpdate).length > 0) {
              await db.collection(Collections.USERS).doc(uid).set(
                        profileUpdate,
                { merge: true }
                      );
      }

      return { success: true };
    } catch (err) {
          throw wrapError(err);
    }
});
