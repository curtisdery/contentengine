/**
 * refreshTokens — every 6h: refresh expiring OAuth tokens.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { TOKEN_ENCRYPTION_KEY } from "../config/env.js";
import { Collections } from "../shared/collections.js";
import { decryptToken, encryptToken } from "../lib/encryption.js";
import { getPublisher } from "../lib/platforms/publishers/registry.js";

export const refreshTokens = onSchedule({
  schedule: "every 6 hours",
  secrets: [TOKEN_ENCRYPTION_KEY],
  timeoutSeconds: 300,
}, async () => {
  // Find connections expiring in the next 12 hours
  const expiresThreshold = Timestamp.fromDate(new Date(Date.now() + 12 * 60 * 60 * 1000));

  const connectionsSnap = await db.collection(Collections.PLATFORM_CONNECTIONS)
    .where("isActive", "==", true)
    .where("tokenExpiresAt", "<=", expiresThreshold)
    .get();

  if (connectionsSnap.empty) return;

  console.log(`Found ${connectionsSnap.size} connections to refresh`);

  for (const doc of connectionsSnap.docs) {
    const data = doc.data();
    const platformId = data.platformId as string;

    try {
      const publisher = getPublisher(platformId);
      if (!publisher) continue;

      const tokens = {
        accessToken: data.accessTokenEncrypted ? decryptToken(data.accessTokenEncrypted as string) : "",
        refreshToken: data.refreshTokenEncrypted ? decryptToken(data.refreshTokenEncrypted as string) : null,
        platformUserId: (data.platformUserId as string) || null,
        platformUsername: (data.platformUsername as string) || null,
      };

      const refreshed = await publisher.refreshToken(tokens, platformId);
      if (refreshed) {
        await doc.ref.update({
          accessTokenEncrypted: encryptToken(refreshed.accessToken),
          refreshTokenEncrypted: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : data.refreshTokenEncrypted,
          tokenExpiresAt: refreshed.expiresIn
            ? Timestamp.fromDate(new Date(Date.now() + refreshed.expiresIn * 1000))
            : data.tokenExpiresAt,
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`Refreshed token for ${platformId} connection ${doc.id}`);
      }
    } catch (err) {
      console.error(`Failed to refresh token for ${platformId} connection ${doc.id}:`, err);
    }
  }
});
