/**
 * LinkedIn metrics fetcher — Marketing API socialActions + shares.
 */

import type { MetricsFetcher, FetchMetricsOptions, PlatformMetrics } from "./base.js";
import { handleApiResponse } from "./base.js";

interface LinkedInShareStats {
  totalShareStatistics?: {
    shareCount?: number;
    clickCount?: number;
    likeCount?: number;
    commentCount?: number;
    impressionCount?: number;
    engagement?: number;
  };
}

export const linkedinFetcher: MetricsFetcher = {
  platformId: "linkedin",

  async fetchMetrics(options: FetchMetricsOptions): Promise<PlatformMetrics> {
    const { platformPostId, accessToken } = options;

    // LinkedIn uses URN-based post IDs: urn:li:share:{id} or urn:li:ugcPost:{id}
    const urn = platformPostId.startsWith("urn:") ? platformPostId : `urn:li:share:${platformPostId}`;
    const encodedUrn = encodeURIComponent(urn);

    const resp = await fetch(
      `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&shares=List(${encodedUrn})`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    // Fallback: try socialActions endpoint if share stats fail
    if (!resp.ok) {
      return await fetchViaSocialActions(platformPostId, accessToken, urn);
    }

    const json = await resp.json() as { elements?: LinkedInShareStats[] };
    const stats = json.elements?.[0]?.totalShareStatistics;

    if (!stats) {
      return await fetchViaSocialActions(platformPostId, accessToken, urn);
    }

    return {
      impressions: stats.impressionCount ?? 0,
      engagements: (stats.likeCount ?? 0) + (stats.commentCount ?? 0) + (stats.shareCount ?? 0) + (stats.clickCount ?? 0),
      saves: 0,
      shares: stats.shareCount ?? 0,
      clicks: stats.clickCount ?? 0,
      follows: 0,
      comments: stats.commentCount ?? 0,
    };
  },
};

async function fetchViaSocialActions(
  platformPostId: string,
  accessToken: string,
  urn: string
): Promise<PlatformMetrics> {
  const encodedUrn = encodeURIComponent(urn);
  const resp = await fetch(
    `https://api.linkedin.com/v2/socialActions/${encodedUrn}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }
  );

  handleApiResponse("linkedin", resp, platformPostId);

  const json = await resp.json() as {
    likesSummary?: { totalLikes?: number };
    commentsSummary?: { totalFirstLevelComments?: number };
  };

  const likes = json.likesSummary?.totalLikes ?? 0;
  const comments = json.commentsSummary?.totalFirstLevelComments ?? 0;

  return {
    impressions: 0,
    engagements: likes + comments,
    saves: 0,
    shares: 0,
    clicks: 0,
    follows: 0,
    comments,
  };
}
