// ============================================================================
// File: src/app/api/admin/tenants/[id]/settings/route.ts
// Description: CRUD API for per-tenant settings (integrations, OAuth config, etc.)
//              GET: Returns all settings for a tenant (sensitive values masked)
//              PUT: Upserts a setting by key
//              DELETE: Removes a setting by key
//              Requires SUPER_ADMIN access.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, errorResponse } from '@/lib/session';
import { requireSuperAdminGuard } from '@/lib/rbac';

/**
 * GET /api/admin/tenants/[id]/settings
 * Returns all tenant settings. Sensitive values are masked.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  try {
    requireSuperAdminGuard(session);
  } catch {
    return errorResponse('Super admin access required', 403);
  }

  const { id: tenantId } = await params;

  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return errorResponse('Tenant not found', 404);

  const settings = await prisma.tenantSetting.findMany({
    where: { tenantId },
    orderBy: { key: 'asc' },
  });

  // Mask sensitive values for display
  const masked = settings.map((s) => ({
    id: s.id,
    key: s.key,
    value: s.isEncrypted ? (s.value ? '••••••••' : '') : s.value,
    isEncrypted: s.isEncrypted,
    updatedAt: s.updatedAt,
    updatedBy: s.updatedBy,
  }));

  return NextResponse.json({ data: masked });
}

/**
 * PUT /api/admin/tenants/[id]/settings
 * Upserts a single setting by key.
 * Body: { key: string, value: string, isEncrypted?: boolean }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  try {
    requireSuperAdminGuard(session);
  } catch {
    return errorResponse('Super admin access required', 403);
  }

  const { id: tenantId } = await params;
  const body = await req.json();
  const { key, value, isEncrypted } = body;

  if (!key || typeof key !== 'string') {
    return errorResponse('Setting key is required', 400);
  }

  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return errorResponse('Tenant not found', 404);

  // If value is the mask placeholder, don't overwrite the existing value
  if (isEncrypted && value === '••••••••') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const setting = await prisma.tenantSetting.upsert({
    where: {
      tenantId_key: { tenantId, key },
    },
    create: {
      tenantId,
      key,
      value: value || '',
      isEncrypted: Boolean(isEncrypted),
      updatedBy: session.userId,
    },
    update: {
      value: value || '',
      isEncrypted: Boolean(isEncrypted),
      updatedBy: session.userId,
    },
  });

  return NextResponse.json({ data: setting });
}

/**
 * DELETE /api/admin/tenants/[id]/settings?key=xxx
 * Removes a single setting by key.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  try {
    requireSuperAdminGuard(session);
  } catch {
    return errorResponse('Super admin access required', 403);
  }

  const { id: tenantId } = await params;
  const key = req.nextUrl.searchParams.get('key');

  if (!key) return errorResponse('Setting key is required', 400);

  await prisma.tenantSetting.deleteMany({
    where: { tenantId, key },
  });

  return NextResponse.json({ ok: true });
}