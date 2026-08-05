// ============================================================================
// File: src/proxy.ts (formerly src/middleware.ts)
// Description: Next.js proxy for route protection. Redirects unauthenticated
//              users to /login for all routes except auth pages and API routes.
//              (Renamed from middleware.ts → proxy.ts in Next.js 16)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/setup-2fa"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow API routes to handle their own auth
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Check for session cookie
  const cookie = req.cookies.get("vega_crm_session");
  if (!cookie) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
