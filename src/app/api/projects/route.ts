// ============================================================================
// GET, POST /api/projects — Vega CRM Projects (Kanban)
// ============================================================================
// List projects for accessible tenants, optionally filtered by archived state;
// create a new project with default columns.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const ProjectCreateSchema = z.object({
  tenantId: z.string().cuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(10).optional().nullable(),
});

const DEFAULT_COLUMNS = [
  { name: 'Backlog', color: '#8b8d98', position: 0, wipLimit: null, isDoneColumn: false },
  { name: 'To Do', color: '#60a5fa', position: 1, wipLimit: null, isDoneColumn: false },
  { name: 'In Progress', color: '#c9a96e', position: 2, wipLimit: 5, isDoneColumn: false },
  { name: 'Review', color: '#a78bfa', position: 3, wipLimit: null, isDoneColumn: false },
  { name: 'Done', color: '#4ade80', position: 4, wipLimit: null, isDoneColumn: true },
];

/**
 * GET /api/projects
 *
 * @query archived - true to show archived projects, false (default) for active
 * @query tenantId - restrict to tenant
 * @returns Array of projects with column/task counts
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const { searchParams } = new URL(req.url);
  const archived = searchParams.get('archived') === 'true';
  const tenantId = searchParams.get('tenantId');

  const where: Record<string, unknown> = {
    isArchived: archived,
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  if (tenantId) {
    if (tenantIds && !tenantIds.includes(tenantId)) return errorResponse('Forbidden', 403);
    where.tenantId = tenantId;
  }

  const data = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      creator: { select: { id: true, name: true } },
      _count: { select: { tasks: true, columns: true } },
    },
  });

  return NextResponse.json({ data });
}

/**
 * POST /api/projects
 *
 * Creates a new project with default kanban columns.
 * @param req - JSON body validated by ProjectCreateSchema
 * @returns Created project with columns
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, ProjectCreateSchema);
  if (body instanceof NextResponse) return body;

  // Validate tenant access
  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && !tenantIds.includes(body.tenantId)) {
    return errorResponse('Forbidden', 403);
  }

  const project = await prisma.project.create({
    data: {
      tenantId: body.tenantId,
      name: body.name,
      description: body.description || null,
      color: body.color || '#c9a96e',
      icon: body.icon || null,
      createdById: session.userId!,
      columns: {
        create: DEFAULT_COLUMNS,
      },
    },
    include: {
      columns: { orderBy: { position: 'asc' } },
      creator: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(project, { status: 201 });
}