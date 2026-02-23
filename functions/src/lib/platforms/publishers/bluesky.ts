/**
 * Bluesky AT Protocol publisher — real implementation.
 * Port of apps/api/app/services/publisher.py BlueskyPublisher.
 */

import type { PlatformPublisher, PublishResult, DecryptedTokens, RefreshedTokens } from "./base.js";

const PDS_URL = "https://bsky.social/xrpc";

export class BlueskyPublisher implements PlatformPublisher {
  async publish(content: string, _metadata: Record<string, unknown>, tokens: DecryptedTokens): Promise<PublishResult> {
    const appPassword = tokens.accessToken;
    const handle = tokens.platformUsername;
    const did = tokens.platformUserId;

    if (!appPassword || (!handle && !did)) {
      return { success: false, postId: null, url: null, error: "Missing Bluesky credentials. Reconnect your account." };
    }

    try {
      const session = await this.createSession(handle || did || "", appPassword);
      if (!session) {
        return { success: false, postId: null, url: null, error: "Failed to authenticate with Bluesky. Check your app password." };
      }

      const facets = this.parseFacets(content);
      const now = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");

      const record: Record<string, unknown> = { text: content, createdAt: now };
      if (facets.length > 0) record.facets = facets;

      const resp = await fetch(`${PDS_URL}/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: session.did,
          collection: "app.bsky.feed.post",
          record,
        }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Bluesky API error ${resp.status}: ${body}`);
      }

      const data = await resp.json() as Record<string, unknown>;
      const uri = (data.uri as string) || "";
      const rkey = uri.split("/").pop() || "";
      const bskyUrl = rkey ? `https://bsky.app/profile/${handle || session.did}/post/${rkey}` : null;

      return { success: true, postId: uri, url: bskyUrl, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, postId: null, url: null, error: `Bluesky publish error: ${message}` };
    }
  }

  private async createSession(identifier: string, password: string): Promise<{ accessJwt: string; did: string } | null> {
    const resp = await fetch(`${PDS_URL}/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });

    if (resp.status !== 200) return null;
    return resp.json() as Promise<{ accessJwt: string; did: string }>;
  }

  private parseFacets(text: string): Array<Record<string, unknown>> {
    const facets: Array<Record<string, unknown>> = [];
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(text);

    // URLs
    const urlRegex = /https?:\/\/[^\s)\]]+/g;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      let url = match[0];
      while (url.length > 0 && ".,;:!?)".includes(url[url.length - 1])) {
        url = url.slice(0, -1);
      }
      const startBytes = encoder.encode(text.substring(0, match.index)).length;
      const endBytes = startBytes + encoder.encode(url).length;
      facets.push({
        index: { byteStart: startBytes, byteEnd: endBytes },
        features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
      });
    }

    // Mentions (@handle.bsky.social)
    const mentionRegex = /@([\w.-]+\.[\w.-]+)/g;
    while ((match = mentionRegex.exec(text)) !== null) {
      const mentionText = match[0];
      const startBytes = encoder.encode(text.substring(0, match.index)).length;
      const endBytes = startBytes + encoder.encode(mentionText).length;
      facets.push({
        index: { byteStart: startBytes, byteEnd: endBytes },
        features: [{ $type: "app.bsky.richtext.facet#mention", did: match[1] }],
      });
    }

    // Hashtags
    const hashtagRegex = /#(\w+)/g;
    while ((match = hashtagRegex.exec(text)) !== null) {
      const tag = match[0];
      const startBytes = encoder.encode(text.substring(0, match.index)).length;
      const endBytes = startBytes + encoder.encode(tag).length;
      facets.push({
        index: { byteStart: startBytes, byteEnd: endBytes },
        features: [{ $type: "app.bsky.richtext.facet#tag", tag: match[1] }],
      });
    }

    return facets;
  }

  async validateConnection(tokens: DecryptedTokens): Promise<boolean> {
    return !!(tokens.accessToken && (tokens.platformUsername || tokens.platformUserId));
  }

  async refreshToken(): Promise<RefreshedTokens | null> {
    // Bluesky uses app passwords — no refresh needed
    return null;
  }
}
