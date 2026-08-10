// ============================================================================
// GET, POST /api/deals — Vega CRM Deal Pipeline
// ============================================================================
// List deals for accessible tenants with optional filters; create a new deal.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DealStatus } from "@prisma"
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

const DealCreateSchema = z.object({
  tenantId: z.cuid(),
  companyId: z.cuid(),
  contactId: z.cuid().optional().nullable(),
  stageId: z.cuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  value: z.number().min(0).optional(),
  currency: z.string().max(3).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.coerce.date().optional().nullable(),
  assignedToId: z.cuid(),
  leadSource: z.string().max(100).optional().nullable(),
});

async function canAccessCompany(
  session: Awaited<ReturnType<typeof requireSession>>,
  companyId: string
): Promise<boolean> {
  if (session instanceof NextResponse) return false;
  if (session.globalRole === 'SUPER_ADMIN') return true;
  const tenantIds = await getAccessibleTenantIds(session);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { tenantId: true },
  });
  if (!company || !tenantIds) return false;
  return tenantIds.includes(company.tenantId);
}

async function canAccessStage(
  session: Awaited<ReturnType<typeof requireSession>>,
  stageId: string
): Promise<boolean> {
  if (session instanceof NextResponse) return false;
  if (session.globalRole === 'SUPER_ADMIN') return true;
  const tenantIds = await getAccessibleTenantIds(session);
  const stage = await prisma.pipelineStage.findUnique({
    where: { id: stageId },
    select: { tenantId: true },
  });
  if (!stage || !tenantIds) return false;
  return tenantIds.includes(stage.tenantId);
}

/**
 * GET /api/deals
 *
 * @query stageId - filter by pipeline stage
 * @query companyId - filter by company
 * @query contactId - filter by contact
 * @query assignedToId - filter by owner
 * @query tenantId - restrict to tenant
 * @returns Array of deals with related records
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const { searchParams } = new URL(req.url);
  const stageId = searchParams.get('stageId');
  const companyId = searchParams.get('companyId');
  const contactId = searchParams.get('contactId');
  const assignedToId = searchParams.get('assignedToId');
  const tenantId = searchParams.get('tenantId');

  const where: Record<string, unknown> = {
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  if (tenantId) {
    if (tenantIds && !tenantIds.includes(tenantId)) return errorResponse('Forbidden', 403);
    where.tenantId = tenantId;
  }
  if (stageId) where.stageId = stageId;
  if (companyId) where.companyId = companyId;
  if (contactId) where.contactId = contactId;
  if (assignedToId) where.assignedToId = assignedToId;

  const [data, stages] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        stage: { select: { id: true, name: true, color: true } },
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    }),
    prisma.pipelineStage.findMany({
      where: { tenantId: tenantIds ? { in: tenantIds } : undefined },
      orderBy: { position: 'asc' },
      include: { _count: { select: { deals: true } } },
    }),
  ]);

  return NextResponse.json({ stages, deals: data });
}

/**
 * POST /api/deals
 *
 * Creates a new sales deal in the pipeline.
 * @param req - JSON body validated by DealCreateSchema
 * @returns Created deal record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, DealCreateSchema);
  if (body instanceof NextResponse) return body;

  const allowedCompany = await canAccessCompany(session, body.companyId);
  if (!allowedCompany) return errorResponse('Forbidden', 403);

  const allowedStage = await canAccessStage(session, body.stageId);
  if (!allowedStage) return errorResponse('Forbidden', 403);

  const stage = await prisma.pipelineStage.findUnique({
    where: { id: body.stageId },
    select: { probability: true, isWonStage: true, isLostStage: true },
  });

  let status: DealStatus = 'OPEN';
  if (stage?.isWonStage) status = 'WON';
  if (stage?.isLostStage) status = 'LOST';

  const deal = await prisma.deal.create({
    data: {
      tenantId: body.tenantId,
      companyId: body.companyId,
      contactId: body.contactId || null,
      stageId: body.stageId,
      title: body.title,
      description: body.description || null,
      value: body.value ?? 0,
      currency: body.currency || 'USD',
      probability: body.probability ?? stage?.probability ?? 50,
      expectedCloseDate: body.expectedCloseDate || null,
      assignedToId: body.assignedToId,
      createdById: session.userId!,
      leadSource: body.leadSource || null,
      status,
      actualCloseDate: status !== 'OPEN' ? new Date() : undefined,
    },
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      stage: { select: { id: true, name: true, color: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });

    await logAudit({ userId: session.userId!, action: 'create', entity: 'deal', entityId: deal.id, changes: { title: deal.title } });
  return NextResponse.json(deal, { status: 201 });
}
