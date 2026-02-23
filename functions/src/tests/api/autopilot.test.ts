/**
 * Tests for Autopilot API — getEligibility, toggleAutopilot.
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
    AUTOPILOT_CONFIGS: "autopilotConfigs",
  },
}));

import { getEligibility, toggleAutopilot } from "../../api/autopilot.js";
import { verifyAuth } from "../../middleware/auth.js";
import { assertRole } from "../../middleware/rbac.js";

function mockRequest(data: Record<string, unknown> = {}) {
  return { auth: { uid: "test-uid", token: { email: "test@example.com" } }, data } as unknown;
}

describe("Autopilot API", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
    mockCollectionRef.where.mockReturnValue(mockCollectionRef);
    mockCollectionRef.limit.mockReturnValue(mockCollectionRef);
    mockCollectionRef.doc.mockReturnValue(mockDocRef);
    mockCollectionRef.add.mockResolvedValue(mockDocRef);
    mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({}), id: "mock-doc-id", ref: mockDocRef });
    mockDocRef.set.mockResolvedValue(undefined);
    mockDocRef.update.mockResolvedValue(undefined);
    mockDb.collection.mockReturnValue(mockCollectionRef);
  });

  // ─── getEligibility ───────────────────────────────────────────────────────

  describe("getEligibility", () => {
    it("returns eligible when criteria are met (>=85% approval, >=10 reviews)", async () => {
      const configRef = { update: vi.fn().mockResolvedValue(undefined) };

      mockCollectionRef.get.mockResolvedValue({
        empty: false,
        docs: [{
          id: "config-1",
          data: () => ({
            totalOutputsReviewed: 20,
            approvedWithoutEdit: 18, // 90% approval
          }),
          ref: configRef,
        }],
        size: 1,
      });

      const request = mockRequest({ platform_id: "twitter" });
      const result = await (getEligibility as Function)(request);

      expect(verifyAuth).toHaveBeenCalled();
      expect(result.eligible).toBe(true);
      expect(result.current_approval_rate).toBe(0.9);
      expect(result.reviews_completed).toBe(20);
      expect(result.reviews_required).toBe(10);
      expect(result.message).toContain("eligible");
    });

    it("returns ineligible when not enough reviews have been completed", async () => {
      mockCollectionRef.get.mockResolvedValue({
        empty: false,
        docs: [{
          id: "config-1",
          data: () => ({
            totalOutputsReviewed: 5, // Below 10 minimum
            approvedWithoutEdit: 5,
          }),
          ref: { update: vi.fn() },
        }],
        size: 1,
      });

      const request = mockRequest({ platform_id: "twitter" });
      const result = await (getEligibility as Function)(request);

      expect(result.eligible).toBe(false);
      expect(result.reviews_completed).toBe(5);
      expect(result.message).toContain("more reviews");
    });

    it("returns ineligible when approval rate is below threshold", async () => {
      mockCollectionRef.get.mockResolvedValue({
        empty: false,
        docs: [{
          id: "config-1",
          data: () => ({
            totalOutputsReviewed: 20,
            approvedWithoutEdit: 10, // 50% approval - below 85%
          }),
          ref: { update: vi.fn() },
        }],
        size: 1,
      });

      const request = mockRequest({ platform_id: "twitter" });
      const result = await (getEligibility as Function)(request);

      expect(result.eligible).toBe(false);
      expect(result.current_approval_rate).toBe(0.5);
      expect(result.message).toContain("below");
    });

    it("returns ineligible when no config exists (zero reviews)", async () => {
      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

      const request = mockRequest({ platform_id: "twitter" });
      const result = await (getEligibility as Function)(request);

      expect(result.eligible).toBe(false);
      expect(result.reviews_completed).toBe(0);
    });
  });

  // ─── toggleAutopilot ─────────────────────────────────────────────────────

  describe("toggleAutopilot", () => {
    it("enables autopilot when the platform is eligible", async () => {
      const configRef = { update: vi.fn().mockResolvedValue(undefined) };

      mockCollectionRef.get.mockResolvedValue({
        empty: false,
        docs: [{
          id: "config-1",
          data: () => ({
            totalOutputsReviewed: 15,
            approvedWithoutEdit: 14, // 93% approval
            enabled: false,
          }),
          ref: configRef,
        }],
        size: 1,
      });

      const request = mockRequest({ platform_id: "twitter", enabled: true });
      const result = await (toggleAutopilot as Function)(request);

      expect(assertRole).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), "admin");
      expect(configRef.update).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true);
    });

    it("rejects enabling autopilot when the platform is not eligible", async () => {
      mockCollectionRef.get.mockResolvedValue({
        empty: false,
        docs: [{
          id: "config-1",
          data: () => ({
            totalOutputsReviewed: 5, // Not enough reviews
            approvedWithoutEdit: 5,
            enabled: false,
          }),
          ref: { update: vi.fn() },
        }],
        size: 1,
      });

      const request = mockRequest({ platform_id: "twitter", enabled: true });
      await expect((toggleAutopilot as Function)(request)).rejects.toThrow();
    });

    it("disables autopilot without eligibility check", async () => {
      const configRef = { update: vi.fn().mockResolvedValue(undefined) };

      mockCollectionRef.get.mockResolvedValue({
        empty: false,
        docs: [{
          id: "config-1",
          data: () => ({
            totalOutputsReviewed: 0,
            approvedWithoutEdit: 0,
            enabled: true,
          }),
          ref: configRef,
        }],
        size: 1,
      });

      const request = mockRequest({ platform_id: "twitter", enabled: false });
      const result = await (toggleAutopilot as Function)(request);

      expect(configRef.update).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
      expect(result.success).toBe(true);
      expect(result.enabled).toBe(false);
    });

    it("creates a new config document when none exists and disabling", async () => {
      mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

      const request = mockRequest({ platform_id: "twitter", enabled: false });
      const result = await (toggleAutopilot as Function)(request);

      expect(mockCollectionRef.add).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-123",
          platformId: "twitter",
          enabled: false,
        })
      );
      expect(result.success).toBe(true);
    });
  });
});
