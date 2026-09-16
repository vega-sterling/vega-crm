// ============================================================================
// File: src/app/api/v1/activities/[id]/route.ts
// Description: Public API v1 endpoint for a single activity — authenticated
//   via x-api-key header (not session cookie). GET requires scope:
//   read:activities; PATCH requires scope: write:activities.
//   Follows the exact pattern of /api/v1/companies.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/apiKeyAuth';
import { logAudit, buildDiff } from '@/lib/audit';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const activitySelect = {
  id: true,
  type: true,
  subject: true,
  description: true,
  companyId: true,
  contactId: true,
  dealId: true,
  userId: true,
  callDirection: true,
  callDuration: true,
  callOutcome: true,
  emailFrom: true,
  emailTo: true,
  emailCc: true,
  emailBody: true,
  source: true,
  externalId: true,
  scheduledAt: true,
  completedAt: true,
  isPinned: true,
  pinnedAt: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  deal: { select: { id: true, title: true } },
} as const;

const ActivityUpdateSchema = z.object({
  subject: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  scheduledAt: z.iso.datetime().optional().nullable(),
  completed: z.boolean().optional(),
  callDirection: z.enum(['inbound', 'outbound']).optional(),
  callDuration: z.number().int().min(0).optional(),
  callOutcome: z.string().max(100).optional(),
  emailFrom: z.email().optional(),
  emailTo: z.email().optional(),
  emailCc: z.string().max(500).optional(),
  emailBody: z.string().max(50000).optional(),
  externalId: z.string().max(200).optional(),
  tenantId: z.string().min(1).optional(), // super-admin only
});

function buildWhere(ctx: Awaited<ReturnType<typeof authenticateApiKey>> extends infer R ? (R extends NextResponse ? never : R) : never, id: string) {
  const where: { id: string; tenantId?: string } = { id };
  if (ctx.tenantId) {
    where.tenantId = ctx.tenantId;
  } else if (!ctx.isSuperAdminKey) {
    where.tenantId = '__none__';
  }
  return where;
}

/**
 * GET /api/v1/activities/[id]
 * Returns a single activity accessible to the API key.
 * Requires scope: read:activities
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:activities');
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;
  const where = buildWhere(ctx, id);

  const activity = await prisma.activity.findUnique({
    where,
    select: activitySelect,
  });

  if (!activity) {
    return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
  }

  return NextResponse.json(activity);
}

/**
 * PATCH /api/v1/activities/[id]
 * Updates an activity within the API key's effective tenant scope.
 * Requires scope: write:activities
 */
export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'write:activities');
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ActivityUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 422 });
  }
  const body = parsed.data;

  let tenantId: string;
  if (ctx.tenantId) {
    tenantId = ctx.tenantId;
  } else {
    if (!body.tenantId) {
      return NextResponse.json({ error: 'tenantId is required for super-admin API keys' }, { status: 422 });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: body.tenantId }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    tenantId = tenant.id;
  }

  const where = buildWhere(ctx, id);
  const existing = await prisma.activity.findUnique({ where });
  if (!existing) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });

  const { tenantId: _tenantId, completed, ...rest } = body;
  const updateData: Record<string, unknown> = { ...rest };

  if (completed === true) {
    updateData.completedAt = new Date();
  } else if (completed === false) {
    updateData.completedAt = null;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 422 });
  }

  const updated = await prisma.activity.update({
    where: { id },
    data: updateData,
    select: activitySelect,
  });

  await logAudit({
    userId: ctx.keyId,
    action: 'update',
    entity: 'activity',
    entityId: id,
    changes: buildDiff(existing as Record<string, unknown>, updated as Record<string, unknown>),
    req,
  });

  return NextResponse.json(updated);
}
