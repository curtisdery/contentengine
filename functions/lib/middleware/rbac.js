"use strict";
/**
 * Role-based access control — owner > admin > editor > viewer hierarchy.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertRole = assertRole;
exports.hasRole = hasRole;
const errors_js_1 = require("../shared/errors.js");
const ROLE_HIERARCHY = {
    owner: 4,
    admin: 3,
    editor: 2,
    viewer: 1,
};
/**
 * Assert that the user's role meets the minimum required level.
 * Throws PermissionError if insufficient.
 */
function assertRole(ctx, requiredRole) {
    const userLevel = ROLE_HIERARCHY[ctx.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;
    if (userLevel < requiredLevel) {
        throw new errors_js_1.PermissionError("Insufficient permissions", `This action requires '${requiredRole}' role or higher. You have '${ctx.role}'.`);
    }
}
/** Check role without throwing — returns boolean. */
function hasRole(ctx, requiredRole) {
    const userLevel = ROLE_HIERARCHY[ctx.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;
    return userLevel >= requiredLevel;
}
//# sourceMappingURL=rbac.js.map