/**
 * syncFollowers — every 12h: sync follower counts from connected platforms.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { TOKEN_ENCRYPTION_KEY } from "../config/env.js";
import { Collections } from "../shared/collections.js";
import { decryptToken } from "../lib/encryption.js";

export const syncFollowers = onSchedule({
  schedule: "every 12 hours",
  secrets: [TOKEN_ENCRYPTION_KEY],
  timeoutSeconds: 300,
}, async () => {
  const connectionsSnap = await db.collection(Collections.PLATFORM_CONNECTIONS)
    .where("isActive", "==", true)
    .get();

  if (connectionsSnap.empty) return;

  console.log(`Syncing follower counts for ${connectionsSnap.size} connections`);

  for (const doc of connectionsSnap.docs) {
    const data = doc.data();
    const platformId = data.platformId as string;
    const accessToken = data.accessTokenEncrypted
      ? decryptToken(data.accessTokenEncrypted as string)
      : "";

    if (!accessToken) continue;

    try {
      let followerCount: number | null = null;

      switch (platformId) {
        case "twitter": {
          const userId = data.platformUserId as string;
          if (!userId) break;
          const resp = await fetch(`https://api.twitter.com/2/users/${userId}?user.fields=public_metrics`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (resp.ok) {
            const json = await resp.json() as { data?: { public_metrics?: { followers_count?: number } } };
            followerCount = json.data?.public_metrics?.followers_count ?? null;
          }
          break;
        }
        case "linkedin": {
          // LinkedIn follower count requires organization API — use connection's stored value as fallback
          break;
        }
        case "bluesky": {
          const handle = data.platformUsername as string;
          if (!handle) break;
          const resp = await fetch(`https://bsky.social/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (resp.ok) {
            const json = await resp.json() as { followersCount?: number };
            followerCount = json.followersCount ?? null;
          }
          break;
        }
        case "instagram": {
          const userId = data.platformUserId as string;
          if (!userId) break;
          const resp = await fetch(`https://graph.instagram.com/v18.0/${userId}?fields=followers_count&access_token=${accessToken}`);
          if (resp.ok) {
            const json = await resp.json() as { followers_count?: number };
            followerCount = json.followers_count ?? null;
          }
          break;
        }
        case "youtube": {
          const channelId = data.platformUserId as string;
          if (!channelId) break;
          const resp = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&access_token=${accessToken}`);
          if (resp.ok) {
            const json = await resp.json() as { items?: Array<{ statistics?: { subscriberCount?: string } }> };
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
          const username = data.platformUsername as string;
          if (!username) break;
          const resp = await fetch(`https://oauth.reddit.com/user/${username}/about`, {
            headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "Pandocast/1.0" },
          });
          if (resp.ok) {
            const json = await resp.json() as { data?: { subscribers?: number } };
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
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`Updated ${platformId} follower count for connection ${doc.id}: ${followerCount}`);
      }
    } catch (err) {
      console.error(`Failed to sync followers for ${platformId} connection ${doc.id}:`, err);
    }
  }

  console.log("Follower sync complete");
});
