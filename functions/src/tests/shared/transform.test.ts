import { describe, it, expect } from "vitest";
import "../helpers/setup.js";
import { toSnakeCase, toCamelCase, docToResponse } from "../../shared/transform.js";

// ─── toSnakeCase ────────────────────────────────────────────────────────────

describe("toSnakeCase", () => {
  it("converts simple camelCase keys to snake_case", () => {
    const input = { firstName: "Alice", lastName: "Smith" };
    expect(toSnakeCase(input)).toEqual({ first_name: "Alice", last_name: "Smith" });
  });

  it("handles nested objects", () => {
    const input = { userProfile: { displayName: "Bob", emailAddress: "bob@test.com" } };
    expect(toSnakeCase(input)).toEqual({
      user_profile: { display_name: "Bob", email_address: "bob@test.com" },
    });
  });

  it("handles arrays", () => {
    const input = [{ firstName: "Alice" }, { firstName: "Bob" }];
    expect(toSnakeCase(input)).toEqual([{ first_name: "Alice" }, { first_name: "Bob" }]);
  });

  it("returns null as-is", () => {
    expect(toSnakeCase(null)).toBeNull();
  });

  it("returns undefined as-is", () => {
    expect(toSnakeCase(undefined)).toBeUndefined();
  });

  it("converts Date to ISO string", () => {
    const date = new Date("2025-06-15T12:00:00.000Z");
    expect(toSnakeCase(date)).toBe("2025-06-15T12:00:00.000Z");
  });

  it("converts Firestore Timestamp (object with toDate) to ISO string", () => {
    const isoStr = "2025-06-15T12:00:00.000Z";
    const timestamp = { toDate: () => new Date(isoStr) };
    const input = { createdAt: timestamp };
    expect(toSnakeCase(input)).toEqual({ created_at: isoStr });
  });

  it("passes primitive values through unchanged", () => {
    expect(toSnakeCase("hello")).toBe("hello");
    expect(toSnakeCase(42)).toBe(42);
    expect(toSnakeCase(true)).toBe(true);
  });
});

// ─── toCamelCase ────────────────────────────────────────────────────────────

describe("toCamelCase", () => {
  it("converts simple snake_case keys to camelCase", () => {
    const input = { first_name: "Alice", last_name: "Smith" };
    expect(toCamelCase(input)).toEqual({ firstName: "Alice", lastName: "Smith" });
  });

  it("handles nested objects", () => {
    const input = { user_profile: { display_name: "Bob", email_address: "bob@test.com" } };
    expect(toCamelCase(input)).toEqual({
      userProfile: { displayName: "Bob", emailAddress: "bob@test.com" },
    });
  });

  it("handles arrays", () => {
    const input = [{ first_name: "Alice" }, { first_name: "Bob" }];
    expect(toCamelCase(input)).toEqual([{ firstName: "Alice" }, { firstName: "Bob" }]);
  });

  it("returns null as-is", () => {
    expect(toCamelCase(null)).toBeNull();
  });

  it("returns undefined as-is", () => {
    expect(toCamelCase(undefined)).toBeUndefined();
  });

  it("passes primitive values through unchanged", () => {
    expect(toCamelCase("hello")).toBe("hello");
    expect(toCamelCase(42)).toBe(42);
    expect(toCamelCase(true)).toBe(true);
  });
});

// ─── docToResponse ──────────────────────────────────────────────────────────

describe("docToResponse", () => {
  it("adds id field and converts keys to snake_case", () => {
    const data = { firstName: "Alice", isActive: true };
    const result = docToResponse("doc-123", data);
    expect(result).toEqual({ id: "doc-123", first_name: "Alice", is_active: true });
  });

  it("handles empty data with just the id", () => {
    const result = docToResponse("doc-456", {});
    expect(result).toEqual({ id: "doc-456" });
  });

  it("handles nested data with Firestore Timestamps", () => {
    const isoStr = "2025-01-01T00:00:00.000Z";
    const data = {
      displayName: "Test",
      createdAt: { toDate: () => new Date(isoStr) },
    };
    const result = docToResponse("doc-789", data);
    expect(result).toEqual({
      id: "doc-789",
      display_name: "Test",
      created_at: isoStr,
    });
  });
});
