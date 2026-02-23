"use strict";
/**
 * LinkedIn Marketing API publisher — real implementation.
 * Port of apps/api/app/services/publisher.py LinkedInPublisher.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkedInPublisher = void 0;
const env_js_1 = require("../../../config/env.js");
const POSTS_URL = "https://api.linkedin.com/rest/posts";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
class LinkedInPublisher {
    async publish(content, metadata, tokens) {
        const userId = tokens.platformUserId;
        if (!userId) {
            return { success: false, postId: null, url: null, error: "No LinkedIn user ID found. Reconnect your LinkedIn account." };
        }
        const formatType = metadata.format_type || "linkedin_post";
        try {
            if (formatType === "linkedin_article") {
                return await this.publishArticle(content, metadata, tokens.accessToken, userId);
            }
            return await this.publishPost(content, tokens.accessToken, userId);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, postId: null, url: null, error: `LinkedIn publish error: ${message}` };
        }
    }
    async publishPost(content, accessToken, userId) {
        const author = `urn:li:person:${userId}`;
        const payload = {
            author,
            commentary: content,
            visibility: "PUBLIC",
            distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
            lifecycleState: "PUBLISHED",
        };
        const resp = await fetch(POSTS_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0",
                "LinkedIn-Version": "202401",
            },
            body: JSON.stringify(payload),
        });
        if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`LinkedIn API error ${resp.status}: ${body}`);
        }
        const postUrn = resp.headers.get("x-restli-id") || "";
        const url = postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : null;
        return { success: true, postId: postUrn, url, error: null };
    }
    async publishArticle(content, metadata, accessToken, userId) {
        const author = `urn:li:person:${userId}`;
        const title = metadata.title || "";
        const sourceUrl = metadata.source_url || "";
        const payload = {
            author,
            commentary: content,
            visibility: "PUBLIC",
            distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
            lifecycleState: "PUBLISHED",
        };
        if (sourceUrl) {
            payload.content = {
                article: {
                    source: sourceUrl,
                    title: title || "Article",
                    description: content.length > 200 ? content.substring(0, 200) : content,
                },
            };
        }
        const resp = await fetch(POSTS_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0",
                "LinkedIn-Version": "202401",
            },
            body: JSON.stringify(payload),
        });
        if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`LinkedIn API error ${resp.status}: ${body}`);
        }
        const postUrn = resp.headers.get("x-restli-id") || "";
        const url = postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : null;
        return { success: true, postId: postUrn, url, error: null };
    }
    async validateConnection(_tokens, expiresAt) {
        if (expiresAt)
            return expiresAt > new Date();
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
                client_id: env_js_1.LINKEDIN_CLIENT_ID.value(),
                client_secret: env_js_1.LINKEDIN_CLIENT_SECRET.value(),
            }),
        });
        if (!resp.ok)
            return null;
        const data = await resp.json();
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token ?? tokens.refreshToken,
            expiresIn: data.expires_in ?? 5184000,
        };
    }
}
exports.LinkedInPublisher = LinkedInPublisher;
//# sourceMappingURL=linkedin.js.map