// ============================================================================
// File: src/app/api/v1/deals/[id]/route.ts
// Description: Public API v1 endpoint for a single deal — authenticated
//   via x-api-key header (not session cookie). GET requires scope:
//   read:deals; PATCH requires scope: write:deals.
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

const dealSelect = {
  id: true,
  title: true,
  description: true,
  value: true,
  currency: true,
  probability: true,
  status: true,
  lossReason: true,
  leadSource: true,
  expectedCloseDate: true,
  actualCloseDate: true,
  createdAt: true,
  updatedAt: true,
  stageId: true,
  companyId: true,
  contactId: true,
  assignedToId: true,
  createdById: true,
  stage: { select: { id: true, name: true, color: true } },
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  assignee: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
} as const;

const DealUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  companyId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional().nullable(),
  stageId: z.string().min(1).optional(),
  assignedToId: z.string().min(1).optional(),
  value: z.number().min(0).optional(),
  currency: z.string().max(8).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.iso.datetime().optional().nullable(),
  leadSource: z.string().max(100).optional(),
  lossReason: z.string().max(500).optional().nullable(),
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
 * GET /api/v1/deals/[id]
 * Returns a single deal accessible to the API key.
 * Requires scope: read:deals
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:deals');
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;
  const where = buildWhere(ctx, id);

  const deal = await prisma.deal.findUnique({
    where,
    select: dealSelect,
  });

  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  return NextResponse.json(deal);
}

/**
 * PATCH /api/v1/deals/[id]
 * Updates a deal within the API key's effective tenant scope.
 * Requires scope: write:deals
 */
export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'write:deals');
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;

  let tenantId: string;
  if (ctx.tenantId) {
    tenantId = ctx.tenantId;
  } else {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = DealUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 422 });
    }
    if (!parsed.data.tenantId) {
      return NextResponse.json({ error: 'tenantId is required for super-admin API keys' }, { status: 422 });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: parsed.data.tenantId }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    tenantId = tenant.id;
  }

  const where = buildWhere(ctx, id);
  const existing = await prisma.deal.findUnique({
    where,
    include: {
      company: { select: { id: true, tenantId: true } },
      contact: { select: { id: true, companyId: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = DealUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 422 });
  }
  const body = parsed.data;
  const { tenantId: _tenantId, ...updates } = body;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 422 });
  }

  // Validate new company if changing
  if (updates.companyId && updates.companyId !== existing.companyId) {
    const company = await prisma.company.findFirst({ where: { id: updates.companyId, tenantId }, select: { id: true } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  // Validate contact belongs to the effective company
  const effectiveCompanyId = updates.companyId ?? existing.companyId;
  if (updates.contactId && updates.contactId !== existing.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: updates.contactId, companyId: effectiveCompanyId, tenantId },
      select: { id: true },
    });
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  // Resolve stage changes
  let newStatus: 'OPEN' | 'WON' | 'LOST' | undefined;
  let newActualCloseDate: Date | null | undefined;
  let newProbability: number | undefined;

  if (updates.stageId) {
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: updates.stageId, tenantId, isArchived: false },
      select: { id: true, probability: true, isWonStage: true, isLostStage: true },
    });
    if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 });

    if (stage.isWonStage) newStatus = 'WON';
    else if (stage.isLostStage) newStatus = 'LOST';
    else newStatus = 'OPEN';

    if (newStatus === 'OPEN') {
      newActualCloseDate = null;
    } else {
      newActualCloseDate = new Date();
    }

    newProbability = updates.probability ?? stage.probability ?? existing.probability ?? 50;
  }

  const updateData: Record<string, unknown> = { ...updates };
  if (updates.probability !== undefined) newProbability = updates.probability;
  if (newStatus !== undefined) updateData.status = newStatus;
  if (newActualCloseDate !== undefined) updateData.actualCloseDate = newActualCloseDate;
  if (newProbability !== undefined) updateData.probability = newProbability;

  const updated = await prisma.deal.update({
    where: { id },
    data: updateData,
    select: dealSelect,
  });

  await logAudit({
    userId: ctx.keyId,
    action: 'update',
    entity: 'deal',
    entityId: id,
    changes: buildDiff(existing as Record<string, unknown>, updated as Record<string, unknown>),
    req,
  });

  return NextResponse.json(updated);
}
