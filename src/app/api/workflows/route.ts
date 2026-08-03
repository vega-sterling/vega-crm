// ============================================================================
// GET, POST /api/workflows — Vega CRM
// ============================================================================
// List workflow automations for the user's accessible tenants. Create a new
// workflow with trigger, conditions, and actions.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';
import { Prisma } from '@prisma/client';

const WorkflowTrigger = z.enum([
  'DEAL_STAGE_CHANGE',
  'NEW_CONTACT',
  'TASK_ASSIGNED',
  'EMAIL_RECEIVED',
  'DEAL_CREATED',
]);

const WorkflowConditionOperator = z.enum([
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'GREATER_THAN',
  'LESS_THAN',
  'EXISTS',
]);

const WorkflowConditionSchema = z.object({
  field: z.string().min(1),
  operator: WorkflowConditionOperator,
  value: z.unknown().optional().nullable(),
});

const WorkflowActionType = z.enum([
  'CREATE_TASK',
  'SEND_EMAIL',
  'ASSIGN_USER',
  'MOVE_DEAL',
  'ADD_TAG',
]);

const WorkflowActionSchema = z.object({
  type: WorkflowActionType,
  config: z.record(z.unknown()).default({}),
});

const WorkflowCreateSchema = z.object({
  tenantId: z.string().cuid(),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional().nullable(),
  triggerType: WorkflowTrigger,
  triggerConfig: z.record(z.unknown()).optional().nullable(),
  conditions: z.array(WorkflowConditionSchema).optional().default([]),
  actions: z.array(WorkflowActionSchema).min(1, 'At least one action is required'),
  isActive: z.boolean().optional(),
});

function triggerTypeToSchemaTrigger(triggerType: string): string {
  return triggerType.toLowerCase().replace(/_/g, '_');
}

/**
 * GET /api/workflows
 *
 * @query tenantId - restrict to tenant
 * @query triggerType - filter by trigger type
 * @returns Workflow definitions
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
  const triggerType = searchParams.get('triggerType')?.toUpperCase();

  const where: Record<string, unknown> = {
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  if (tenantId) {
    if (tenantIds && !tenantIds.includes(tenantId)) return errorResponse('Forbidden', 403);
    where.tenantId = tenantId;
  }

  if (triggerType && WorkflowTrigger.safeParse(triggerType).success) {
    where.trigger = triggerTypeToSchemaTrigger(triggerType);
  }

  const data = await prisma.workflow.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      creator: { select: { id: true, name: true } },
      _count: { select: { executions: true } },
    },
  });

  return NextResponse.json({ data });
}

/**
 * POST /api/workflows
 *
 * @param req - JSON body validated by WorkflowCreateSchema
 * @returns Created workflow record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, WorkflowCreateSchema);
  if (body instanceof NextResponse) return body;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && !tenantIds.includes(body.tenantId)) {
    return errorResponse('Forbidden', 403);
  }

  const workflow = await prisma.workflow.create({
    data: {
      tenantId: body.tenantId,
      name: body.name,
      description: body.description ?? null,
      trigger: triggerTypeToSchemaTrigger(body.triggerType),
      triggerConfig: body.triggerConfig as Prisma.InputJsonValue ?? {},
      conditions: body.conditions as Prisma.InputJsonValue ?? [],
      actions: body.actions as Prisma.InputJsonValue,
      isActive: body.isActive ?? true,
      createdById: session.userId!,
    },
  });

  return NextResponse.json(workflow, { status: 201 });
}
