"use strict";
/**
 * Twitter/X API v2 publisher — real implementation.
 * Port of apps/api/app/services/publisher.py TwitterPublisher.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitterPublisher = void 0;
const env_js_1 = require("../../../config/env.js");
const TWEETS_URL = "https://api.twitter.com/2/tweets";
const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
class TwitterPublisher {
    async publish(content, metadata, tokens) {
        const formatType = metadata.format_type || "twitter_single";
        try {
            if (formatType === "twitter_thread") {
                return await this.publishThread(content, tokens.accessToken);
            }
            return await this.publishSingle(content, tokens.accessToken);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, postId: null, url: null, error: `Twitter publish error: ${message}` };
        }
    }
    async publishSingle(content, accessToken) {
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
        const data = await resp.json();
        const tweetId = data.data.id;
        return {
            success: true,
            postId: tweetId,
            url: `https://x.com/i/status/${tweetId}`,
            error: null,
        };
    }
    async publishThread(content, accessToken) {
        // Split by numbered markers or --- separators
        const parts = content
            .split(/\n\s*---\s*\n|\n\s*\d+\/\s*\n?/)
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
        if (parts.length < 2) {
            return await this.publishSingle(content, accessToken);
        }
        let firstTweetId = null;
        let previousTweetId = null;
        for (let i = 0; i < parts.length; i++) {
            const payload = { text: parts[i] };
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
            const data = await resp.json();
            const tweetId = data.data.id;
            if (i === 0)
                firstTweetId = tweetId;
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
    async validateConnection(_tokens, expiresAt) {
        if (expiresAt) {
            return expiresAt > new Date();
        }
        return true;
    }
    async refreshToken(tokens) {
        if (!tokens.refreshToken)
            return null;
        const resp = await fetch(TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: tokens.refreshToken,
                client_id: env_js_1.TWITTER_CLIENT_ID.value(),
            }),
        });
        if (!resp.ok)
            return null;
        const data = await resp.json();
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token ?? tokens.refreshToken,
            expiresIn: data.expires_in ?? 7200,
        };
    }
}
exports.TwitterPublisher = TwitterPublisher;
//# sourceMappingURL=twitter.js.map