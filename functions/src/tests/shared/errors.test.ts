import { describe, it, expect } from "vitest";
import "../helpers/setup.js";
import {
  AppError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  AlreadyExistsError,
  ValidationError,
  PreconditionError,
  QuotaError,
  wrapError,
} from "../../shared/errors.js";
import { HttpsError } from "firebase-functions/v2/https";

// ─── AppError base class ────────────────────────────────────────────────────

describe("AppError", () => {
  it("stores code, message, and detail", () => {
    const err = new AppError("internal", "Something broke", "extra detail");
    expect(err.code).toBe("internal");
    expect(err.message).toBe("Something broke");
    expect(err.detail).toBe("extra detail");
    expect(err.name).toBe("AppError");
  });

  it("defaults detail to message when not provided", () => {
    const err = new AppError("internal", "Something broke");
    expect(err.detail).toBe("Something broke");
  });

  it("toHttpsError() converts to HttpsError with correct code", () => {
    const err = new AppError("not-found", "Missing", "resource gone");
    const httpsErr = err.toHttpsError();
    expect(httpsErr).toBeInstanceOf(HttpsError);
    expect(httpsErr.code).toBe("not-found");
    expect(httpsErr.message).toBe("Missing");
    expect(httpsErr.details).toBe("resource gone");
  });
});

// ─── Subclass error types ───────────────────────────────────────────────────

describe("AuthenticationError", () => {
  it("has code 'unauthenticated'", () => {
    const err = new AuthenticationError("Not signed in", "Please log in");
    expect(err.code).toBe("unauthenticated");
    expect(err.message).toBe("Not signed in");
    expect(err.detail).toBe("Please log in");
  });

  it("toHttpsError() produces correct code", () => {
    const httpsErr = new AuthenticationError("No token").toHttpsError();
    expect(httpsErr.code).toBe("unauthenticated");
  });
});

describe("PermissionError", () => {
  it("has code 'permission-denied'", () => {
    const err = new PermissionError("Forbidden", "Need admin role");
    expect(err.code).toBe("permission-denied");
    expect(err.message).toBe("Forbidden");
    expect(err.detail).toBe("Need admin role");
  });

  it("toHttpsError() produces correct code", () => {
    const httpsErr = new PermissionError("Denied").toHttpsError();
    expect(httpsErr.code).toBe("permission-denied");
  });
});

describe("NotFoundError", () => {
  it("has code 'not-found'", () => {
    const err = new NotFoundError("Document missing", "ID xyz not found");
    expect(err.code).toBe("not-found");
    expect(err.message).toBe("Document missing");
    expect(err.detail).toBe("ID xyz not found");
  });

  it("toHttpsError() produces correct code", () => {
    const httpsErr = new NotFoundError("Gone").toHttpsError();
    expect(httpsErr.code).toBe("not-found");
  });
});

describe("AlreadyExistsError", () => {
  it("has code 'already-exists'", () => {
    const err = new AlreadyExistsError("Duplicate", "Slug taken");
    expect(err.code).toBe("already-exists");
    expect(err.message).toBe("Duplicate");
    expect(err.detail).toBe("Slug taken");
  });

  it("toHttpsError() produces correct code", () => {
    const httpsErr = new AlreadyExistsError("Exists").toHttpsError();
    expect(httpsErr.code).toBe("already-exists");
  });
});

describe("ValidationError", () => {
  it("has code 'invalid-argument'", () => {
    const err = new ValidationError("Bad input", "name is required");
    expect(err.code).toBe("invalid-argument");
    expect(err.message).toBe("Bad input");
    expect(err.detail).toBe("name is required");
  });

  it("toHttpsError() produces correct code", () => {
    const httpsErr = new ValidationError("Invalid").toHttpsError();
    expect(httpsErr.code).toBe("invalid-argument");
  });
});

describe("PreconditionError", () => {
  it("has code 'failed-precondition'", () => {
    const err = new PreconditionError("Not ready", "Setup incomplete");
    expect(err.code).toBe("failed-precondition");
    expect(err.message).toBe("Not ready");
    expect(err.detail).toBe("Setup incomplete");
  });

  it("toHttpsError() produces correct code", () => {
    const httpsErr = new PreconditionError("Precondition").toHttpsError();
    expect(httpsErr.code).toBe("failed-precondition");
  });
});

describe("QuotaError", () => {
  it("has code 'resource-exhausted'", () => {
    const err = new QuotaError("Limit hit", "5 of 5 used");
    expect(err.code).toBe("resource-exhausted");
    expect(err.message).toBe("Limit hit");
    expect(err.detail).toBe("5 of 5 used");
  });

  it("toHttpsError() produces correct code", () => {
    const httpsErr = new QuotaError("Exhausted").toHttpsError();
    expect(httpsErr.code).toBe("resource-exhausted");
  });
});

// ─── wrapError ──────────────────────────────────────────────────────────────

describe("wrapError", () => {
  it("converts AppError to HttpsError", () => {
    const appErr = new NotFoundError("Gone", "detail");
    const result = wrapError(appErr);
    expect(result).toBeInstanceOf(HttpsError);
    expect(result.code).toBe("not-found");
    expect(result.message).toBe("Gone");
  });

  it("passes through an existing HttpsError unchanged", () => {
    const httpsErr = new HttpsError("already-exists", "Dup");
    const result = wrapError(httpsErr);
    expect(result).toBe(httpsErr);
  });

  it("converts a generic Error to internal HttpsError", () => {
    const genericErr = new Error("Something unexpected");
    const result = wrapError(genericErr);
    expect(result).toBeInstanceOf(HttpsError);
    expect(result.code).toBe("internal");
    expect(result.message).toBe("Something unexpected");
  });

  it("converts a non-Error value to internal HttpsError", () => {
    const result = wrapError("string error");
    expect(result).toBeInstanceOf(HttpsError);
    expect(result.code).toBe("internal");
    expect(result.message).toBe("Internal error");
  });
});
