// ============================================================================
// GET, PUT, DELETE /api/projects/[id] — Vega CRM
// ============================================================================
// Read, update, or delete a single project board.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const ProjectUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(10).optional().nullable(),
  isArchived: z.boolean().optional(),
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

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true } },
      _count: { select: { tasks: true, columns: true } },
    },
  });
  if (!project) return null;
  if (tenantIds && !tenantIds.includes(project.tenantId)) return null;
  return project;
}

/**
 * GET /api/projects/[id]
 *
 * Returns full project board with columns and tasks (for kanban view).
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return errorResponse('Project not found', 404);

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true } },
      columns: {
        orderBy: { position: 'asc' },
        include: {
          tasks: {
            orderBy: { position: 'asc' },
            include: {
              assignee: { select: { id: true, name: true } },
              creator: { select: { id: true, name: true } },
              subtasks: {
                orderBy: { position: 'asc' },
                include: {
                  assignee: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
      _count: { select: { tasks: true } },
    },
  });

  if (!project) return errorResponse('Project not found', 404);
  if (tenantIds && !tenantIds.includes(project.tenantId)) return errorResponse('Project not found', 404);

  return NextResponse.json(project);
}

/**
 * PUT /api/projects/[id]
 *
 * Update project metadata (name, description, color, icon, archive).
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const project = await getAllowedProject(id, session);
  if (!project) return errorResponse('Project not found', 404);

  const body = await validateBody(req, ProjectUpdateSchema);
  if (body instanceof NextResponse) return body;

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.color && { color: body.color }),
      ...(body.icon !== undefined && { icon: body.icon }),
      ...(body.isArchived !== undefined && { isArchived: body.isArchived }),
    },
    include: {
      creator: { select: { id: true, name: true } },
      _count: { select: { tasks: true, columns: true } },
    },
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/projects/[id]
 *
 * Hard-deletes a project and all its columns, tasks, and subtasks (cascade).
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const project = await getAllowedProject(id, session);
  if (!project) return errorResponse('Project not found', 404);

  await prisma.project.delete({ where: { id } });

  return NextResponse.json({ success: true });
}