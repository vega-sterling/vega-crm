// ============================================================================
// GET, POST /api/admin/tenants — Vega CRM
// ============================================================================
// Super-admin only endpoints for listing and creating tenants.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSuperAdmin, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const TenantCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/admin/tenants
 *
 * @query page - page number
 * @query limit - page size
 * @query search - search by name or slug
 * @returns Paginated tenant list
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireSuperAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const search = searchParams.get('search')?.trim();

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { companies: true, userTenants: true } },
      },
    }),
    prisma.tenant.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/admin/tenants
 *
 * @param req - JSON body validated by TenantCreateSchema
 * @returns Created tenant record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireSuperAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const body = await validateBody(req, TenantCreateSchema);
  if (body instanceof NextResponse) return body;

  const existing = await prisma.tenant.findUnique({
    where: { slug: body.slug },
  });
  if (existing) return errorResponse('Tenant slug already exists', 409);

  const tenant = await prisma.tenant.create({
    data: {
      name: body.name,
      slug: body.slug,
      description: body.description || null,
      isActive: body.isActive ?? true,
    },
  });

  return NextResponse.json(tenant, { status: 201 });
}
