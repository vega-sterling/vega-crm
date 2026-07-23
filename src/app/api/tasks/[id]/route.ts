// ============================================================================
// GET, PUT, DELETE /api/tasks/[id] — Vega CRM
// ============================================================================
// Read, update, or delete a single task within an accessible tenant.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const TaskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedToId: z.string().cuid().optional(),
  dueDate: z.coerce.date().optional().nullable(),
  completedAt: z.coerce.date().optional().nullable(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAllowedTask(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true, tenantId: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });
  if (!task) return null;
  if (tenantIds && !tenantIds.includes(task.tenantId)) return null;
  return task;
}

/**
 * GET /api/tasks/[id]
 *
 * @returns Single task details
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const task = await getAllowedTask(id, session);
  if (!task) return errorResponse('Task not found', 404);

  return NextResponse.json(task);
}

/**
 * PUT /api/tasks/[id]
 *
 * @param req - JSON body with updated task fields
 * @returns Updated task record
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const task = await getAllowedTask(id, session);
  if (!task) return errorResponse('Task not found', 404);

  const body = await validateBody(req, TaskUpdateSchema);
  if (body instanceof NextResponse) return body;

  const cleaned = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, value === '' ? null : value])
  ) as Partial<typeof body>;

  const updateData: Record<string, unknown> = { ...cleaned };
  if (cleaned.status === 'COMPLETED' && !cleaned.completedAt) {
    updateData.completedAt = new Date();
  }

  const updated = await prisma.task.update({
    where: { id },
    data: {
      ...updateData,
      status: cleaned.status as TaskStatus | undefined,
      priority: cleaned.priority as TaskPriority | undefined,
    },
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/tasks/[id]
 *
 * Hard-deletes a task.
 *
 * @returns Success confirmation
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const task = await getAllowedTask(id, session);
  if (!task) return errorResponse('Task not found', 404);

  await prisma.task.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
