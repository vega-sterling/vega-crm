// ============================================================================
// POST /api/projects/[id]/columns — Vega CRM
// ============================================================================
// Add a new column to a project board.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const ColumnCreateSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  wipLimit: z.number().int().min(1).max(100).optional().nullable(),
  isDoneColumn: z.boolean().optional(),
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
 * POST /api/projects/[id]/columns
 *
 * Creates a new column at the end of the board.
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const project = await getAllowedProject(id, session);
  if (!project) return errorResponse('Project not found', 404);

  const body = await validateBody(req, ColumnCreateSchema);
  if (body instanceof NextResponse) return body;

  // Get next position
  const maxPos = await prisma.projectColumn.aggregate({
    where: { projectId: id },
    _max: { position: true },
  });

  const column = await prisma.projectColumn.create({
    data: {
      projectId: id,
      name: body.name,
      color: body.color || '#8b8d98',
      position: (maxPos._max.position ?? -1) + 1,
      wipLimit: body.wipLimit ?? null,
      isDoneColumn: body.isDoneColumn ?? false,
    },
  });

  return NextResponse.json(column, { status: 201 });
}