// ============================================================================
// File: src/lib/rbac.ts
// Description: RBAC authorization helpers for Vega CRM.
//              Exports AuthorizationError and guard functions used by session.ts
//              and API routes. No circular dependencies.
// ============================================================================

import type { IronSession } from "iron-session";
import { prisma } from "./db";

/** Session data shape (mirrors session.ts to avoid circular import). */
export interface SessionData {
  userId?: string;
  email?: string;
  name?: string;
  globalRole?: "SUPER_ADMIN" | "ADMIN" | "USER";
  totpVerified?: boolean;
  pendingUserId?: string;
}

/** VegaSession type alias. */
export type VegaSession = IronSession<SessionData>;

/** Thrown when a session fails an authorization check. */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Empty session shape. */
export const defaultSession: SessionData = {
  userId: undefined,
  email: undefined,
  name: undefined,
  globalRole: undefined,
  totpVerified: false,
  pendingUserId: undefined,
};

/**
 * Checks if the session belongs to an authenticated user.
 * @throws AuthorizationError if not authenticated.
 */
export function requireSessionGuard(session: VegaSession): void {
  if (!session.userId || !session.email) {
    throw new AuthorizationError("Unauthorized — please log in.");
  }
}

/**
 * Checks if the session has at least ADMIN role.
 * @throws AuthorizationError if not admin.
 */
export function requireAdminGuard(session: VegaSession): void {
  requireSessionGuard(session);
  if (session.globalRole !== "ADMIN" && session.globalRole !== "SUPER_ADMIN") {
    throw new AuthorizationError("Admin access required.");
  }
}

/**
 * Checks if the session is a SUPER_ADMIN.
 * @throws AuthorizationError if not super admin.
 */
export function requireSuperAdminGuard(session: VegaSession): void {
  requireSessionGuard(session);
  if (session.globalRole !== "SUPER_ADMIN") {
    throw new AuthorizationError("Super admin access required.");
  }
}

/** Type guard: is this session a super admin? */
export function isSuperAdmin(session: VegaSession): boolean {
  return session.globalRole === "SUPER_ADMIN";
}

/** Type guard: is this session at least admin? */
export function isAdmin(session: VegaSession): boolean {
  return session.globalRole === "SUPER_ADMIN" || session.globalRole === "ADMIN";
}

/**
 * Returns the tenant IDs accessible to the authenticated session.
 * super_admin sees all tenants. Others only see their assigned tenants.
 * @returns Array of tenant IDs, or null for super_admin (meaning all).
 */
export async function getAccessibleTenantIdsGuard(session: VegaSession): Promise<string[] | null> {
  requireSessionGuard(session);
  if (session.globalRole === "SUPER_ADMIN") return null;

  const userTenants = await prisma.userTenant.findMany({
    where: { userId: session.userId },
    select: { tenantId: true },
  });
  return userTenants.map((ut: { tenantId: string }) => ut.tenantId);
}