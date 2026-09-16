// ============================================================================
// File: src/app/api/v1/tasks/[id]/route.ts
// Description: Public API v1 endpoint for a single task — authenticated
//   via x-api-key header (not session cookie). GET requires scope:
//   read:tasks; PATCH requires scope: write:tasks.
//   Follows the exact pattern of /api/v1/companies.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/apiKeyAuth';
import { logAudit, buildDiff } from '@/lib/audit';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  companyId: true,
  contactId: true,
  assignedToId: true,
  createdById: true,
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  assignee: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
} as const;

const TaskUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: z.iso.datetime().optional().nullable(),
  assignedToId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional().nullable(),
  tenantId: z.string().min(1).optional(), // super-admin only
  completedAt: z.string().datetime().optional().nullable(),
});

function buildWhere(ctx: Awaited<ReturnType<typeof authenticateApiKey>> extends infer R ? (R extends NextResponse ? never : R) : never, id: string) {
  const where: { id: string; tenantId?: string } = { id };
  if (ctx.tenantId) {
    where.tenantId = ctx.tenantId;
  } else if (!ctx.isSuperAdminKey) {
    where.tenantId = '__none__';
  }
  return where;
}

/**
 * GET /api/v1/tasks/[id]
 * Returns a single task accessible to the API key.
 * Requires scope: read:tasks
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:tasks');
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;
  const where = buildWhere(ctx, id);

  const task = await prisma.task.findUnique({
    where,
    select: taskSelect,
  });

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json(task);
}

/**
 * PATCH /api/v1/tasks/[id]
 * Updates a task within the API key's effective tenant scope.
 * Requires scope: write:tasks
 */
export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'write:tasks');
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = TaskUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 422 });
  }
  const body = parsed.data;

  let tenantId: string;
  if (ctx.tenantId) {
    tenantId = ctx.tenantId;
  } else {
    if (!body.tenantId) {
      return NextResponse.json({ error: 'tenantId is required for super-admin API keys' }, { status: 422 });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: body.tenantId }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    tenantId = tenant.id;
  }

  const where = buildWhere(ctx, id);
  const existing = await prisma.task.findUnique({
    where,
    include: {
      company: { select: { id: true, tenantId: true } },
      contact: { select: { id: true, companyId: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const { tenantId: _tenantId, ...updates } = body;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 422 });
  }

  // Validate company change
  if (updates.companyId && updates.companyId !== existing.companyId) {
    const company = await prisma.company.findFirst({ where: { id: updates.companyId, tenantId }, select: { id: true } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  // Validate contact belongs to effective company
  const effectiveCompanyId = updates.companyId ?? existing.companyId;
  if (updates.contactId && updates.contactId !== existing.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: updates.contactId, companyId: effectiveCompanyId, tenantId },
      select: { id: true },
    });
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  // Handle completedAt based on status transition
  if (updates.status !== undefined) {
    if (updates.status === 'COMPLETED' && !existing.completedAt) {
      updates.completedAt = new Date().toISOString();
    } else if (updates.status !== 'COMPLETED' && existing.completedAt) {
      updates.completedAt = null;
    }
  }

  const updated = await prisma.task.update({
    where: { id },
    data: updates,
    select: taskSelect,
  });

  await logAudit({
    userId: ctx.keyId,
    action: 'update',
    entity: 'task',
    entityId: id,
    changes: buildDiff(existing as Record<string, unknown>, updated as Record<string, unknown>),
    req,
  });

  return NextResponse.json(updated);
}
