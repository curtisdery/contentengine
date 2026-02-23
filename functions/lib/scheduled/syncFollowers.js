"use strict";
/**
 * syncFollowers — every 12h: sync follower counts from connected platforms.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncFollowers = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const firebase_js_1 = require("../config/firebase.js");
const env_js_1 = require("../config/env.js");
const collections_js_1 = require("../shared/collections.js");
const encryption_js_1 = require("../lib/encryption.js");
exports.syncFollowers = (0, scheduler_1.onSchedule)({
    schedule: "every 12 hours",
    secrets: [env_js_1.TOKEN_ENCRYPTION_KEY],
    timeoutSeconds: 300,
}, async () => {
    const connectionsSnap = await firebase_js_1.db.collection(collections_js_1.Collections.PLATFORM_CONNECTIONS)
        .where("isActive", "==", true)
        .get();
    if (connectionsSnap.empty)
        return;
    console.log(`Syncing follower counts for ${connectionsSnap.size} connections`);
    for (const doc of connectionsSnap.docs) {
        const data = doc.data();
        const platformId = data.platformId;
        const accessToken = data.accessTokenEncrypted
            ? (0, encryption_js_1.decryptToken)(data.accessTokenEncrypted)
            : "";
        if (!accessToken)
            continue;
        try {
            let followerCount = null;
            switch (platformId) {
                case "twitter": {
                    const userId = data.platformUserId;
                    if (!userId)
                        break;
                    const resp = await fetch(`https://api.twitter.com/2/users/${userId}?user.fields=public_metrics`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    if (resp.ok) {
                        const json = await resp.json();
                        followerCount = json.data?.public_metrics?.followers_count ?? null;
                    }
                    break;
                }
                case "linkedin": {
                    // LinkedIn follower count requires organization API — use connection's stored value as fallback
                    break;
                }
                case "bluesky": {
                    const handle = data.platformUsername;
                    if (!handle)
                        break;
                    const resp = await fetch(`https://bsky.social/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    if (resp.ok) {
                        const json = await resp.json();
                        followerCount = json.followersCount ?? null;
                    }
                    break;
                }
                case "instagram": {
                    const userId = data.platformUserId;
                    if (!userId)
                        break;
                    const resp = await fetch(`https://graph.instagram.com/v18.0/${userId}?fields=followers_count&access_token=${accessToken}`);
                    if (resp.ok) {
                        const json = await resp.json();
                        followerCount = json.followers_count ?? null;
                    }
                    break;
                }
                case "youtube": {
                    const channelId = data.platformUserId;
                    if (!channelId)
                        break;
                    const resp = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&access_token=${accessToken}`);
                    if (resp.ok) {
                        const json = await resp.json();
                        const count = json.items?.[0]?.statistics?.subscriberCount;
                        followerCount = count ? parseInt(count, 10) : null;
                    }
                    break;
                }
                case "tiktok": {
                    // TikTok API requires specific scopes for user info
                    break;
                }
                case "reddit": {
                    const username = data.platformUsername;
                    if (!username)
                        break;
                    const resp = await fetch(`https://oauth.reddit.com/user/${username}/about`, {
                        headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "Pandocast/1.0" },
                    });
                    if (resp.ok) {
                        const json = await resp.json();
                        followerCount = json.data?.subscribers ?? null;
                    }
                    break;
                }
                default:
                    // No follower sync for other platforms
                    break;
            }
            if (followerCount !== null) {
                await doc.ref.update({
                    followerCount,
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                console.log(`Updated ${platformId} follower count for connection ${doc.id}: ${followerCount}`);
            }
        }
        catch (err) {
            console.error(`Failed to sync followers for ${platformId} connection ${doc.id}:`, err);
        }
    }
    console.log("Follower sync complete");
});
//# sourceMappingURL=syncFollowers.js.map