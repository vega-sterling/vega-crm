// ============================================================================
// GET, PUT, DELETE /api/workflows/[id] — Vega CRM
// ============================================================================
// Read, update, or delete a single workflow within an accessible tenant.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

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

const WorkflowUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  triggerType: WorkflowTrigger.optional(),
  triggerConfig: z.record(z.unknown()).optional().nullable(),
  conditions: z.array(WorkflowConditionSchema).optional(),
  actions: z.array(WorkflowActionSchema).optional(),
  isActive: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

function triggerTypeToSchemaTrigger(triggerType: string): string {
  return triggerType.toLowerCase().replace(/_/g, '_');
}

async function getAllowedWorkflow(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const workflow = await prisma.workflow.findUnique({
    where: { id },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      creator: { select: { id: true, name: true } },
      _count: { select: { executions: true } },
    },
  });

  if (!workflow) return null;
  if (tenantIds && !tenantIds.includes(workflow.tenantId)) return null;
  return workflow;
}

/**
 * GET /api/workflows/[id]
 *
 * @returns Single workflow details
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const workflow = await getAllowedWorkflow(id, session);
  if (!workflow) return errorResponse('Workflow not found', 404);

  return NextResponse.json(workflow);
}

/**
 * PUT /api/workflows/[id]
 *
 * @param req - JSON body with updated workflow fields
 * @returns Updated workflow record
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const workflow = await getAllowedWorkflow(id, session);
  if (!workflow) return errorResponse('Workflow not found', 404);

  const body = await validateBody(req, WorkflowUpdateSchema);
  if (body instanceof NextResponse) return body;

  const cleaned = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, value === '' ? null : value])
  ) as Partial<typeof body>;

  const updateData: Record<string, unknown> = {};

  if (cleaned.name !== undefined) updateData.name = cleaned.name;
  if (cleaned.description !== undefined) updateData.description = cleaned.description;
  if (cleaned.triggerType !== undefined) updateData.trigger = triggerTypeToSchemaTrigger(cleaned.triggerType);
  if (cleaned.triggerConfig !== undefined) updateData.triggerConfig = cleaned.triggerConfig ?? {};
  if (cleaned.conditions !== undefined) updateData.conditions = cleaned.conditions ?? [];
  if (cleaned.actions !== undefined) updateData.actions = cleaned.actions;
  if (cleaned.isActive !== undefined) updateData.isActive = cleaned.isActive;

  const updated = await prisma.workflow.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/workflows/[id]
 *
 * Hard-deletes the workflow. Related executions are removed by cascade.
 *
 * @returns Success confirmation
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const workflow = await getAllowedWorkflow(id, session);
  if (!workflow) return errorResponse('Workflow not found', 404);

  await prisma.workflow.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
