import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, mockCollectionRef, mockBatch } from "../helpers/setup.js";
import { cleanup } from "../../scheduled/cleanup.js";

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: all queries return empty
  mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
  mockCollectionRef.where.mockReturnThis();
  mockCollectionRef.orderBy.mockReturnThis();
  mockCollectionRef.limit.mockReturnThis();

  mockBatch.update.mockReturnThis();
  mockBatch.delete.mockReturnThis();
  mockBatch.commit.mockResolvedValue(undefined);
});

// ─── cleanup scheduled function ──────────────────────────────────────────────

describe("cleanup", () => {
  it("queries for old pending invites and expires them", async () => {
    const inviteDocs = [
      { id: "inv-1", data: () => ({ status: "pending" }), ref: { id: "inv-1" } },
      { id: "inv-2", data: () => ({ status: "pending" }), ref: { id: "inv-2" } },
    ];

    // Track which collection is queried to provide the right mock data
    let queryCount = 0;
    mockCollectionRef.get.mockImplementation(() => {
      queryCount++;
      if (queryCount === 1) {
        // First query: invites
        return Promise.resolve({ empty: false, docs: inviteDocs, size: 2 });
      }
      return Promise.resolve({ empty: true, docs: [], size: 0 });
    });

    await (cleanup as unknown as () => Promise<void>)();

    // Should query the invites collection
    expect(mockDb.collection).toHaveBeenCalledWith("invites");
    // Should batch update invites to expired status
    expect(mockBatch.update).toHaveBeenCalledTimes(2);
    expect(mockBatch.update).toHaveBeenCalledWith(
      { id: "inv-1" },
      { status: "expired" },
    );
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  it("queries for stale OAuth states and deletes them", async () => {
    const staleOAuthDocs = [
      { id: "oauth-1", data: () => ({}), ref: { id: "oauth-1" } },
    ];

    let queryCount = 0;
    mockCollectionRef.get.mockImplementation(() => {
      queryCount++;
      if (queryCount === 2) {
        // Second query: oauthStates
        return Promise.resolve({ empty: false, docs: staleOAuthDocs, size: 1 });
      }
      return Promise.resolve({ empty: true, docs: [], size: 0 });
    });

    await (cleanup as unknown as () => Promise<void>)();

    expect(mockDb.collection).toHaveBeenCalledWith("oauthStates");
    expect(mockBatch.delete).toHaveBeenCalled();
  });

  it("queries for old audit logs and deletes them", async () => {
    const auditDocs = [
      { id: "audit-1", data: () => ({}), ref: { id: "audit-1" } },
      { id: "audit-2", data: () => ({}), ref: { id: "audit-2" } },
    ];

    let queryCount = 0;
    mockCollectionRef.get.mockImplementation(() => {
      queryCount++;
      if (queryCount === 3) {
        // Third query: auditLogs
        return Promise.resolve({ empty: false, docs: auditDocs, size: 2 });
      }
      return Promise.resolve({ empty: true, docs: [], size: 0 });
    });

    await (cleanup as unknown as () => Promise<void>)();

    expect(mockDb.collection).toHaveBeenCalledWith("auditLogs");
    expect(mockBatch.delete).toHaveBeenCalled();
  });

  it("queries for old read notifications and deletes them", async () => {
    const notifDocs = [
      { id: "notif-1", data: () => ({ read: true }), ref: { id: "notif-1" } },
    ];

    let queryCount = 0;
    mockCollectionRef.get.mockImplementation(() => {
      queryCount++;
      if (queryCount === 4) {
        // Fourth query: notifications
        return Promise.resolve({ empty: false, docs: notifDocs, size: 1 });
      }
      return Promise.resolve({ empty: true, docs: [], size: 0 });
    });

    await (cleanup as unknown as () => Promise<void>)();

    expect(mockDb.collection).toHaveBeenCalledWith("notifications");
    expect(mockBatch.delete).toHaveBeenCalled();
  });

  it("handles the case where all collections are empty (nothing to clean)", async () => {
    mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

    await (cleanup as unknown as () => Promise<void>)();

    // batch should still be created but no updates or deletes should occur
    expect(mockBatch.update).not.toHaveBeenCalled();
    expect(mockBatch.delete).not.toHaveBeenCalled();
  });

  it("also cleans up old failed scheduled events", async () => {
    const failedDocs = [
      { id: "failed-1", data: () => ({ status: "failed" }), ref: { id: "failed-1" } },
    ];

    let queryCount = 0;
    mockCollectionRef.get.mockImplementation(() => {
      queryCount++;
      if (queryCount === 5) {
        // Fifth query: scheduledEvents with status failed
        return Promise.resolve({ empty: false, docs: failedDocs, size: 1 });
      }
      return Promise.resolve({ empty: true, docs: [], size: 0 });
    });

    await (cleanup as unknown as () => Promise<void>)();

    expect(mockDb.collection).toHaveBeenCalledWith("scheduledEvents");
    expect(mockBatch.delete).toHaveBeenCalled();
    expect(mockBatch.commit).toHaveBeenCalled();
  });
});
