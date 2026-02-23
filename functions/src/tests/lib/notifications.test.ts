import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, mockCollectionRef, mockDocRef, mockMessaging } from "../helpers/setup.js";
import { sendNotification, notifyWorkspace } from "../../lib/notifications.js";

// ─── Reset mocks before each test ─────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Restore default mock behaviors
  mockCollectionRef.add.mockResolvedValue(mockDocRef);
  mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
  mockDocRef.get.mockResolvedValue({ exists: true, data: () => ({}), id: "mock-doc-id", ref: mockDocRef });
  mockMessaging.sendEachForMulticast.mockResolvedValue({
    successCount: 1,
    failureCount: 0,
    responses: [],
  });
});

// ─── sendNotification ─────────────────────────────────────────────────────────

describe("sendNotification", () => {
  it("creates a notification document in Firestore", async () => {
    // User has no FCM tokens
    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ fcmTokens: [] }),
      id: "user-1",
      ref: mockDocRef,
    });

    await sendNotification({
      userId: "user-1",
      workspaceId: "ws-1",
      title: "Test Title",
      body: "Test Body",
      type: "info",
    });

    // collection("notifications").add() should be called
    expect(mockDb.collection).toHaveBeenCalledWith("notifications");
    expect(mockCollectionRef.add).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "ws-1",
        title: "Test Title",
        body: "Test Body",
        type: "info",
        read: false,
      }),
    );
  });

  it("sends FCM push notification when user has tokens", async () => {
    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ fcmTokens: ["token-a", "token-b"] }),
      id: "user-1",
      ref: mockDocRef,
    });

    await sendNotification({
      userId: "user-1",
      workspaceId: "ws-1",
      title: "Push Title",
      body: "Push Body",
      type: "alert",
    });

    expect(mockMessaging.sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: { title: "Push Title", body: "Push Body" },
        tokens: ["token-a", "token-b"],
      }),
    );
  });

  it("does not send FCM push when user has no tokens", async () => {
    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ fcmTokens: [] }),
      id: "user-1",
      ref: mockDocRef,
    });

    await sendNotification({
      userId: "user-1",
      workspaceId: "ws-1",
      title: "No Push",
      body: "No FCM tokens",
      type: "info",
    });

    expect(mockMessaging.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("does not send FCM push when user doc does not exist", async () => {
    mockDocRef.get.mockResolvedValue({
      exists: false,
      data: () => null,
      id: "user-missing",
      ref: mockDocRef,
    });

    await sendNotification({
      userId: "user-missing",
      workspaceId: "ws-1",
      title: "Missing User",
      body: "User gone",
      type: "info",
    });

    expect(mockMessaging.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("cleans up invalid FCM tokens when messaging reports failures", async () => {
    const userTokens = ["valid-token", "invalid-token"];
    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ fcmTokens: userTokens }),
      id: "user-1",
      ref: mockDocRef,
    });

    mockMessaging.sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        { success: false, error: { code: "messaging/registration-token-not-registered" } },
      ],
    });

    await sendNotification({
      userId: "user-1",
      workspaceId: "ws-1",
      title: "Cleanup Test",
      body: "Some tokens invalid",
      type: "alert",
    });

    // Should call update to remove the invalid token
    expect(mockDocRef.update).toHaveBeenCalledWith(
      expect.objectContaining({
        fcmTokens: expect.objectContaining({
          _methodName: "arrayRemove",
          args: ["invalid-token"],
        }),
      }),
    );
  });

  it("returns the notification document ID", async () => {
    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ fcmTokens: [] }),
      id: "user-1",
      ref: mockDocRef,
    });

    const id = await sendNotification({
      userId: "user-1",
      workspaceId: "ws-1",
      title: "Return ID",
      body: "Testing ID return",
      type: "info",
    });

    expect(typeof id).toBe("string");
    expect(id).toBe(mockDocRef.id);
  });
});

// ─── notifyWorkspace ──────────────────────────────────────────────────────────

describe("notifyWorkspace", () => {
  it("sends notifications to all organization members", async () => {
    // First call: collection("workspaces").doc(wsId).get() -> workspace with orgId
    // Second call: collection("organizationMembers").where(...).get() -> members
    // Further calls: collection("notifications").add() for each member
    // Also: collection("users").doc(userId).get() for FCM check

    const memberDocs = [
      { data: () => ({ userId: "member-1" }), id: "m1", ref: {} },
      { data: () => ({ userId: "member-2" }), id: "m2", ref: {} },
    ];

    // Track collection calls to return different mocks
    let collectionCallCount = 0;
    mockDb.collection.mockImplementation((name: string) => {
      collectionCallCount++;
      if (name === "workspaces") {
        return {
          ...mockCollectionRef,
          doc: vi.fn().mockReturnValue({
            ...mockDocRef,
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({ organizationId: "org-1" }),
              id: "ws-1",
              ref: mockDocRef,
            }),
          }),
        };
      }
      if (name === "organizationMembers") {
        return {
          ...mockCollectionRef,
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              empty: false,
              docs: memberDocs,
              size: 2,
            }),
          }),
        };
      }
      // Default for notifications, users, etc.
      return mockCollectionRef;
    });

    // User docs for FCM (no tokens)
    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ fcmTokens: [] }),
      id: "user",
      ref: mockDocRef,
    });

    await notifyWorkspace("ws-1", "Workspace Alert", "Something happened", "alert");

    // Should have called collection for workspaces and organizationMembers
    expect(mockDb.collection).toHaveBeenCalledWith("workspaces");
    expect(mockDb.collection).toHaveBeenCalledWith("organizationMembers");
  });

  it("does nothing when workspace does not exist", async () => {
    mockDb.collection.mockImplementation((name: string) => {
      if (name === "workspaces") {
        return {
          ...mockCollectionRef,
          doc: vi.fn().mockReturnValue({
            ...mockDocRef,
            get: vi.fn().mockResolvedValue({
              exists: false,
              data: () => null,
              id: "ws-missing",
              ref: mockDocRef,
            }),
          }),
        };
      }
      return mockCollectionRef;
    });

    await notifyWorkspace("ws-missing", "Title", "Body", "info");

    // Should not have tried to query members
    expect(mockDb.collection).not.toHaveBeenCalledWith("organizationMembers");
  });
});
