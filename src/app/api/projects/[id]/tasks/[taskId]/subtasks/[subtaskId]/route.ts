// ============================================================================
// PUT, DELETE /api/projects/[id]/tasks/[taskId]/subtasks/[subtaskId]
// ============================================================================
// Update or delete a single subtask (checklist item).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const SubtaskUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  isCompleted: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  assignedToId: z.cuid().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

interface RouteContext {
  params: Promise<{ id: string; taskId: string; subtaskId: string }>;
}

async function getAllowedSubtask(
  projectId: string,
  taskId: string,
  subtaskId: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;
  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const subtask = await prisma.subtask.findUnique({
    where: { id: subtaskId },
    include: { task: { select: { projectId: true, tenantId: true } } },
  });
  if (!subtask || subtask.taskId !== taskId) return null;
  if (subtask.task.projectId !== projectId) return null;
  if (tenantIds && !tenantIds.includes(subtask.task.tenantId)) return null;
  return subtask;
}

/**
 * PUT /api/projects/[id]/tasks/[taskId]/subtasks/[subtaskId]
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id, taskId, subtaskId } = await context.params;

  const subtask = await getAllowedSubtask(id, taskId, subtaskId, session);
  if (!subtask) return errorResponse('Subtask not found', 404);

  const body = await validateBody(req, SubtaskUpdateSchema);
  if (body instanceof NextResponse) return body;

  const updateData: Record<string, unknown> = {};
  if (body.title !== undefined) updateData.title = body.title;
  if (body.isCompleted !== undefined) updateData.isCompleted = body.isCompleted;
  if (body.assignedToId !== undefined) updateData.assignedToId = body.assignedToId || null;
  if (body.dueDate !== undefined) updateData.dueDate = body.dueDate || null;

  if (body.position !== undefined && body.position !== subtask.position) {
    const newPos = body.position;
    if (newPos < subtask.position) {
      await prisma.subtask.updateMany({
        where: { taskId, position: { gte: newPos, lt: subtask.position } },
        data: { position: { increment: 1 } },
      });
    } else {
      await prisma.subtask.updateMany({
        where: { taskId, position: { gt: subtask.position, lte: newPos } },
        data: { position: { decrement: 1 } },
      });
    }
    updateData.position = newPos;
  }

  const updated = await prisma.subtask.update({
    where: { id: subtaskId },
    data: updateData,
    include: { assignee: { select: { id: true, name: true } } },
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/projects/[id]/tasks/[taskId]/subtasks/[subtaskId]
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id, taskId, subtaskId } = await context.params;

  const subtask = await getAllowedSubtask(id, taskId, subtaskId, session);
  if (!subtask) return errorResponse('Subtask not found', 404);

  await prisma.subtask.delete({ where: { id: subtaskId } });

  // Reorder remaining
  const remaining = await prisma.subtask.findMany({
    where: { taskId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });

  await Promise.all(
    remaining.map((s, idx) =>
      prisma.subtask.update({ where: { id: s.id }, data: { position: idx } })
    )
  );

  return NextResponse.json({ success: true });
}