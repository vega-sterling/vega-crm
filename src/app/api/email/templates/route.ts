// ============================================================================
// GET, POST /api/email/templates — Vega CRM
// ============================================================================
// List reusable email templates for accessible tenants, or create a new one.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const EmailTemplateCreateSchema = z.object({
  tenantId: z.cuid(),
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  variables: z.array(z.string()).optional().default([]),
});

/**
 * GET /api/email/templates
 *
 * @query tenantId - restrict to a single tenant
 * @query page - page number
 * @query limit - page size
 * @query search - filter by name
 * @returns Paginated email templates
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
  const tenantId = searchParams.get('tenantId');
  const search = searchParams.get('search')?.trim();

  const where: Record<string, unknown> = {
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  if (tenantId) {
    if (tenantIds && !tenantIds.includes(tenantId)) return errorResponse('Forbidden', 403);
    where.tenantId = tenantId;
  }
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  const [data, total] = await Promise.all([
    prisma.emailTemplate.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        creator: { select: { id: true, name: true } },
      },
    }),
    prisma.emailTemplate.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/email/templates
 *
 * @param req - { tenantId, name, subject, body, variables? }
 * @returns Created EmailTemplate record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, EmailTemplateCreateSchema);
  if (body instanceof NextResponse) return body;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && !tenantIds.includes(body.tenantId)) {
    return errorResponse('Forbidden', 403);
  }

  const template = await prisma.emailTemplate.create({
    data: {
      tenantId: body.tenantId,
      name: body.name,
      subject: body.subject,
      body: body.body,
      createdById: session.userId!,
    },
  });

  return NextResponse.json(template, { status: 201 });
}
