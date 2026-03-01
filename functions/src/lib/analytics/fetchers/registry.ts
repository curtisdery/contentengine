/**
 * Fetcher registry — maps platformId to the correct MetricsFetcher.
 */

import type { MetricsFetcher } from "./base.js";
import { twitterFetcher } from "./twitter.js";
import { linkedinFetcher } from "./linkedin.js";
import { instagramFetcher } from "./instagram.js";
import { youtubeFetcher } from "./youtube.js";
import { tiktokFetcher } from "./tiktok.js";
import { blueskyFetcher } from "./bluesky.js";

const fetchers: Record<string, MetricsFetcher> = {
  twitter: twitterFetcher,
  twitter_single: twitterFetcher,
  twitter_thread: twitterFetcher,
  linkedin: linkedinFetcher,
  linkedin_post: linkedinFetcher,
  linkedin_article: linkedinFetcher,
  instagram: instagramFetcher,
  instagram_carousel: instagramFetcher,
  instagram_caption: instagramFetcher,
  youtube: youtubeFetcher,
  youtube_longform: youtubeFetcher,
  tiktok: tiktokFetcher,
  short_form_video: tiktokFetcher,
  bluesky: blueskyFetcher,
  bluesky_post: blueskyFetcher,
};

/**
 * Get the metrics fetcher for a given platform ID.
 * Returns null for platforms without a fetcher (reddit, pinterest, etc.).
 */
export function getFetcher(platformId: string): MetricsFetcher | null {
  return fetchers[platformId] ?? null;
}

/** List all supported platform IDs for metrics fetching. */
export function getSupportedPlatforms(): string[] {
  return [...new Set(Object.values(fetchers).map((f) => f.platformId))];
}
