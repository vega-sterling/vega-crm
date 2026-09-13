// ============================================================================
// File: src/app/api/v1/companies/route.ts
// Description: Public API v1 endpoint for companies — authenticated via
//   x-api-key header (not session cookie). Supports read:companies and
//   write:companies scopes. GET returns a paginated tenant-scoped list;
//   POST creates a new company inside the key's tenant (or, for super-admin
//   keys, a body-supplied tenant). Follows Stripe-style single-object
//   responses on create.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/apiKeyAuth';
import { logAudit } from '@/lib/audit';

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

const CompanyCreateSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().max(500).optional(),
  website: z.string().max(500).optional(),
  phone: z.string().max(500).optional(),
  email: z.string().max(500).optional(),
  address: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  tenantId: z.string().min(1).optional(), // required only for super-admin keys
});

/** Field projection shared by the POST response (full created record). */
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

// ----------------------------------------------------------------------------
// GET
// ----------------------------------------------------------------------------

/**
 * GET /api/v1/companies
 * Returns a paginated list of companies accessible to the API key.
 * Requires scope: read:companies
 *
 * Query params:
 *   page    - page number (default 1)
 *   limit   - page size (default 50, max 100)
 *   search  - search by name
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:companies');
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const search = searchParams.get('search')?.trim() || '';

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
    where.name = { contains: search, mode: 'insensitive' };
  }

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      select: {
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
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.company.count({ where }),
  ]);

  return NextResponse.json({
    data: companies,
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
 * POST /api/v1/companies
 * Creates a new company in the API key's tenant. Super-admin keys must
 * supply tenantId in the body; tenant keys have their tenant forced
 * server-side (any body tenantId is ignored). Requires write:companies.
 *
 * @param req - JSON body validated by CompanyCreateSchema
 * @returns 201 with the created company (including tenant summary)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'write:companies');
  if (ctx instanceof NextResponse) return ctx;

  // ---- Parse & validate body -------------------------------------------------
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CompanyCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 422 }
    );
  }
  const body = parsed.data;

  // ---- Resolve effective tenant ------------------------------------------------
  // Tenant-scoped keys always create in their own tenant; a body tenantId is
  // never trusted. Super-admin keys must name a real, existing tenant.
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

  // ---- Resolve key creator (for audit attribution) ----------------------------
  const key = await prisma.apiKey.findUnique({
    where: { id: ctx.keyId },
    select: { createdBy: true },
  });
  if (!key) {
    return NextResponse.json({ error: 'API key creator not found' }, { status: 422 });
  }

  // ---- Create -------------------------------------------------------------------
  const company = await prisma.company.create({
    data: {
      tenantId,
      name: body.name,
      industry: body.industry,
      website: body.website,
      phone: body.phone,
      email: body.email,
      address: body.address,
      description: body.description,
      isActive: true,
    },
    select: companySelect,
  });

  await logAudit({
    userId: key.createdBy,
    action: 'create',
    entity: 'company',
    entityId: company.id,
    changes: { name: company.name, tenantId },
    req,
  });

  return NextResponse.json(company, { status: 201 });
}