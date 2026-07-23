// ============================================================================
// GET, POST /api/tasks — Vega CRM
// ============================================================================
// List tasks for accessible tenants, optionally filtered by status,
// company, or assignee; create a new task.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const TaskCreateSchema = z.object({
  tenantId: z.string().cuid(),
  companyId: z.string().cuid(),
  contactId: z.string().cuid().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedToId: z.string().cuid(),
  dueDate: z.coerce.date().optional().nullable(),
});

async function canAccessCompany(
  session: Awaited<ReturnType<typeof requireSession>>,
  companyId: string
): Promise<boolean> {
  if (session instanceof NextResponse) return false;
  if (session.globalRole === 'SUPER_ADMIN') return true;
  const tenantIds = await getAccessibleTenantIds(session);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { tenantId: true },
  });
  if (!company || !tenantIds) return false;
  return tenantIds.includes(company.tenantId);
}

/**
 * GET /api/tasks
 *
 * @query page - page number
 * @query limit - page size
 * @query status - PENDING | IN_PROGRESS | COMPLETED | CANCELLED
 * @query companyId - filter by company
 * @query assignedToId - filter by assignee
 * @query tenantId - restrict to tenant
 * @returns Paginated tasks
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ data: [], pagination: { page: 1, limit: 20, total: 0 } });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const status = searchParams.get('status') as TaskStatus | null;
  const companyId = searchParams.get('companyId');
  const assignedToId = searchParams.get('assignedToId');
  const tenantId = searchParams.get('tenantId');

  const where: Record<string, unknown> = {
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  if (tenantId) {
    if (tenantIds && !tenantIds.includes(tenantId)) return errorResponse('Forbidden', 403);
    where.tenantId = tenantId;
  }
  if (status) where.status = status;
  if (companyId) where.companyId = companyId;
  if (assignedToId) where.assignedToId = assignedToId;

  const [data, total] = await Promise.all([
    prisma.task.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { dueDate: 'asc' },
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    }),
    prisma.task.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/tasks
 *
 * @param req - JSON body validated by TaskCreateSchema
 * @returns Created task record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, TaskCreateSchema);
  if (body instanceof NextResponse) return body;

  const allowed = await canAccessCompany(session, body.companyId);
  if (!allowed) return errorResponse('Forbidden', 403);

  const task = await prisma.task.create({
    data: {
      tenantId: body.tenantId,
      companyId: body.companyId,
      contactId: body.contactId || null,
      title: body.title,
      description: body.description || null,
      status: (body.status as TaskStatus) ?? 'PENDING',
      priority: (body.priority as TaskPriority) ?? 'MEDIUM',
      assignedToId: body.assignedToId,
      createdById: session.userId!,
      dueDate: body.dueDate || null,
    },
  });

  return NextResponse.json(task, { status: 201 });
}
