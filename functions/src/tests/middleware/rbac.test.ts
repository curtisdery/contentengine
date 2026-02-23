import { describe, it, expect } from "vitest";
import "../helpers/setup.js";
import { assertRole, hasRole } from "../../middleware/rbac.js";
import { PermissionError } from "../../shared/errors.js";

interface AuthContext {
  uid: string;
  email: string;
  userId: string;
  workspaceId: string;
  organizationId: string;
  role: "owner" | "admin" | "editor" | "viewer";
}

function makeCtx(role: AuthContext["role"]): AuthContext {
  return {
    uid: "firebase-uid",
    email: "user@test.com",
    userId: "user-123",
    workspaceId: "ws-123",
    organizationId: "org-123",
    role,
  };
}

// ─── assertRole ─────────────────────────────────────────────────────────────

describe("assertRole", () => {
  describe("owner", () => {
    const ctx = makeCtx("owner");

    it("can access owner-level", () => {
      expect(() => assertRole(ctx, "owner")).not.toThrow();
    });

    it("can access admin-level", () => {
      expect(() => assertRole(ctx, "admin")).not.toThrow();
    });

    it("can access editor-level", () => {
      expect(() => assertRole(ctx, "editor")).not.toThrow();
    });

    it("can access viewer-level", () => {
      expect(() => assertRole(ctx, "viewer")).not.toThrow();
    });
  });

  describe("admin", () => {
    const ctx = makeCtx("admin");

    it("cannot access owner-level", () => {
      expect(() => assertRole(ctx, "owner")).toThrow(PermissionError);
    });

    it("can access admin-level", () => {
      expect(() => assertRole(ctx, "admin")).not.toThrow();
    });

    it("can access editor-level", () => {
      expect(() => assertRole(ctx, "editor")).not.toThrow();
    });

    it("can access viewer-level", () => {
      expect(() => assertRole(ctx, "viewer")).not.toThrow();
    });
  });

  describe("editor", () => {
    const ctx = makeCtx("editor");

    it("cannot access owner-level", () => {
      expect(() => assertRole(ctx, "owner")).toThrow(PermissionError);
    });

    it("cannot access admin-level", () => {
      expect(() => assertRole(ctx, "admin")).toThrow(PermissionError);
    });

    it("can access editor-level", () => {
      expect(() => assertRole(ctx, "editor")).not.toThrow();
    });

    it("can access viewer-level", () => {
      expect(() => assertRole(ctx, "viewer")).not.toThrow();
    });
  });

  describe("viewer", () => {
    const ctx = makeCtx("viewer");

    it("cannot access owner-level", () => {
      expect(() => assertRole(ctx, "owner")).toThrow(PermissionError);
    });

    it("cannot access admin-level", () => {
      expect(() => assertRole(ctx, "admin")).toThrow(PermissionError);
    });

    it("cannot access editor-level", () => {
      expect(() => assertRole(ctx, "editor")).toThrow(PermissionError);
    });

    it("can access viewer-level", () => {
      expect(() => assertRole(ctx, "viewer")).not.toThrow();
    });
  });

  it("throws PermissionError with descriptive message on insufficient role", () => {
    const ctx = makeCtx("viewer");
    try {
      assertRole(ctx, "admin");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionError);
      expect((err as PermissionError).message).toBe("Insufficient permissions");
      expect((err as PermissionError).detail).toContain("admin");
      expect((err as PermissionError).detail).toContain("viewer");
      expect((err as PermissionError).code).toBe("permission-denied");
    }
  });
});

// ─── hasRole ────────────────────────────────────────────────────────────────

describe("hasRole", () => {
  describe("owner", () => {
    const ctx = makeCtx("owner");

    it("returns true for owner-level", () => {
      expect(hasRole(ctx, "owner")).toBe(true);
    });

    it("returns true for admin-level", () => {
      expect(hasRole(ctx, "admin")).toBe(true);
    });

    it("returns true for editor-level", () => {
      expect(hasRole(ctx, "editor")).toBe(true);
    });

    it("returns true for viewer-level", () => {
      expect(hasRole(ctx, "viewer")).toBe(true);
    });
  });

  describe("admin", () => {
    const ctx = makeCtx("admin");

    it("returns false for owner-level", () => {
      expect(hasRole(ctx, "owner")).toBe(false);
    });

    it("returns true for admin-level", () => {
      expect(hasRole(ctx, "admin")).toBe(true);
    });

    it("returns true for editor-level", () => {
      expect(hasRole(ctx, "editor")).toBe(true);
    });

    it("returns true for viewer-level", () => {
      expect(hasRole(ctx, "viewer")).toBe(true);
    });
  });

  describe("editor", () => {
    const ctx = makeCtx("editor");

    it("returns false for owner-level", () => {
      expect(hasRole(ctx, "owner")).toBe(false);
    });

    it("returns false for admin-level", () => {
      expect(hasRole(ctx, "admin")).toBe(false);
    });

    it("returns true for editor-level", () => {
      expect(hasRole(ctx, "editor")).toBe(true);
    });

    it("returns true for viewer-level", () => {
      expect(hasRole(ctx, "viewer")).toBe(true);
    });
  });

  describe("viewer", () => {
    const ctx = makeCtx("viewer");

    it("returns false for owner-level", () => {
      expect(hasRole(ctx, "owner")).toBe(false);
    });

    it("returns false for admin-level", () => {
      expect(hasRole(ctx, "admin")).toBe(false);
    });

    it("returns false for editor-level", () => {
      expect(hasRole(ctx, "editor")).toBe(false);
    });

    it("returns true for viewer-level", () => {
      expect(hasRole(ctx, "viewer")).toBe(true);
    });
  });

  it("does not throw when role is insufficient (returns false instead)", () => {
    const ctx = makeCtx("viewer");
    expect(() => hasRole(ctx, "owner")).not.toThrow();
    expect(hasRole(ctx, "owner")).toBe(false);
  });
});
