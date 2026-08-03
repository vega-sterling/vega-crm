// ============================================================================
// GET, POST /api/projects/[id]/tasks — Vega CRM
// ============================================================================
// List tasks for a project board (optionally filtered by column); create a new
// task card in a specified column.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { TaskPriority } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const TaskCreateSchema = z.object({
  columnId: z.string().cuid(),
  title: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedToId: z.string().cuid().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  labels: z.array(z.string()).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAllowedProject(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;
  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;
  const project = await prisma.project.findUnique({ where: { id }, select: { tenantId: true } });
  if (!project) return null;
  if (tenantIds && !tenantIds.includes(project.tenantId)) return null;
  return project;
}

/**
 * GET /api/projects/[id]/tasks
 *
 * @query columnId - filter by column
 * @query assignedToId - filter by assignee
 * @returns Array of tasks with relations
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const project = await getAllowedProject(id, session);
  if (!project) return errorResponse('Project not found', 404);

  const { searchParams } = new URL(req.url);
  const columnId = searchParams.get('columnId');
  const assignedToId = searchParams.get('assignedToId');

  const where: Record<string, unknown> = { projectId: id };
  if (columnId) where.columnId = columnId;
  if (assignedToId) where.assignedToId = assignedToId;

  const tasks = await prisma.projectTask.findMany({
    where,
    orderBy: { position: 'asc' },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      subtasks: {
        orderBy: { position: 'asc' },
        include: { assignee: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({ data: tasks });
}

/**
 * POST /api/projects/[id]/tasks
 *
 * Creates a new task card in the specified column.
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const project = await getAllowedProject(id, session);
  if (!project) return errorResponse('Project not found', 404);

  const body = await validateBody(req, TaskCreateSchema);
  if (body instanceof NextResponse) return body;

  // Verify column belongs to this project
  const column = await prisma.projectColumn.findUnique({
    where: { id: body.columnId },
    select: { id: true, projectId: true, isDoneColumn: true },
  });
  if (!column || column.projectId !== id) {
    return errorResponse('Column not found in this project', 404);
  }

  // Get next position in column
  const maxPos = await prisma.projectTask.aggregate({
    where: { columnId: body.columnId },
    _max: { position: true },
  });

  const task = await prisma.projectTask.create({
    data: {
      projectId: id,
      columnId: body.columnId,
      tenantId: project.tenantId,
      title: body.title,
      description: body.description || null,
      position: (maxPos._max.position ?? -1) + 1,
      priority: (body.priority as TaskPriority) ?? 'MEDIUM',
      assignedToId: body.assignedToId || null,
      createdById: session.userId!,
      dueDate: body.dueDate || null,
      labels: body.labels || [],
      color: body.color || null,
      completedAt: column.isDoneColumn ? new Date() : null,
    },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      subtasks: true,
    },
  });

  return NextResponse.json(task, { status: 201 });
}