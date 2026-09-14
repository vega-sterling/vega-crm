// ============================================================================
// File: src/app/api/v1/deals/route.ts
// Description: Public API v1 endpoint for deals — authenticated via
//   x-api-key header (not session cookie). GET returns a paginated list
//   (scope: read:deals) with optional status filter; POST creates a new
//   deal in the pipeline (scope: write:deals). Deals created here are
//   assigned to and attributed to the API key's creator; stageId defaults
//   to the tenant's first non-archived pipeline stage.
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

const VALID_STATUSES = ['OPEN', 'WON', 'LOST'] as const;

const DealCreateSchema = z.object({
  title: z.string().min(1).max(300),
  companyId: z.string().min(1),
  contactId: z.string().min(1).optional(),
  stageId: z.string().min(1).optional(),
  description: z.string().max(5000).optional(),
  value: z.number().min(0).default(0),
  currency: z.string().max(8).default('USD'),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.iso.datetime().optional(),
  leadSource: z.string().max(100).optional(),
  tenantId: z.string().min(1).optional(), // required only for super-admin keys
});

const dealSelect = {
  id: true,
  title: true,
  description: true,
  value: true,
  currency: true,
  probability: true,
  status: true,
  expectedCloseDate: true,
  actualCloseDate: true,
  leadSource: true,
  companyId: true,
  contactId: true,
  stageId: true,
  assignedToId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  stage: { select: { id: true, name: true, color: true } },
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  assignee: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
} as const;

// ----------------------------------------------------------------------------
// GET
// ----------------------------------------------------------------------------

/**
 * GET /api/v1/deals
 * Returns a paginated list of deals accessible to the API key.
 * Requires scope: read:deals
 *
 * Query params:
 *   page    - page number (default 1)
 *   limit   - page size (default 50, max 100)
 *   search  - search by title
 *   status  - filter by deal status (OPEN | WON | LOST)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:deals');
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
        { error: 'Invalid status. Valid values: OPEN, WON, LOST' },
        { status: 400 }
      );
    }
    where.status = status;
  }

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        value: true,
        currency: true,
        probability: true,
        status: true,
        expectedCloseDate: true,
        actualCloseDate: true,
        createdAt: true,
        updatedAt: true,
        stage: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.deal.count({ where }),
  ]);

  return NextResponse.json({
    data: deals,
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
 * POST /api/v1/deals
 * Creates a new deal in the effective tenant's pipeline.
 * stageId defaults to the tenant's first non-archived stage (by position);
 * contactId must belong to the same company and tenant; status is derived
 * from the stage (won/lost stages close the deal). assignedToId and
 * createdById are resolved from the API key's creator. Requires write:deals.
 *
 * @param req - JSON body validated by DealCreateSchema
 * @returns 201 with the created deal (including company/contact/stage/
 *          assignee/creator joins)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'write:deals');
  if (ctx instanceof NextResponse) return ctx;

  // ---- Parse & validate body -------------------------------------------------
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = DealCreateSchema.safeParse(raw);
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

  // ---- Resolve stage (explicit or tenant default) -------------------------------
  let stage: { id: string; probability: number; isWonStage: boolean; isLostStage: boolean } | null;
  if (body.stageId) {
    stage = await prisma.pipelineStage.findFirst({
      where: { id: body.stageId, tenantId, isArchived: false },
      select: { id: true, probability: true, isWonStage: true, isLostStage: true },
    });
    if (!stage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }
  } else {
    stage = await prisma.pipelineStage.findFirst({
      where: { tenantId, isArchived: false },
      select: { id: true, probability: true, isWonStage: true, isLostStage: true },
      orderBy: { position: 'asc' },
    });
    if (!stage) {
      return NextResponse.json(
        { error: 'No pipeline stages configured for tenant' },
        { status: 422 }
      );
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

  // ---- Derive status from stage (mirrors internal /api/deals POST) ---------------
  let status: 'OPEN' | 'WON' | 'LOST' = 'OPEN';
  if (stage.isWonStage) status = 'WON';
  if (stage.isLostStage) status = 'LOST';

  // ---- Create -------------------------------------------------------------------
  const deal = await prisma.deal.create({
    data: {
      tenantId,
      title: body.title,
      description: body.description,
      companyId: body.companyId,
      contactId: body.contactId,
      stageId: stage.id,
      value: body.value,
      currency: body.currency,
      probability: body.probability ?? stage.probability ?? 50,
      expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : undefined,
      leadSource: body.leadSource,
      assignedToId: key.createdBy,
      createdById: key.createdBy,
      status,
      actualCloseDate: status !== 'OPEN' ? new Date() : undefined,
    },
    select: dealSelect,
  });

  await logAudit({
    userId: key.createdBy,
    action: 'create',
    entity: 'deal',
    entityId: deal.id,
    changes: { title: deal.title, companyId: body.companyId, stageId: stage.id },
    req,
  });

  return NextResponse.json(deal, { status: 201 });
}