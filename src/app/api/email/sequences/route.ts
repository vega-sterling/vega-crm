// ============================================================================
// GET, POST /api/email/sequences — Vega CRM
// ============================================================================
// List email sequences or create a new multi-step sequence. Sequences use a
// Json `steps` array of { subject, body, delayDays } per the API contract.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const SequenceStepSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  delayDays: z.number().int().min(0).default(0),
});

const EmailSequenceCreateSchema = z.object({
  tenantId: z.cuid(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  steps: z.array(SequenceStepSchema).min(1),
});

/**
 * GET /api/email/sequences
 *
 * @query tenantId - restrict to a single tenant
 * @query page - page number
 * @query limit - page size
 * @query search - filter by name
 * @returns Paginated email sequences
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
    prisma.emailSequence.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true } },
        _count: { select: { enrollments: true, steps: true } },
      },
    }),
    prisma.emailSequence.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/email/sequences
 *
 * @param req - { tenantId, name, description?, steps: [{ subject, body, delayDays }] }
 * @returns Created EmailSequence record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, EmailSequenceCreateSchema);
  if (body instanceof NextResponse) return body;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && !tenantIds.includes(body.tenantId)) {
    return errorResponse('Forbidden', 403);
  }

  const sequence = await prisma.$transaction(async (tx) => {
    const created = await tx.emailSequence.create({
      data: {
        tenantId: body.tenantId,
        name: body.name,
        description: body.description || null,
        createdById: session.userId!,
      },
    });

    await tx.sequenceStep.createMany({
      data: body.steps.map((step, index) => ({
        sequenceId: created.id,
        stepNumber: index + 1,
        subject: step.subject,
        body: step.body,
        delayDays: step.delayDays,
      })),
    });

    return created;
  });

  return NextResponse.json(sequence, { status: 201 });
}
