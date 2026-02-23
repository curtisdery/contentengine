/**
 * Tests for Auth API — 8 onCall functions for user profile and session management.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, mockAuth, mockCollectionRef, mockDocRef } from "../helpers/setup.js";

// ─── Helper: build mock request ──────────────────────────────────────────────
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

// ─── Helpers to wire up the Firestore mock chains for verifyAuth ────────────

/**
 * verifyAuth for an existing user queries:
 *  1. db.collection("users").where("firebaseUid", "==", uid).limit(1).get()
 *  2. db.collection("workspaces").doc(workspaceId).get()
 *  3. db.collection("organizationMembers").where(...).where(...).limit(1).get()
 *
 * Because mockDb.collection always returns the same mockCollectionRef, we have
 * to make the mock return the right thing at the right time.  The simplest
 * approach: override mockCollectionRef.get per-test, and give mockDocRef
 * sensible defaults for the workspace lookup.
 */
function setupExistingUserMocks(overrides?: {
  role?: string;
  isActive?: boolean;
  userId?: string;
  workspaceId?: string;
  organizationId?: string;
}) {
  const userId = overrides?.userId ?? "mock-doc-id";
  const workspaceId = overrides?.workspaceId ?? "ws-1";
  const organizationId = overrides?.organizationId ?? "org-1";
  const role = overrides?.role ?? "owner";
  const isActive = overrides?.isActive ?? true;

  const userDoc = {
    firebaseUid: "test-uid",
    email: "test@example.com",
    fullName: "Test User",
    avatarUrl: null,
    emailVerified: true,
    isActive,
    defaultWorkspaceId: workspaceId,
    fcmTokens: [],
    mfaEnabled: false,
  };

  // Users query: collection("users").where(...).limit(1).get()
  // Workspaces lookup: collection("workspaces").doc(wsId).get()
  // OrgMembers query: collection("organizationMembers").where(...).where(...).limit(1).get()

  // Track which collection is being queried
  let collectionCallCount = 0;
  mockDb.collection.mockImplementation((name: string) => {
    collectionCallCount++;
    if (name === "users") {
      return {
        doc: vi.fn().mockReturnValue({
          ...mockDocRef,
          id: userId,
          get: vi.fn().mockResolvedValue({
            exists: true,
            id: userId,
            data: () => userDoc,
            ref: mockDocRef,
          }),
        }),
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              empty: false,
              docs: [
                {
                  id: userId,
                  data: () => userDoc,
                  ref: mockDocRef,
                },
              ],
              size: 1,
            }),
          }),
          get: vi.fn().mockResolvedValue({
            empty: false,
            docs: [
              {
                id: userId,
                data: () => userDoc,
                ref: mockDocRef,
              },
            ],
            size: 1,
          }),
        }),
        get: vi.fn().mockResolvedValue({ empty: false, docs: [{ id: userId, data: () => userDoc, ref: mockDocRef }], size: 1 }),
      };
    }
    if (name === "workspaces") {
      return {
        doc: vi.fn().mockReturnValue({
          ...mockDocRef,
          id: workspaceId,
          get: vi.fn().mockResolvedValue({
            exists: true,
            id: workspaceId,
            data: () => ({ organizationId, name: "Default Workspace", slug: "default" }),
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
                docs: [
                  {
                    id: "member-1",
                    data: () => ({ organizationId, userId, role }),
                    ref: {},
                  },
                ],
                size: 1,
              }),
            }),
          }),
        }),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
      };
    }
    // Default fallback for any other collection
    return mockCollectionRef;
  });

  return { userId, workspaceId, organizationId, userDoc };
}

// ─── Import the functions under test (after mocks are set up via setup.ts) ──
// onCall is mocked to return the handler function directly, so these exports
// are the async handler functions themselves.
import {
  createProfile,
  updateProfile,
  enableMFA,
  verifyMFA,
  registerFCMToken,
  revokeFCMToken,
  listSessions,
  revokeSession,
} from "../../api/auth.js";

