"use strict";
/**
 * refreshTokens — every 6h: refresh expiring OAuth tokens.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshTokens = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const env_js_1 = require("../config/env.js");
const collections_js_1 = require("../shared/collections.js");
const encryption_js_1 = require("../lib/encryption.js");
const registry_js_1 = require("../lib/platforms/publishers/registry.js");
exports.refreshTokens = (0, scheduler_1.onSchedule)({
    schedule: "every 6 hours",
    secrets: [env_js_1.TOKEN_ENCRYPTION_KEY],
    timeoutSeconds: 300,
}, async () => {
    // Find connections expiring in the next 12 hours
    const expiresThreshold = firestore_1.Timestamp.fromDate(new Date(Date.now() + 12 * 60 * 60 * 1000));
    const connectionsSnap = await firebase_js_1.db.collection(collections_js_1.Collections.PLATFORM_CONNECTIONS)
        .where("isActive", "==", true)
        .where("tokenExpiresAt", "<=", expiresThreshold)
        .get();
    if (connectionsSnap.empty)
        return;
    console.log(`Found ${connectionsSnap.size} connections to refresh`);
    for (const doc of connectionsSnap.docs) {
        const data = doc.data();
        const platformId = data.platformId;
        try {
            const publisher = (0, registry_js_1.getPublisher)(platformId);
            if (!publisher)
                continue;
            const tokens = {
                accessToken: data.accessTokenEncrypted ? (0, encryption_js_1.decryptToken)(data.accessTokenEncrypted) : "",
                refreshToken: data.refreshTokenEncrypted ? (0, encryption_js_1.decryptToken)(data.refreshTokenEncrypted) : null,
                platformUserId: data.platformUserId || null,
                platformUsername: data.platformUsername || null,
            };
            const refreshed = await publisher.refreshToken(tokens, platformId);
            if (refreshed) {
                await doc.ref.update({
                    accessTokenEncrypted: (0, encryption_js_1.encryptToken)(refreshed.accessToken),
                    refreshTokenEncrypted: refreshed.refreshToken ? (0, encryption_js_1.encryptToken)(refreshed.refreshToken) : data.refreshTokenEncrypted,
                    tokenExpiresAt: refreshed.expiresIn
                        ? firestore_1.Timestamp.fromDate(new Date(Date.now() + refreshed.expiresIn * 1000))
                        : data.tokenExpiresAt,
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                console.log(`Refreshed token for ${platformId} connection ${doc.id}`);
            }
        }
        catch (err) {
            console.error(`Failed to refresh token for ${platformId} connection ${doc.id}:`, err);
        }
    }
});
//# sourceMappingURL=refreshTokens.js.map