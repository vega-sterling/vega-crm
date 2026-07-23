// ============================================================================
// GET, POST /api/admin/users — Vega CRM
// ============================================================================
// Admin-only endpoints for listing and creating users. Super admins see
// all users; tenant admins see users attached to their accessible tenants.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { hashSync } from 'bcryptjs';
import { z } from 'zod';
import { GlobalRole } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAdmin, requireSuperAdmin, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const UserCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  globalRole: z.enum(['SUPER_ADMIN', 'ADMIN', 'USER']).optional(),
  tenantIds: z.array(z.string().cuid()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/admin/users
 *
 * @query page - page number
 * @query limit - page size
 * @query search - search name or email
 * @returns Paginated users with tenant assignments
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const search = searchParams.get('search')?.trim();

  let tenantIds: string[] | null = null;
  if (admin.globalRole !== 'SUPER_ADMIN') {
    tenantIds = await getAccessibleTenantIds(admin);
    if (tenantIds && tenantIds.length === 0) {
      return NextResponse.json({ data: [], pagination: { page: 1, limit, total: 0 } });
    }
  }

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  let userIds: string[] | undefined;
  if (tenantIds) {
    const rows = await prisma.userTenant.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { userId: true },
      distinct: ['userId'],
    });
    userIds = rows.map((r: { userId: string }) => r.userId);
    where.id = { in: userIds };
  }

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        globalRole: true,
        isActive: true,
        totpEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        userTenants: {
          select: {
            id: true,
            tenant: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/admin/users
 *
 * @param req - JSON body validated by UserCreateSchema
 * @returns Created user without password hash
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const body = await validateBody(req, UserCreateSchema);
  if (body instanceof NextResponse) return body;

  if (admin.globalRole !== 'SUPER_ADMIN' && body.globalRole === 'SUPER_ADMIN') {
    return errorResponse('Forbidden', 403);
  }

  if (admin.globalRole !== 'SUPER_ADMIN' && body.tenantIds) {
    const allowedIds = await getAccessibleTenantIds(admin);
    const forbidden = allowedIds
      ? body.tenantIds.some((id: string) => !allowedIds.includes(id))
      : false;
    if (forbidden) return errorResponse('Forbidden', 403);
  }

  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      name: body.name,
      passwordHash: hashSync(body.password, 10),
      globalRole: (body.globalRole as GlobalRole) ?? 'USER',
      isActive: body.isActive ?? true,
      userTenants: body.tenantIds
        ? {
            create: body.tenantIds.map((tenantId: string) => ({ tenantId })),
          }
        : undefined,
    },
    select: {
      id: true,
      email: true,
      name: true,
      globalRole: true,
      isActive: true,
      totpEnabled: true,
      createdAt: true,
      userTenants: {
        select: {
          id: true,
          tenant: { select: { id: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json(user, { status: 201 });
}
