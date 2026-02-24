import { describe, it, expect, vi, beforeEach } from "vitest";
import "../../../helpers/setup.js";
import { TikTokPublisher } from "../../../../lib/platforms/publishers/tiktok.js";
import type { DecryptedTokens } from "../../../../lib/platforms/publishers/base.js";

const publisher = new TikTokPublisher();

const mockTokens: DecryptedTokens = {
  accessToken: "tt_test_token",
  refreshToken: "tt_refresh_token",
  platformUserId: "tt_user_123",
  platformUsername: "testcreator",
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers();
});

import { afterEach } from "vitest";
afterEach(() => {
  vi.useRealTimers();
});

describe("TikTokPublisher", () => {
  it("returns error when no access token", async () => {
    const tokens = { ...mockTokens, accessToken: "" };
    const result = await publisher.publish("Test", {}, tokens);
    expect(result.success).toBe(false);
    expect(result.error).toContain("No TikTok access token");
  });

  it("returns error when no video_url provided", async () => {
    const result = await publisher.publish("Test", {}, mockTokens);
    expect(result.success).toBe(false);
    expect(result.error).toContain("requires a video_url");
  });

  it("publishes video via pull-from-URL flow", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Init upload
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { publish_id: "pub_123" } }), { status: 200 }),
    );
    // Poll status — processing
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { status: "PROCESSING_UPLOAD" } }), { status: 200 }),
    );
    // Poll status — complete
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["video_456"] },
        }),
        { status: 200 },
      ),
    );

    const resultPromise = publisher.publish(
      "My TikTok video",
      { video_url: "https://storage.example.com/video.mp4" },
      mockTokens,
    );

    // Advance past the two 5-second polling delays
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.postId).toBe("video_456");
    expect(result.url).toContain("tiktok.com");
  });

  it("handles init failure", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    const result = await publisher.publish("Test", { video_url: "https://example.com/v.mp4" }, mockTokens);
    expect(result.success).toBe(false);
    expect(result.error).toContain("init failed");
  });

  it("handles publish failure status", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Init upload
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { publish_id: "pub_fail" } }), { status: 200 }),
    );
    // Poll status — failed
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { status: "FAILED", fail_reason: "Video too short" } }),
        { status: 200 },
      ),
    );

    const resultPromise = publisher.publish("Test", { video_url: "https://example.com/v.mp4" }, mockTokens);

    // Advance past the polling delay
    await vi.advanceTimersByTimeAsync(5000);

    const result = await resultPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain("Video too short");
  });

  it("refreshToken calls TikTok token endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.stubEnv("TIKTOK_CLIENT_ID", "tt_client_key");
    vi.stubEnv("TIKTOK_CLIENT_SECRET", "tt_client_secret");

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "new_tt_token", expires_in: 86400 }), { status: 200 }),
    );

    const result = await publisher.refreshToken(mockTokens);
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe("new_tt_token");

    vi.unstubAllEnvs();
  });

  it("refreshToken returns null when no refresh token", async () => {
    const tokens = { ...mockTokens, refreshToken: null };
    const result = await publisher.refreshToken(tokens);
    expect(result).toBeNull();
  });

  it("validateConnection checks expiry date", async () => {
    const future = new Date(Date.now() + 86400000);
    const past = new Date(Date.now() - 86400000);

    expect(await publisher.validateConnection(mockTokens, future)).toBe(true);
    expect(await publisher.validateConnection(mockTokens, past)).toBe(false);
    expect(await publisher.validateConnection(mockTokens, null)).toBe(true);
  });
});
