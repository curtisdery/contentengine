import { describe, it, expect, vi, beforeEach } from "vitest";
import "../helpers/setup.js";

// Mock @google-cloud/bigquery before importing the trigger
const mockInsert = vi.fn().mockResolvedValue(undefined);
const mockTable = vi.fn().mockReturnValue({ insert: mockInsert });
const mockDataset = vi.fn().mockReturnValue({ table: mockTable });

vi.mock("@google-cloud/bigquery", () => ({
  BigQuery: vi.fn().mockImplementation(() => ({
    dataset: mockDataset,
  })),
}));

import { streamToBigQuery } from "../../triggers/bigquery.js";

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockResolvedValue(undefined);
});

// ─── streamToBigQuery trigger ─────────────────────────────────────────────────

describe("streamToBigQuery", () => {
  it("streams document data to BigQuery on creation", async () => {
    const snapshotData = {
      workspaceId: "ws-1",
      generatedOutputId: "out-1",
      platformId: "twitter_single",
      snapshotTime: { toDate: () => new Date("2025-06-15T10:00:00Z") },
      impressions: 5000,
      engagements: 250,
      saves: 30,
      shares: 15,
      clicks: 80,
      follows: 5,
      comments: 20,
    };

    const event = {
      data: {
        data: () => snapshotData,
      },
      params: { docId: "snap-123" },
    };

    // The onDocumentCreated mock unwraps to just the handler function
    await (streamToBigQuery as unknown as (event: unknown) => Promise<void>)(event);

    expect(mockDataset).toHaveBeenCalledWith("pandocast_analytics");
    expect(mockTable).toHaveBeenCalledWith("snapshots");
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        workspace_id: "ws-1",
        generated_output_id: "out-1",
        platform_id: "twitter_single",
        snapshot_time: "2025-06-15T10:00:00.000Z",
        impressions: 5000,
        engagements: 250,
        saves: 30,
        shares: 15,
        clicks: 80,
        follows: 5,
        comments: 20,
      }),
    ]);
  });

  it("handles missing data gracefully (event.data is undefined)", async () => {
    const event = {
      data: undefined,
      params: { docId: "snap-missing" },
    };

    // Should not throw when data is missing
    await (streamToBigQuery as unknown as (event: unknown) => Promise<void>)(event);

    // Should not attempt BigQuery insertion
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("handles missing data gracefully (data() returns undefined)", async () => {
    const event = {
      data: {
        data: () => undefined,
      },
      params: { docId: "snap-empty" },
    };

    await (streamToBigQuery as unknown as (event: unknown) => Promise<void>)(event);

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("maps Firestore fields to BigQuery column names correctly", async () => {
    const snapshotData = {
      workspaceId: "ws-42",
      generatedOutputId: "gen-99",
      platformId: "linkedin_post",
      snapshotTime: { toDate: () => new Date("2025-01-01T00:00:00Z") },
      impressions: 100,
      engagements: 10,
      saves: 1,
      shares: 2,
      clicks: 3,
      follows: 0,
      comments: 4,
    };

    const event = {
      data: { data: () => snapshotData },
      params: { docId: "snap-456" },
    };

    await (streamToBigQuery as unknown as (event: unknown) => Promise<void>)(event);

    const insertedRow = mockInsert.mock.calls[0][0][0];
    // Verify snake_case field mapping
    expect(insertedRow).toHaveProperty("workspace_id", "ws-42");
    expect(insertedRow).toHaveProperty("generated_output_id", "gen-99");
    expect(insertedRow).toHaveProperty("platform_id", "linkedin_post");
    expect(insertedRow).toHaveProperty("snapshot_time");
    expect(insertedRow).toHaveProperty("impressions", 100);
    expect(insertedRow).toHaveProperty("engagements", 10);
    expect(insertedRow).toHaveProperty("saves", 1);
    expect(insertedRow).toHaveProperty("shares", 2);
    expect(insertedRow).toHaveProperty("clicks", 3);
    expect(insertedRow).toHaveProperty("follows", 0);
    expect(insertedRow).toHaveProperty("comments", 4);
  });

  it("defaults missing numeric fields to 0", async () => {
    const snapshotData = {
      workspaceId: "ws-1",
      generatedOutputId: "out-1",
      platformId: "bluesky_post",
      snapshotTime: { toDate: () => new Date() },
      // All numeric fields missing
    };

    const event = {
      data: { data: () => snapshotData },
      params: { docId: "snap-sparse" },
    };

    await (streamToBigQuery as unknown as (event: unknown) => Promise<void>)(event);

    const insertedRow = mockInsert.mock.calls[0][0][0];
    expect(insertedRow.impressions).toBe(0);
    expect(insertedRow.engagements).toBe(0);
    expect(insertedRow.saves).toBe(0);
    expect(insertedRow.shares).toBe(0);
    expect(insertedRow.clicks).toBe(0);
    expect(insertedRow.follows).toBe(0);
    expect(insertedRow.comments).toBe(0);
  });

  it("does not throw when BigQuery insert fails (non-fatal)", async () => {
    mockInsert.mockRejectedValue(new Error("BigQuery unavailable"));

    const snapshotData = {
      workspaceId: "ws-1",
      generatedOutputId: "out-1",
      platformId: "twitter_single",
      snapshotTime: { toDate: () => new Date() },
      impressions: 100,
      engagements: 10,
    };

    const event = {
      data: { data: () => snapshotData },
      params: { docId: "snap-fail" },
    };

    // Should not throw
    await expect(
      (streamToBigQuery as unknown as (event: unknown) => Promise<void>)(event),
    ).resolves.toBeUndefined();
  });

  it("uses current timestamp when snapshotTime is missing", async () => {
    const snapshotData = {
      workspaceId: "ws-1",
      generatedOutputId: "out-1",
      platformId: "twitter_single",
      // snapshotTime is undefined
      impressions: 50,
      engagements: 5,
    };

    const event = {
      data: { data: () => snapshotData },
      params: { docId: "snap-notime" },
    };

    await (streamToBigQuery as unknown as (event: unknown) => Promise<void>)(event);

    const insertedRow = mockInsert.mock.calls[0][0][0];
    // snapshot_time should be a valid ISO string (fallback to new Date())
    expect(typeof insertedRow.snapshot_time).toBe("string");
    expect(new Date(insertedRow.snapshot_time).getTime()).not.toBeNaN();
  });
});
