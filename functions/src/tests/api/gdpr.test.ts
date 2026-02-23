/**
 * Tests for GDPR API — exportData, deleteAccount.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, mockAuth, mockCollectionRef, mockDocRef, mockBatch } from "../helpers/setup.js";

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
    CONTENT_UPLOADS: "contentUploads",
    GENERATED_OUTPUTS: "generatedOutputs",
    BRAND_VOICE_PROFILES: "brandVoiceProfiles",
    PLATFORM_CONNECTIONS: "platformConnections",
    SCHEDULED_EVENTS: "scheduledEvents",
    ANALYTICS_SNAPSHOTS: "analyticsSnapshots",
    MULTIPLIER_SCORES: "multiplierScores",
    AUTOPILOT_CONFIGS: "autopilotConfigs",
    AUDIT_LOGS: "auditLogs",
    NOTIFICATIONS: "notifications",
  },
}));

vi.mock("../../shared/transform.js", () => ({
  docToResponse: vi.fn((id: string, data: Record<string, unknown>) => ({ id, ...data })),
}));

import { exportData, deleteAccount } from "../../api/gdpr.js";
import { verifyAuth } from "../../middleware/auth.js";

function mockRequest(data: Record<string, unknown> = {}) {
  return { auth: { uid: "test-uid", token: { email: "test@example.com" } }, data } as unknown;
}

describe("GDPR API", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
    mockCollectionRef.where.mockReturnValue(mockCollectionRef);
    mockCollectionRef.limit.mockReturnValue(mockCollectionRef);
    mockCollectionRef.doc.mockReturnValue(mockDocRef);
    mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({}), id: "mock-doc-id", ref: mockDocRef });
    mockDocRef.set.mockResolvedValue(undefined);
    mockDocRef.update.mockResolvedValue(undefined);
    mockDocRef.delete.mockResolvedValue(undefined);
    mockDb.collection.mockReturnValue(mockCollectionRef);
    mockDb.batch.mockReturnValue(mockBatch);
    mockBatch.delete.mockReturnThis();
    mockBatch.commit.mockResolvedValue(undefined);
    mockAuth.deleteUser.mockResolvedValue(undefined);
  });

  // ─── exportData ───────────────────────────────────────────────────────────

  describe("exportData", () => {
    it("requires authentication", async () => {
      const request = mockRequest({});
      await (exportData as Function)(request);

      expect(verifyAuth).toHaveBeenCalledWith(request);
    });

    it("collects all user data across collections", async () => {
      // User document
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ email: "test@example.com", fullName: "Test User" }),
        id: "user-123",
        ref: mockDocRef,
      });

      // Workspace collection queries return some docs
      const contentDocs = [
        { id: "c-1", data: () => ({ title: "Podcast Ep 1", workspaceId: "ws-123" }) },
        { id: "c-2", data: () => ({ title: "Podcast Ep 2", workspaceId: "ws-123" }) },
      ];

      const outputDocs = [
        { id: "out-1", data: () => ({ platformId: "twitter", content: "Thread text" }) },
      ];

      const voiceDocs = [
        { id: "voice-1", data: () => ({ profileName: "Professional Voice" }) },
      ];

      const eventDocs = [
        { id: "event-1", data: () => ({ status: "scheduled" }) },
      ];

      let getCallNum = 0;
      mockCollectionRef.get.mockImplementation(() => {
        getCallNum++;
        switch (getCallNum) {
          case 1: return Promise.resolve({ empty: false, docs: contentDocs, size: 2 });
          case 2: return Promise.resolve({ empty: false, docs: outputDocs, size: 1 });
          case 3: return Promise.resolve({ empty: false, docs: voiceDocs, size: 1 });
          case 4: return Promise.resolve({ empty: false, docs: eventDocs, size: 1 });
          default: return Promise.resolve({ empty: true, docs: [], size: 0 });
        }
      });

      const request = mockRequest({});
      const result = await (exportData as Function)(request);

      expect(result.user).toBeDefined();
      expect(result.content_uploads).toBeDefined();
      expect(result.content_uploads.length).toBe(2);
      expect(result.generated_outputs).toBeDefined();
      expect(result.generated_outputs.length).toBe(1);
      expect(result.voice_profiles).toBeDefined();
      expect(result.voice_profiles.length).toBe(1);
      expect(result.scheduled_events).toBeDefined();
      expect(result.scheduled_events.length).toBe(1);
      expect(result.exported_at).toBeDefined();
    });
  });

  // ─── deleteAccount ────────────────────────────────────────────────────────

  describe("deleteAccount", () => {
    it("requires authentication", async () => {
      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

      const request = mockRequest({ confirmation: "DELETE MY ACCOUNT" });
      await (deleteAccount as Function)(request);

      expect(verifyAuth).toHaveBeenCalledWith(request);
    });

    it("cascade deletes all workspace data across collections", async () => {
      // All collection queries return empty for simplicity
      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

      const request = mockRequest({ confirmation: "DELETE MY ACCOUNT" });
      const result = await (deleteAccount as Function)(request);

      expect(result.success).toBe(true);
      expect(result.message).toContain("permanently deleted");

      // Verify workspace and organization docs were deleted
      expect(mockDocRef.delete).toHaveBeenCalled();
    });

    it("deletes the Firebase Auth account", async () => {
      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

      const request = mockRequest({ confirmation: "DELETE MY ACCOUNT" });
      await (deleteAccount as Function)(request);

      expect(mockAuth.deleteUser).toHaveBeenCalledWith("test-uid");
    });

    it("deletes documents in batches when collections have data", async () => {
      const docRef1 = { ref: { delete: vi.fn() } };
      const docRef2 = { ref: { delete: vi.fn() } };

      // Some collections have data, some are empty
      let getCallNum = 0;
      mockCollectionRef.get.mockImplementation(() => {
        getCallNum++;
        if (getCallNum === 1) {
          // First collection (contentUploads) has docs
          return Promise.resolve({
            empty: false,
            docs: [docRef1, docRef2],
            size: 2,
          });
        }
        return Promise.resolve({ empty: true, docs: [], size: 0 });
      });

      const request = mockRequest({ confirmation: "DELETE MY ACCOUNT" });
      const result = await (deleteAccount as Function)(request);

      expect(result.success).toBe(true);
      // Batch operations should have been called
      expect(mockBatch.delete).toHaveBeenCalled();
      expect(mockBatch.commit).toHaveBeenCalled();
    });
  });
});
