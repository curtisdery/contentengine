/**
 * PublisherRegistry singleton — maps platformId → publisher implementation.
 * Port of apps/api/app/services/publisher.py PublisherRegistry + init_publishers.
 */

import type { PlatformPublisher } from "./base.js";
import { TwitterPublisher } from "./twitter.js";
import { LinkedInPublisher } from "./linkedin.js";
import { BlueskyPublisher } from "./bluesky.js";
import {
  InstagramPublisher,
  YouTubePublisher,
  TikTokPublisher,
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

// Tier 1
register("twitter_single", twitter);
register("twitter_thread", twitter);
register("linkedin_post", linkedin);
register("linkedin_article", linkedin);
register("bluesky_post", bluesky);

// Tier 2
register("instagram_carousel", InstagramPublisher);
register("instagram_caption", InstagramPublisher);
register("pinterest_pin", PinterestPublisher);

// Tier 3
register("medium_post", MediumPublisher);

// Tier 4
register("youtube_longform", YouTubePublisher);
register("short_form_video", TikTokPublisher);

// Tier 5
register("reddit_post", RedditPublisher);
register("quora_answer", QuoraPublisher);
