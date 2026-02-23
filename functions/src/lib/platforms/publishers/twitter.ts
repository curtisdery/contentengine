/**
 * Twitter/X API v2 publisher — real implementation.
 * Port of apps/api/app/services/publisher.py TwitterPublisher.
 */

import type { PlatformPublisher, PublishResult, DecryptedTokens, RefreshedTokens } from "./base.js";
import { TWITTER_CLIENT_ID } from "../../../config/env.js";

const TWEETS_URL = "https://api.twitter.com/2/tweets";
const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";

export class TwitterPublisher implements PlatformPublisher {
  async publish(content: string, metadata: Record<string, unknown>, tokens: DecryptedTokens): Promise<PublishResult> {
    const formatType = (metadata.format_type as string) || "twitter_single";

    try {
      if (formatType === "twitter_thread") {
        return await this.publishThread(content, tokens.accessToken);
      }
      return await this.publishSingle(content, tokens.accessToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, postId: null, url: null, error: `Twitter publish error: ${message}` };
    }
  }

  private async publishSingle(content: string, accessToken: string): Promise<PublishResult> {
    const resp = await fetch(TWEETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: content }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Twitter API error ${resp.status}: ${body}`);
    }

    const data = await resp.json() as Record<string, unknown>;
    const tweetId = (data.data as Record<string, unknown>).id as string;
    return {
      success: true,
      postId: tweetId,
      url: `https://x.com/i/status/${tweetId}`,
      error: null,
    };
  }

  private async publishThread(content: string, accessToken: string): Promise<PublishResult> {
    // Split by numbered markers or --- separators
    const parts = content
      .split(/\n\s*---\s*\n|\n\s*\d+\/\s*\n?/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (parts.length < 2) {
      return await this.publishSingle(content, accessToken);
    }

    let firstTweetId: string | null = null;
    let previousTweetId: string | null = null;

    for (let i = 0; i < parts.length; i++) {
      const payload: Record<string, unknown> = { text: parts[i] };
      if (previousTweetId) {
        payload.reply = { in_reply_to_tweet_id: previousTweetId };
      }

      const resp = await fetch(TWEETS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Twitter API error ${resp.status}: ${body}`);
      }

      const data = await resp.json() as Record<string, unknown>;
      const tweetId = (data.data as Record<string, unknown>).id as string;

      if (i === 0) firstTweetId = tweetId;
      previousTweetId = tweetId;

      // Small delay between thread tweets
      if (i < parts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return {
      success: true,
      postId: firstTweetId,
      url: `https://x.com/i/status/${firstTweetId}`,
      error: null,
    };
  }

  async validateConnection(_tokens: DecryptedTokens, expiresAt: Date | null): Promise<boolean> {
    if (expiresAt) {
      return expiresAt > new Date();
    }
    return true;
  }

  async refreshToken(tokens: DecryptedTokens): Promise<RefreshedTokens | null> {
    if (!tokens.refreshToken) return null;

    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        client_id: TWITTER_CLIENT_ID.value(),
      }),
    });

    if (!resp.ok) return null;

    const data = await resp.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? tokens.refreshToken,
      expiresIn: (data.expires_in as number) ?? 7200,
    };
  }
}