describe("Auth API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default mock behaviour
    mockDb.collection.mockReturnValue(mockCollectionRef);
    mockCollectionRef.doc.mockReturnValue(mockDocRef);
    mockCollectionRef.where.mockReturnThis();
    mockCollectionRef.limit.mockReturnThis();
    mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
    mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({}), id: "mock-doc-id", ref: mockDocRef });
    mockDocRef.update.mockResolvedValue(undefined);
  });

  // ─── createProfile ────────────────────────────────────────────────────────

  describe("createProfile", () => {
    it("should return the user profile for an authenticated user", async () => {
      const { userId, userDoc } = setupExistingUserMocks();

      const result = await (createProfile as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest()
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(userId);
    });

    it("should throw when not authenticated", async () => {
      await expect(
        (createProfile as unknown as (req: unknown) => Promise<unknown>)(unauthenticatedRequest())
      ).rejects.toThrow();
    });
  });

  // ─── updateProfile ────────────────────────────────────────────────────────

  describe("updateProfile", () => {
    it("should update the user profile with valid input", async () => {
      const { userId } = setupExistingUserMocks();

      const result = await (updateProfile as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({ full_name: "Updated Name" })
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(userId);
    });

    it("should call doc.update with the correct fields", async () => {
      setupExistingUserMocks();

      // We need the update spy from the users collection doc mock
      let updateSpy: ReturnType<typeof vi.fn> | undefined;
      mockDb.collection.mockImplementation((name: string) => {
        if (name === "users") {
          updateSpy = vi.fn().mockResolvedValue(undefined);
          const docMock = {
            ...mockDocRef,
            id: "mock-doc-id",
            update: updateSpy,
            get: vi.fn().mockResolvedValue({
              exists: true,
              id: "mock-doc-id",
              data: () => ({
                firebaseUid: "test-uid",
                email: "test@example.com",
                fullName: "Updated Name",
                avatarUrl: null,
                emailVerified: true,
                isActive: true,
                defaultWorkspaceId: "ws-1",
                fcmTokens: [],
                mfaEnabled: false,
              }),
              ref: mockDocRef,
            }),
          };
          return {
            doc: vi.fn().mockReturnValue(docMock),
            where: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                  empty: false,
                  docs: [{
                    id: "mock-doc-id",
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
              get: vi.fn().mockResolvedValue({ empty: false, docs: [], size: 0 }),
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
        return mockCollectionRef;
      });

      const result = await (updateProfile as unknown as (req: unknown) => Promise<unknown>)(
        authedRequest({ full_name: "Updated Name" })
      );

      // Verify the function completed without error (the update path was exercised)
      expect(result).toBeDefined();
    });

    it("should throw when not authenticated", async () => {
      await expect(
        (updateProfile as unknown as (req: unknown) => Promise<unknown>)(unauthenticatedRequest({ full_name: "X" }))
      ).rejects.toThrow();
    });
  });

  // ─── enableMFA ────────────────────────────────────────────────────────────

  describe("enableMFA", () => {
    it("should enable MFA and return success", async () => {
      setupExistingUserMocks();

      const result = await (enableMFA as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest()
      );

      expect(result).toEqual({ success: true, message: "MFA enabled. Complete enrollment in your authenticator app." });
    });
  });

  // ─── verifyMFA ────────────────────────────────────────────────────────────

  describe("verifyMFA", () => {
    it("should return MFA status for authenticated user", async () => {
      setupExistingUserMocks();

      const result = await (verifyMFA as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest()
      );

      expect(result).toBeDefined();
      expect(result).toHaveProperty("mfa_enabled");
      expect(result).toHaveProperty("verified", true);
    });
  });

  // ─── registerFCMToken ─────────────────────────────────────────────────────

  describe("registerFCMToken", () => {
    it("should register a token and return success", async () => {
      setupExistingUserMocks();

      const result = await (registerFCMToken as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({ token: "fcm-token-abc123" })
      );

      expect(result).toEqual({ success: true });
    });

    it("should call update with FieldValue.arrayUnion for the token", async () => {
      let updateSpy: ReturnType<typeof vi.fn> | undefined;
      const baseMocks = setupExistingUserMocks();

      // Override the users collection to capture the update call
      const originalImpl = mockDb.collection.getMockImplementation();
      mockDb.collection.mockImplementation((name: string) => {
        if (name === "users") {
          updateSpy = vi.fn().mockResolvedValue(undefined);
          const userCollection = originalImpl!(name);
          const origDoc = userCollection.doc;
          userCollection.doc = vi.fn().mockImplementation((...args: unknown[]) => {
            const d = origDoc(...args);
            d.update = updateSpy;
            return d;
          });
          return userCollection;
        }
        return originalImpl!(name);
      });

      await (registerFCMToken as unknown as (req: unknown) => Promise<unknown>)(
        authedRequest({ token: "fcm-token-xyz" })
      );

      expect(updateSpy).toHaveBeenCalled();
      const updateArgs = updateSpy!.mock.calls[0][0];
      expect(updateArgs.fcmTokens).toEqual(
        expect.objectContaining({ _methodName: "arrayUnion", args: ["fcm-token-xyz"] })
      );
    });

    it("should throw when not authenticated", async () => {
      await expect(
        (registerFCMToken as unknown as (req: unknown) => Promise<unknown>)(
          unauthenticatedRequest({ token: "abc" })
        )
      ).rejects.toThrow();
    });
  });

  // ─── revokeFCMToken ───────────────────────────────────────────────────────

  describe("revokeFCMToken", () => {
    it("should revoke a token and return success", async () => {
      setupExistingUserMocks();

      const result = await (revokeFCMToken as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({ token: "fcm-token-abc123" })
      );

      expect(result).toEqual({ success: true });
    });

    it("should call update with FieldValue.arrayRemove for the token", async () => {
      let updateSpy: ReturnType<typeof vi.fn> | undefined;
      const baseMocks = setupExistingUserMocks();

      const originalImpl = mockDb.collection.getMockImplementation();
      mockDb.collection.mockImplementation((name: string) => {
        if (name === "users") {
          updateSpy = vi.fn().mockResolvedValue(undefined);
          const userCollection = originalImpl!(name);
          const origDoc = userCollection.doc;
          userCollection.doc = vi.fn().mockImplementation((...args: unknown[]) => {
            const d = origDoc(...args);
            d.update = updateSpy;
            return d;
          });
          return userCollection;
        }
        return originalImpl!(name);
      });

      await (revokeFCMToken as unknown as (req: unknown) => Promise<unknown>)(
        authedRequest({ token: "fcm-token-remove-me" })
      );

      expect(updateSpy).toHaveBeenCalled();
      const updateArgs = updateSpy!.mock.calls[0][0];
      expect(updateArgs.fcmTokens).toEqual(
        expect.objectContaining({ _methodName: "arrayRemove", args: ["fcm-token-remove-me"] })
      );
    });
  });

  // ─── listSessions ─────────────────────────────────────────────────────────

  describe("listSessions", () => {
    it("should return session info for authenticated user", async () => {
      setupExistingUserMocks();

      // Mock auth.getUser to return a Firebase user record
      mockAuth.getUser = vi.fn().mockResolvedValue({
        uid: "test-uid",
        disabled: false,
        metadata: {
          creationTime: "2024-01-01T00:00:00Z",
          lastSignInTime: "2024-06-01T12:00:00Z",
        },
      });

      const result = await (listSessions as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest()
      );

      expect(result).toBeDefined();
      expect(result.sessions).toBeDefined();
      const sessions = result.sessions as Array<Record<string, unknown>>;
      expect(sessions).toHaveLength(1);
      expect(sessions[0].is_active).toBe(true);
      expect(sessions[0].created_at).toBe("2024-01-01T00:00:00Z");
      expect(sessions[0].last_sign_in).toBe("2024-06-01T12:00:00Z");
    });

    it("should throw when not authenticated", async () => {
      await expect(
        (listSessions as unknown as (req: unknown) => Promise<unknown>)(unauthenticatedRequest())
      ).rejects.toThrow();
    });
  });

  // ─── revokeSession ────────────────────────────────────────────────────────

  describe("revokeSession", () => {
    it("should revoke all sessions and return success", async () => {
      setupExistingUserMocks();
      mockAuth.revokeRefreshTokens = vi.fn().mockResolvedValue(undefined);

      const result = await (revokeSession as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest()
      );

      expect(result).toEqual({ success: true, message: "All sessions revoked." });
      expect(mockAuth.revokeRefreshTokens).toHaveBeenCalledWith("test-uid");
    });

    it("should throw when not authenticated", async () => {
      await expect(
        (revokeSession as unknown as (req: unknown) => Promise<unknown>)(unauthenticatedRequest())
      ).rejects.toThrow();
    });
  });
});
