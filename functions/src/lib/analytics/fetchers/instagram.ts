/**
 * Instagram metrics fetcher — Graph API /media/:id/insights.
 */

import type { MetricsFetcher, FetchMetricsOptions, PlatformMetrics } from "./base.js";
import { handleApiResponse } from "./base.js";

interface InsightValue {
  value: number;
}

interface InsightEntry {
  name: string;
  values: InsightValue[];
}

export const instagramFetcher: MetricsFetcher = {
  platformId: "instagram",

  async fetchMetrics(options: FetchMetricsOptions): Promise<PlatformMetrics> {
    const { platformPostId, accessToken } = options;

    // First get basic metrics from the media endpoint
    const mediaResp = await fetch(
      `https://graph.instagram.com/v18.0/${platformPostId}?fields=like_count,comments_count&access_token=${accessToken}`
    );

    handleApiResponse("instagram", mediaResp, platformPostId);

    const mediaJson = await mediaResp.json() as {
      like_count?: number;
      comments_count?: number;
    };

    const likes = mediaJson.like_count ?? 0;
    const comments = mediaJson.comments_count ?? 0;

    // Then get insights (impressions, reach, saves, shares)
    let impressions = 0;
    let reach = 0;
    let saves = 0;
    let shares = 0;

    try {
      const insightsResp = await fetch(
        `https://graph.instagram.com/v18.0/${platformPostId}/insights?metric=impressions,reach,saved,shares&access_token=${accessToken}`
      );

      if (insightsResp.ok) {
        const insightsJson = await insightsResp.json() as { data?: InsightEntry[] };

        for (const entry of insightsJson.data ?? []) {
          const value = entry.values?.[0]?.value ?? 0;
          switch (entry.name) {
            case "impressions":
              impressions = value;
              break;
            case "reach":
              reach = value;
              break;
            case "saved":
              saves = value;
              break;
            case "shares":
              shares = value;
              break;
          }
        }
      }
    } catch {
      // Insights may not be available for all media types — use basic metrics
    }

    return {
      impressions: impressions || reach,
      engagements: likes + comments + saves + shares,
      saves,
      shares,
      clicks: 0,
      follows: 0,
      comments,
    };
  },
};
