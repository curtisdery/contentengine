import { describe, it, expect } from "vitest";
import "../helpers/setup.js";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { ValidationError } from "../../shared/errors.js";

const testSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
  email: z.string().email().optional(),
});

describe("validate", () => {
  it("returns typed data when input is valid", () => {
    const input = { name: "Alice", age: 30 };
    const result = validate(testSchema, input);
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  it("includes optional fields when provided", () => {
    const input = { name: "Bob", age: 25, email: "bob@test.com" };
    const result = validate(testSchema, input);
    expect(result).toEqual({ name: "Bob", age: 25, email: "bob@test.com" });
  });

  it("strips unknown fields (Zod default behavior)", () => {
    const input = { name: "Carol", age: 40, unknown: "field" };
    const result = validate(testSchema, input);
    expect(result).toEqual({ name: "Carol", age: 40 });
    expect(result).not.toHaveProperty("unknown");
  });

  it("throws ValidationError with message 'Validation failed' for invalid data", () => {
    const input = { name: "Dave", age: "not-a-number" };
    expect(() => validate(testSchema, input)).toThrow(ValidationError);
    try {
      validate(testSchema, input);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toBe("Validation failed");
      expect((err as ValidationError).code).toBe("invalid-argument");
    }
  });

  it("throws ValidationError when required fields are missing", () => {
    const input = { age: 30 };
    expect(() => validate(testSchema, input)).toThrow(ValidationError);
    try {
      validate(testSchema, input);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toBe("Validation failed");
    }
  });

  it("throws ValidationError for completely empty input", () => {
    expect(() => validate(testSchema, {})).toThrow(ValidationError);
  });

  it("includes issue details in the error detail field", () => {
    const input = { name: "", age: -5 };
    try {
      validate(testSchema, input);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const detail = (err as ValidationError).detail;
      expect(detail).toBeDefined();
      expect(typeof detail).toBe("string");
      // Detail should contain Zod issue descriptions joined by semicolons
      expect(detail.length).toBeGreaterThan(0);
    }
  });
});
