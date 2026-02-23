import { HttpsError, FunctionsErrorCode } from "firebase-functions/v2/https";

type AppErrorCode =
  | "unauthenticated"
  | "permission-denied"
  | "not-found"
  | "already-exists"
  | "invalid-argument"
  | "failed-precondition"
  | "resource-exhausted"
  | "internal";

export class AppError extends Error {
  code: AppErrorCode;
  detail: string;

  constructor(code: AppErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.detail = detail ?? message;
  }

  toHttpsError(): HttpsError {
    return new HttpsError(this.code as FunctionsErrorCode, this.message, this.detail);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, detail?: string) {
    super("unauthenticated", message, detail);
  }
}

export class PermissionError extends AppError {
  constructor(message: string, detail?: string) {
    super("permission-denied", message, detail);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, detail?: string) {
    super("not-found", message, detail);
  }
}

export class AlreadyExistsError extends AppError {
  constructor(message: string, detail?: string) {
    super("already-exists", message, detail);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, detail?: string) {
    super("invalid-argument", message, detail);
  }
}

export class PreconditionError extends AppError {
  constructor(message: string, detail?: string) {
    super("failed-precondition", message, detail);
  }
}

export class QuotaError extends AppError {
  constructor(message: string, detail?: string) {
    super("resource-exhausted", message, detail);
  }
}

/** Wrap any function body; if it throws an AppError, convert to HttpsError. */
export function wrapError(err: unknown): HttpsError {
  if (err instanceof AppError) {
    return err.toHttpsError();
  }
  if (err instanceof HttpsError) {
    return err;
  }
  const message = err instanceof Error ? err.message : "Internal error";
  return new HttpsError("internal", message);
}
