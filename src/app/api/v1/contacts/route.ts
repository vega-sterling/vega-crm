// ============================================================================
// File: src/app/api/v1/contacts/route.ts
// Description: Public API v1 endpoint for contacts — authenticated via
//   x-api-key header. GET returns a paginated tenant-scoped list (scope:
//   read:contacts); POST creates a contact under a company that exists in
//   the effective tenant scope (scope: write:contacts). Create responses
//   follow the Stripe single-object convention.
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

const ContactCreateSchema = z.object({
  companyId: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.email().max(200).optional(),
  phone: z.string().max(500).optional(),
  mobile: z.string().max(500).optional(),
  title: z.string().max(500).optional(),
  department: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string()).default([]),
  tenantId: z.string().min(1).optional(), // required only for super-admin keys
});

/** Field projection shared by the POST response (full created record). */
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

// ----------------------------------------------------------------------------
// GET
// ----------------------------------------------------------------------------

/**
 * GET /api/v1/contacts
 * Returns a paginated list of contacts accessible to the API key.
 * Requires scope: read:contacts
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:contacts');
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const search = searchParams.get('search')?.trim() || '';
  const companyId = searchParams.get('companyId');

  const where: Record<string, unknown> = {};
  if (ctx.tenantId) {
    where.tenantId = ctx.tenantId;
  } else if (!ctx.isSuperAdminKey) {
    where.tenantId = '__none__';
  }

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (companyId) {
    where.companyId = companyId;
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        mobile: true,
        title: true,
        department: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({
    data: contacts,
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
 * POST /api/v1/contacts
 * Creates a contact under an existing company in the effective tenant scope.
 * Tenant-scoped keys have their tenant forced server-side; super-admin keys
 * must supply tenantId in the body. Requires scope: write:contacts.
 *
 * @param req - JSON body validated by ContactCreateSchema
 * @returns 201 with the created contact (including company summary)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'write:contacts');
  if (ctx instanceof NextResponse) return ctx;

  // ---- Parse & validate body -------------------------------------------------
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ContactCreateSchema.safeParse(raw);
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

  // ---- Resolve key creator (for audit attribution) ----------------------------
  const key = await prisma.apiKey.findUnique({
    where: { id: ctx.keyId },
    select: { createdBy: true },
  });
  if (!key) {
    return NextResponse.json({ error: 'API key creator not found' }, { status: 422 });
  }

  // ---- Create -------------------------------------------------------------------
  const contact = await prisma.contact.create({
    data: {
      tenantId,
      companyId: body.companyId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
      mobile: body.mobile,
      title: body.title,
      department: body.department,
      notes: body.notes,
      tags: body.tags,
    },
    select: contactSelect,
  });

  await logAudit({
    userId: key.createdBy,
    action: 'create',
    entity: 'contact',
    entityId: contact.id,
    changes: { firstName: contact.firstName, lastName: contact.lastName, companyId: body.companyId },
    req,
  });

  return NextResponse.json(contact, { status: 201 });
}