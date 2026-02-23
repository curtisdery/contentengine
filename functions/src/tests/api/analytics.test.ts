/**
 * Tests for Analytics API — getOverview, getContentAnalytics, getPlatformAnalytics, getHeatmap, getAudienceIntelligence.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, mockCollectionRef, mockDocRef } from "../helpers/setup.js";

vi.mock("../../middleware/auth.js", () => ({
  verifyAuth: vi.fn().mockResolvedValue({
    uid: "test-uid",
    email: "test@example.com",
    userId: "user-123",
    workspaceId: "ws-123",
    organizationId: "org-123",
    role: "admin",
  }),
}));

vi.mock("../../middleware/rbac.js", () => ({
  assertRole: vi.fn(),
}));

vi.mock("../../middleware/validate.js", () => ({
  validate: vi.fn((_schema: unknown, data: unknown) => data),
}));

vi.mock("../../shared/collections.js", () => ({
  Collections: {
    CONTENT_UPLOADS: "contentUploads",
    GENERATED_OUTPUTS: "generatedOutputs",
    PLATFORM_CONNECTIONS: "platformConnections",
    ANALYTICS_SNAPSHOTS: "analyticsSnapshots",
    MULTIPLIER_SCORES: "multiplierScores",
  },
}));

vi.mock("../../lib/platforms/profiles.js", () => ({
  PLATFORMS: {
    twitter: { name: "Twitter / X", platformId: "twitter" },
    linkedin: { name: "LinkedIn", platformId: "linkedin" },
    instagram: { name: "Instagram", platformId: "instagram" },
  },
}));

import { getOverview, getContentAnalytics, getPlatformAnalytics, getHeatmap, getAudienceIntelligence } from "../../api/analytics.js";
import { verifyAuth } from "../../middleware/auth.js";

function mockRequest(data: Record<string, unknown> = {}) {
  return { auth: { uid: "test-uid", token: { email: "test@example.com" } }, data } as unknown;
}

describe("Analytics API", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
    mockCollectionRef.where.mockReturnValue(mockCollectionRef);
    mockCollectionRef.limit.mockReturnValue(mockCollectionRef);
    mockCollectionRef.orderBy.mockReturnValue(mockCollectionRef);
    mockCollectionRef.doc.mockReturnValue(mockDocRef);
    mockCollectionRef.count.mockReturnValue({
      get: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
    });
    mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({}), id: "mock-doc-id", ref: mockDocRef });
    mockDb.collection.mockReturnValue(mockCollectionRef);
  });

  // ─── getOverview ──────────────────────────────────────────────────────────

  describe("getOverview", () => {
    it("returns dashboard stats with content counts and analytics", async () => {
      // count() queries return different values
      let countCallNum = 0;
      mockCollectionRef.count.mockImplementation(() => ({
        get: vi.fn().mockImplementation(() => {
          countCallNum++;
          if (countCallNum === 1) return Promise.resolve({ data: () => ({ count: 10 }) }); // content uploads
          if (countCallNum === 2) return Promise.resolve({ data: () => ({ count: 50 }) }); // generated outputs
          if (countCallNum === 3) return Promise.resolve({ data: () => ({ count: 25 }) }); // published
          return Promise.resolve({ data: () => ({ count: 0 }) });
        }),
      }));

      // Active connections
      let getCallNum = 0;
      mockCollectionRef.get.mockImplementation(() => {
        getCallNum++;
        if (getCallNum === 1) {
          // Platform connections
          return Promise.resolve({
            empty: false,
            docs: [
              { id: "conn-1", data: () => ({ platformId: "twitter" }) },
              { id: "conn-2", data: () => ({ platformId: "linkedin" }) },
            ],
            size: 2,
          });
        }
        if (getCallNum === 2) {
          // Analytics snapshots
          return Promise.resolve({
            empty: false,
            docs: [
              { id: "snap-1", data: () => ({ impressions: 1000, engagements: 50 }) },
              { id: "snap-2", data: () => ({ impressions: 2000, engagements: 100 }) },
            ],
            size: 2,
          });
        }
        if (getCallNum === 3) {
          // Multiplier scores
          return Promise.resolve({
            empty: false,
            docs: [
              { id: "score-1", data: () => ({ multiplierValue: 3.5, contentUploadId: "c1", totalReach: 5000 }) },
              { id: "score-2", data: () => ({ multiplierValue: 2.0, contentUploadId: "c2", totalReach: 3000 }) },
            ],
            size: 2,
          });
        }
        return Promise.resolve({ empty: true, docs: [], size: 0 });
      });

      // Content title lookups for top performing
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ title: "Test Content" }),
        id: "c1",
        ref: mockDocRef,
      });

      const request = mockRequest({ days: 30 });
      const result = await (getOverview as Function)(request);

      expect(verifyAuth).toHaveBeenCalled();
      expect(result.total_content_pieces).toBeDefined();
      expect(result.total_outputs_generated).toBeDefined();
      expect(result.total_published).toBeDefined();
      expect(result.total_reach).toBe(3000);
      expect(result.total_engagements).toBe(150);
      expect(result.platforms_active).toBe(2);
      expect(result.avg_multiplier_score).toBeDefined();
      expect(result.best_multiplier_score).toBeDefined();
      expect(result.top_performing_content).toBeDefined();
    });
  });

  // ─── getContentAnalytics ──────────────────────────────────────────────────

  describe("getContentAnalytics", () => {
    it("returns content-specific analytics with multiplier score and outputs", async () => {
      // Content doc lookup
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ workspaceId: "ws-123", title: "My Podcast Episode" }),
        id: "content-1",
        ref: mockDocRef,
      });

      let getCallNum = 0;
      mockCollectionRef.get.mockImplementation(() => {
        getCallNum++;
        if (getCallNum === 1) {
          // Multiplier score
          return Promise.resolve({
            empty: false,
            docs: [{ id: "score-1", data: () => ({ multiplierValue: 4.2, contentUploadId: "content-1" }) }],
            size: 1,
          });
        }
        if (getCallNum === 2) {
          // Outputs for this content
          return Promise.resolve({
            empty: false,
            docs: [
              { id: "out-1", data: () => ({ platformId: "twitter", formatName: "Thread", status: "published", voiceMatchScore: 0.92 }) },
              { id: "out-2", data: () => ({ platformId: "linkedin", formatName: "Post", status: "approved", voiceMatchScore: 0.88 }) },
            ],
            size: 2,
          });
        }
        return Promise.resolve({ empty: true, docs: [], size: 0 });
      });

      const request = mockRequest({ content_id: "content-1" });
      const result = await (getContentAnalytics as Function)(request);

      expect(result.content_id).toBe("content-1");
      expect(result.multiplier_score).toBeDefined();
      expect(result.outputs).toBeDefined();
      expect(result.outputs.length).toBe(2);
    });

    it("throws NotFoundError when content does not exist", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: false,
        data: () => null,
        id: "nonexistent",
        ref: mockDocRef,
      });

      const request = mockRequest({ content_id: "nonexistent" });
      await expect((getContentAnalytics as Function)(request)).rejects.toThrow();
    });
  });

  // ─── getPlatformAnalytics ─────────────────────────────────────────────────

  describe("getPlatformAnalytics", () => {
    it("groups analytics data by platform", async () => {
      mockCollectionRef.get.mockResolvedValue({
        empty: false,
        docs: [
          { id: "snap-1", data: () => ({ platformId: "twitter", impressions: 5000, engagements: 250, saves: 10, shares: 30, clicks: 100, follows: 5 }) },
          { id: "snap-2", data: () => ({ platformId: "twitter", impressions: 3000, engagements: 150, saves: 5, shares: 20, clicks: 80, follows: 3 }) },
          { id: "snap-3", data: () => ({ platformId: "linkedin", impressions: 2000, engagements: 200, saves: 15, shares: 10, clicks: 50, follows: 10 }) },
        ],
        size: 3,
      });

      const request = mockRequest({ days: 30 });
      const result = await (getPlatformAnalytics as Function)(request);

      expect(result.platforms).toBeDefined();
      expect(result.platforms.length).toBe(2);

      const twitterPlatform = result.platforms.find((p: Record<string, unknown>) => p.platform_id === "twitter");
      expect(twitterPlatform).toBeDefined();
      expect(twitterPlatform.total_impressions).toBe(8000);
      expect(twitterPlatform.total_engagements).toBe(400);
      expect(twitterPlatform.platform_name).toBe("Twitter / X");

      const linkedinPlatform = result.platforms.find((p: Record<string, unknown>) => p.platform_id === "linkedin");
      expect(linkedinPlatform).toBeDefined();
      expect(linkedinPlatform.total_impressions).toBe(2000);
    });
  });

  // ─── getHeatmap ───────────────────────────────────────────────────────────

  describe("getHeatmap", () => {
    it("returns day/hour engagement data grouped as a heatmap", async () => {
      const mondayAt10 = new Date("2026-02-23T10:00:00Z"); // Monday
      const mondayAt14 = new Date("2026-02-23T14:00:00Z");
      const tuesdayAt10 = new Date("2026-02-24T10:00:00Z"); // Tuesday

      mockCollectionRef.get.mockResolvedValue({
        empty: false,
        docs: [
          { id: "s1", data: () => ({ snapshotTime: { toDate: () => mondayAt10, seconds: 1000, nanoseconds: 0 }, engagements: 100, impressions: 1000 }) },
          { id: "s2", data: () => ({ snapshotTime: { toDate: () => mondayAt14, seconds: 2000, nanoseconds: 0 }, engagements: 50, impressions: 500 }) },
          { id: "s3", data: () => ({ snapshotTime: { toDate: () => tuesdayAt10, seconds: 3000, nanoseconds: 0 }, engagements: 75, impressions: 750 }) },
        ],
        size: 3,
      });

      const request = mockRequest({ days: 30 });
      const result = await (getHeatmap as Function)(request);

      expect(result.heatmap).toBeDefined();
      expect(result.heatmap.length).toBeGreaterThan(0);

      for (const entry of result.heatmap) {
        expect(entry).toHaveProperty("day_of_week");
        expect(entry).toHaveProperty("hour");
        expect(entry).toHaveProperty("avg_engagement_rate");
        expect(entry).toHaveProperty("post_count");
        expect(entry.day_of_week).toBeGreaterThanOrEqual(0);
        expect(entry.day_of_week).toBeLessThanOrEqual(6);
        expect(entry.hour).toBeGreaterThanOrEqual(0);
        expect(entry.hour).toBeLessThanOrEqual(23);
      }
    });
  });

  // ─── getAudienceIntelligence ──────────────────────────────────────────────

  describe("getAudienceIntelligence", () => {
    it("returns platform rankings based on active connections", async () => {
      mockCollectionRef.get.mockResolvedValue({
        empty: false,
        docs: [
          { id: "conn-1", data: () => ({ platformId: "twitter", isActive: true }) },
          { id: "conn-2", data: () => ({ platformId: "instagram", isActive: true }) },
        ],
        size: 2,
      });

      const request = mockRequest({});
      const result = await (getAudienceIntelligence as Function)(request);

      expect(result.platform_rankings).toBeDefined();
      expect(result.platform_rankings.length).toBe(2);
      expect(result.fastest_growing_platform).toBeDefined();
      expect(result.best_engagement_platform).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it("returns null for fastest/best platform when no connections exist", async () => {
      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

      const request = mockRequest({});
      const result = await (getAudienceIntelligence as Function)(request);

      expect(result.platform_rankings).toEqual([]);
      expect(result.fastest_growing_platform).toBeNull();
      expect(result.best_engagement_platform).toBeNull();
    });
  });
});
