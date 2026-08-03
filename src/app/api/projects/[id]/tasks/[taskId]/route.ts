// ============================================================================
// GET, PUT, DELETE /api/projects/[id]/tasks/[taskId] — Vega CRM
// ============================================================================
// Read, update, or delete a single kanban task card. Supports moving cards
// between columns (with position reorder) and updating all card fields.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { TaskPriority } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const TaskUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  columnId: z.string().cuid().optional(),
  position: z.number().int().min(0).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedToId: z.string().cuid().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  labels: z.array(z.string()).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
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
    include: {
      column: { select: { isDoneColumn: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });
  if (!task || task.projectId !== projectId) return null;
  if (tenantIds && !tenantIds.includes(task.tenantId)) return null;
  return task;
}

/**
 * GET /api/projects/[id]/tasks/[taskId]
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id, taskId } = await context.params;

  const task = await getAllowedTask(id, taskId, session);
  if (!task) return errorResponse('Task not found', 404);

  const fullTask = await prisma.projectTask.findUnique({
    where: { id: taskId },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      subtasks: {
        orderBy: { position: 'asc' },
        include: { assignee: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json(fullTask);
}

/**
 * PUT /api/projects/[id]/tasks/[taskId]
 *
 * Updates a task. When columnId changes, moves the card to the new column
 * and handles position shifting in both old and new columns. If the target
 * column is a "done" column, sets completedAt; if moving out of a done
 * column, clears completedAt.
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id, taskId } = await context.params;

  const task = await getAllowedTask(id, taskId, session);
  if (!task) return errorResponse('Task not found', 404);

  const body = await validateBody(req, TaskUpdateSchema);
  if (body instanceof NextResponse) return body;

  const updateData: Record<string, unknown> = {};

  if (body.title !== undefined) updateData.title = body.title;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.priority !== undefined) updateData.priority = body.priority as TaskPriority;
  if (body.assignedToId !== undefined) updateData.assignedToId = body.assignedToId || null;
  if (body.dueDate !== undefined) updateData.dueDate = body.dueDate || null;
  if (body.labels !== undefined) updateData.labels = body.labels;
  if (body.color !== undefined) updateData.color = body.color || null;

  // Handle column move + position reorder
  const movingColumn = body.columnId !== undefined && body.columnId !== task.columnId;
  const movingPosition = body.position !== undefined;

  if (movingColumn) {
    // Verify new column belongs to this project
    const newColumn = await prisma.projectColumn.findUnique({
      where: { id: body.columnId! },
      select: { id: true, projectId: true, isDoneColumn: true },
    });
    if (!newColumn || newColumn.projectId !== id) {
      return errorResponse('Column not found in this project', 404);
    }

    // Shift tasks in old column (close the gap)
    await prisma.projectTask.updateMany({
      where: { columnId: task.columnId, position: { gt: task.position } },
      data: { position: { decrement: 1 } },
    });

    // Make space in new column
    if (body.position !== undefined) {
      await prisma.projectTask.updateMany({
        where: { columnId: body.columnId!, position: { gte: body.position } },
        data: { position: { increment: 1 } },
      });
    } else {
      // Append to end
      const maxPos = await prisma.projectTask.aggregate({
        where: { columnId: body.columnId! },
        _max: { position: true },
      });
      body.position = (maxPos._max.position ?? -1) + 1;
    }

    updateData.columnId = body.columnId;
    updateData.position = body.position;

    // Handle done column completion
    if (newColumn.isDoneColumn && !task.completedAt) {
      updateData.completedAt = new Date();
    } else if (!newColumn.isDoneColumn && task.completedAt) {
      updateData.completedAt = null;
    }
  } else if (movingPosition && !movingColumn) {
    // Reorder within same column
    const newPos = body.position!;
    if (newPos < task.position) {
      await prisma.projectTask.updateMany({
        where: { columnId: task.columnId, position: { gte: newPos, lt: task.position } },
        data: { position: { increment: 1 } },
      });
    } else {
      await prisma.projectTask.updateMany({
        where: { columnId: task.columnId, position: { gt: task.position, lte: newPos } },
        data: { position: { decrement: 1 } },
      });
    }
    updateData.position = newPos;
  }

  const updated = await prisma.projectTask.update({
    where: { id: taskId },
    data: updateData,
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      subtasks: {
        orderBy: { position: 'asc' },
        include: { assignee: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/projects/[id]/tasks/[taskId]
 *
 * Deletes a task card and all its subtasks (cascade). Reorders remaining
 * tasks in the column.
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id, taskId } = await context.params;

  const task = await getAllowedTask(id, taskId, session);
  if (!task) return errorResponse('Task not found', 404);

  await prisma.projectTask.delete({ where: { id: taskId } });

  // Reorder remaining tasks in the column
  const remaining = await prisma.projectTask.findMany({
    where: { columnId: task.columnId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });

  await Promise.all(
    remaining.map((t, idx) =>
      prisma.projectTask.update({ where: { id: t.id }, data: { position: idx } })
    )
  );

  return NextResponse.json({ success: true });
}