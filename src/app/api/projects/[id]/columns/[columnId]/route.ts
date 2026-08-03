// ============================================================================
// PUT, DELETE /api/projects/[id]/columns/[columnId] — Vega CRM
// ============================================================================
// Update or delete a kanban column. Supports reordering via position field.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const ColumnUpdateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  wipLimit: z.number().int().min(1).max(100).optional().nullable(),
  isDoneColumn: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

interface RouteContext {
  params: Promise<{ id: string; columnId: string }>;
}

async function getAllowedColumn(
  projectId: string,
  columnId: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;
  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const column = await prisma.projectColumn.findUnique({
    where: { id: columnId },
    include: { project: { select: { tenantId: true } } },
  });
  if (!column || column.projectId !== projectId) return null;
  if (tenantIds && !tenantIds.includes(column.project.tenantId)) return null;
  return column;
}

/**
 * PUT /api/projects/[id]/columns/[columnId]
 *
 * Update column name, color, WIP limit, done flag, or position.
 * When position changes, shifts other columns accordingly.
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id, columnId } = await context.params;

  const column = await getAllowedColumn(id, columnId, session);
  if (!column) return errorResponse('Column not found', 404);

  const body = await validateBody(req, ColumnUpdateSchema);
  if (body instanceof NextResponse) return body;

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.color !== undefined) updateData.color = body.color;
  if (body.wipLimit !== undefined) updateData.wipLimit = body.wipLimit;
  if (body.isDoneColumn !== undefined) updateData.isDoneColumn = body.isDoneColumn;

  // Handle position reorder
  if (body.position !== undefined && body.position !== column.position) {
    const newPos = body.position;
    if (newPos < column.position) {
      // Moving left — shift columns between newPos and old pos right
      await prisma.projectColumn.updateMany({
        where: { projectId: id, position: { gte: newPos, lt: column.position } },
        data: { position: { increment: 1 } },
      });
    } else {
      // Moving right — shift columns between old pos and newPos left
      await prisma.projectColumn.updateMany({
        where: { projectId: id, position: { gt: column.position, lte: newPos } },
        data: { position: { decrement: 1 } },
      });
    }
    updateData.position = newPos;
  }

  const updated = await prisma.projectColumn.update({
    where: { id: columnId },
    data: updateData,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/projects/[id]/columns/[columnId]
 *
 * Deletes a column and all its tasks (cascade). Reorders remaining columns.
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id, columnId } = await context.params;

  const column = await getAllowedColumn(id, columnId, session);
  if (!column) return errorResponse('Column not found', 404);

  await prisma.projectColumn.delete({ where: { id: columnId } });

  // Reorder remaining columns
  const remaining = await prisma.projectColumn.findMany({
    where: { projectId: id },
    orderBy: { position: 'asc' },
    select: { id: true },
  });

  await Promise.all(
    remaining.map((col, idx) =>
      prisma.projectColumn.update({ where: { id: col.id }, data: { position: idx } })
    )
  );

  return NextResponse.json({ success: true });
}