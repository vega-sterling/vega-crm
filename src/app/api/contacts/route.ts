// ============================================================================
// GET, POST /api/contacts — Vega CRM
// ============================================================================
// List contacts for accessible tenants with filters, or create a contact
// inside a company the user can access.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const ContactCreateSchema = z.object({
  companyId: z.string().cuid(),
  tenantId: z.string().cuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  title: z.string().optional(),
  department: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

async function canAccessCompany(
  session: Awaited<ReturnType<typeof requireSession>>,
  companyId: string
): Promise<boolean> {
  if (session instanceof NextResponse) return false;
  if (session.globalRole === 'SUPER_ADMIN') return true;
  const tenantIds = await getAccessibleTenantIds(session);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { tenantId: true },
  });
  if (!company || !tenantIds) return false;
  return tenantIds.includes(company.tenantId);
}

/**
 * GET /api/contacts
 *
 * @query page - page number
 * @query limit - page size
 * @query companyId - filter by company
 * @query search - search first/last name or email
 * @query tenantId - restrict to a specific tenant
 * @returns Paginated contacts
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
  const companyId = searchParams.get('companyId');
  const tenantId = searchParams.get('tenantId');
  const search = searchParams.get('search')?.trim();

  const where: Record<string, unknown> = {
    isActive: true,
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  if (tenantId) {
    if (tenantIds && !tenantIds.includes(tenantId)) return errorResponse('Forbidden', 403);
    where.tenantId = tenantId;
  }
  if (companyId) where.companyId = companyId;
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { lastName: 'asc' },
      include: {
        company: { select: { id: true, name: true } },
      },
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/contacts
 *
 * @param req - JSON body validated by ContactCreateSchema
 * @returns Created contact record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, ContactCreateSchema);
  if (body instanceof NextResponse) return body;

  const allowed = await canAccessCompany(session, body.companyId);
  if (!allowed) return errorResponse('Forbidden', 403);

  const contact = await prisma.contact.create({
    data: {
      companyId: body.companyId,
      tenantId: body.tenantId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email || null,
      phone: body.phone,
      mobile: body.mobile,
      title: body.title,
      department: body.department,
      notes: body.notes,
      tags: body.tags ?? [],
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
