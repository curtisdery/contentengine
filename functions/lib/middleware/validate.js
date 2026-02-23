"use strict";
/**
 * Zod validation wrapper — parse request data or throw HttpsError.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const errors_js_1 = require("../shared/errors.js");
/**
 * Validate request data against a Zod schema.
 * Returns the parsed (and typed) data, or throws a ValidationError.
 */
function validate(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
        throw new errors_js_1.ValidationError("Validation failed", issues);
    }
    return result.data;
}
//# sourceMappingURL=validate.js.map