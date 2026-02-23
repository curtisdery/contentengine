import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, mockCollectionRef, mockDocRef } from "../helpers/setup.js";
import { recalcScores } from "../../scheduled/recalcScores.js";

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: everything returns empty
  mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
  mockCollectionRef.where.mockReturnThis();
  mockCollectionRef.orderBy.mockReturnThis();
  mockCollectionRef.limit.mockReturnThis();

  mockDocRef.get.mockResolvedValue({
    exists: true,
    data: () => ({}),
    id: "mock-doc-id",
    ref: mockDocRef,
  });
});

// ─── recalcScores scheduled function ─────────────────────────────────────────

describe("recalcScores", () => {
  it("queries for all published generated outputs", async () => {
    await (recalcScores as unknown as () => Promise<void>)();

    expect(mockDb.collection).toHaveBeenCalledWith("generatedOutputs");
    expect(mockCollectionRef.where).toHaveBeenCalledWith("status", "==", "published");
  });

  it("returns early when no published outputs exist", async () => {
    mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

    await (recalcScores as unknown as () => Promise<void>)();

    // Should only have called collection once for generatedOutputs query
    expect(mockDb.collection).toHaveBeenCalledWith("generatedOutputs");
    // Should not have tried to query analytics or multiplier scores
    expect(mockDb.collection).not.toHaveBeenCalledWith("analyticsSnapshots");
  });

  it("groups published outputs by contentUploadId", async () => {
    const publishedDocs = [
      { id: "out-1", data: () => ({ contentUploadId: "content-A", status: "published" }) },
      { id: "out-2", data: () => ({ contentUploadId: "content-A", status: "published" }) },
      { id: "out-3", data: () => ({ contentUploadId: "content-B", status: "published" }) },
    ];

    // Track collection calls
    let getCallCount = 0;
    mockCollectionRef.get.mockImplementation(() => {
      getCallCount++;
      if (getCallCount === 1) {
        // First call: published outputs
        return Promise.resolve({ empty: false, docs: publishedDocs, size: 3 });
      }
      // Subsequent calls: analytics snapshots and multiplier scores return empty
      return Promise.resolve({ empty: true, docs: [], size: 0 });
    });

    // Content upload docs
    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ workspaceId: "ws-1" }),
      id: "content-A",
      ref: mockDocRef,
    });

    await (recalcScores as unknown as () => Promise<void>)();

    // Should query analyticsSnapshots for each output
    expect(mockDb.collection).toHaveBeenCalledWith("analyticsSnapshots");
    // Should query contentUploads to get workspaceId
    expect(mockDb.collection).toHaveBeenCalledWith("contentUploads");
  });

  it("calculates multiplier value from analytics data", async () => {
    const publishedDocs = [
      { id: "out-1", data: () => ({ contentUploadId: "content-A", status: "published" }) },
      { id: "out-2", data: () => ({ contentUploadId: "content-A", status: "published" }) },
    ];

    const analyticsDoc1 = {
      id: "snap-1",
      data: () => ({
        generatedOutputId: "out-1",
        platformId: "twitter_single",
        impressions: 1000,
        engagements: 50,
      }),
    };

    const analyticsDoc2 = {
      id: "snap-2",
      data: () => ({
        generatedOutputId: "out-2",
        platformId: "linkedin_post",
        impressions: 500,
        engagements: 30,
      }),
    };

    let getCallCount = 0;
    mockCollectionRef.get.mockImplementation(() => {
      getCallCount++;
      if (getCallCount === 1) {
        // Published outputs
        return Promise.resolve({ empty: false, docs: publishedDocs, size: 2 });
      }
      if (getCallCount === 2) {
        // Analytics for out-1
        return Promise.resolve({ empty: false, docs: [analyticsDoc1], size: 1 });
      }
      if (getCallCount === 3) {
        // Analytics for out-2
        return Promise.resolve({ empty: false, docs: [analyticsDoc2], size: 1 });
      }
      if (getCallCount === 4) {
        // Multiplier scores query (existing score check) - none exists
        return Promise.resolve({ empty: true, docs: [], size: 0 });
      }
      return Promise.resolve({ empty: true, docs: [], size: 0 });
    });

    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ workspaceId: "ws-1" }),
      id: "content-A",
      ref: mockDocRef,
    });

    await (recalcScores as unknown as () => Promise<void>)();

    // Should create a new multiplier score document
    expect(mockDb.collection).toHaveBeenCalledWith("multiplierScores");
    expect(mockCollectionRef.add).toHaveBeenCalledWith(
      expect.objectContaining({
        contentUploadId: "content-A",
        workspaceId: "ws-1",
        totalReach: 1500,       // 1000 + 500
        totalEngagements: 80,    // 50 + 30
        platformsPublished: 2,
        // multiplierValue = totalReach / bestPlatformReach = 1500 / 1000 = 1.5
        multiplierValue: 1.5,
      }),
    );
  });

  it("updates existing multiplier score doc instead of creating new one", async () => {
    const publishedDocs = [
      { id: "out-1", data: () => ({ contentUploadId: "content-A", status: "published" }) },
    ];

    const analyticsDoc = {
      id: "snap-1",
      data: () => ({
        generatedOutputId: "out-1",
        platformId: "twitter_single",
        impressions: 2000,
        engagements: 100,
      }),
    };

    const existingScoreDoc = {
      id: "score-1",
      ref: mockDocRef,
      data: () => ({ multiplierValue: 1.0 }),
    };

    let getCallCount = 0;
    mockCollectionRef.get.mockImplementation(() => {
      getCallCount++;
      if (getCallCount === 1) {
        // Published outputs
        return Promise.resolve({ empty: false, docs: publishedDocs, size: 1 });
      }
      if (getCallCount === 2) {
        // Analytics snapshot
        return Promise.resolve({ empty: false, docs: [analyticsDoc], size: 1 });
      }
      if (getCallCount === 3) {
        // Existing multiplier score
        return Promise.resolve({ empty: false, docs: [existingScoreDoc], size: 1 });
      }
      return Promise.resolve({ empty: true, docs: [], size: 0 });
    });

    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ workspaceId: "ws-1" }),
      id: "content-A",
      ref: mockDocRef,
    });

    await (recalcScores as unknown as () => Promise<void>)();

    // Should update existing doc, not add new one
    expect(mockDocRef.update).toHaveBeenCalledWith(
      expect.objectContaining({
        contentUploadId: "content-A",
        workspaceId: "ws-1",
      }),
    );
  });

  it("skips content upload if it no longer exists", async () => {
    const publishedDocs = [
      { id: "out-1", data: () => ({ contentUploadId: "deleted-content", status: "published" }) },
    ];

    let getCallCount = 0;
    mockCollectionRef.get.mockImplementation(() => {
      getCallCount++;
      if (getCallCount === 1) {
        return Promise.resolve({ empty: false, docs: publishedDocs, size: 1 });
      }
      return Promise.resolve({ empty: true, docs: [], size: 0 });
    });

    // Content upload doesn't exist
    mockDocRef.get.mockResolvedValue({
      exists: false,
      data: () => null,
      id: "deleted-content",
      ref: mockDocRef,
    });

    // Should not throw
    await (recalcScores as unknown as () => Promise<void>)();

    // Should not have created a multiplier score
    expect(mockCollectionRef.add).not.toHaveBeenCalled();
  });
});
