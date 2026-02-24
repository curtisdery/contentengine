import { describe, it, expect, vi, beforeEach } from "vitest";
import "../../../helpers/setup.js";
import { YouTubePublisher } from "../../../../lib/platforms/publishers/youtube.js";
import type { DecryptedTokens } from "../../../../lib/platforms/publishers/base.js";

const publisher = new YouTubePublisher();

const mockTokens: DecryptedTokens = {
  accessToken: "yt_test_token",
  refreshToken: "yt_refresh_token",
  platformUserId: "UC12345",
  platformUsername: "TestChannel",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("YouTubePublisher", () => {
  it("returns error when no access token", async () => {
    const tokens = { ...mockTokens, accessToken: "" };
    const result = await publisher.publish("Test video", {}, tokens);
    expect(result.success).toBe(false);
    expect(result.error).toContain("No YouTube access token");
  });

  it("returns error when no video_url provided", async () => {
    const result = await publisher.publish("Test video", {}, mockTokens);
    expect(result.success).toBe(false);
    expect(result.error).toContain("requires a video_url");
  });

  it("publishes video via resumable upload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Fetch video from URL
    fetchSpy.mockResolvedValueOnce(new Response(new ArrayBuffer(1024), { status: 200 }));
    // Init resumable upload
    fetchSpy.mockResolvedValueOnce(
      new Response("", {
        status: 200,
        headers: { Location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=xyz" },
      }),
    );
    // Upload video data
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "VIDEO_ID_123" }), { status: 200 }),
    );

    const result = await publisher.publish(
      "My Test Video",
      { video_url: "https://storage.example.com/video.mp4", title: "My Video", tags: ["test"] },
      mockTokens,
    );

    expect(result.success).toBe(true);
    expect(result.postId).toBe("VIDEO_ID_123");
    expect(result.url).toBe("https://www.youtube.com/watch?v=VIDEO_ID_123");
  });

  it("handles video fetch failure", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    const result = await publisher.publish("Video", { video_url: "https://bad-url.com/video.mp4" }, mockTokens);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to fetch video");
  });

  it("handles upload init failure", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response(new ArrayBuffer(100), { status: 200 }));
    fetchSpy.mockResolvedValueOnce(new Response("Quota exceeded", { status: 403 }));

    const result = await publisher.publish("Video", { video_url: "https://example.com/v.mp4" }, mockTokens);
    expect(result.success).toBe(false);
    expect(result.error).toContain("upload init failed");
  });

  it("refreshToken calls Google OAuth token endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.stubEnv("YOUTUBE_CLIENT_ID", "yt_client_id");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "yt_client_secret");

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "new_yt_token", expires_in: 3600 }), { status: 200 }),
    );

    const result = await publisher.refreshToken(mockTokens);
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe("new_yt_token");

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
