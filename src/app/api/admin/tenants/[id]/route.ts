// ============================================================================
// GET, PUT /api/admin/tenants/[id] — Vega CRM
// ============================================================================
// Super-admin only endpoints for reading and updating a tenant.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSuperAdmin, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const TenantUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/tenants/[id]
 *
 * @returns Single tenant details with counts
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const admin = await requireSuperAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      _count: { select: { companies: true, userTenants: true } },
    },
  });
  if (!tenant) return errorResponse('Tenant not found', 404);

  return NextResponse.json(tenant);
}

/**
 * PUT /api/admin/tenants/[id]
 *
 * @param req - JSON body with updated tenant fields
 * @returns Updated tenant record
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const admin = await requireSuperAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;

  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return errorResponse('Tenant not found', 404);

  const body = await validateBody(req, TenantUpdateSchema);
  if (body instanceof NextResponse) return body;

  if (body.slug && body.slug !== tenant.slug) {
    const existing = await prisma.tenant.findUnique({
      where: { slug: body.slug },
    });
    if (existing) return errorResponse('Tenant slug already exists', 409);
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data: {
      name: body.name,
      slug: body.slug,
      description: body.description === '' ? null : body.description,
      isActive: body.isActive,
    },
  });

  return NextResponse.json(updated);
}
