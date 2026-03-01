/**
 * YouTube metrics fetcher — Data API v3 /videos?part=statistics.
 */

import type { MetricsFetcher, FetchMetricsOptions, PlatformMetrics } from "./base.js";
import { handleApiResponse } from "./base.js";

interface YouTubeStatistics {
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
  favoriteCount?: string;
}

export const youtubeFetcher: MetricsFetcher = {
  platformId: "youtube",

  async fetchMetrics(options: FetchMetricsOptions): Promise<PlatformMetrics> {
    const { platformPostId, accessToken } = options;

    const resp = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${platformPostId}&access_token=${accessToken}`
    );

    handleApiResponse("youtube", resp, platformPostId);

    const json = await resp.json() as {
      items?: Array<{ statistics?: YouTubeStatistics }>;
    };

    const stats = json.items?.[0]?.statistics;
    if (!stats) {
      return { impressions: 0, engagements: 0, saves: 0, shares: 0, clicks: 0, follows: 0, comments: 0 };
    }

    const views = parseInt(stats.viewCount ?? "0", 10);
    const likes = parseInt(stats.likeCount ?? "0", 10);
    const comments = parseInt(stats.commentCount ?? "0", 10);
    const favorites = parseInt(stats.favoriteCount ?? "0", 10);

    return {
      impressions: views,
      engagements: likes + comments + favorites,
      saves: favorites,
      shares: 0,
      clicks: 0,
      follows: 0,
      comments,
    };
  },
};
