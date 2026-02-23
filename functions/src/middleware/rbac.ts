/**
 * Role-based access control — owner > admin > editor > viewer hierarchy.
 */

import { PermissionError } from "../shared/errors.js";
import type { AuthContext } from "./auth.js";

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

/**
 * Assert that the user's role meets the minimum required level.
 * Throws PermissionError if insufficient.
 */
export function assertRole(
  ctx: AuthContext,
  requiredRole: "owner" | "admin" | "editor" | "viewer"
): void {
  const userLevel = ROLE_HIERARCHY[ctx.role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;

  if (userLevel < requiredLevel) {
    throw new PermissionError(
      "Insufficient permissions",
      `This action requires '${requiredRole}' role or higher. You have '${ctx.role}'.`
    );
  }
}

/** Check role without throwing — returns boolean. */
export function hasRole(
  ctx: AuthContext,
  requiredRole: "owner" | "admin" | "editor" | "viewer"
): boolean {
  const userLevel = ROLE_HIERARCHY[ctx.role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;
  return userLevel >= requiredLevel;
}
