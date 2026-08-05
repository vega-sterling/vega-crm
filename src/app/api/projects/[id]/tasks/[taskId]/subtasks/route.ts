// ============================================================================
// GET, POST /api/projects/[id]/tasks/[taskId]/subtasks — Vega CRM
// ============================================================================
// List and create subtasks (checklist items) within a kanban task card.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const SubtaskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  assignedToId: z.cuid().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

interface RouteContext {
  params: Promise<{ id: string; taskId: string }>;
}

async function getAllowedTask(
  projectId: string,
  taskId: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;
  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const task = await prisma.projectTask.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, tenantId: true },
  });
  if (!task || task.projectId !== projectId) return null;
  if (tenantIds && !tenantIds.includes(task.tenantId)) return null;
  return task;
}

/**
 * GET /api/projects/[id]/tasks/[taskId]/subtasks
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id, taskId } = await context.params;

  const task = await getAllowedTask(id, taskId, session);
  if (!task) return errorResponse('Task not found', 404);

  const subtasks = await prisma.subtask.findMany({
    where: { taskId },
    orderBy: { position: 'asc' },
    include: { assignee: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ data: subtasks });
}

/**
 * POST /api/projects/[id]/tasks/[taskId]/subtasks
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id, taskId } = await context.params;

  const task = await getAllowedTask(id, taskId, session);
  if (!task) return errorResponse('Task not found', 404);

  const body = await validateBody(req, SubtaskCreateSchema);
  if (body instanceof NextResponse) return body;

  const maxPos = await prisma.subtask.aggregate({
    where: { taskId },
    _max: { position: true },
  });

  const subtask = await prisma.subtask.create({
    data: {
      taskId,
      title: body.title,
      position: (maxPos._max.position ?? -1) + 1,
      assignedToId: body.assignedToId || null,
      dueDate: body.dueDate || null,
    },
    include: { assignee: { select: { id: true, name: true } } },
  });

  return NextResponse.json(subtask, { status: 201 });
}