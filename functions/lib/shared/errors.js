"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuotaError = exports.PreconditionError = exports.ValidationError = exports.AlreadyExistsError = exports.NotFoundError = exports.PermissionError = exports.AuthenticationError = exports.AppError = void 0;
exports.wrapError = wrapError;
const https_1 = require("firebase-functions/v2/https");
class AppError extends Error {
    constructor(code, message, detail) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.detail = detail ?? message;
    }
    toHttpsError() {
        return new https_1.HttpsError(this.code, this.message, this.detail);
    }
}
exports.AppError = AppError;
class AuthenticationError extends AppError {
    constructor(message, detail) {
        super("unauthenticated", message, detail);
    }
}
exports.AuthenticationError = AuthenticationError;
class PermissionError extends AppError {
    constructor(message, detail) {
        super("permission-denied", message, detail);
    }
}
exports.PermissionError = PermissionError;
class NotFoundError extends AppError {
    constructor(message, detail) {
        super("not-found", message, detail);
    }
}
exports.NotFoundError = NotFoundError;
class AlreadyExistsError extends AppError {
    constructor(message, detail) {
        super("already-exists", message, detail);
    }
}
exports.AlreadyExistsError = AlreadyExistsError;
class ValidationError extends AppError {
    constructor(message, detail) {
        super("invalid-argument", message, detail);
    }
}
exports.ValidationError = ValidationError;
class PreconditionError extends AppError {
    constructor(message, detail) {
        super("failed-precondition", message, detail);
    }
}
exports.PreconditionError = PreconditionError;
class QuotaError extends AppError {
    constructor(message, detail) {
        super("resource-exhausted", message, detail);
    }
}
exports.QuotaError = QuotaError;
/** Wrap any function body; if it throws an AppError, convert to HttpsError. */
function wrapError(err) {
    if (err instanceof AppError) {
        return err.toHttpsError();
    }
    if (err instanceof https_1.HttpsError) {
        return err;
    }
    const message = err instanceof Error ? err.message : "Internal error";
    return new https_1.HttpsError("internal", message);
}
//# sourceMappingURL=errors.js.map