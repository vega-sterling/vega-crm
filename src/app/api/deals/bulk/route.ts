// ============================================================================
// POST /api/deals/bulk — Vega CRM Bulk Deal Actions
// ============================================================================
// Apply an action (move stage, reassign, delete) to multiple deals at once.
// All deals must be within accessible tenants. Selective updates only —
// no bulk data wipes. Additive by design.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const BulkActionSchema = z.object({
  action: z.enum(['moveStage', 'reassign', 'delete']),
  dealIds: z.array(z.cuid()).min(1, 'Select at least one deal'),
  stageId: z.cuid().optional(),
  assignedToId: z.cuid().optional(),
});

/**
 * POST /api/deals/bulk
 *
 * @param action - 'moveStage' | 'reassign' | 'delete'
 * @param dealIds - array of deal IDs to act on
 * @param stageId - required when action === 'moveStage'
 * @param assignedToId - required when action === 'reassign'
 * @returns { updated: number, action: string }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, BulkActionSchema);
  if (body instanceof NextResponse) return body;

  const { action, dealIds } = body;
  const tenantIds = await getAccessibleTenantIds(session);

  // Fetch only deals within accessible tenants — security boundary
  const accessibleDeals = await prisma.deal.findMany({
    where: {
      id: { in: dealIds },
      ...(tenantIds ? { tenantId: { in: tenantIds } } : {}),
    },
    select: { id: true, tenantId: true, stageId: true },
  });

  if (accessibleDeals.length === 0) {
    return errorResponse('No accessible deals found', 404);
  }

  const accessibleIds = accessibleDeals.map((d) => d.id);

  if (action === 'moveStage') {
    if (!body.stageId) return errorResponse('stageId is required for moveStage', 400);

    // Verify the target stage is accessible
    if (tenantIds) {
      const stage = await prisma.pipelineStage.findUnique({
        where: { id: body.stageId },
        select: { tenantId: true, probability: true, isWonStage: true, isLostStage: true },
      });
      if (!stage) return errorResponse('Stage not found', 404);
      if (!tenantIds.includes(stage.tenantId)) return errorResponse('Forbidden', 403);

      // Determine new status based on stage type
      const newStatus = stage.isWonStage ? 'WON' : stage.isLostStage ? 'LOST' : 'OPEN';
      const actualCloseDate = newStatus !== 'OPEN' ? new Date() : null;

      const result = await prisma.deal.updateMany({
        where: { id: { in: accessibleIds } },
        data: {
          stageId: body.stageId,
          probability: stage.probability,
          status: newStatus,
          actualCloseDate,
        },
      });
      return NextResponse.json({ updated: result.count, action });
    }

    // Super admin path — no tenant restriction
    const stage = await prisma.pipelineStage.findUnique({
      where: { id: body.stageId },
      select: { probability: true, isWonStage: true, isLostStage: true },
    });
    if (!stage) return errorResponse('Stage not found', 404);

    const newStatus = stage.isWonStage ? 'WON' : stage.isLostStage ? 'LOST' : 'OPEN';
    const actualCloseDate = newStatus !== 'OPEN' ? new Date() : null;

    const result = await prisma.deal.updateMany({
      where: { id: { in: accessibleIds } },
      data: {
        stageId: body.stageId,
        probability: stage.probability,
        status: newStatus,
        actualCloseDate,
      },
    });
    return NextResponse.json({ updated: result.count, action });
  }

  if (action === 'reassign') {
    if (!body.assignedToId) return errorResponse('assignedToId is required for reassign', 400);

    // Verify the assignee exists (any tenant — users can be assigned cross-tenant in multi-tenant)
    const user = await prisma.user.findUnique({
      where: { id: body.assignedToId },
      select: { id: true },
    });
    if (!user) return errorResponse('User not found', 404);

    const result = await prisma.deal.updateMany({
      where: { id: { in: accessibleIds } },
      data: { assignedToId: body.assignedToId },
    });
    return NextResponse.json({ updated: result.count, action });
  }

  if (action === 'delete') {
    // Only delete deals we confirmed are accessible — never touch others
    const result = await prisma.deal.deleteMany({
      where: { id: { in: accessibleIds } },
    });
    return NextResponse.json({ updated: result.count, action });
  }

  return errorResponse('Unknown action', 400);
}