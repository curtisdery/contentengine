import { describe, it, expect, vi, beforeEach } from "vitest";
import "../../../helpers/setup.js";
import { InstagramPublisher } from "../../../../lib/platforms/publishers/instagram.js";
import type { DecryptedTokens } from "../../../../lib/platforms/publishers/base.js";

const publisher = new InstagramPublisher();

const mockTokens: DecryptedTokens = {
  accessToken: "ig_test_token",
  refreshToken: null,
  platformUserId: "12345",
  platformUsername: "testuser",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("InstagramPublisher", () => {
  it("returns error when no user ID is provided", async () => {
    const tokens = { ...mockTokens, platformUserId: null };
    const result = await publisher.publish("Hello Instagram!", {}, tokens);
    expect(result.success).toBe(false);
    expect(result.error).toContain("No Instagram user ID");
  });

  it("returns error when no image_url is provided for single caption", async () => {
    const result = await publisher.publish("Hello!", { format_type: "instagram_caption" }, mockTokens);
    expect(result.success).toBe(false);
    expect(result.error).toContain("requires an image");
  });

  it("publishes single image successfully", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Container creation
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ id: "container_123" }), { status: 200 }));
    // Container status poll
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 }));
    // Publish
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ id: "post_456" }), { status: 200 }));

    const result = await publisher.publish("Caption here", { image_url: "https://example.com/img.jpg" }, mockTokens);
    expect(result.success).toBe(true);
    expect(result.postId).toBe("post_456");
    expect(result.url).toContain("instagram.com");
  });

  it("handles container creation failure", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("Bad Request", { status: 400 }));

    const result = await publisher.publish("Caption", { image_url: "https://example.com/img.jpg" }, mockTokens);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Container creation failed");
  });

  it("handles carousel with multiple images", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Two child container creations
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ id: "child_1" }), { status: 200 }));
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ id: "child_2" }), { status: 200 }));
    // Poll for child 1
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 }));
    // Poll for child 2
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 }));
    // Carousel container creation
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ id: "carousel_1" }), { status: 200 }));
    // Carousel status poll
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 }));
    // Carousel publish
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ id: "post_carousel" }), { status: 200 }));

    const result = await publisher.publish(
      "Carousel caption",
      { format_type: "instagram_carousel", image_urls: ["https://example.com/1.jpg", "https://example.com/2.jpg"] },
      mockTokens,
    );
    expect(result.success).toBe(true);
    expect(result.postId).toBe("post_carousel");
  });

  it("refreshToken calls Instagram refresh endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "new_token", expires_in: 5184000 }), { status: 200 }),
    );

    const result = await publisher.refreshToken(mockTokens);
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe("new_token");
    expect(result!.expiresIn).toBe(5184000);
  });

  it("refreshToken returns null on failure", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    const result = await publisher.refreshToken(mockTokens);
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
