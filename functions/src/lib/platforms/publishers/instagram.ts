/**
 * Instagram Graph API publisher — container-based publish flow.
 * Uses Meta Graph API: create container → poll status → publish.
 */

import type { PlatformPublisher, PublishResult, DecryptedTokens, RefreshedTokens } from "./base.js";

const GRAPH_URL = "https://graph.instagram.com/v21.0";
const GRAPH_OAUTH_URL = "https://graph.instagram.com/oauth/access_token";

export class InstagramPublisher implements PlatformPublisher {
  async publish(content: string, metadata: Record<string, unknown>, tokens: DecryptedTokens): Promise<PublishResult> {
    const userId = tokens.platformUserId;
    if (!userId) {
      return { success: false, postId: null, url: null, error: "No Instagram user ID found. Reconnect your account." };
    }

    const formatType = (metadata.format_type as string) || "instagram_caption";

    try {
      if (formatType === "instagram_carousel" && metadata.image_urls) {
        return await this.publishCarousel(content, metadata, tokens.accessToken, userId);
      }
      return await this.publishSingleCaption(content, metadata, tokens.accessToken, userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, postId: null, url: null, error: `Instagram publish error: ${message}` };
    }
  }

  private async publishSingleCaption(
    content: string,
    metadata: Record<string, unknown>,
    accessToken: string,
    userId: string,
  ): Promise<PublishResult> {
    const imageUrl = (metadata.image_url as string) || "";

    // Step 1: Create media container
    const containerParams: Record<string, string> = {
      caption: content,
      access_token: accessToken,
    };

    if (imageUrl) {
      containerParams.image_url = imageUrl;
    } else {
      // Text-only posts require an image on Instagram — return guidance
      return {
        success: false,
        postId: null,
        url: null,
        error: "Instagram requires an image. Attach an image_url in metadata to publish.",
      };
    }

    const createResp = await fetch(`${GRAPH_URL}/${userId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(containerParams),
    });

    if (!createResp.ok) {
      const body = await createResp.text();
      throw new Error(`Container creation failed ${createResp.status}: ${body}`);
    }

    const containerData = await createResp.json() as Record<string, unknown>;
    const containerId = containerData.id as string;

    // Step 2: Wait for container to be ready (poll status)
    await this.waitForContainer(containerId, accessToken);

    // Step 3: Publish the container
    const publishResp = await fetch(`${GRAPH_URL}/${userId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      }),
    });

    if (!publishResp.ok) {
      const body = await publishResp.text();
      throw new Error(`Publish failed ${publishResp.status}: ${body}`);
    }

    const publishData = await publishResp.json() as Record<string, unknown>;
    const postId = publishData.id as string;

    return {
      success: true,
      postId,
      url: `https://www.instagram.com/p/${postId}/`,
      error: null,
    };
  }

  private async publishCarousel(
    content: string,
    metadata: Record<string, unknown>,
    accessToken: string,
    userId: string,
  ): Promise<PublishResult> {
    const imageUrls = (metadata.image_urls as string[]) || [];
    if (imageUrls.length < 2) {
      return this.publishSingleCaption(content, { ...metadata, image_url: imageUrls[0] }, accessToken, userId);
    }

    // Step 1: Create child containers for each image
    const childIds: string[] = [];
    for (const imageUrl of imageUrls.slice(0, 10)) {
      const resp = await fetch(`${GRAPH_URL}/${userId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          image_url: imageUrl,
          is_carousel_item: "true",
          access_token: accessToken,
        }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Carousel child creation failed ${resp.status}: ${body}`);
      }

      const data = await resp.json() as Record<string, unknown>;
      childIds.push(data.id as string);
    }

    // Wait for all children to process
    for (const childId of childIds) {
      await this.waitForContainer(childId, accessToken);
    }

    // Step 2: Create carousel container
    const carouselResp = await fetch(`${GRAPH_URL}/${userId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        caption: content,
        media_type: "CAROUSEL",
        children: childIds.join(","),
        access_token: accessToken,
      }),
    });

    if (!carouselResp.ok) {
      const body = await carouselResp.text();
      throw new Error(`Carousel container creation failed ${carouselResp.status}: ${body}`);
    }

    const carouselData = await carouselResp.json() as Record<string, unknown>;
    const carouselId = carouselData.id as string;

    await this.waitForContainer(carouselId, accessToken);

    // Step 3: Publish carousel
    const publishResp = await fetch(`${GRAPH_URL}/${userId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: carouselId,
        access_token: accessToken,
      }),
    });

    if (!publishResp.ok) {
      const body = await publishResp.text();
      throw new Error(`Carousel publish failed ${publishResp.status}: ${body}`);
    }

    const publishData = await publishResp.json() as Record<string, unknown>;
    const postId = publishData.id as string;

    return {
      success: true,
      postId,
      url: `https://www.instagram.com/p/${postId}/`,
      error: null,
    };
  }

  private async waitForContainer(containerId: string, accessToken: string, maxAttempts = 10): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const resp = await fetch(
        `${GRAPH_URL}/${containerId}?fields=status_code&access_token=${accessToken}`,
      );

      if (resp.ok) {
        const data = await resp.json() as Record<string, unknown>;
        if (data.status_code === "FINISHED") return;
        if (data.status_code === "ERROR") {
          throw new Error("Instagram media container processing failed.");
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("Instagram media container timed out waiting for processing.");
  }

  async validateConnection(_tokens: DecryptedTokens, expiresAt: Date | null): Promise<boolean> {
    if (expiresAt) return expiresAt > new Date();
    return true;
  }

  async refreshToken(tokens: DecryptedTokens): Promise<RefreshedTokens | null> {
    // Instagram long-lived tokens can be refreshed via GET endpoint
    if (!tokens.accessToken) return null;

    const resp = await fetch(
      `${GRAPH_URL}/refresh_access_token?grant_type=ig_refresh_token&access_token=${tokens.accessToken}`,
    );

    if (!resp.ok) return null;

    const data = await resp.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: null,
      expiresIn: (data.expires_in as number) ?? 5184000, // 60 days default
    };
  }
}
