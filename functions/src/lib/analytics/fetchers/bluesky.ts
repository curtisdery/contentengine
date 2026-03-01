/**
 * Bluesky metrics fetcher — AT Protocol getPostThread + getLikes.
 */

import type { MetricsFetcher, FetchMetricsOptions, PlatformMetrics } from "./base.js";
import { handleApiResponse } from "./base.js";

interface BlueskyPostView {
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
}

export const blueskyFetcher: MetricsFetcher = {
  platformId: "bluesky",

  async fetchMetrics(options: FetchMetricsOptions): Promise<PlatformMetrics> {
    const { platformPostId, accessToken } = options;

    // platformPostId is the AT URI: at://did:plc:.../app.bsky.feed.post/...
    const encodedUri = encodeURIComponent(platformPostId);

    const resp = await fetch(
      `https://bsky.social/xrpc/app.bsky.feed.getPostThread?uri=${encodedUri}&depth=0`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    handleApiResponse("bluesky", resp, platformPostId);

    const json = await resp.json() as {
      thread?: {
        post?: {
          likeCount?: number;
          repostCount?: number;
          replyCount?: number;
          quoteCount?: number;
        };
      };
    };

    const post = json.thread?.post;
    if (!post) {
      return { impressions: 0, engagements: 0, saves: 0, shares: 0, clicks: 0, follows: 0, comments: 0 };
    }

    const likes = post.likeCount ?? 0;
    const reposts = post.repostCount ?? 0;
    const replies = post.replyCount ?? 0;
    const quotes = post.quoteCount ?? 0;

    return {
      impressions: 0,  // Bluesky doesn't expose impression counts
      engagements: likes + reposts + replies + quotes,
      saves: 0,
      shares: reposts + quotes,
      clicks: 0,
      follows: 0,
      comments: replies,
    };
  },
};
