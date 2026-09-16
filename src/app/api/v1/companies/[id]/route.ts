// ============================================================================
// File: src/app/api/v1/companies/[id]/route.ts
// Description: Public API v1 endpoint for a single company. GET (read:
//   companies) returns the record; PATCH (write:companies) updates editable
//   fields in tenant scope. Follows Stripe-style single-object responses.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/apiKeyAuth';
import { logAudit } from '@/lib/audit';
import type { ApiKeyContext } from '@/lib/apiKeyAuth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const CompanyUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  industry: z.string().max(500).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  phone: z.string().max(500).optional().nullable(),
  email: z.string().max(500).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  isActive: z.boolean().optional(),
});

const companySelect = {
  id: true,
  name: true,
  industry: true,
  website: true,
  phone: true,
  email: true,
  address: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { id: true, name: true, slug: true } },
} as const;

function buildWhere(ctx: ApiKeyContext, id: string) {
  const where: { id: string; tenantId?: string } = { id };
  if (ctx.tenantId) {
    where.tenantId = ctx.tenantId;
  } else if (!ctx.isSuperAdminKey) {
    where.tenantId = '__none__';
  }
  return where;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:companies');
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;
  const where = buildWhere(ctx, id);

  const company = await prisma.company.findUnique({
    where,
    select: companySelect,
  });

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  return NextResponse.json(company);
}

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'write:companies');
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;
  const where = buildWhere(ctx, id);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CompanyUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 422 }
    );
  }

  const existing = await prisma.company.findUnique({
    where,
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const data = parsed.data;
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) updateData[key] = value;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields provided to update' }, { status: 422 });
  }

  const company = await prisma.company.update({
    where,
    data: updateData,
    select: companySelect,
  });

  await logAudit({
    userId: ctx.keyId,
    action: 'update',
    entity: 'company',
    entityId: company.id,
    changes: updateData,
    req,
  });

  return NextResponse.json(company);
}
