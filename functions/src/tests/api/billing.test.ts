/**
 * Tests for Billing API — createCheckout, createPortal, getSubscriptionStatus.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, mockCollectionRef, mockDocRef } from "../helpers/setup.js";

// ─── Mock enqueueTask (Cloud Tasks) so imports don't blow up ─────────────────
vi.mock("../../lib/taskClient.js", () => ({
  enqueueTask: vi.fn().mockResolvedValue("task-name"),
  getTaskHandlerUrl: vi.fn().mockReturnValue("https://example.com/task"),
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
 * Wire up Firestore mocks so verifyAuth resolves for an existing user and
 * billing-specific queries (subscriptions collection) return useful data.
 */
function setupBillingMocks(overrides?: {
  subscriptionData?: Record<string, unknown>;
  noSubscription?: boolean;
}) {
  const subData = overrides?.subscriptionData ?? {
    organizationId: "org-1",
    stripeCustomerId: "cus_test123",
    stripeSubscriptionId: "sub_test123",
    tier: "growth",
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodStart: { toDate: () => new Date("2024-01-01") },
    currentPeriodEnd: { toDate: () => new Date("2024-02-01") },
  };

  const subDocRef = {
    ...mockDocRef,
    id: "sub-doc-1",
    update: vi.fn().mockResolvedValue(undefined),
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
    if (name === "subscriptions") {
      return {
        doc: vi.fn().mockReturnValue(subDocRef),
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(
              overrides?.noSubscription
                ? { empty: true, docs: [], size: 0 }
                : {
                    empty: false,
                    docs: [{ id: "sub-doc-1", data: () => subData, ref: subDocRef }],
                    size: 1,
                  }
            ),
          }),
          get: vi.fn().mockResolvedValue(
            overrides?.noSubscription
              ? { empty: true, docs: [], size: 0 }
              : {
                  empty: false,
                  docs: [{ id: "sub-doc-1", data: () => subData, ref: subDocRef }],
                  size: 1,
                }
          ),
        }),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
      };
    }
    return mockCollectionRef;
  });

  return { subDocRef, subData };
}

// ─── Import functions under test ─────────────────────────────────────────────
import { createCheckout, createPortal, getSubscriptionStatus } from "../../api/billing.js";

describe("Billing API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.collection.mockReturnValue(mockCollectionRef);
    mockCollectionRef.doc.mockReturnValue(mockDocRef);
    mockCollectionRef.where.mockReturnThis();
    mockCollectionRef.limit.mockReturnThis();
    mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
    mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({}), id: "mock-doc-id", ref: mockDocRef });
  });

  // ─── createCheckout ──────────────────────────────────────────────────────

  describe("createCheckout", () => {
    it("should create a Stripe checkout session and return the URL", async () => {
      setupBillingMocks();

      const result = await (createCheckout as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest({
          tier: "growth",
          success_url: "https://app.example.com/success",
          cancel_url: "https://app.example.com/cancel",
        })
      );

      expect(result).toBeDefined();
      expect(result.checkout_url).toBe("https://checkout.stripe.com/test");
    });

    it("should throw when not authenticated", async () => {
      await expect(
        (createCheckout as unknown as (req: unknown) => Promise<unknown>)(
          unauthenticatedRequest({
            tier: "growth",
            success_url: "https://example.com/success",
            cancel_url: "https://example.com/cancel",
          })
        )
      ).rejects.toThrow();
    });

    it("should throw for invalid tier", async () => {
      setupBillingMocks();

      await expect(
        (createCheckout as unknown as (req: unknown) => Promise<unknown>)(
          authedRequest({
            tier: "enterprise",
            success_url: "https://example.com/success",
            cancel_url: "https://example.com/cancel",
          })
        )
      ).rejects.toThrow();
    });

    it("should throw when no subscription exists", async () => {
      setupBillingMocks({ noSubscription: true });

      await expect(
        (createCheckout as unknown as (req: unknown) => Promise<unknown>)(
          authedRequest({
            tier: "growth",
            success_url: "https://example.com/success",
            cancel_url: "https://example.com/cancel",
          })
        )
      ).rejects.toThrow();
    });
  });

  // ─── createPortal ────────────────────────────────────────────────────────

  describe("createPortal", () => {
    it("should create a Stripe billing portal session and return the URL", async () => {
      setupBillingMocks();

      const result = await (createPortal as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest()
      );

      expect(result).toBeDefined();
      expect(result.portal_url).toBe("https://billing.stripe.com/test");
    });

    it("should throw when not authenticated", async () => {
      await expect(
        (createPortal as unknown as (req: unknown) => Promise<unknown>)(unauthenticatedRequest())
      ).rejects.toThrow();
    });

    it("should throw when no Stripe customer exists", async () => {
      setupBillingMocks({
        subscriptionData: {
          organizationId: "org-1",
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          tier: "starter",
          status: "trialing",
          cancelAtPeriodEnd: false,
          currentPeriodStart: null,
          currentPeriodEnd: null,
        },
      });

      await expect(
        (createPortal as unknown as (req: unknown) => Promise<unknown>)(authedRequest())
      ).rejects.toThrow();
    });
  });

  // ─── getSubscriptionStatus ───────────────────────────────────────────────

  describe("getSubscriptionStatus", () => {
    it("should return subscription data for the organization", async () => {
      setupBillingMocks();

      const result = await (getSubscriptionStatus as unknown as (req: unknown) => Promise<Record<string, unknown>>)(
        authedRequest()
      );

      expect(result).toBeDefined();
      expect(result.id).toBe("sub-doc-1");
      expect(result.organization_id).toBe("org-1");
      expect(result.tier).toBe("growth");
      expect(result.status).toBe("active");
      expect(result.stripe_customer_id).toBe("cus_test123");
      expect(result.stripe_subscription_id).toBe("sub_test123");
      expect(result.cancel_at_period_end).toBe(false);
    });

    it("should throw when not authenticated", async () => {
      await expect(
        (getSubscriptionStatus as unknown as (req: unknown) => Promise<unknown>)(unauthenticatedRequest())
      ).rejects.toThrow();
    });

    it("should throw when no subscription exists", async () => {
      setupBillingMocks({ noSubscription: true });

      await expect(
        (getSubscriptionStatus as unknown as (req: unknown) => Promise<unknown>)(authedRequest())
      ).rejects.toThrow();
    });
  });
});
