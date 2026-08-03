// ============================================================================
// PUT, DELETE /api/pipeline-stages/[id] — Vega CRM Deal Pipeline
// ============================================================================
// Rename, reorder, recolor, or mark a pipeline stage as won/lost. Hard-delete
// only allowed when no deals are attached.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const PipelineStageUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  position: z.number().int().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  isWonStage: z.boolean().optional(),
  isLostStage: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAllowedStage(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const stage = await prisma.pipelineStage.findUnique({
    where: { id },
    include: {
      _count: { select: { deals: true } },
    },
  });
  if (!stage || stage.isArchived) return null;
  if (tenantIds && !tenantIds.includes(stage.tenantId)) return null;
  return stage;
}

/**
 * PUT /api/pipeline-stages/[id]
 *
 * Renames, reorders, recolors, or changes the win/loss flag of a stage.
 * Moving a stage's position shifts surrounding stages to maintain order.
 * @param req - JSON body with updated stage fields
 * @returns Updated stage record
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const stage = await getAllowedStage(id, session);
  if (!stage) return errorResponse('Pipeline stage not found', 404);

  const body = await validateBody(req, PipelineStageUpdateSchema);
  if (body instanceof NextResponse) return body;

  const cleaned = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, value === '' ? null : value])
  ) as Partial<typeof body>;

  const targetPosition = cleaned.position;
  if (targetPosition !== undefined && targetPosition !== stage.position) {
    const siblings = await prisma.pipelineStage.findMany({
      where: { tenantId: stage.tenantId, isArchived: false, id: { not: id } },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });

    const reordered: { id: string; position: number }[] = [];
    let currentPosition = 0;
    for (const s of siblings) {
      if (currentPosition === targetPosition) currentPosition++;
      if (s.position !== currentPosition) {
        reordered.push({ id: s.id, position: currentPosition });
      }
      currentPosition++;
    }

    if (reordered.length > 0) {
      await prisma.$transaction(
        reordered.map((s) =>
          prisma.pipelineStage.update({
            where: { id: s.id },
            data: { position: s.position },
          })
        )
      );
    }
  }

  const updateData: Record<string, unknown> = { ...cleaned };
  if (cleaned.isWonStage) {
    updateData.isLostStage = false;
  } else if (cleaned.isLostStage) {
    updateData.isWonStage = false;
  }

  const updated = await prisma.pipelineStage.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/pipeline-stages/[id]
 *
 * Hard-deletes a stage only when it has no associated deals.
 * @returns Success confirmation
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const stage = await getAllowedStage(id, session);
  if (!stage) return errorResponse('Pipeline stage not found', 404);

  if (stage._count.deals > 0) {
    return errorResponse('Cannot delete stage with associated deals', 409);
  }

  await prisma.pipelineStage.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
