/**
 * PublisherRegistry singleton — maps platformId → publisher implementation.
 * Port of apps/api/app/services/publisher.py PublisherRegistry + init_publishers.
 */

import type { PlatformPublisher } from "./base.js";
import { TwitterPublisher } from "./twitter.js";
import { LinkedInPublisher } from "./linkedin.js";
import { BlueskyPublisher } from "./bluesky.js";
import { InstagramPublisher } from "./instagram.js";
import { YouTubePublisher } from "./youtube.js";
import { TikTokPublisher } from "./tiktok.js";
import {
  PinterestPublisher,
  RedditPublisher,
  MediumPublisher,
  QuoraPublisher,
} from "./stubs.js";

const _publishers: Record<string, PlatformPublisher> = {};

function register(platformId: string, publisher: PlatformPublisher): void {
  _publishers[platformId] = publisher;
}

export function getPublisher(platformId: string): PlatformPublisher | undefined {
  return _publishers[platformId];
}

export function isSupported(platformId: string): boolean {
  return platformId in _publishers;
}

export function getSupportedPlatforms(): string[] {
  return Object.keys(_publishers);
}

// Initialize all publishers
const twitter = new TwitterPublisher();
const linkedin = new LinkedInPublisher();
const bluesky = new BlueskyPublisher();
const instagram = new InstagramPublisher();
const youtube = new YouTubePublisher();
const tiktok = new TikTokPublisher();

// Tier 1 — Real implementations
register("twitter_single", twitter);
register("twitter_thread", twitter);
register("linkedin_post", linkedin);
register("linkedin_article", linkedin);
register("bluesky_post", bluesky);

// Tier 2 — Real implementations
register("instagram_carousel", instagram);
register("instagram_caption", instagram);
register("pinterest_pin", PinterestPublisher);

// Tier 3 — Stub
register("medium_post", MediumPublisher);

// Tier 4 — Real implementations
register("youtube_longform", youtube);
register("short_form_video", tiktok);

// Tier 5 — Stubs
register("reddit_post", RedditPublisher);
register("quora_answer", QuoraPublisher);
