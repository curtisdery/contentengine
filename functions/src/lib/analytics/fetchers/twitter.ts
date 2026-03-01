/**
 * Twitter/X metrics fetcher — v2 API with public_metrics + non_public_metrics.
 */

import type { MetricsFetcher, FetchMetricsOptions, PlatformMetrics } from "./base.js";
import { handleApiResponse } from "./base.js";

interface TwitterPublicMetrics {
  retweet_count?: number;
  reply_count?: number;
  like_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  impression_count?: number;
}

interface TwitterNonPublicMetrics {
  impression_count?: number;
  url_link_clicks?: number;
  user_profile_clicks?: number;
}

export const twitterFetcher: MetricsFetcher = {
  platformId: "twitter",

  async fetchMetrics(options: FetchMetricsOptions): Promise<PlatformMetrics> {
    const { platformPostId, accessToken } = options;

    const fields = "public_metrics,non_public_metrics";
    const resp = await fetch(
      `https://api.twitter.com/2/tweets/${platformPostId}?tweet.fields=${fields}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    handleApiResponse("twitter", resp, platformPostId);

    const json = await resp.json() as {
      data?: {
        public_metrics?: TwitterPublicMetrics;
        non_public_metrics?: TwitterNonPublicMetrics;
      };
    };

    const pub = json.data?.public_metrics ?? {};
    const nonPub = json.data?.non_public_metrics ?? {};

    const impressions = nonPub.impression_count ?? pub.impression_count ?? 0;
    const likes = pub.like_count ?? 0;
    const retweets = pub.retweet_count ?? 0;
    const replies = pub.reply_count ?? 0;
    const quotes = pub.quote_count ?? 0;
    const bookmarks = pub.bookmark_count ?? 0;
    const urlClicks = nonPub.url_link_clicks ?? 0;

    return {
      impressions,
      engagements: likes + retweets + replies + quotes + bookmarks,
      saves: bookmarks,
      shares: retweets + quotes,
      clicks: urlClicks,
      follows: 0,
      comments: replies,
    };
  },
};
