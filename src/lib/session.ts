// ============================================================================
// File: src/lib/session.ts
// Description: iron-session configuration and request/session helpers for Vega CRM.
//              Defines the encrypted cookie shape, session options, and thin
//              route-level wrappers that return NextResponse on auth failures.
// ============================================================================

import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  requireSessionGuard,
  requireAdminGuard,
  requireSuperAdminGuard,
  getAccessibleTenantIdsGuard,
  AuthorizationError,
  type SessionData,
  type VegaSession,
} from "./rbac";

export type { SessionData, VegaSession };
export { AuthorizationError };

/** iron-session configuration options. */
export const sessionOptions: SessionOptions = {
  cookieName: "vega_crm_session",
  password: process.env.SESSION_SECRET as string,
  cookieOptions: {
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    maxAge: 86400,
    path: "/",
  },
};

/** Empty session shape. */
export const defaultSession: SessionData = {
  userId: undefined,
  email: undefined,
  name: undefined,
  globalRole: undefined,
  totpVerified: false,
  pendingUserId: undefined,
};

/** Loads the iron-session for the current request. */
export async function getSession(_req?: NextRequest): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/** Destroys the current session and clears the cookie. */
export async function destroySession(req: NextRequest): Promise<void> {
  const session = await getSession(req);
  Object.assign(session, defaultSession);
  session.destroy();
  await session.save();
}

/** Builds a standard JSON error response. */
export function errorResponse(
  message: string,
  status: number,
  issues?: Array<{ message: string; path: (string | number)[] }>
): NextResponse {
  return NextResponse.json({ error: message, issues }, { status });
}

/** Ensures the session belongs to an authenticated user. Returns session or 401. */
export async function requireSession(
  req: NextRequest
): Promise<IronSession<SessionData> | NextResponse> {
  try {
    const session = await getSession(req);
    requireSessionGuard(session);
    return session;
  } catch (error) {
    if (error instanceof AuthorizationError) return errorResponse(error.message, 401);
    return errorResponse("Unauthorized", 401);
  }
}

/** Ensures the authenticated user is at least ADMIN. Returns session or 403. */
export async function requireAdmin(
  req: NextRequest
): Promise<IronSession<SessionData> | NextResponse> {
  try {
    const session = await getSession(req);
    requireAdminGuard(session);
    return session;
  } catch (error) {
    if (error instanceof AuthorizationError) return errorResponse(error.message, 403);
    return errorResponse("Admin access required", 403);
  }
}

/** Ensures the authenticated user is SUPER_ADMIN. Returns session or 403. */
export async function requireSuperAdmin(
  req: NextRequest
): Promise<IronSession<SessionData> | NextResponse> {
  try {
    const session = await getSession(req);
    requireSuperAdminGuard(session);
    return session;
  } catch (error) {
    if (error instanceof AuthorizationError) return errorResponse(error.message, 403);
    return errorResponse("Super admin access required", 403);
  }
}

/** Returns tenant IDs accessible to the session (null = all for super_admin). */
export async function getAccessibleTenantIds(
  session: IronSession<SessionData>
): Promise<string[] | null> {
  try {
    return await getAccessibleTenantIdsGuard(session);
  } catch {
    return [];
  }
}

