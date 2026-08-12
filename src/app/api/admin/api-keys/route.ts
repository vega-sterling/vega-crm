// ============================================================================
// File: src/app/api/admin/api-keys/route.ts
// Description: API key management endpoints.
//   GET    /api/admin/api-keys      — list all API keys (admin only)
//   POST   /api/admin/api-keys      — create a new API key (admin only)
//   PATCH  /api/admin/api-keys      — update key (rename, toggle active, revoke)
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { generateApiKey, hashApiKey, getKeyPrefix, validateScopes } from '@/lib/apiKeys';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/admin/api-keys
 * Lists all API keys. Super admins see all; tenant admins see keys for
 * their accessible tenants.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);
  const isSuperAdmin = session.globalRole === 'SUPER_ADMIN';

  const where: Record<string, unknown> = {};
  if (!isSuperAdmin && tenantIds) {
    where.OR = [
      { tenantId: { in: tenantIds } },
      { tenantId: null },
    ];
  }

  const keys = await prisma.apiKey.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      creator: {
        select: { id: true, name: true, email: true },
      },
      tenant: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  const safeKeys = keys.map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    scopes: k.scopes,
    tenantId: k.tenantId,
    tenantName: k.tenant?.name ?? null,
    tenantSlug: k.tenant?.slug ?? null,
    createdBy: k.createdBy,
    createdByName: k.creator?.name ?? 'Unknown',
    createdByEmail: k.creator?.email ?? '',
    lastUsedAt: k.lastUsedAt,
    lastUsedIp: k.lastUsedIp,
    expiresAt: k.expiresAt,
    isActive: k.isActive,
    createdAt: k.createdAt,
  }));

  return NextResponse.json({ keys: safeKeys });
}

const CreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  scopes: z.array(z.string()).min(1, 'At least one scope is required'),
  tenantId: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

/**
 * POST /api/admin/api-keys
 * Creates a new API key. Returns the plaintext key ONE TIME ONLY.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('Invalid request', 422, parsed.error.issues);
  }

  const { name, scopes, tenantId, expiresAt } = parsed.data;

  if (!validateScopes(scopes)) {
    return errorResponse('Invalid scope(s) provided', 422);
  }

  const isSuperAdmin = session.globalRole === 'SUPER_ADMIN';
  if (tenantId) {
    if (!isSuperAdmin) {
      const accessibleIds = await getAccessibleTenantIds(session);
      if (accessibleIds && !accessibleIds.includes(tenantId)) {
        return errorResponse('You do not have access to this tenant', 403);
      }
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return errorResponse('Tenant not found', 404);
  }

  const plaintextKey = generateApiKey();
  const keyHash = hashApiKey(plaintextKey);
  const keyPrefix = getKeyPrefix(plaintextKey);

  let expiryDate: Date | null = null;
  if (expiresAt) {
    expiryDate = new Date(expiresAt);
    if (isNaN(expiryDate.getTime())) {
      return errorResponse('Invalid expiry date', 422);
    }
    if (expiryDate <= new Date()) {
      return errorResponse('Expiry date must be in the future', 422);
    }
  }

  const apiKey = await prisma.apiKey.create({
    data: {
      name,
      keyHash,
      keyPrefix,
      scopes,
      tenantId: tenantId || null,
      createdBy: session.userId!,
      expiresAt: expiryDate,
    },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      tenant: { select: { id: true, name: true, slug: true } },
    },
  });

  await logAudit({
    userId: session.userId!,
    action: 'create',
    entity: 'api_key',
    entityId: apiKey.id,
    changes: { name, scopes, tenantId, expiresAt },
    req,
  });

  return NextResponse.json({
    id: apiKey.id,
    name: apiKey.name,
    key: plaintextKey,
    keyPrefix: apiKey.keyPrefix,
    scopes: apiKey.scopes,
    tenantId: apiKey.tenantId,
    expiresAt: apiKey.expiresAt,
    createdAt: apiKey.createdAt,
  }, { status: 201 });
}

const UpdateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  scopes: z.array(z.string()).optional(),
});

/**
 * PATCH /api/admin/api-keys
 * Updates an API key (rename, toggle active/inactive, update scopes).
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('Invalid request', 422, parsed.error.issues);
  }

  const { id, name, isActive, scopes } = parsed.data;

  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) return errorResponse('API key not found', 404);

  const isSuperAdmin = session.globalRole === 'SUPER_ADMIN';
  if (!isSuperAdmin && existing.tenantId) {
    const accessibleIds = await getAccessibleTenantIds(session);
    if (accessibleIds && !accessibleIds.includes(existing.tenantId)) {
      return errorResponse('You do not have access to this key', 403);
    }
  }

  if (scopes && !validateScopes(scopes)) {
    return errorResponse('Invalid scope(s) provided', 422);
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (isActive !== undefined) data.isActive = isActive;
  if (scopes !== undefined) data.scopes = scopes;

  const updated = await prisma.apiKey.update({
    where: { id },
    data,
  });

  await logAudit({
    userId: session.userId!,
    action: 'update',
    entity: 'api_key',
    entityId: id,
    changes: data,
    req,
  });

  return NextResponse.json({ id: updated.id, name: updated.name, isActive: updated.isActive, scopes: updated.scopes });
}
