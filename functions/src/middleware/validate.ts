/**
 * Zod validation wrapper — parse request data or throw HttpsError.
 */

import { z } from "zod";
import { ValidationError } from "../shared/errors.js";

/**
 * Validate request data against a Zod schema.
 * Returns the parsed (and typed) data, or throws a ValidationError.
 */
export function validate<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new ValidationError("Validation failed", issues);
  }
  return result.data;
}
