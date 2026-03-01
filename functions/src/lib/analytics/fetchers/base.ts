/**
 * Shared interface for platform metrics fetchers.
 * Each platform implements fetchMetrics() to retrieve post-level analytics.
 */

export interface PlatformMetrics {
  impressions: number;
  engagements: number;
  saves: number;
  shares: number;
  clicks: number;
  follows: number;
  comments: number;
}

export interface FetchMetricsOptions {
  platformPostId: string;
  accessToken: string;
  platformUserId?: string;
}

export interface MetricsFetcher {
  platformId: string;
  fetchMetrics(options: FetchMetricsOptions): Promise<PlatformMetrics>;
}

/** Empty metrics — used as fallback when API calls fail gracefully. */
export const EMPTY_METRICS: PlatformMetrics = {
  impressions: 0,
  engagements: 0,
  saves: 0,
  shares: 0,
  clicks: 0,
  follows: 0,
  comments: 0,
};

export class PlatformApiError extends Error {
  constructor(
    public readonly platform: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(`[${platform}] ${statusCode}: ${message}`);
    this.name = "PlatformApiError";
  }
}

export class TokenExpiredError extends PlatformApiError {
  constructor(platform: string) {
    super(platform, 401, "Token expired or revoked");
    this.name = "TokenExpiredError";
  }
}

export class PostNotFoundError extends PlatformApiError {
  constructor(platform: string, postId: string) {
    super(platform, 404, `Post ${postId} not found or deleted`);
    this.name = "PostNotFoundError";
  }
}

export class RateLimitError extends PlatformApiError {
  public readonly retryAfterSeconds: number;
  constructor(platform: string, retryAfter: number = 60) {
    super(platform, 429, `Rate limited — retry after ${retryAfter}s`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfter;
  }
}

/**
 * Helper to parse common HTTP error patterns from platform APIs.
 * Throws typed errors for 401, 404, 429; generic PlatformApiError otherwise.
 */
export function handleApiResponse(platform: string, resp: Response, postId: string): never | void {
  if (resp.ok) return;

  if (resp.status === 401 || resp.status === 403) {
    throw new TokenExpiredError(platform);
  }
  if (resp.status === 404) {
    throw new PostNotFoundError(platform, postId);
  }
  if (resp.status === 429) {
    const retryAfter = parseInt(resp.headers.get("retry-after") || "60", 10);
    throw new RateLimitError(platform, retryAfter);
  }

  throw new PlatformApiError(platform, resp.status, `Unexpected error`);
}
