// ============================================================================
// GET, PUT, DELETE /api/deals/[id] — Vega CRM Deal Pipeline
// ============================================================================
// Read, update, or delete a single deal within an accessible tenant.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DealStatus } from "@prisma"
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const DealUpdateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional().nullable(),
  stageId: z.cuid().optional(),
  value: z.number().min(0).optional(),
  currency: z.string().max(3).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.coerce.date().optional().nullable(),
  actualCloseDate: z.coerce.date().optional().nullable(),
  assignedToId: z.cuid().optional(),
  leadSource: z.string().max(100).optional().nullable(),
  status: z.enum(['OPEN', 'WON', 'LOST']).optional(),
  lossReason: z.string().max(255).optional().nullable(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAllowedDeal(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true, tenantId: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      stage: { select: { id: true, name: true, color: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });
  if (!deal) return null;
  if (tenantIds && !tenantIds.includes(deal.tenantId)) return null;
  return deal;
}

/**
 * GET /api/deals/[id]
 *
 * @returns Single deal details
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const deal = await getAllowedDeal(id, session);
  if (!deal) return errorResponse('Deal not found', 404);

  return NextResponse.json(deal);
}

/**
 * PUT /api/deals/[id]
 *
 * Updates a deal. Stage changes automatically set WON/LOST status when moved
 * to a won/lost stage and vice-versa.
 * @param req - JSON body with updated deal fields
 * @returns Updated deal record
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const deal = await getAllowedDeal(id, session);
  if (!deal) return errorResponse('Deal not found', 404);

  const body = await validateBody(req, DealUpdateSchema);
  if (body instanceof NextResponse) return body;

  const cleaned = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, value === '' ? null : value])
  ) as Partial<typeof body>;

  let status = cleaned.status ?? (deal.status as DealStatus);
  let actualCloseDate = cleaned.actualCloseDate;

  if (cleaned.stageId && cleaned.stageId !== deal.stageId) {
    const stage = await prisma.pipelineStage.findUnique({
      where: { id: cleaned.stageId },
      select: { tenantId: true, probability: true, isWonStage: true, isLostStage: true },
    });
    if (!stage) return errorResponse('Stage not found', 404);

    const tenantIds = await getAccessibleTenantIds(session);
    if (tenantIds && !tenantIds.includes(stage.tenantId)) {
      return errorResponse('Forbidden', 403);
    }

    if (stage.isWonStage) {
      status = 'WON';
      actualCloseDate = actualCloseDate ?? new Date();
    } else if (stage.isLostStage) {
      status = 'LOST';
      actualCloseDate = actualCloseDate ?? new Date();
    } else if (status !== 'OPEN') {
      status = 'OPEN';
      actualCloseDate = null;
    }

    if (cleaned.probability === undefined) {
      cleaned.probability = stage.probability;
    }
  }

  if (cleaned.status && cleaned.status !== 'OPEN') {
    actualCloseDate = actualCloseDate ?? deal.actualCloseDate ?? new Date();
  } else if (cleaned.status === 'OPEN') {
    actualCloseDate = null;
  }

  const updateData: Record<string, unknown> = { ...cleaned };
  updateData.status = status;
  updateData.actualCloseDate = actualCloseDate;

  const updated = await prisma.deal.update({
    where: { id },
    data: updateData,
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      stage: { select: { id: true, name: true, color: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/deals/[id]
 *
 * Hard-deletes a deal.
 * @returns Success confirmation
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const deal = await getAllowedDeal(id, session);
  if (!deal) return errorResponse('Deal not found', 404);

  await prisma.deal.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
