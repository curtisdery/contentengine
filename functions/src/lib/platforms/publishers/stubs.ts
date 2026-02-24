/**
 * Stub publishers for platforms not yet fully implemented.
 * Each returns a helpful "not yet implemented" message.
 */

import type { PlatformPublisher, PublishResult, DecryptedTokens, RefreshedTokens } from "./base.js";

function stubPublisher(platformName: string): PlatformPublisher {
  return {
    async publish(): Promise<PublishResult> {
      return {
        success: false,
        postId: null,
        url: null,
        error: `${platformName} publishing not yet implemented. Copy content from dashboard.`,
      };
    },
    async validateConnection(): Promise<boolean> {
      return false;
    },
    async refreshToken(): Promise<RefreshedTokens | null> {
      return null;
    },
  };
}

export const PinterestPublisher = stubPublisher("Pinterest");
export const RedditPublisher = stubPublisher("Reddit");
export const MediumPublisher = stubPublisher("Medium");
export const QuoraPublisher = stubPublisher("Quora");
