/**
 * Tests for Calendar API — scheduleOutput, scheduleBatch, autoSchedule, getCalendarEvents, rescheduleOutput.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, mockCollectionRef, mockDocRef } from "../helpers/setup.js";

const mockAuthContext = {
  uid: "test-uid",
  email: "test@example.com",
  userId: "user-123",
  workspaceId: "ws-123",
  organizationId: "org-123",
  role: "admin" as const,
};

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
    GENERATED_OUTPUTS: "generatedOutputs",
    SCHEDULED_EVENTS: "scheduledEvents",
    CONTENT_UPLOADS: "contentUploads",
  },
}));

vi.mock("../../shared/transform.js", () => ({
  docToResponse: vi.fn((id: string, data: Record<string, unknown>) => ({ id, ...data })),
}));

vi.mock("../../lib/distributionArc.js", () => ({
  createDistributionArc: vi.fn((outputs: Array<{ id: string; platformId: string }>, startDate: Date) => {
    return outputs.map((o, i) => ({
      outputId: o.id,
      platformId: o.platformId,
      suggestedDatetime: new Date(startDate.getTime() + i * 86400000),
    }));
  }),
}));

import { scheduleOutput, scheduleBatch, autoSchedule, getCalendarEvents, rescheduleOutput } from "../../api/calendar.js";
import { verifyAuth } from "../../middleware/auth.js";
import { assertRole } from "../../middleware/rbac.js";
import { createDistributionArc } from "../../lib/distributionArc.js";

function mockRequest(data: Record<string, unknown> = {}) {
  return { auth: { uid: "test-uid", token: { email: "test@example.com" } }, data } as unknown;
}

describe("Calendar API", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
    mockCollectionRef.where.mockReturnValue(mockCollectionRef);
    mockCollectionRef.limit.mockReturnValue(mockCollectionRef);
    mockCollectionRef.orderBy.mockReturnValue(mockCollectionRef);
    mockCollectionRef.doc.mockReturnValue(mockDocRef);
    mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({}), id: "mock-doc-id", ref: mockDocRef });
    mockDocRef.set.mockResolvedValue(undefined);
    mockDocRef.update.mockResolvedValue(undefined);
    mockDb.collection.mockReturnValue(mockCollectionRef);
  });

  // ─── scheduleOutput ─────────────────────────────────────────────────────

  describe("scheduleOutput", () => {
    it("creates a scheduled event document for a valid output", async () => {
      // First get: output exists and belongs to workspace
      // Second get: no existing scheduled event
      // Third get: after set, read back the event
      let getCallCount = 0;
      mockDocRef.get.mockImplementation(() => {
        getCallCount++;
        if (getCallCount === 1) {
          return Promise.resolve({
            exists: true,
            data: () => ({ workspaceId: "ws-123", platformId: "twitter" }),
            id: "output-1",
            ref: mockDocRef,
          });
        }
        // After set, read the event
        return Promise.resolve({
          exists: true,
          data: () => ({
            workspaceId: "ws-123",
            generatedOutputId: "output-1",
            platformId: "twitter",
            status: "scheduled",
          }),
          id: "event-1",
          ref: mockDocRef,
        });
      });

      // No existing scheduled event for this output
      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

      const request = mockRequest({
        output_id: "output-1",
        scheduled_at: "2026-03-01T10:00:00Z",
      });
      const result = await (scheduleOutput as Function)(request);

      expect(verifyAuth).toHaveBeenCalled();
      expect(assertRole).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), "editor");
      expect(mockDocRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-123",
          generatedOutputId: "output-1",
          platformId: "twitter",
          status: "scheduled",
        })
      );
      expect(result).toBeDefined();
    });

    it("validates that the output exists before scheduling", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: false,
        data: () => null,
        id: "missing-output",
        ref: mockDocRef,
      });

      const request = mockRequest({
        output_id: "missing-output",
        scheduled_at: "2026-03-01T10:00:00Z",
      });

      await expect((scheduleOutput as Function)(request)).rejects.toThrow();
    });

    it("rejects scheduling if output is already scheduled", async () => {
      // Output exists
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ workspaceId: "ws-123", platformId: "twitter" }),
        id: "output-1",
        ref: mockDocRef,
      });

      // Existing scheduled event found
      mockCollectionRef.get.mockResolvedValue({
        empty: false,
        docs: [{ id: "existing-event", data: () => ({ status: "scheduled" }) }],
        size: 1,
      });

      const request = mockRequest({
        output_id: "output-1",
        scheduled_at: "2026-03-01T10:00:00Z",
      });

      await expect((scheduleOutput as Function)(request)).rejects.toThrow();
    });
  });

  // ─── scheduleBatch ────────────────────────────────────────────────────────

  describe("scheduleBatch", () => {
    it("creates multiple scheduled events for batch items", async () => {
      // Output doc lookups: each exists and belongs to workspace
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          workspaceId: "ws-123",
          platformId: "twitter",
          status: "scheduled",
        }),
        id: "output-1",
        ref: mockDocRef,
      });

      // No existing scheduled events
      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

      const request = mockRequest({
        items: [
          { output_id: "output-1", scheduled_at: "2026-03-01T10:00:00Z" },
          { output_id: "output-2", scheduled_at: "2026-03-02T10:00:00Z" },
        ],
      });
      const result = await (scheduleBatch as Function)(request);

      expect(result.events).toBeDefined();
      expect(result.total).toBe(result.events.length);
    });
  });

  // ─── autoSchedule ─────────────────────────────────────────────────────────

  describe("autoSchedule", () => {
    it("uses distribution arc to schedule outputs", async () => {
      const outputDocs = [
        { id: "out-1", data: () => ({ platformId: "twitter", workspaceId: "ws-123", status: "approved" }) },
        { id: "out-2", data: () => ({ platformId: "linkedin", workspaceId: "ws-123", status: "draft" }) },
      ];

      // First query: get outputs for content
      let collectionGetCount = 0;
      mockCollectionRef.get.mockImplementation(() => {
        collectionGetCount++;
        if (collectionGetCount === 1) {
          return Promise.resolve({ empty: false, docs: outputDocs, size: 2 });
        }
        return Promise.resolve({ empty: true, docs: [], size: 0 });
      });

      // Event doc reads after set
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ workspaceId: "ws-123", status: "scheduled" }),
        id: "event-id",
        ref: mockDocRef,
      });

      const request = mockRequest({
        content_id: "content-1",
        start_date: "2026-03-01T00:00:00Z",
      });
      const result = await (autoSchedule as Function)(request);

      expect(createDistributionArc).toHaveBeenCalled();
      expect(result.events).toBeDefined();
      expect(result.total).toBe(result.events.length);
    });

    it("returns empty when no outputs are available", async () => {
      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

      const request = mockRequest({
        content_id: "content-1",
        start_date: "2026-03-01T00:00:00Z",
      });
      const result = await (autoSchedule as Function)(request);

      expect(result.events).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ─── getCalendarEvents ────────────────────────────────────────────────────

  describe("getCalendarEvents", () => {
    it("returns events within the requested date range", async () => {
      const eventDocs = [
        {
          id: "event-1",
          data: () => ({
            workspaceId: "ws-123",
            generatedOutputId: "output-1",
            platformId: "twitter",
            scheduledAt: { toDate: () => new Date("2026-03-01T10:00:00Z"), seconds: 1000000, nanoseconds: 0 },
            status: "scheduled",
          }),
        },
      ];

      // First get: calendar events query
      let collectionGetCount = 0;
      mockCollectionRef.get.mockImplementation(() => {
        collectionGetCount++;
        if (collectionGetCount === 1) {
          return Promise.resolve({ empty: false, docs: eventDocs, size: 1 });
        }
        return Promise.resolve({ empty: true, docs: [], size: 0 });
      });

      // Output lookup for enrichment
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          content: "Test content",
          formatName: "Twitter Post",
          contentUploadId: "content-1",
        }),
        id: "output-1",
        ref: mockDocRef,
      });

      const request = mockRequest({
        start: "2026-03-01T00:00:00Z",
        end: "2026-03-31T23:59:59Z",
      });
      const result = await (getCalendarEvents as Function)(request);

      expect(result.events).toBeDefined();
      expect(result.total).toBe(result.events.length);
    });
  });

  // ─── rescheduleOutput ─────────────────────────────────────────────────────

  describe("rescheduleOutput", () => {
    it("updates the event datetime for a scheduled event", async () => {
      let docGetCount = 0;
      mockDocRef.get.mockImplementation(() => {
        docGetCount++;
        if (docGetCount === 1) {
          return Promise.resolve({
            exists: true,
            data: () => ({
              workspaceId: "ws-123",
              generatedOutputId: "output-1",
              status: "scheduled",
            }),
            id: "event-1",
            ref: mockDocRef,
          });
        }
        // After update, read back
        return Promise.resolve({
          exists: true,
          data: () => ({
            workspaceId: "ws-123",
            generatedOutputId: "output-1",
            status: "scheduled",
            scheduledAt: { toDate: () => new Date("2026-04-01T10:00:00Z") },
          }),
          id: "event-1",
          ref: mockDocRef,
        });
      });

      const request = mockRequest({
        event_id: "event-1",
        scheduled_at: "2026-04-01T10:00:00Z",
      });
      const result = await (rescheduleOutput as Function)(request);

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "scheduled",
          publishError: null,
        })
      );
      expect(result).toBeDefined();
    });

    it("throws NotFoundError when event does not exist", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: false,
        data: () => null,
        id: "nonexistent",
        ref: mockDocRef,
      });

      const request = mockRequest({
        event_id: "nonexistent",
        scheduled_at: "2026-04-01T10:00:00Z",
      });

      await expect((rescheduleOutput as Function)(request)).rejects.toThrow();
    });
  });
});
