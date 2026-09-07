// ============================================================================
// POST /api/companies/bulk — Vega CRM Bulk Company Actions
// ============================================================================
// Apply an action (archive, activate, delete) to multiple companies at once.
// Mirrors the deals/bulk pattern: all companies must be within accessible
// tenants, selective updates only — no bulk data wipes. Additive by design.
// No audit logging (deals/bulk does not audit either).
//
// ⚠️ DESTRUCTIVE: 'delete' cascades — Prisma schema onDelete: Cascade on
// Company means deleting companies PERMANENTLY deletes their contacts,
// activities, tasks, deals, emailMessages, calendarEvents, and bookings.
// The UI must warn about this before confirming.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const BulkActionSchema = z.object({
  action: z.enum(['archive', 'activate', 'delete']),
  companyIds: z.array(z.string()).min(1, 'Select at least one company'),
});

/**
 * POST /api/companies/bulk
 *
 * @param action     - 'archive' | 'activate' | 'delete'
 * @param companyIds - array of company IDs to act on
 * @returns { updated: number, action: string }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, BulkActionSchema);
  if (body instanceof NextResponse) return body;

  const { action, companyIds } = body;
  const tenantIds = await getAccessibleTenantIds(session);

  // Fetch only companies within accessible tenants — security boundary
  const accessibleCompanies = await prisma.company.findMany({
    where: {
      id: { in: companyIds },
      ...(tenantIds ? { tenantId: { in: tenantIds } } : {}),
    },
    select: { id: true },
  });

  if (accessibleCompanies.length === 0) {
    return errorResponse('No accessible companies found', 404);
  }

  const accessibleIds = accessibleCompanies.map((c) => c.id);

  if (action === 'archive') {
    const result = await prisma.company.updateMany({
      where: { id: { in: accessibleIds } },
      data: { isActive: false },
    });
    return NextResponse.json({ updated: result.count, action });
  }

  if (action === 'activate') {
    const result = await prisma.company.updateMany({
      where: { id: { in: accessibleIds } },
      data: { isActive: true },
    });
    return NextResponse.json({ updated: result.count, action });
  }

  if (action === 'delete') {
    // ⚠️ CASCADE: permanently deletes each company's contacts, activities,
    // tasks, deals, emailMessages, calendarEvents, and bookings.
    // Only delete companies we confirmed are accessible — never touch others.
    const result = await prisma.company.deleteMany({
      where: { id: { in: accessibleIds } },
    });
    return NextResponse.json({ updated: result.count, action });
  }

  return errorResponse('Unknown action', 400);
}