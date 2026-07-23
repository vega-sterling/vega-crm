// ============================================================================
// GET, POST /api/companies — Vega CRM
// ============================================================================
// List companies for the user's accessible tenants, or create a new company
// within an allowed tenant.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const CompanyCreateSchema = z.object({
  tenantId: z.string().cuid(),
  name: z.string().min(1),
  industry: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  description: z.string().optional(),
});

function getTenantFilter(sessionUser: { globalRole: string; userId: string }):
  | { id: { in: string[] } }
  | undefined {
  if (sessionUser.globalRole === 'SUPER_ADMIN') return undefined;
  return { id: { in: [] as string[] } };
}

/**
 * GET /api/companies
 *
 * @query page - page number (default 1)
 * @query limit - page size (default 20)
 * @query search - optional name filter
 * @returns Paginated companies for accessible tenants
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
  const search = searchParams.get('search')?.trim();

  const where: Record<string, unknown> = {
    isActive: true,
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  const [data, total] = await Promise.all([
    prisma.company.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        _count: { select: { contacts: true } },
      },
    }),
    prisma.company.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/companies
 *
 * @param req - JSON body validated by CompanyCreateSchema
 * @returns Created company record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, CompanyCreateSchema);
  if (body instanceof NextResponse) return body;

  if (session.globalRole !== 'SUPER_ADMIN') {
    const tenantIds = await getAccessibleTenantIds(session);
    if (tenantIds && !tenantIds.includes(body.tenantId)) {
      return errorResponse('Forbidden', 403);
    }
  }

  const company = await prisma.company.create({
    data: {
      tenantId: body.tenantId,
      name: body.name,
      industry: body.industry,
      website: body.website || null,
      phone: body.phone,
      email: body.email || null,
      address: body.address,
      description: body.description,
    },
  });

  return NextResponse.json(company, { status: 201 });
}
