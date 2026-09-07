// ============================================================================
// POST /api/contacts/bulk — Vega CRM Bulk Contact Actions
// ============================================================================
// Apply an action (set company, archive, activate, delete) to multiple
// contacts at once. Mirrors the deals/bulk pattern: all contacts must be
// within accessible tenants, selective updates only — no bulk data wipes.
// Additive by design. No audit logging (deals/bulk does not audit either).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const BulkActionSchema = z.object({
  action: z.enum(['setCompany', 'archive', 'activate', 'delete']),
  contactIds: z.array(z.string()).min(1, 'Select at least one contact'),
  companyId: z.cuid().optional(),
});

/**
 * POST /api/contacts/bulk
 *
 * @param action    - 'setCompany' | 'archive' | 'activate' | 'delete'
 * @param contactIds - array of contact IDs to act on
 * @param companyId  - required when action === 'setCompany'
 * @returns { updated: number, action: string }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, BulkActionSchema);
  if (body instanceof NextResponse) return body;

  const { action, contactIds } = body;
  const tenantIds = await getAccessibleTenantIds(session);

  // Fetch only contacts within accessible tenants — security boundary
  const accessibleContacts = await prisma.contact.findMany({
    where: {
      id: { in: contactIds },
      ...(tenantIds ? { tenantId: { in: tenantIds } } : {}),
    },
    select: { id: true },
  });

  if (accessibleContacts.length === 0) {
    return errorResponse('No accessible contacts found', 404);
  }

  const accessibleIds = accessibleContacts.map((c) => c.id);

  if (action === 'setCompany') {
    if (!body.companyId) return errorResponse('companyId is required for setCompany', 400);

    // Verify the target company is in an accessible tenant
    if (tenantIds) {
      const company = await prisma.company.findUnique({
        where: { id: body.companyId },
        select: { tenantId: true },
      });
      if (!company) return errorResponse('Company not found', 404);
      if (!tenantIds.includes(company.tenantId)) return errorResponse('Forbidden', 403);
    }

    const result = await prisma.contact.updateMany({
      where: { id: { in: accessibleIds } },
      data: { companyId: body.companyId },
    });
    return NextResponse.json({ updated: result.count, action });
  }

  if (action === 'archive') {
    const result = await prisma.contact.updateMany({
      where: { id: { in: accessibleIds } },
      data: { isActive: false },
    });
    return NextResponse.json({ updated: result.count, action });
  }

  if (action === 'activate') {
    const result = await prisma.contact.updateMany({
      where: { id: { in: accessibleIds } },
      data: { isActive: true },
    });
    return NextResponse.json({ updated: result.count, action });
  }

  if (action === 'delete') {
    // Cascades: deleting contacts also deletes their activities and tasks.
    // Only delete contacts we confirmed are accessible — never touch others.
    const result = await prisma.contact.deleteMany({
      where: { id: { in: accessibleIds } },
    });
    return NextResponse.json({ updated: result.count, action });
  }

  return errorResponse('Unknown action', 400);
}