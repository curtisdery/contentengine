/**
 * Publisher interface — abstract base for platform-specific publishing.
 */

export interface PublishResult {
  success: boolean;
  postId: string | null;
  url: string | null;
  error: string | null;
}

export interface PlatformPublisher {
  publish(content: string, metadata: Record<string, unknown>, tokens: DecryptedTokens): Promise<PublishResult>;
  validateConnection(tokens: DecryptedTokens, expiresAt: Date | null): Promise<boolean>;
  refreshToken(tokens: DecryptedTokens, platformId: string): Promise<RefreshedTokens | null>;
}

export interface DecryptedTokens {
  accessToken: string;
  refreshToken: string | null;
  platformUserId: string | null;
  platformUsername: string | null;
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
}
