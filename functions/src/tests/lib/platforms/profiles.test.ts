import { describe, it, expect } from "vitest";
import "../../helpers/setup.js";
import {
  PLATFORMS,
  getPlatform,
  getAllPlatforms,
  getPlatformsByTier,
} from "../../../lib/platforms/profiles.js";

// ─── PLATFORMS constant ────────────────────────────────────────────────────────

describe("PLATFORMS", () => {
  const expectedPlatformIds = [
    "twitter_single",
    "twitter_thread",
    "linkedin_post",
    "linkedin_article",
    "bluesky_post",
    "instagram_carousel",
    "instagram_caption",
    "pinterest_pin",
    "blog_seo",
    "email_newsletter",
    "medium_post",
    "youtube_longform",
    "short_form_video",
    "podcast_talking_points",
    "reddit_post",
    "quora_answer",
    "press_release",
    "slide_deck",
  ];

  it("has entries for all 18 expected platforms", () => {
    expect(Object.keys(PLATFORMS)).toHaveLength(18);
    for (const id of expectedPlatformIds) {
      expect(PLATFORMS).toHaveProperty(id);
    }
  });

  it("every platform profile has required fields", () => {
    for (const [key, profile] of Object.entries(PLATFORMS)) {
      expect(profile.platformId).toBe(key);
      expect(typeof profile.name).toBe("string");
      expect(typeof profile.tier).toBe("number");
      expect(typeof profile.nativeTone).toBe("string");
      expect(Array.isArray(profile.structuralTemplates)).toBe(true);
      expect(Array.isArray(profile.hookPatterns)).toBe(true);
      expect(profile.lengthRange).toHaveProperty("min");
      expect(profile.lengthRange).toHaveProperty("ideal");
      expect(profile.lengthRange).toHaveProperty("max");
      expect(Array.isArray(profile.ctaStyles)).toBe(true);
      expect(profile.algorithmSignals).toHaveProperty("primary");
      expect(profile.algorithmSignals).toHaveProperty("secondary");
      expect(profile.algorithmSignals).toHaveProperty("negative");
      expect(typeof profile.audienceIntent).toBe("string");
      expect(typeof profile.mediaFormat).toBe("string");
      expect(typeof profile.postingCadence).toBe("string");
    }
  });

  it("tiers range from 1 to 6", () => {
    const tiers = Object.values(PLATFORMS).map((p) => p.tier);
    expect(Math.min(...tiers)).toBe(1);
    expect(Math.max(...tiers)).toBe(6);
  });
});

// ─── getPlatform ──────────────────────────────────────────────────────────────

describe("getPlatform", () => {
  it("returns the correct platform profile by ID", () => {
    const twitter = getPlatform("twitter_single");
    expect(twitter).toBeDefined();
    expect(twitter!.platformId).toBe("twitter_single");
    expect(twitter!.name).toBe("Twitter/X Single Tweet");
  });

  it("returns undefined for unknown platform ID", () => {
    const result = getPlatform("nonexistent_platform");
    expect(result).toBeUndefined();
  });

  it("returns correct data for each tier-1 platform", () => {
    const tier1 = ["twitter_single", "twitter_thread", "linkedin_post", "linkedin_article", "bluesky_post"];
    for (const id of tier1) {
      const platform = getPlatform(id);
      expect(platform).toBeDefined();
      expect(platform!.tier).toBe(1);
    }
  });
});

// ─── getAllPlatforms ──────────────────────────────────────────────────────────

describe("getAllPlatforms", () => {
  it("returns all 18 platforms as an array", () => {
    const all = getAllPlatforms();
    expect(Array.isArray(all)).toBe(true);
    expect(all).toHaveLength(18);
  });

  it("each element has a platformId", () => {
    const all = getAllPlatforms();
    for (const p of all) {
      expect(typeof p.platformId).toBe("string");
      expect(p.platformId.length).toBeGreaterThan(0);
    }
  });
});

// ─── getPlatformsByTier ──────────────────────────────────────────────────────

describe("getPlatformsByTier", () => {
  it("returns tier 1 platforms correctly", () => {
    const tier1 = getPlatformsByTier(1);
    expect(tier1.length).toBe(5);
    for (const p of tier1) {
      expect(p.tier).toBe(1);
    }
  });

  it("returns tier 2 platforms correctly", () => {
    const tier2 = getPlatformsByTier(2);
    expect(tier2.length).toBe(3);
    for (const p of tier2) {
      expect(p.tier).toBe(2);
    }
  });

  it("returns empty array for a tier with no platforms", () => {
    const result = getPlatformsByTier(99);
    expect(result).toEqual([]);
  });

  it("all tiers together account for all 18 platforms", () => {
    let total = 0;
    for (let tier = 1; tier <= 6; tier++) {
      total += getPlatformsByTier(tier).length;
    }
    expect(total).toBe(18);
  });
});
