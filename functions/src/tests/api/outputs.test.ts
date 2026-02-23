/**
 * Tests for Outputs API — listOutputs, getOutput, editOutput, approveOutput, rejectOutput, regenerateOutput.
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
    CONTENT_UPLOADS: "contentUploads",
    GENERATED_OUTPUTS: "generatedOutputs",
    AUTOPILOT_CONFIGS: "autopilotConfigs",
  },
}));

vi.mock("../../shared/transform.js", () => ({
  docToResponse: vi.fn((id: string, data: Record<string, unknown>) => ({ id, ...data })),
}));

const { mockEnqueueTask, mockGetTaskHandlerUrl } = vi.hoisted(() => ({
  mockEnqueueTask: vi.fn().mockResolvedValue("task-id"),
  mockGetTaskHandlerUrl: vi.fn().mockReturnValue("https://task-handler.example.com"),
}));

vi.mock("../../lib/taskClient.js", () => ({
  enqueueTask: mockEnqueueTask,
  getTaskHandlerUrl: mockGetTaskHandlerUrl,
}));

import { listOutputs, getOutput, editOutput, approveOutput, rejectOutput, regenerateOutput } from "../../api/outputs.js";
import { verifyAuth } from "../../middleware/auth.js";
import { assertRole } from "../../middleware/rbac.js";

function mockRequest(data: Record<string, unknown> = {}) {
  return { auth: { uid: "test-uid", token: { email: "test@example.com" } }, data } as unknown;
}

describe("Outputs API", () => {
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

  // ─── listOutputs ──────────────────────────────────────────────────────────

  describe("listOutputs", () => {
    it("returns outputs for a workspace content upload", async () => {
      // Content exists and belongs to workspace
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ workspaceId: "ws-123", title: "My Content" }),
        id: "content-1",
        ref: mockDocRef,
      });

      const outputDocs = [
        { id: "out-1", data: () => ({ content: "Tweet content", platformId: "twitter", status: "draft" }) },
        { id: "out-2", data: () => ({ content: "LinkedIn post", platformId: "linkedin", status: "approved" }) },
      ];
      mockCollectionRef.get.mockResolvedValue({ empty: false, docs: outputDocs, size: 2 });

      const request = mockRequest({ content_id: "content-1" });
      const result = await (listOutputs as Function)(request);

      expect(verifyAuth).toHaveBeenCalled();
      expect(result.items).toBeDefined();
      expect(result.total).toBe(2);
      expect(result.content_id).toBe("content-1");
    });

    it("throws NotFoundError when content_id is missing", async () => {
      const request = mockRequest({});
      await expect((listOutputs as Function)(request)).rejects.toThrow();
    });
  });

  // ─── getOutput ────────────────────────────────────────────────────────────

  describe("getOutput", () => {
    it("returns a single output with details", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          workspaceId: "ws-123",
          content: "Test tweet content",
          platformId: "twitter",
          formatName: "Twitter Post",
          status: "draft",
        }),
        id: "output-1",
        ref: mockDocRef,
      });

      const request = mockRequest({ output_id: "output-1" });
      const result = await (getOutput as Function)(request);

      expect(result).toBeDefined();
      expect(result.id).toBe("output-1");
    });

    it("throws NotFoundError for missing output", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: false,
        data: () => null,
        id: "nonexistent",
        ref: mockDocRef,
      });

      const request = mockRequest({ output_id: "nonexistent" });
      await expect((getOutput as Function)(request)).rejects.toThrow();
    });

    it("throws NotFoundError when output belongs to different workspace", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ workspaceId: "other-ws", content: "Other content" }),
        id: "output-other",
        ref: mockDocRef,
      });

      const request = mockRequest({ output_id: "output-other" });
      await expect((getOutput as Function)(request)).rejects.toThrow();
    });
  });

  // ─── editOutput ───────────────────────────────────────────────────────────

  describe("editOutput", () => {
    it("updates the content field of an output", async () => {
      let docGetCount = 0;
      mockDocRef.get.mockImplementation(() => {
        docGetCount++;
        if (docGetCount === 1) {
          return Promise.resolve({
            exists: true,
            data: () => ({ workspaceId: "ws-123", content: "Old content", status: "draft" }),
            id: "output-1",
            ref: mockDocRef,
          });
        }
        return Promise.resolve({
          exists: true,
          data: () => ({ workspaceId: "ws-123", content: "Updated content", status: "draft" }),
          id: "output-1",
          ref: mockDocRef,
        });
      });

      const request = mockRequest({ output_id: "output-1", content: "Updated content" });
      const result = await (editOutput as Function)(request);

      expect(assertRole).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), "editor");
      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({ content: "Updated content" })
      );
      expect(result).toBeDefined();
    });
  });

  // ─── approveOutput ────────────────────────────────────────────────────────

  describe("approveOutput", () => {
    it("changes status to approved and tracks autopilot metrics", async () => {
      const autopilotConfigRef = { update: vi.fn().mockResolvedValue(undefined) };

      let docGetCount = 0;
      mockDocRef.get.mockImplementation(() => {
        docGetCount++;
        if (docGetCount === 1) {
          return Promise.resolve({
            exists: true,
            data: () => ({ workspaceId: "ws-123", platformId: "twitter", status: "draft" }),
            id: "output-1",
            ref: mockDocRef,
          });
        }
        return Promise.resolve({
          exists: true,
          data: () => ({ workspaceId: "ws-123", platformId: "twitter", status: "approved" }),
          id: "output-1",
          ref: mockDocRef,
        });
      });

      // Autopilot config exists
      mockCollectionRef.get.mockResolvedValue({
        empty: false,
        docs: [{ id: "config-1", data: () => ({ totalOutputsReviewed: 5, approvedWithoutEdit: 4 }), ref: autopilotConfigRef }],
      });

      const request = mockRequest({ output_id: "output-1" });
      const result = await (approveOutput as Function)(request);

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "approved" })
      );
      expect(autopilotConfigRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          totalOutputsReviewed: expect.anything(),
          approvedWithoutEdit: expect.anything(),
        })
      );
      expect(result).toBeDefined();
    });
  });

  // ─── rejectOutput ─────────────────────────────────────────────────────────

  describe("rejectOutput", () => {
    it("changes status to rejected", async () => {
      let docGetCount = 0;
      mockDocRef.get.mockImplementation(() => {
        docGetCount++;
        if (docGetCount === 1) {
          return Promise.resolve({
            exists: true,
            data: () => ({ workspaceId: "ws-123", platformId: "twitter", status: "draft" }),
            id: "output-1",
            ref: mockDocRef,
          });
        }
        return Promise.resolve({
          exists: true,
          data: () => ({ workspaceId: "ws-123", platformId: "twitter", status: "rejected" }),
          id: "output-1",
          ref: mockDocRef,
        });
      });

      // No autopilot config (or empty)
      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

      const request = mockRequest({ output_id: "output-1" });
      const result = await (rejectOutput as Function)(request);

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "rejected" })
      );
      expect(result).toBeDefined();
    });
  });

  // ─── regenerateOutput ─────────────────────────────────────────────────────

  describe("regenerateOutput", () => {
    it("changes status to rejected and enqueues a generation task", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          workspaceId: "ws-123",
          contentUploadId: "content-1",
          platformId: "twitter",
          status: "draft",
        }),
        id: "output-1",
        ref: mockDocRef,
      });

      const request = mockRequest({ output_id: "output-1" });
      const result = await (regenerateOutput as Function)(request);

      expect(assertRole).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), "editor");
      expect(mockEnqueueTask).toHaveBeenCalledWith(
        expect.objectContaining({
          queue: "output-generation",
          payload: expect.objectContaining({
            contentId: "content-1",
            workspaceId: "ws-123",
            selectedPlatforms: ["twitter"],
          }),
        })
      );
      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "rejected" })
      );
      expect(result.success).toBe(true);
    });

    it("throws NotFoundError when output does not exist", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: false,
        data: () => null,
        id: "nonexistent",
        ref: mockDocRef,
      });

      const request = mockRequest({ output_id: "nonexistent" });
      await expect((regenerateOutput as Function)(request)).rejects.toThrow();
    });
  });
});
