/**
 * Tests for Team API — inviteMember, acceptInvite, listMembers, updateRole, removeMember, transferOwnership.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, mockCollectionRef, mockDocRef, mockBatch } from "../helpers/setup.js";

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
    USERS: "users",
    WORKSPACES: "workspaces",
    ORGANIZATIONS: "organizations",
    ORGANIZATION_MEMBERS: "organizationMembers",
    SUBSCRIPTIONS: "subscriptions",
    INVITES: "invites",
  },
}));

import { inviteMember, acceptInvite, listMembers, updateRole, removeMember, transferOwnership } from "../../api/team.js";
import { verifyAuth } from "../../middleware/auth.js";
import { assertRole } from "../../middleware/rbac.js";

// Helper to create a mock callable request
function mockRequest(data: Record<string, unknown> = {}) {
  return { auth: { uid: "test-uid", token: { email: "test@example.com" } }, data } as unknown;
}

describe("Team API", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default mock behaviors
    mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
    mockCollectionRef.where.mockReturnValue(mockCollectionRef);
    mockCollectionRef.limit.mockReturnValue(mockCollectionRef);
    mockCollectionRef.orderBy.mockReturnValue(mockCollectionRef);
    mockCollectionRef.doc.mockReturnValue(mockDocRef);
    mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({}), id: "mock-doc-id", ref: mockDocRef });
    mockDocRef.set.mockResolvedValue(undefined);
    mockDocRef.update.mockResolvedValue(undefined);
    mockDocRef.delete.mockResolvedValue(undefined);
    mockDb.collection.mockReturnValue(mockCollectionRef);
    mockBatch.update.mockReturnThis();
    mockBatch.commit.mockResolvedValue(undefined);
  });

  // ─── inviteMember ─────────────────────────────────────────────────────────

  describe("inviteMember", () => {
    it("requires admin role and calls assertRole", async () => {
      // No existing user, no existing member
      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
      mockDocRef.set.mockResolvedValue(undefined);

      const request = mockRequest({ email: "new@example.com", role: "editor" });
      const result = await (inviteMember as Function)(request);

      expect(verifyAuth).toHaveBeenCalledWith(request);
      expect(assertRole).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), "admin");
      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe("string");
    });

    it("creates an invite document with a token", async () => {
      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
      mockDocRef.set.mockResolvedValue(undefined);

      const request = mockRequest({ email: "new@example.com", role: "editor" });
      const result = await (inviteMember as Function)(request);

      expect(result.success).toBe(true);
      expect(result.invite_id).toBe("mock-doc-id");
      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(0);

      // Verify invite was persisted
      expect(mockDocRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-123",
          email: "new@example.com",
          role: "editor",
          invitedBy: "user-123",
          status: "pending",
          token: expect.any(String),
        })
      );
    });

    it("rejects duplicate members who are already in the organization", async () => {
      // First call: user exists by email
      const existingUserSnap = {
        empty: false,
        docs: [{ id: "existing-user-id", data: () => ({ email: "dup@example.com" }) }],
      };
      // Second call: member exists for that org
      const existingMemberSnap = {
        empty: false,
        docs: [{ id: "member-id", data: () => ({ organizationId: "org-123", userId: "existing-user-id" }) }],
      };

      let callCount = 0;
      mockCollectionRef.get.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(existingUserSnap);
        if (callCount === 2) return Promise.resolve(existingMemberSnap);
        return Promise.resolve({ empty: true, docs: [], size: 0 });
      });

      const request = mockRequest({ email: "dup@example.com", role: "editor" });

      await expect((inviteMember as Function)(request)).rejects.toThrow();
    });
  });

  // ─── acceptInvite ─────────────────────────────────────────────────────────

  describe("acceptInvite", () => {
    it("validates token and creates member document, marks invite as accepted", async () => {
      const inviteRef = { update: vi.fn().mockResolvedValue(undefined) };
      const inviteData = {
        organizationId: "org-123",
        role: "editor",
        email: "invitee@example.com",
        status: "pending",
        token: "valid-token",
      };

      mockCollectionRef.get.mockResolvedValue({
        empty: false,
        docs: [{ id: "invite-id", data: () => inviteData, ref: inviteRef }],
      });
      mockCollectionRef.add.mockResolvedValue(mockDocRef);

      const request = mockRequest({ token: "valid-token" });
      const result = await (acceptInvite as Function)(request);

      expect(result.success).toBe(true);
      expect(result.organization_id).toBe("org-123");

      // Verify new member was created
      expect(mockCollectionRef.add).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-123",
          userId: "user-123",
          role: "editor",
        })
      );

      // Verify invite was marked accepted
      expect(inviteRef.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "accepted" })
      );
    });

    it("throws NotFoundError for invalid or expired token", async () => {
      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

      const request = mockRequest({ token: "invalid-token" });
      await expect((acceptInvite as Function)(request)).rejects.toThrow();
    });
  });

  // ─── listMembers ──────────────────────────────────────────────────────────

  describe("listMembers", () => {
    it("returns all organization members with user data", async () => {
      const memberDocs = [
        {
          id: "member-1",
          data: () => ({ organizationId: "org-123", userId: "user-1", role: "owner" }),
        },
        {
          id: "member-2",
          data: () => ({ organizationId: "org-123", userId: "user-2", role: "editor" }),
        },
      ];

      const userDataMap: Record<string, Record<string, unknown>> = {
        "user-1": { email: "owner@example.com", fullName: "Owner User", avatarUrl: "https://example.com/avatar1.png" },
        "user-2": { email: "editor@example.com", fullName: "Editor User", avatarUrl: null },
      };

      let collectionCallCount = 0;
      mockDb.collection.mockImplementation(() => {
        collectionCallCount++;
        return mockCollectionRef;
      });

      // First get call returns members, subsequent get calls return user docs
      let getCallCount = 0;
      mockCollectionRef.get.mockImplementation(() => {
        getCallCount++;
        if (getCallCount === 1) {
          return Promise.resolve({ empty: false, docs: memberDocs, size: 2 });
        }
        return Promise.resolve({ empty: true, docs: [], size: 0 });
      });

      // For user lookups via doc().get()
      mockDocRef.get.mockImplementation(() => {
        return Promise.resolve({
          exists: true,
          data: () => userDataMap["user-1"] || {},
          id: "user-1",
          ref: mockDocRef,
        });
      });

      const request = mockRequest({});
      const result = await (listMembers as Function)(request);

      expect(verifyAuth).toHaveBeenCalledWith(request);
      expect(result.members).toBeDefined();
      expect(result.total).toBe(result.members.length);
    });
  });

  // ─── updateRole ───────────────────────────────────────────────────────────

  describe("updateRole", () => {
    it("requires admin and updates member role", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ organizationId: "org-123", userId: "other-user", role: "editor" }),
        id: "member-id",
        ref: mockDocRef,
      });

      const request = mockRequest({ member_id: "member-id", role: "viewer" });
      const result = await (updateRole as Function)(request);

      expect(assertRole).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), "admin");
      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({ role: "viewer" })
      );
      expect(result.success).toBe(true);
    });

    it("cannot change owner role", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ organizationId: "org-123", userId: "owner-user", role: "owner" }),
        id: "owner-member-id",
        ref: mockDocRef,
      });

      const request = mockRequest({ member_id: "owner-member-id", role: "admin" });
      await expect((updateRole as Function)(request)).rejects.toThrow();
    });

    it("throws NotFoundError when member does not exist", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: false,
        data: () => null,
        id: "nonexistent",
        ref: mockDocRef,
      });

      const request = mockRequest({ member_id: "nonexistent", role: "viewer" });
      await expect((updateRole as Function)(request)).rejects.toThrow();
    });
  });

  // ─── removeMember ─────────────────────────────────────────────────────────

  describe("removeMember", () => {
    it("requires admin and deletes the member document", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ organizationId: "org-123", userId: "other-user", role: "editor" }),
        id: "member-id",
        ref: mockDocRef,
      });

      const request = mockRequest({ member_id: "member-id" });
      const result = await (removeMember as Function)(request);

      expect(assertRole).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), "admin");
      expect(mockDocRef.delete).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("cannot remove the owner", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ organizationId: "org-123", userId: "owner-user", role: "owner" }),
        id: "owner-member-id",
        ref: mockDocRef,
      });

      const request = mockRequest({ member_id: "owner-member-id" });
      await expect((removeMember as Function)(request)).rejects.toThrow();
    });

    it("cannot remove self", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ organizationId: "org-123", userId: "user-123", role: "admin" }),
        id: "self-member-id",
        ref: mockDocRef,
      });

      const request = mockRequest({ member_id: "self-member-id" });
      await expect((removeMember as Function)(request)).rejects.toThrow();
    });
  });

  // ─── transferOwnership ────────────────────────────────────────────────────

  describe("transferOwnership", () => {
    it("requires owner role and swaps roles in a batch write", async () => {
      vi.mocked(verifyAuth).mockResolvedValueOnce({
        ...mockAuthContext,
        role: "owner",
      });

      const newOwnerRef = { update: vi.fn() };
      const currentOwnerRef = { update: vi.fn() };

      // Mock for new owner search, then current owner search
      let getCallCount = 0;
      mockCollectionRef.get.mockImplementation(() => {
        getCallCount++;
        if (getCallCount === 1) {
          // New owner membership
          return Promise.resolve({
            empty: false,
            docs: [{ id: "new-owner-member", data: () => ({ role: "admin" }), ref: newOwnerRef }],
          });
        }
        if (getCallCount === 2) {
          // Current owner membership
          return Promise.resolve({
            empty: false,
            docs: [{ id: "current-owner-member", data: () => ({ role: "owner" }), ref: currentOwnerRef }],
          });
        }
        return Promise.resolve({ empty: true, docs: [], size: 0 });
      });

      const request = mockRequest({ new_owner_id: "new-owner-user" });
      const result = await (transferOwnership as Function)(request);

      expect(result.success).toBe(true);
      // Verify batch was used for atomic role swap
      expect(mockBatch.update).toHaveBeenCalled();
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it("throws NotFoundError if new owner is not a member", async () => {
      vi.mocked(verifyAuth).mockResolvedValueOnce({
        ...mockAuthContext,
        role: "owner",
      });

      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

      const request = mockRequest({ new_owner_id: "nonexistent-user" });
      await expect((transferOwnership as Function)(request)).rejects.toThrow();
    });
  });
});
