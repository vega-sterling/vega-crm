// ============================================================================
// GET /api/email/messages — Vega CRM
// ============================================================================
// Lists email messages for a given contact or company, paginated and ordered
// by most recent first.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';

/**
 * GET /api/email/messages
 *
 * @query contactId - filter to a specific contact
 * @query companyId - filter to a specific company
 * @query page - page number (default 1)
 * @query limit - page size (default 20, max 100)
 * @returns Paginated EmailMessage records
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ data: [], pagination: { page: 1, limit: 20, total: 0 } });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const contactId = searchParams.get('contactId');
  const companyId = searchParams.get('companyId');

  if (!contactId && !companyId) {
    return errorResponse('Provide contactId or companyId', 400);
  }

  const where: Record<string, unknown> = {
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  if (contactId) where.contactId = contactId;
  if (companyId) where.companyId = companyId;

  // Optional: enforce the related record belongs to an accessible tenant.
  if (companyId) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { tenantId: true },
    });
    if (!company || (tenantIds && !tenantIds.includes(company.tenantId))) {
      return errorResponse('Company not found', 404);
    }
  }

  if (contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { tenantId: true },
    });
    if (!contact || (tenantIds && !tenantIds.includes(contact.tenantId))) {
      return errorResponse('Contact not found', 404);
    }
  }

  const [data, total] = await Promise.all([
    prisma.emailMessage.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        company: { select: { id: true, name: true } },
        deal: { select: { id: true, title: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.emailMessage.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
