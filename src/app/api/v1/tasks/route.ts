// ============================================================================
// File: src/app/api/v1/tasks/route.ts
// Description: Public API v1 endpoint for tasks — authenticated via
//   x-api-key header (not session cookie). GET returns a paginated list
//   (scope: read:tasks) with optional status filter; POST creates a new
//   task against a tenant-scoped company (scope: write:tasks). Tasks
//   created here are assigned to and attributed to the API key's creator;
//   tasks created with status=COMPLETED get completedAt set immediately.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/apiKeyAuth';
import { logAudit } from '@/lib/audit';

// ----------------------------------------------------------------------------
// Constants / validation
// ----------------------------------------------------------------------------

const VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

const TaskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  companyId: z.string().min(1),
  contactId: z.string().min(1).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('PENDING'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: z.iso.datetime().optional(),
  tenantId: z.string().min(1).optional(), // required only for super-admin keys
});

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  companyId: true,
  contactId: true,
  assignedToId: true,
  createdById: true,
  dueDate: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  assignee: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
} as const;

// ----------------------------------------------------------------------------
// GET
// ----------------------------------------------------------------------------

/**
 * GET /api/v1/tasks
 * Returns a paginated list of tasks accessible to the API key.
 * Requires scope: read:tasks
 *
 * Query params:
 *   page    - page number (default 1)
 *   limit   - page size (default 50, max 100)
 *   search  - search by title
 *   status  - filter by task status (PENDING | IN_PROGRESS | COMPLETED | CANCELLED)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:tasks');
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const search = searchParams.get('search')?.trim() || '';
  const status = searchParams.get('status')?.trim().toUpperCase() || '';

  const where: Record<string, unknown> = {};
  if (ctx.tenantId) {
    where.tenantId = ctx.tenantId;
  } else if (!ctx.isSuperAdminKey) {
    // Non-super-admin keys with null tenantId should see nothing
    // (they were created by tenant admins, not super admins)
    // This is a safety check — the key should have a tenantId
    where.tenantId = '__none__';
  }

  if (search) {
    where.title = { contains: search, mode: 'insensitive' };
  }

  if (status) {
    if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return NextResponse.json(
        { error: 'Invalid status. Valid values: PENDING, IN_PROGRESS, COMPLETED, CANCELLED' },
        { status: 400 }
      );
    }
    where.status = status;
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        contact: { select: { id: true, firstName: true, lastName: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.task.count({ where }),
  ]);

  return NextResponse.json({
    data: tasks,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}

// ----------------------------------------------------------------------------
// POST
// ----------------------------------------------------------------------------

/**
 * POST /api/v1/tasks
 * Creates a new task against a company in the effective tenant scope.
 * The optional contactId must belong to the same company and tenant.
 * assignedToId and createdById are resolved from the API key's creator.
 * Tasks created with status=COMPLETED get completedAt set to now.
 * Requires write:tasks.
 *
 * @param req - JSON body validated by TaskCreateSchema
 * @returns 201 with the created task (including company/contact/assignee/
 *          creator joins)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'write:tasks');
  if (ctx instanceof NextResponse) return ctx;

  // ---- Parse & validate body -------------------------------------------------
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = TaskCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 422 }
    );
  }
  const body = parsed.data;

  // ---- Resolve effective tenant ------------------------------------------------
  let tenantId: string;
  if (ctx.tenantId) {
    tenantId = ctx.tenantId;
  } else {
    if (!body.tenantId) {
      return NextResponse.json(
        { error: 'tenantId is required for super-admin API keys' },
        { status: 422 }
      );
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: body.tenantId },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    tenantId = tenant.id;
  }

  // ---- Verify referenced company exists in tenant scope ------------------------
  const company = await prisma.company.findFirst({
    where: { id: body.companyId, tenantId },
    select: { id: true },
  });
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  // ---- Verify optional contact belongs to the same company AND tenant -----------
  if (body.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: body.contactId, companyId: body.companyId, tenantId },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
  }

  // ---- Resolve key creator (assignee + audit attribution) ------------------------
  const key = await prisma.apiKey.findUnique({
    where: { id: ctx.keyId },
    select: { createdBy: true },
  });
  if (!key) {
    return NextResponse.json({ error: 'API key creator not found' }, { status: 422 });
  }

  // ---- Create -------------------------------------------------------------------
  const task = await prisma.task.create({
    data: {
      tenantId,
      title: body.title,
      description: body.description,
      companyId: body.companyId,
      contactId: body.contactId,
      status: body.status,
      priority: body.priority,
      assignedToId: key.createdBy,
      createdById: key.createdBy,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      completedAt: body.status === 'COMPLETED' ? new Date() : undefined,
    },
    select: taskSelect,
  });

  await logAudit({
    userId: key.createdBy,
    action: 'create',
    entity: 'task',
    entityId: task.id,
    changes: { title: task.title, companyId: body.companyId, status: task.status },
    req,
  });

  return NextResponse.json(task, { status: 201 });
}