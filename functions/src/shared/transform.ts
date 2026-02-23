/** camelCase ↔ snake_case conversion utilities for API responses. */

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** Recursively convert object keys from camelCase to snake_case. */
export function toSnakeCase(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (obj instanceof Date) return obj.toISOString();
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Handle Firestore Timestamps
      if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
        result[camelToSnake(key)] = (value as { toDate: () => Date }).toDate().toISOString();
      } else {
        result[camelToSnake(key)] = toSnakeCase(value);
      }
    }
    return result;
  }
  return obj;
}

/** Recursively convert object keys from snake_case to camelCase. */
export function toCamelCase(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[snakeToCamel(key)] = toCamelCase(value);
    }
    return result;
  }
  return obj;
}

/** Convert a Firestore document to a snake_case API response with id included. */
export function docToResponse(id: string, data: Record<string, unknown>): Record<string, unknown> {
  return toSnakeCase({ id, ...data }) as Record<string, unknown>;
}
