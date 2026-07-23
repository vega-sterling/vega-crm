// ============================================================================
// GET /api/auth/me — Vega CRM
// ============================================================================
// Return the currently authenticated user and their tenant access list.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds } from '@/lib/session';

/**
 * GET /api/auth/me
 *
 * @returns Current user profile and accessible tenant IDs
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.userId! },
    select: {
      id: true,
      email: true,
      name: true,
      globalRole: true,
      isActive: true,
      totpEnabled: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const tenantIds = await getAccessibleTenantIds(session);
  const tenants = tenantIds
    ? await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, slug: true },
      })
    : null;

  return NextResponse.json({
    user: {
      ...user,
      totpVerified: session.totpVerified,
    },
    tenants,
  });
}
