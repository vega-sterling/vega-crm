// ============================================================================
// GET, POST /api/pipeline-stages — Vega CRM Deal Pipeline
// ============================================================================
// List stages for accessible tenants ordered by position; create a new stage.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const PipelineStageCreateSchema = z.object({
  tenantId: z.cuid(),
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  position: z.number().int().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  isWonStage: z.boolean().optional(),
  isLostStage: z.boolean().optional(),
});

/**
 * GET /api/pipeline-stages
 *
 * @query tenantId - restrict to tenant
 * @returns Stages ordered by position
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');

  const where: Record<string, unknown> = {
    isArchived: false,
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  if (tenantId) {
    if (tenantIds && !tenantIds.includes(tenantId)) return errorResponse('Forbidden', 403);
    where.tenantId = tenantId;
  }

  const data = await prisma.pipelineStage.findMany({
    where,
    orderBy: { position: 'asc' },
    include: {
      _count: { select: { deals: true } },
    },
  });

  return NextResponse.json({ data });
}

/**
 * POST /api/pipeline-stages
 *
 * Creates a new pipeline stage. Position defaults to end of existing stages.
 * @param req - JSON body validated by PipelineStageCreateSchema
 * @returns Created stage record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, PipelineStageCreateSchema);
  if (body instanceof NextResponse) return body;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && !tenantIds.includes(body.tenantId)) {
    return errorResponse('Forbidden', 403);
  }

  let position = body.position;
  if (position === undefined) {
    const last = await prisma.pipelineStage.findFirst({
      where: { tenantId: body.tenantId, isArchived: false },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    position = (last?.position ?? -1) + 1;
  }

  const stage = await prisma.pipelineStage.create({
    data: {
      tenantId: body.tenantId,
      name: body.name,
      color: body.color || '#8b8d98',
      position,
      probability: body.probability ?? 0,
      isWonStage: body.isWonStage ?? false,
      isLostStage: body.isLostStage ?? false,
    },
  });

  return NextResponse.json(stage, { status: 201 });
}
