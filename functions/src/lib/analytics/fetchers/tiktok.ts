/**
 * TikTok metrics fetcher — Content Posting API /video/query.
 */

import type { MetricsFetcher, FetchMetricsOptions, PlatformMetrics } from "./base.js";
import { handleApiResponse } from "./base.js";

interface TikTokVideoData {
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  view_count?: number;
}

export const tiktokFetcher: MetricsFetcher = {
  platformId: "tiktok",

  async fetchMetrics(options: FetchMetricsOptions): Promise<PlatformMetrics> {
    const { platformPostId, accessToken } = options;

    const resp = await fetch(
      "https://open.tiktokapis.com/v2/video/query/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filters: { video_ids: [platformPostId] },
          fields: ["like_count", "comment_count", "share_count", "view_count"],
        }),
      }
    );

    handleApiResponse("tiktok", resp, platformPostId);

    const json = await resp.json() as {
      data?: { videos?: TikTokVideoData[] };
    };

    const video = json.data?.videos?.[0];
    if (!video) {
      return { impressions: 0, engagements: 0, saves: 0, shares: 0, clicks: 0, follows: 0, comments: 0 };
    }

    const views = video.view_count ?? 0;
    const likes = video.like_count ?? 0;
    const comments = video.comment_count ?? 0;
    const shares = video.share_count ?? 0;

    return {
      impressions: views,
      engagements: likes + comments + shares,
      saves: 0,
      shares,
      clicks: 0,
      follows: 0,
      comments,
    };
  },
};
