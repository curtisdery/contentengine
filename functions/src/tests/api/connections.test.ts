/**
 * Tests for Connections API — getOAuthURL, listConnections, disconnectPlatform, refreshConnection.
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
    PLATFORM_CONNECTIONS: "platformConnections",
  },
}));

vi.mock("../../shared/transform.js", () => ({
  docToResponse: vi.fn((id: string, data: Record<string, unknown>) => ({ id, ...data })),
}));

vi.mock("../../lib/encryption.js", () => ({
  encryptToken: vi.fn((token: string) => `encrypted_${token}`),
  decryptToken: vi.fn((token: string) => token.replace("encrypted_", "")),
}));

const mockRefreshToken = vi.fn().mockResolvedValue({
  accessToken: "new-access-token",
  refreshToken: "new-refresh-token",
  expiresIn: 3600,
});

vi.mock("../../lib/platforms/publishers/registry.js", () => ({
  getPublisher: vi.fn(() => ({
    refreshToken: mockRefreshToken,
    publish: vi.fn(),
  })),
}));

vi.mock("../../lib/platforms/oauthConfigs.js", () => ({
  getOAuthConfig: vi.fn((platformId: string) => {
    if (platformId === "unsupported") return null;
    return {
      platformId,
      authMethod: "oauth2",
      authorizeUrl: `https://auth.${platformId}.com/authorize`,
      tokenUrl: `https://auth.${platformId}.com/token`,
      userinfoUrl: `https://api.${platformId}.com/userinfo`,
      scopes: ["read", "write"],
      clientIdEnv: `${platformId.toUpperCase()}_CLIENT_ID`,
      clientSecretEnv: `${platformId.toUpperCase()}_CLIENT_SECRET`,
      usesPkce: false,
      tokenAuthMethod: "post_body",
      extraAuthorizeParams: {},
      extraTokenParams: {},
    };
  }),
  AuthMethod: { OAUTH2: "oauth2", APP_PASSWORD: "app_password", API_KEY: "api_key", NONE: "none" },
}));

import { getOAuthURL, listConnections, disconnectPlatform, refreshConnection } from "../../api/connections.js";
import { verifyAuth } from "../../middleware/auth.js";
import { assertRole } from "../../middleware/rbac.js";

function mockRequest(data: Record<string, unknown> = {}) {
  return { auth: { uid: "test-uid", token: { email: "test@example.com" } }, data } as unknown;
}

describe("Connections API", () => {
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
    mockDocRef.delete.mockResolvedValue(undefined);
    mockDb.collection.mockReturnValue(mockCollectionRef);

    // Set up env for OAuth client ID lookup
    process.env.TWITTER_CLIENT_ID = "test-twitter-client-id";
    process.env.LINKEDIN_CLIENT_ID = "test-linkedin-client-id";
  });

  // ─── getOAuthURL ──────────────────────────────────────────────────────────

  describe("getOAuthURL", () => {
    it("generates an authorize URL with state for a supported platform", async () => {
      const request = mockRequest({ platform_id: "twitter" });
      const result = await (getOAuthURL as Function)(request);

      expect(verifyAuth).toHaveBeenCalled();
      expect(assertRole).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), "editor");
      expect(result.authorize_url).toBeDefined();
      expect(result.authorize_url).toContain("https://auth.twitter.com/authorize");
      expect(result.authorize_url).toContain("state=");
      expect(result.authorize_url).toContain("client_id=");
    });

    it("stores state token in Firestore with TTL", async () => {
      const request = mockRequest({ platform_id: "twitter" });
      await (getOAuthURL as Function)(request);

      // Verify state was stored (the oauthStates collection)
      expect(mockDocRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-123",
          workspaceId: "ws-123",
          platformId: "twitter",
        })
      );
    });

    it("throws ValidationError for unsupported platform", async () => {
      const request = mockRequest({ platform_id: "unsupported" });
      await expect((getOAuthURL as Function)(request)).rejects.toThrow();
    });
  });

  // ─── listConnections ──────────────────────────────────────────────────────

  describe("listConnections", () => {
    it("returns active connections for the workspace", async () => {
      const connectionDocs = [
        {
          id: "conn-1",
          data: () => ({
            workspaceId: "ws-123",
            platformId: "twitter",
            platformUsername: "myhandle",
            isActive: true,
            createdAt: { toDate: () => new Date("2026-01-01T00:00:00Z") },
          }),
        },
        {
          id: "conn-2",
          data: () => ({
            workspaceId: "ws-123",
            platformId: "linkedin",
            platformUsername: "myprofile",
            isActive: true,
            createdAt: { toDate: () => new Date("2026-01-15T00:00:00Z") },
          }),
        },
      ];

      mockCollectionRef.get.mockResolvedValue({ empty: false, docs: connectionDocs, size: 2 });

      const request = mockRequest({});
      const result = await (listConnections as Function)(request);

      expect(verifyAuth).toHaveBeenCalled();
      expect(result.items).toBeDefined();
      expect(result.total).toBe(2);
      expect(result.items[0].platform_id).toBe("twitter");
      expect(result.items[1].platform_id).toBe("linkedin");
    });
  });

  // ─── disconnectPlatform ───────────────────────────────────────────────────

  describe("disconnectPlatform", () => {
    it("sets isActive to false and clears tokens", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          workspaceId: "ws-123",
          platformId: "twitter",
          isActive: true,
          accessTokenEncrypted: "encrypted_token",
        }),
        id: "conn-1",
        ref: mockDocRef,
      });

      const request = mockRequest({ connection_id: "conn-1" });
      const result = await (disconnectPlatform as Function)(request);

      expect(assertRole).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), "editor");
      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          accessTokenEncrypted: null,
          refreshTokenEncrypted: null,
        })
      );
      expect(result.success).toBe(true);
    });

    it("throws NotFoundError when connection does not exist", async () => {
      mockDocRef.get.mockResolvedValue({
        exists: false,
        data: () => null,
        id: "nonexistent",
        ref: mockDocRef,
      });

      const request = mockRequest({ connection_id: "nonexistent" });
      await expect((disconnectPlatform as Function)(request)).rejects.toThrow();
    });
  });

  // ─── refreshConnection ────────────────────────────────────────────────────

  describe("refreshConnection", () => {
    it("refreshes tokens using the platform publisher", async () => {
      let docGetCount = 0;
      mockDocRef.get.mockImplementation(() => {
        docGetCount++;
        return Promise.resolve({
          exists: true,
          data: () => ({
            workspaceId: "ws-123",
            platformId: "twitter",
            isActive: true,
            accessTokenEncrypted: "encrypted_old-access-token",
            refreshTokenEncrypted: "encrypted_old-refresh-token",
            platformUserId: "user-tw-123",
            platformUsername: "myhandle",
            tokenExpiresAt: null,
          }),
          id: "conn-1",
          ref: mockDocRef,
        });
      });

      const request = mockRequest({ connection_id: "conn-1" });
      const result = await (refreshConnection as Function)(request);

      expect(mockRefreshToken).toHaveBeenCalled();
      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          accessTokenEncrypted: "encrypted_new-access-token",
        })
      );
      expect(result.success).toBe(true);
    });
  });
});
