/**
 * TikTok Content Posting API publisher.
 * Uses the two-step flow: init upload → upload video → publish.
 */

import type { PlatformPublisher, PublishResult, DecryptedTokens, RefreshedTokens } from "./base.js";

const TIKTOK_API = "https://open.tiktokapis.com/v2";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

export class TikTokPublisher implements PlatformPublisher {
  async publish(content: string, metadata: Record<string, unknown>, tokens: DecryptedTokens): Promise<PublishResult> {
    if (!tokens.accessToken) {
      return { success: false, postId: null, url: null, error: "No TikTok access token. Reconnect your account." };
    }

    const videoUrl = (metadata.video_url as string) || "";
    if (!videoUrl) {
      return {
        success: false,
        postId: null,
        url: null,
        error: "TikTok requires a video_url in metadata to upload.",
      };
    }

    try {
      // Step 1: Initialize upload with pull-from-URL
      const title = content.substring(0, 150);

      const initResp = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: {
            title,
            privacy_level: "PUBLIC_TO_EVERYONE",
            disable_duet: false,
            disable_stitch: false,
            disable_comment: false,
          },
          source_info: {
            source: "PULL_FROM_URL",
            video_url: videoUrl,
          },
        }),
      });

      if (!initResp.ok) {
        const body = await initResp.text();
        throw new Error(`TikTok init failed ${initResp.status}: ${body}`);
      }

      const initData = await initResp.json() as Record<string, unknown>;
      const dataObj = initData.data as Record<string, unknown> | undefined;
      const publishId = dataObj?.publish_id as string;

      if (!publishId) {
        throw new Error("TikTok did not return a publish_id.");
      }

      // Step 2: Poll publish status
      const result = await this.pollPublishStatus(publishId, tokens.accessToken);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, postId: null, url: null, error: `TikTok publish error: ${message}` };
    }
  }

  private async pollPublishStatus(publishId: string, accessToken: string, maxAttempts = 15): Promise<PublishResult> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const resp = await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ publish_id: publishId }),
      });

      if (!resp.ok) continue;

      const data = await resp.json() as Record<string, unknown>;
      const statusData = data.data as Record<string, unknown> | undefined;
      const status = statusData?.status as string;

      if (status === "PUBLISH_COMPLETE") {
        const publicVideoId = statusData?.publicaly_available_post_id as string[] | undefined;
        const videoId = publicVideoId?.[0] || publishId;
        return {
          success: true,
          postId: videoId,
          url: `https://www.tiktok.com/@/video/${videoId}`,
          error: null,
        };
      }

      if (status === "FAILED") {
        const failReason = statusData?.fail_reason as string || "Unknown error";
        return {
          success: false,
          postId: null,
          url: null,
          error: `TikTok publish failed: ${failReason}`,
        };
      }
      // PROCESSING_UPLOAD or PROCESSING_DOWNLOAD — continue polling
    }

    return {
      success: false,
      postId: null,
      url: null,
      error: "TikTok publish timed out. The video may still be processing.",
    };
  }

  async validateConnection(_tokens: DecryptedTokens, expiresAt: Date | null): Promise<boolean> {
    if (expiresAt) return expiresAt > new Date();
    return true;
  }

  async refreshToken(tokens: DecryptedTokens): Promise<RefreshedTokens | null> {
    if (!tokens.refreshToken) return null;

    const clientKey = process.env.TIKTOK_CLIENT_ID || "";
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET || "";

    if (!clientKey || !clientSecret) return null;

    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        client_key: clientKey,
        client_secret: clientSecret,
      }),
    });

    if (!resp.ok) return null;

    const data = await resp.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? tokens.refreshToken,
      expiresIn: (data.expires_in as number) ?? 86400,
    };
  }
}
