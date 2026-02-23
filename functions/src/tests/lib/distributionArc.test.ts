import { describe, it, expect } from "vitest";
import "../helpers/setup.js";
import {
  DISTRIBUTION_ARC,
  CADENCE_DAYS,
  createDistributionArc,
} from "../../lib/distributionArc.js";

// ─── DISTRIBUTION_ARC constant ────────────────────────────────────────────────

describe("DISTRIBUTION_ARC", () => {
  it("has 18 entries", () => {
    expect(Object.keys(DISTRIBUTION_ARC)).toHaveLength(18);
  });

  it("every entry has day, hour, and minute fields", () => {
    for (const [key, arc] of Object.entries(DISTRIBUTION_ARC)) {
      expect(arc).toHaveProperty("day");
      expect(arc).toHaveProperty("hour");
      expect(arc).toHaveProperty("minute");
      expect(typeof arc.day).toBe("number");
      expect(typeof arc.hour).toBe("number");
      expect(typeof arc.minute).toBe("number");
    }
  });

  it("contains expected platform keys", () => {
    const expected = [
      "linkedin_post",
      "twitter_thread",
      "twitter_single",
      "instagram_carousel",
      "bluesky_post",
      "email_newsletter",
      "blog_seo",
      "reddit_post",
      "medium_post",
      "press_release",
      "slide_deck",
    ];
    for (const key of expected) {
      expect(DISTRIBUTION_ARC).toHaveProperty(key);
    }
  });
});

// ─── CADENCE_DAYS constant ────────────────────────────────────────────────────

describe("CADENCE_DAYS", () => {
  it("has 18 entries", () => {
    expect(Object.keys(CADENCE_DAYS)).toHaveLength(18);
  });

  it("all values are positive numbers", () => {
    for (const [key, days] of Object.entries(CADENCE_DAYS)) {
      expect(typeof days).toBe("number");
      expect(days).toBeGreaterThan(0);
    }
  });
});

// ─── createDistributionArc ────────────────────────────────────────────────────

describe("createDistributionArc", () => {
  it("returns empty array for empty inputs", () => {
    const result = createDistributionArc([], new Date());
    expect(result).toEqual([]);
  });

  it("returns sorted results by suggestedDatetime ascending", () => {
    // Use a future date so dates don't get pushed to now+1h
    const futureStart = new Date();
    futureStart.setFullYear(futureStart.getFullYear() + 1);

    const outputs = [
      { id: "out-1", platformId: "reddit_post" },       // day 7
      { id: "out-2", platformId: "linkedin_post" },      // day 1
      { id: "out-3", platformId: "email_newsletter" },   // day 3
    ];

    const result = createDistributionArc(outputs, futureStart);
    expect(result).toHaveLength(3);

    for (let i = 1; i < result.length; i++) {
      expect(result[i].suggestedDatetime.getTime())
        .toBeGreaterThanOrEqual(result[i - 1].suggestedDatetime.getTime());
    }
  });

  it("uses arc timing for known platforms", () => {
    const futureStart = new Date();
    futureStart.setFullYear(futureStart.getFullYear() + 1);

    const outputs = [{ id: "out-1", platformId: "linkedin_post" }];
    const result = createDistributionArc(outputs, futureStart);

    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item.outputId).toBe("out-1");
    expect(item.platformId).toBe("linkedin_post");

    // linkedin_post: day 1, hour 9, minute 0
    expect(item.suggestedDatetime.getUTCHours()).toBe(9);
    expect(item.suggestedDatetime.getUTCMinutes()).toBe(0);
  });

  it("falls back to day 7 hour 12 for unknown platforms", () => {
    const futureStart = new Date();
    futureStart.setFullYear(futureStart.getFullYear() + 1);

    const outputs = [{ id: "out-1", platformId: "unknown_platform" }];
    const result = createDistributionArc(outputs, futureStart);

    expect(result).toHaveLength(1);
    // Default: day 7, hour 12, minute 0
    expect(result[0].suggestedDatetime.getUTCHours()).toBe(12);
    expect(result[0].suggestedDatetime.getUTCMinutes()).toBe(0);
  });

  it("pushes past dates to future (now + 1 hour)", () => {
    // Use a date far in the past so all arc slots are in the past
    const pastDate = new Date("2020-01-01T00:00:00Z");
    const outputs = [{ id: "out-1", platformId: "linkedin_post" }];

    const beforeRun = Date.now();
    const result = createDistributionArc(outputs, pastDate);
    const afterRun = Date.now();

    expect(result).toHaveLength(1);
    const suggestedMs = result[0].suggestedDatetime.getTime();

    // Should be approximately now + 1 hour (within a 60-second tolerance
    // because the function truncates seconds/ms to 0)
    const oneHourMs = 60 * 60 * 1000;
    expect(suggestedMs).toBeGreaterThanOrEqual(beforeRun + oneHourMs - 61000);
    expect(suggestedMs).toBeLessThanOrEqual(afterRun + oneHourMs + 5000);
  });

  it("preserves outputId and platformId in each result item", () => {
    const futureStart = new Date();
    futureStart.setFullYear(futureStart.getFullYear() + 1);

    const outputs = [
      { id: "aaa", platformId: "twitter_single" },
      { id: "bbb", platformId: "bluesky_post" },
    ];

    const result = createDistributionArc(outputs, futureStart);
    const ids = result.map((r) => r.outputId);
    expect(ids).toContain("aaa");
    expect(ids).toContain("bbb");

    const platforms = result.map((r) => r.platformId);
    expect(platforms).toContain("twitter_single");
    expect(platforms).toContain("bluesky_post");
  });

  it("each result has a valid Date for suggestedDatetime", () => {
    const futureStart = new Date();
    futureStart.setFullYear(futureStart.getFullYear() + 1);

    const outputs = [
      { id: "out-1", platformId: "linkedin_post" },
      { id: "out-2", platformId: "twitter_thread" },
    ];

    const result = createDistributionArc(outputs, futureStart);
    for (const item of result) {
      expect(item.suggestedDatetime).toBeInstanceOf(Date);
      expect(isNaN(item.suggestedDatetime.getTime())).toBe(false);
    }
  });
});
