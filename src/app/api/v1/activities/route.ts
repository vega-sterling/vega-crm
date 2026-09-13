// ============================================================================
// File: src/app/api/v1/activities/route.ts
// Description: Public API v1 endpoint for activities — authenticated via
//   x-api-key header (not session cookie). GET returns a paginated list
//   (scope: read:activities) with optional type filter; POST logs a new
//   activity against a tenant-scoped company (scope: write:activities).
//   Activities created here are attributed to the API key's creator and
//   default to source=MANUAL (the ActivitySource enum has no API value).
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

const VALID_TYPES = ['CALL', 'EMAIL', 'NOTE', 'TASK', 'MEETING'] as const;

const ActivityCreateSchema = z.object({
  type: z.enum(['CALL', 'EMAIL', 'NOTE', 'MEETING']),
  subject: z.string().min(1).max(300),
  companyId: z.string().min(1),
  contactId: z.string().min(1).optional(),
  description: z.string().max(5000).optional(),
  callDirection: z.enum(['inbound', 'outbound']).optional(),
  callDuration: z.number().int().min(0).optional(),
  callOutcome: z.string().max(100).optional(),
  emailFrom: z.email().optional(),
  emailTo: z.email().optional(),
  emailCc: z.string().max(500).optional(),
  emailBody: z.string().max(50000).optional(),
  scheduledAt: z.iso.datetime().optional(),
  externalId: z.string().max(200).optional(),
  completed: z.boolean().optional(),
  tenantId: z.string().min(1).optional(), // required only for super-admin keys
});

const activitySelect = {
  id: true,
  type: true,
  subject: true,
  description: true,
  companyId: true,
  contactId: true,
  dealId: true,
  userId: true,
  callDirection: true,
  callDuration: true,
  callOutcome: true,
  emailFrom: true,
  emailTo: true,
  emailCc: true,
  emailBody: true,
  source: true,
  externalId: true,
  scheduledAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
} as const;

// ----------------------------------------------------------------------------
// GET
// ----------------------------------------------------------------------------

/**
 * GET /api/v1/activities
 * Returns a paginated list of activities accessible to the API key,
 * newest first. Requires scope: read:activities
 *
 * Query params:
 *   page    - page number (default 1)
 *   limit   - page size (default 50, max 100)
 *   search  - search by subject
 *   type    - filter by activity type (CALL | EMAIL | NOTE | TASK | MEETING)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:activities');
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const search = searchParams.get('search')?.trim() || '';
  const type = searchParams.get('type')?.trim().toUpperCase() || '';

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
    where.subject = { contains: search, mode: 'insensitive' };
  }

  if (type) {
    if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
      return NextResponse.json(
        { error: 'Invalid type. Valid values: CALL, EMAIL, NOTE, TASK, MEETING' },
        { status: 400 }
      );
    }
    where.type = type;
  }

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      select: activitySelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.activity.count({ where }),
  ]);

  return NextResponse.json({
    data: activities,
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
 * POST /api/v1/activities
 * Logs a new activity against a company in the effective tenant scope.
 * The optional contactId must belong to the same company and tenant.
 * userId is resolved from the API key's creator. Requires write:activities.
 *
 * @param req - JSON body validated by ActivityCreateSchema
 * @returns 201 with the created activity (including company/contact joins)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'write:activities');
  if (ctx instanceof NextResponse) return ctx;

  // ---- Parse & validate body -------------------------------------------------
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ActivityCreateSchema.safeParse(raw);
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

  // ---- Resolve key creator (activity owner + audit attribution) -----------------
  const key = await prisma.apiKey.findUnique({
    where: { id: ctx.keyId },
    select: { createdBy: true },
  });
  if (!key) {
    return NextResponse.json({ error: 'API key creator not found' }, { status: 422 });
  }

  // ---- Create -------------------------------------------------------------------
  // ActivitySource has no 'API' enum value, so source is omitted and the
  // schema default (MANUAL) applies. completedAt is set only when the caller
  // explicitly passes completed: true.
  const activity = await prisma.activity.create({
    data: {
      tenantId,
      type: body.type,
      subject: body.subject,
      description: body.description,
      companyId: body.companyId,
      contactId: body.contactId,
      userId: key.createdBy,
      callDirection: body.callDirection,
      callDuration: body.callDuration,
      callOutcome: body.callOutcome,
      emailFrom: body.emailFrom,
      emailTo: body.emailTo,
      emailCc: body.emailCc,
      emailBody: body.emailBody,
      externalId: body.externalId,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      completedAt: body.completed === true ? new Date() : undefined,
    },
    select: activitySelect,
  });

  await logAudit({
    userId: key.createdBy,
    action: 'create',
    entity: 'activity',
    entityId: activity.id,
    changes: { type: activity.type, subject: activity.subject, companyId: body.companyId },
    req,
  });

  return NextResponse.json(activity, { status: 201 });
}