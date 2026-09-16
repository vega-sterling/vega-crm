// ============================================================================
// File: src/app/api/v1/contacts/[id]/route.ts
// Description: Public API v1 endpoint for a single contact — authenticated
//   via x-api-key header (not session cookie). GET requires scope:
//   read:contacts; PATCH requires scope: write:contacts.
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

const contactSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  mobile: true,
  title: true,
  department: true,
  notes: true,
  tags: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true } },
} as const;

const ContactUpdateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.email().max(200).optional(),
  phone: z.string().max(500).optional(),
  mobile: z.string().max(500).optional(),
  title: z.string().max(500).optional(),
  department: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  companyId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(), // super-admin only
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
 * GET /api/v1/contacts/[id]
 * Returns a single contact accessible to the API key.
 * Requires scope: read:contacts
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:contacts');
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;
  const where = buildWhere(ctx, id);

  const contact = await prisma.contact.findUnique({
    where,
    select: contactSelect,
  });

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  return NextResponse.json(contact);
}

/**
 * PATCH /api/v1/contacts/[id]
 * Updates a contact within the API key's effective tenant scope.
 * Requires scope: write:contacts
 */
export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'write:contacts');
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;

  let tenantId: string;
  if (ctx.tenantId) {
    tenantId = ctx.tenantId;
  } else {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = ContactUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 422 });
    }
    if (!parsed.data.tenantId) {
      return NextResponse.json({ error: 'tenantId is required for super-admin API keys' }, { status: 422 });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: parsed.data.tenantId }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    tenantId = tenant.id;
  }

  const where = buildWhere(ctx, id);
  const existing = await prisma.contact.findUnique({
    where,
    include: { company: { select: { id: true, tenantId: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = ContactUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 422 });
  }
  const body = parsed.data;
  const { tenantId: _tenantId, ...updates } = body;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 422 });
  }

  // If companyId is changing, verify the new company belongs to the tenant
  if (updates.companyId && updates.companyId !== existing.companyId) {
    const newCompany = await prisma.company.findFirst({
      where: { id: updates.companyId, tenantId },
      select: { id: true },
    });
    if (!newCompany) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const updated = await prisma.contact.update({
    where: { id },
    data: updates,
    select: contactSelect,
  });

  await logAudit({
    userId: ctx.keyId,
    action: 'update',
    entity: 'contact',
    entityId: id,
    changes: buildDiff(existing as Record<string, unknown>, updated as Record<string, unknown>),
    req,
  });

  return NextResponse.json(updated);
}
