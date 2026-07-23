// ============================================================================
// GET, PUT, DELETE /api/admin/users/[id] — Vega CRM
// ============================================================================
// Admin-only endpoints for reading, updating, and deactivating a user.
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

const UserUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  globalRole: z.enum(['SUPER_ADMIN', 'ADMIN', 'USER']).optional(),
  isActive: z.boolean().optional(),
  tenantIds: z.array(z.string().cuid()).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAllowedUser(
  id: string,
  admin: Awaited<ReturnType<typeof requireAdmin>>
) {
  if (admin instanceof NextResponse) return null;

  const user = await prisma.user.findUnique({
    where: { id },
    include: { userTenants: { select: { tenantId: true } } },
  });
  if (!user) return null;

  if (admin.globalRole === 'SUPER_ADMIN') return user;

  const tenantIds = await getAccessibleTenantIds(admin);
  if (!tenantIds) return user;
  const userTenantIds = user.userTenants.map((ut: { tenantId: string }) => ut.tenantId);
  return userTenantIds.some((tid: string) => tenantIds.includes(tid)) ? user : null;
}

/**
 * GET /api/admin/users/[id]
 *
 * @returns User details including tenant assignments
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;

  const user = await getAllowedUser(id, admin);
  if (!user) return errorResponse('User not found', 404);

  const userWithTenants = await prisma.user.findUnique({
    where: { id: user.id },
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
  });

  return NextResponse.json(userWithTenants);
}

/**
 * PUT /api/admin/users/[id]
 *
 * @param req - JSON body with updated user fields
 * @returns Updated user without password hash
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;

  const user = await getAllowedUser(id, admin);
  if (!user) return errorResponse('User not found', 404);
  if (admin.globalRole !== 'SUPER_ADMIN' && user.globalRole === 'SUPER_ADMIN') {
    return errorResponse('Forbidden', 403);
  }

  const body = await validateBody(req, UserUpdateSchema);
  if (body instanceof NextResponse) return body;

  if (body.globalRole === 'SUPER_ADMIN' && admin.globalRole !== 'SUPER_ADMIN') {
    return errorResponse('Forbidden', 403);
  }
  if (admin.globalRole !== 'SUPER_ADMIN' && body.tenantIds) {
    const allowedIds = await getAccessibleTenantIds(admin);
    const forbidden = allowedIds
      ? body.tenantIds.some((tid: string) => !allowedIds.includes(tid))
      : false;
    if (forbidden) return errorResponse('Forbidden', 403);
  }

  const data: Record<string, unknown> = {};
  if (body.name) data.name = body.name;
  if (body.email) data.email = body.email.toLowerCase();
  if (body.password) data.passwordHash = hashSync(body.password, 10);
  if (body.globalRole) data.globalRole = body.globalRole as GlobalRole;
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
  if (body.tenantIds) {
    data.userTenants = {
      deleteMany: {},
      create: body.tenantIds.map((tenantId: string) => ({ tenantId })),
    };
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
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
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/admin/users/[id]
 *
 * Deactivates a user. Super admins can fully delete another user.
 *
 * @returns Deactivated user record
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await context.params;

  const user = await getAllowedUser(id, admin);
  if (!user) return errorResponse('User not found', 404);
  if (admin.globalRole !== 'SUPER_ADMIN' && user.globalRole === 'SUPER_ADMIN') {
    return errorResponse('Forbidden', 403);
  }
  if (admin.userId === id) return errorResponse('Cannot delete yourself', 400);

  const superAdmin = await requireSuperAdmin(req);
  if (superAdmin instanceof NextResponse) {
    const deactivated = await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json(deactivated);
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
