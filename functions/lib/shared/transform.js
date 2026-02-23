"use strict";
/** camelCase ↔ snake_case conversion utilities for API responses. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSnakeCase = toSnakeCase;
exports.toCamelCase = toCamelCase;
exports.docToResponse = docToResponse;
function camelToSnake(str) {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
function snakeToCamel(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}
/** Recursively convert object keys from camelCase to snake_case. */
function toSnakeCase(obj) {
    if (obj === null || obj === undefined)
        return obj;
    if (Array.isArray(obj))
        return obj.map(toSnakeCase);
    if (obj instanceof Date)
        return obj.toISOString();
    if (typeof obj === "object") {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            // Handle Firestore Timestamps
            if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
                result[camelToSnake(key)] = value.toDate().toISOString();
            }
            else {
                result[camelToSnake(key)] = toSnakeCase(value);
            }
        }
        return result;
    }
    return obj;
}
/** Recursively convert object keys from snake_case to camelCase. */
function toCamelCase(obj) {
    if (obj === null || obj === undefined)
        return obj;
    if (Array.isArray(obj))
        return obj.map(toCamelCase);
    if (typeof obj === "object") {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[snakeToCamel(key)] = toCamelCase(value);
        }
        return result;
    }
    return obj;
}
/** Convert a Firestore document to a snake_case API response with id included. */
function docToResponse(id, data) {
    return toSnakeCase({ id, ...data });
}
//# sourceMappingURL=transform.js.map