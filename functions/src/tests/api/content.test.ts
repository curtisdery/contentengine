/**
 * Tests for Content API — createContent, getContent, listContent, updateContent, triggerGeneration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, mockCollectionRef, mockDocRef, mockBatch } from "../helpers/setup.js";

// ─── Mock modules that content.ts imports ────────────────────────────────────
vi.mock("../../lib/taskClient.js", () => ({
  enqueueTask: vi.fn().mockResolvedValue("task-name"),
  getTaskHandlerUrl: vi.fn().mockReturnValue("https://example.com/task"),
}));

vi.mock("uuid", () => ({
  v4: vi.fn().mockReturnValue("mock-uuid-1234"),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authedRequest(data: Record<string, unknown> = {}) {
  return {
    auth: {
      uid: "test-uid",
      token: {
        email: "test@example.com",
        name: "Test User",
        picture: null,
        email_verified: true,
      },
    },
    data,
  };
}

function unauthenticatedRequest(data: Record<string, unknown> = {}) {
  return { auth: null, data };
}

/**
 * Wire up verifyAuth mocks and content-specific collection mocks.
 */
function setupContentMocks(overrides?: {
  contentExists?: boolean;
  contentData?: Record<string, unknown>;
  contentDocs?: Array<{ id: string; data: () => Record<string, unknown> }>;
}) {
  const contentData = overrides?.contentData ?? {
    workspaceId: "ws-1",
    title: "Test Content",
    contentType: "blog",
    rawContent: "Some raw content here",
    storagePath: null,
    sourceUrl: null,
    contentDna: null,
    status: "pending",
  };

  const contentDocRef = {
    ...mockDocRef,
    id: "content-doc-1",
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({
      exists: overrides?.contentExists !== false,
      id: "content-doc-1",
      data: () => contentData,
      ref: mockDocRef,
    }),
  };

  mockDb.collection.mockImplementation((name: string) => {
    if (name === "users") {
      return {
        doc: vi.fn().mockReturnValue({
          ...mockDocRef,
          id: "user-1",
          get: vi.fn().mockResolvedValue({
            exists: true,
            id: "user-1",
            data: () => ({
              firebaseUid: "test-uid",
              email: "test@example.com",
              fullName: "Test User",
              avatarUrl: null,
              emailVerified: true,
              isActive: true,
              defaultWorkspaceId: "ws-1",
              fcmTokens: [],
              mfaEnabled: false,
            }),
            ref: mockDocRef,
          }),
        }),
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              empty: false,
              docs: [{
                id: "user-1",
                data: () => ({
                  firebaseUid: "test-uid",
                  email: "test@example.com",
                  fullName: "Test User",
                  avatarUrl: null,
                  emailVerified: true,
                  isActive: true,
                  defaultWorkspaceId: "ws-1",
                  fcmTokens: [],
                  mfaEnabled: false,
                }),
                ref: mockDocRef,
              }],
              size: 1,
            }),
          }),
          get: vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
        }),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
      };
    }
    if (name === "workspaces") {
      return {
        doc: vi.fn().mockReturnValue({
          ...mockDocRef,
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ organizationId: "org-1" }),
            ref: {},
          }),
        }),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
      };
    }
    if (name === "organizationMembers") {
      return {
        doc: vi.fn().mockReturnValue(mockDocRef),
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                empty: false,
                docs: [{ id: "m-1", data: () => ({ role: "owner" }), ref: {} }],
                size: 1,
              }),
            }),
          }),
        }),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
      };
    }
    if (name === "contentUploads") {
      const listDocs = overrides?.contentDocs ?? [];
      return {
        doc: vi.fn().mockReturnValue(contentDocRef),
        add: vi.fn().mockResolvedValue(contentDocRef),
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnValue({
            offset: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                  empty: listDocs.length === 0,
                  docs: listDocs,
                  size: listDocs.length,
                }),
              }),
            }),
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                empty: listDocs.length === 0,
                docs: listDocs,
                size: listDocs.length,
              }),
            }),
            get: vi.fn().mockResolvedValue({
              empty: listDocs.length === 0,
              docs: listDocs,
              size: listDocs.length,
            }),
          }),
          limit: vi.fn().mockReturnThis(),
          count: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ data: () => ({ count: listDocs.length }) }),
          }),
          get: vi.fn().mockResolvedValue({
            empty: listDocs.length === 0,
            docs: listDocs,
            size: listDocs.length,
          }),
        }),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        count: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ data: () => ({ count: listDocs.length }) }),
        }),
        get: vi.fn().mockResolvedValue({
          empty: listDocs.length === 0,
          docs: listDocs,
          size: listDocs.length,
        }),
      };
    }
    return mockCollectionRef;
  });

  return { contentDocRef, contentData };
}

// ─── Import functions under test ─────────────────────────────────────────────
import { createContent, getContent, listContent, updateContent, triggerGeneration } from "../../api/content.js";

