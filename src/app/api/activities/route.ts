// ============================================================================
// GET, POST /api/activities — Vega CRM
// ============================================================================
// List activities for accessible tenants, optionally filtered by type,
// company, or contact; create a new activity.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ActivityType, ActivitySource } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const ActivityCreateSchema = z.object({
  tenantId: z.string().cuid(),
  companyId: z.string().cuid(),
  contactId: z.string().cuid().optional().nullable(),
  type: z.enum(['CALL', 'EMAIL', 'NOTE', 'TASK', 'MEETING']),
  subject: z.string().min(1),
  description: z.string().optional().nullable(),
  scheduledAt: z.coerce.date().optional().nullable(),
  completedAt: z.coerce.date().optional().nullable(),
  callDirection: z.string().optional().nullable(),
  callDuration: z.number().int().optional().nullable(),
  callOutcome: z.string().optional().nullable(),
  emailFrom: z.string().email().optional().nullable().or(z.literal('')),
  emailTo: z.string().email().optional().nullable().or(z.literal('')),
  emailCc: z.string().optional().nullable(),
  emailBody: z.string().optional().nullable(),
  externalId: z.string().optional().nullable(),
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
 * GET /api/activities
 *
 * @query page - page number
 * @query limit - page size
 * @query type - CALL | EMAIL | NOTE | TASK | MEETING
 * @query companyId - filter by company
 * @query contactId - filter by contact
 * @query tenantId - restrict to tenant
 * @returns Paginated activities
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
  const type = searchParams.get('type') as ActivityType | null;
  const companyId = searchParams.get('companyId');
  const contactId = searchParams.get('contactId');
  const tenantId = searchParams.get('tenantId');

  const where: Record<string, unknown> = {
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  if (tenantId) {
    if (tenantIds && !tenantIds.includes(tenantId)) return errorResponse('Forbidden', 403);
    where.tenantId = tenantId;
  }
  if (type) where.type = type;
  if (companyId) where.companyId = companyId;
  if (contactId) where.contactId = contactId;

  const [data, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.activity.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/activities
 *
 * @param req - JSON body validated by ActivityCreateSchema
 * @returns Created activity record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, ActivityCreateSchema);
  if (body instanceof NextResponse) return body;

  const allowed = await canAccessCompany(session, body.companyId);
  if (!allowed) return errorResponse('Forbidden', 403);

  const activity = await prisma.activity.create({
    data: {
      tenantId: body.tenantId,
      companyId: body.companyId,
      contactId: body.contactId || null,
      userId: session.userId!,
      type: body.type as ActivityType,
      subject: body.subject,
      description: body.description || null,
      scheduledAt: body.scheduledAt || null,
      completedAt: body.completedAt || null,
      callDirection: body.callDirection || null,
      callDuration: body.callDuration || null,
      callOutcome: body.callOutcome || null,
      emailFrom: body.emailFrom || null,
      emailTo: body.emailTo || null,
      emailCc: body.emailCc || null,
      emailBody: body.emailBody || null,
      externalId: body.externalId || null,
      source: ActivitySource.MANUAL,
    },
  });

  return NextResponse.json(activity, { status: 201 });
}
