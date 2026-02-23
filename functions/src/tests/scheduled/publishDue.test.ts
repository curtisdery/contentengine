import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, mockCollectionRef, mockDocRef } from "../helpers/setup.js";

// Mock taskClient before importing publishDue
vi.mock("../../lib/taskClient.js", () => ({
  enqueueTask: vi.fn().mockResolvedValue("task-name-123"),
  getTaskHandlerUrl: vi.fn().mockReturnValue("https://us-central1-test-project.cloudfunctions.net/taskPublishing"),
}));

import { publishDue } from "../../scheduled/publishDue.js";
import { enqueueTask, getTaskHandlerUrl } from "../../lib/taskClient.js";

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default mock: empty result
  mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
});

// ─── publishDue scheduled function ───────────────────────────────────────────

describe("publishDue", () => {
  it("queries scheduledEvents with status 'scheduled' and scheduledAt <= now", async () => {
    // publishDue is unwrapped by the onSchedule mock to just the handler fn
    await (publishDue as unknown as () => Promise<void>)();

    expect(mockDb.collection).toHaveBeenCalledWith("scheduledEvents");
    expect(mockCollectionRef.where).toHaveBeenCalledWith("scheduledAt", "<=", expect.anything());
    expect(mockCollectionRef.where).toHaveBeenCalledWith("status", "==", "scheduled");
    expect(mockCollectionRef.orderBy).toHaveBeenCalledWith("scheduledAt", "asc");
    expect(mockCollectionRef.limit).toHaveBeenCalledWith(50);
  });

  it("enqueues a Cloud Task for each due event", async () => {
    const dueDocs = [
      { id: "evt-1", data: () => ({ status: "scheduled" }), ref: { id: "evt-1" } },
      { id: "evt-2", data: () => ({ status: "scheduled" }), ref: { id: "evt-2" } },
      { id: "evt-3", data: () => ({ status: "scheduled" }), ref: { id: "evt-3" } },
    ];

    mockCollectionRef.get.mockResolvedValue({
      empty: false,
      docs: dueDocs,
      size: 3,
    });

    await (publishDue as unknown as () => Promise<void>)();

    expect(enqueueTask).toHaveBeenCalledTimes(3);
    expect(enqueueTask).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: "publishing",
        payload: { eventId: "evt-1" },
      }),
    );
    expect(enqueueTask).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: "publishing",
        payload: { eventId: "evt-2" },
      }),
    );
    expect(enqueueTask).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: "publishing",
        payload: { eventId: "evt-3" },
      }),
    );
  });

  it("handles empty result gracefully (no events due)", async () => {
    mockCollectionRef.get.mockResolvedValue({ empty: true, docs: [], size: 0 });

    await (publishDue as unknown as () => Promise<void>)();

    expect(enqueueTask).not.toHaveBeenCalled();
  });

  it("uses getTaskHandlerUrl to build the task URL", async () => {
    const dueDocs = [
      { id: "evt-1", data: () => ({ status: "scheduled" }), ref: { id: "evt-1" } },
    ];

    mockCollectionRef.get.mockResolvedValue({
      empty: false,
      docs: dueDocs,
      size: 1,
    });

    await (publishDue as unknown as () => Promise<void>)();

    expect(getTaskHandlerUrl).toHaveBeenCalledWith("taskPublishing");
    expect(enqueueTask).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://us-central1-test-project.cloudfunctions.net/taskPublishing",
      }),
    );
  });

  it("continues processing remaining events if one enqueue fails", async () => {
    const dueDocs = [
      { id: "evt-1", data: () => ({}), ref: { id: "evt-1" } },
      { id: "evt-2", data: () => ({}), ref: { id: "evt-2" } },
    ];

    mockCollectionRef.get.mockResolvedValue({
      empty: false,
      docs: dueDocs,
      size: 2,
    });

    // First call fails, second succeeds
    (enqueueTask as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("queue error"))
      .mockResolvedValueOnce("task-ok");

    // Should not throw — errors are caught per-event
    await (publishDue as unknown as () => Promise<void>)();

    expect(enqueueTask).toHaveBeenCalledTimes(2);
  });
});