describe("Content API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.collection.mockReturnValue(mockCollectionRef);
    mockCollectionRef.doc.mockReturnValue(mockDocRef);
    mockCollectionRef.where.mockReturnThis();
    mockCollectionRef.orderBy.mockReturnThis();
    mockCollectionRef.limit.mockReturnThis();
    mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
    mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({}), id: "mock-doc-id", ref: mockDocRef });
    mockDocRef.set.mockResolvedValue(undefined);
    mockDocRef.update.mockResolvedValue(undefined);
  });

  // ─── createContent ───────────────────────────────────────────────────────

  describe("createContent", () => {
    it("should create a content document and return it", async () => {
      const { contentDocRef } = setupContentMocks();

      const result = await (createContent as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({
          title: "My Blog Post",
          content_type: "blog",
          raw_content: "This is my blog post content.",
        })
      );

      expect(result).toBeDefined();
      expect(result.id).toBe("content-doc-1");
      expect(contentDocRef.set).toHaveBeenCalled();
    });

    it("should set status to pending on creation", async () => {
      const { contentDocRef } = setupContentMocks();

      await (createContent as unknown as (req: unknown) => Promise<unknown>)(
        authedRequest({
          title: "Test",
          content_type: "blog",
          raw_content: "Content body",
        })
      );

      const setCall = contentDocRef.set.mock.calls[0][0];
      expect(setCall.status).toBe("pending");
      expect(setCall.workspaceId).toBe("ws-1");
      expect(setCall.title).toBe("Test");
      expect(setCall.contentType).toBe("blog");
    });

    it("should throw when not authenticated", async () => {
      await expect(
        (createContent as unknown as (req: unknown) => Promise<unknown>)(
          unauthenticatedRequest({ title: "X", content_type: "blog" })
        )
      ).rejects.toThrow();
    });

    it("should throw for invalid input (missing title)", async () => {
      setupContentMocks();

      await expect(
        (createContent as unknown as (req: unknown) => Promise<unknown>)(
          authedRequest({ content_type: "blog" })
        )
      ).rejects.toThrow();
    });
  });

  // ─── getContent ──────────────────────────────────────────────────────────

  describe("getContent", () => {
    it("should return content by ID", async () => {
      setupContentMocks();

      const result = await (getContent as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({ content_id: "content-doc-1" })
      );

      expect(result).toBeDefined();
      expect(result.id).toBe("content-doc-1");
    });

    it("should throw NotFoundError for missing content", async () => {
      setupContentMocks({ contentExists: false });

      await expect(
        (getContent as unknown as (req: unknown) => Promise<unknown>)(
          authedRequest({ content_id: "nonexistent-id" })
        )
      ).rejects.toThrow();
    });

    it("should throw when content_id is not provided", async () => {
      setupContentMocks();

      await expect(
        (getContent as unknown as (req: unknown) => Promise<unknown>)(authedRequest({}))
      ).rejects.toThrow();
    });

    it("should throw when content belongs to different workspace", async () => {
      setupContentMocks({
        contentData: {
          workspaceId: "other-workspace",
          title: "Other Content",
          contentType: "blog",
          rawContent: "",
          storagePath: null,
          sourceUrl: null,
          contentDna: null,
          status: "pending",
        },
      });

      await expect(
        (getContent as unknown as (req: unknown) => Promise<unknown>)(
          authedRequest({ content_id: "content-doc-1" })
        )
      ).rejects.toThrow();
    });
  });

  // ─── listContent ─────────────────────────────────────────────────────────

  describe("listContent", () => {
    it("should return paginated results", async () => {
      const contentDocs = [
        {
          id: "c-1",
          data: () => ({ workspaceId: "ws-1", title: "Post 1", contentType: "blog", status: "pending" }),
        },
        {
          id: "c-2",
          data: () => ({ workspaceId: "ws-1", title: "Post 2", contentType: "blog", status: "ready" }),
        },
      ];
      setupContentMocks({ contentDocs });

      const result = await (listContent as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({ limit: 20, offset: 0 })
      );

      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
      const items = result.items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("should return empty list when no content exists", async () => {
      setupContentMocks({ contentDocs: [] });

      const result = await (listContent as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({})
      );

      expect(result).toBeDefined();
      expect((result.items as unknown[]).length).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  // ─── updateContent ───────────────────────────────────────────────────────

  describe("updateContent", () => {
    it("should update content DNA with user adjustments", async () => {
      const { contentDocRef } = setupContentMocks();

      const result = await (updateContent as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({
          content_id: "content-doc-1",
          emphasis_notes: "Focus on the introduction.",
        })
      );

      expect(result).toBeDefined();
      expect(contentDocRef.update).toHaveBeenCalled();
      const updateCall = contentDocRef.update.mock.calls[0][0];
      expect(updateCall.contentDna.userAdjustments.emphasisNotes).toBe("Focus on the introduction.");
    });

    it("should throw when content_id is missing", async () => {
      setupContentMocks();

      await expect(
        (updateContent as unknown as (req: unknown) => Promise<unknown>)(
          authedRequest({ emphasis_notes: "test" })
        )
      ).rejects.toThrow();
    });
  });

  // ─── triggerGeneration ───────────────────────────────────────────────────

  describe("triggerGeneration", () => {
    it("should change status to generating and enqueue task", async () => {
      const { contentDocRef } = setupContentMocks();

      const result = await (triggerGeneration as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({
          content_id: "content-doc-1",
          voice_profile_id: "voice-1",
          selected_platforms: ["twitter", "linkedin"],
        })
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.message).toContain("Generation started");

      // Check that status was updated to "generating"
      expect(contentDocRef.update).toHaveBeenCalled();
      const updateCalls = contentDocRef.update.mock.calls;
      const statusUpdate = updateCalls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).status === "generating"
      );
      expect(statusUpdate).toBeDefined();
    });

    it("should throw when content does not exist", async () => {
      setupContentMocks({ contentExists: false });

      await expect(
        (triggerGeneration as unknown as (req: unknown) => Promise<unknown>)(
          authedRequest({ content_id: "nonexistent" })
        )
      ).rejects.toThrow();
    });

    it("should throw when not authenticated", async () => {
      await expect(
        (triggerGeneration as unknown as (req: unknown) => Promise<unknown>)(
          unauthenticatedRequest({ content_id: "c-1" })
        )
      ).rejects.toThrow();
    });
  });
});
