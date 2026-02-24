import { describe, it, expect } from "vitest";
import "../../../helpers/setup.js";
import { getPublisher } from "../../../../lib/platforms/publishers/registry.js";

// ─── getPublisher for known platforms ─────────────────────────────────────────

describe("getPublisher", () => {
  it("returns a publisher for twitter_single", () => {
    const publisher = getPublisher("twitter_single");
    expect(publisher).toBeDefined();
  });

  it("returns a publisher for twitter_thread", () => {
    const publisher = getPublisher("twitter_thread");
    expect(publisher).toBeDefined();
  });

  it("returns a publisher for linkedin_post", () => {
    const publisher = getPublisher("linkedin_post");
    expect(publisher).toBeDefined();
  });

  it("returns a publisher for linkedin_article", () => {
    const publisher = getPublisher("linkedin_article");
    expect(publisher).toBeDefined();
  });

  it("returns a publisher for bluesky_post", () => {
    const publisher = getPublisher("bluesky_post");
    expect(publisher).toBeDefined();
  });

  it("returns the same publisher instance for twitter_single and twitter_thread", () => {
    const single = getPublisher("twitter_single");
    const thread = getPublisher("twitter_thread");
    expect(single).toBe(thread);
  });

  it("returns the same publisher instance for linkedin_post and linkedin_article", () => {
    const post = getPublisher("linkedin_post");
    const article = getPublisher("linkedin_article");
    expect(post).toBe(article);
  });
});

// ─── Real publishers (registered but not stubs) ──────────────────────────────

describe("real publishers", () => {
  const realPlatforms = [
    "instagram_carousel",
    "instagram_caption",
    "youtube_longform",
    "short_form_video",
  ];

  it.each(realPlatforms)("returns a real publisher for %s", (platformId) => {
    const publisher = getPublisher(platformId);
    expect(publisher).toBeDefined();
  });

  it("instagram returns the same instance for carousel and caption", () => {
    const carousel = getPublisher("instagram_carousel");
    const caption = getPublisher("instagram_caption");
    expect(carousel).toBe(caption);
  });
});

// ─── Stub publishers ──────────────────────────────────────────────────────────

describe("stub publishers", () => {
  const stubPlatforms = [
    "pinterest_pin",
    "medium_post",
    "reddit_post",
    "quora_answer",
  ];

  it.each(stubPlatforms)("returns a stub publisher for %s", (platformId) => {
    const publisher = getPublisher(platformId);
    expect(publisher).toBeDefined();
  });

  it("stub publisher publish() returns success: false", async () => {
    const publisher = getPublisher("pinterest_pin")!;
    const result = await publisher.publish("content", {}, {
      accessToken: "t",
      refreshToken: null,
      platformUserId: null,
      platformUsername: null,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not yet implemented");
  });

  it("stub publisher validateConnection() returns false", async () => {
    const publisher = getPublisher("pinterest_pin")!;
    const result = await publisher.validateConnection({
      accessToken: "t",
      refreshToken: null,
      platformUserId: null,
      platformUsername: null,
    }, null);
    expect(result).toBe(false);
  });

  it("stub publisher refreshToken() returns null", async () => {
    const publisher = getPublisher("pinterest_pin")!;
    const result = await publisher.refreshToken({
      accessToken: "t",
      refreshToken: null,
      platformUserId: null,
      platformUsername: null,
    }, "pinterest_pin");
    expect(result).toBeNull();
  });
});

// ─── Unknown platform ─────────────────────────────────────────────────────────

describe("unknown platform", () => {
  it("returns undefined for an unknown platform ID", () => {
    const publisher = getPublisher("nonexistent_platform");
    expect(publisher).toBeUndefined();
  });
});

// ─── Publisher interface compliance ───────────────────────────────────────────

describe("all publishers have required methods", () => {
  const allPlatforms = [
    "twitter_single",
    "twitter_thread",
    "linkedin_post",
    "linkedin_article",
    "bluesky_post",
    "instagram_carousel",
    "instagram_caption",
    "pinterest_pin",
    "medium_post",
    "youtube_longform",
    "short_form_video",
    "reddit_post",
    "quora_answer",
  ];

  it.each(allPlatforms)("%s publisher has publish, validateConnection, and refreshToken methods", (platformId) => {
    const publisher = getPublisher(platformId);
    expect(publisher).toBeDefined();
    expect(typeof publisher!.publish).toBe("function");
    expect(typeof publisher!.validateConnection).toBe("function");
    expect(typeof publisher!.refreshToken).toBe("function");
  });
});
