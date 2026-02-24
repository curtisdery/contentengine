/**
 * YouTube Data API v3 publisher — Shorts and video upload.
 * Uses resumable upload protocol for reliability.
 */

import type { PlatformPublisher, PublishResult, DecryptedTokens, RefreshedTokens } from "./base.js";

const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export class YouTubePublisher implements PlatformPublisher {
  async publish(content: string, metadata: Record<string, unknown>, tokens: DecryptedTokens): Promise<PublishResult> {
    if (!tokens.accessToken) {
      return { success: false, postId: null, url: null, error: "No YouTube access token. Reconnect your account." };
    }

    try {
      const title = (metadata.title as string) || content.substring(0, 100);
      const description = (metadata.description as string) || content;
      const tags = (metadata.tags as string[]) || [];
      const videoUrl = (metadata.video_url as string) || "";

      if (!videoUrl) {
        return {
          success: false,
          postId: null,
          url: null,
          error: "YouTube requires a video_url in metadata to upload.",
        };
      }

      // Download the video content
      const videoResp = await fetch(videoUrl);
      if (!videoResp.ok) {
        throw new Error(`Failed to fetch video from ${videoUrl}: ${videoResp.status}`);
      }
      const videoBuffer = await videoResp.arrayBuffer();

      // Step 1: Initialize resumable upload
      const videoMetadata = {
        snippet: {
          title: title.substring(0, 100),
          description: description.substring(0, 5000),
          tags: tags.slice(0, 30),
          categoryId: "22", // People & Blogs
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
          ...(metadata.is_short ? { shorts: { isShort: true } } : {}),
        },
      };

      const initResp = await fetch(
        `${UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "video/*",
            "X-Upload-Content-Length": String(videoBuffer.byteLength),
          },
          body: JSON.stringify(videoMetadata),
        },
      );

      if (!initResp.ok) {
        const body = await initResp.text();
        throw new Error(`YouTube upload init failed ${initResp.status}: ${body}`);
      }

      const uploadUrl = initResp.headers.get("Location");
      if (!uploadUrl) {
        throw new Error("YouTube did not return a resumable upload URL.");
      }

      // Step 2: Upload the video data
      const uploadResp = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/*",
          "Content-Length": String(videoBuffer.byteLength),
        },
        body: videoBuffer,
      });

      if (!uploadResp.ok) {
        const body = await uploadResp.text();
        throw new Error(`YouTube upload failed ${uploadResp.status}: ${body}`);
      }

      const uploadData = await uploadResp.json() as Record<string, unknown>;
      const videoId = uploadData.id as string;

      return {
        success: true,
        postId: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        error: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, postId: null, url: null, error: `YouTube publish error: ${message}` };
    }
  }

  async validateConnection(_tokens: DecryptedTokens, expiresAt: Date | null): Promise<boolean> {
    if (expiresAt) return expiresAt > new Date();
    return true;
  }

  async refreshToken(tokens: DecryptedTokens): Promise<RefreshedTokens | null> {
    if (!tokens.refreshToken) return null;

    const clientId = process.env.YOUTUBE_CLIENT_ID || "";
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || "";

    if (!clientId || !clientSecret) return null;

    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!resp.ok) return null;

    const data = await resp.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? tokens.refreshToken,
      expiresIn: (data.expires_in as number) ?? 3600,
    };
  }
}
