// ============================================================================
// PUT, DELETE /api/email/sequences/[id] — Vega CRM
// ============================================================================
// Update or delete an email sequence within an accessible tenant.
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

const EmailSequenceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  steps: z.array(SequenceStepSchema).min(1).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAllowedSequence(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const sequence = await prisma.emailSequence.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true } },
      steps: { orderBy: { stepNumber: 'asc' } },
      _count: { select: { enrollments: true } },
    },
  });

  if (!sequence) return null;
  if (tenantIds && !tenantIds.includes(sequence.tenantId)) return null;
  return sequence;
}

/**
 * PUT /api/email/sequences/[id]
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const sequence = await getAllowedSequence(id, session);
  if (!sequence) return errorResponse('Sequence not found', 404);

  const body = await validateBody(req, EmailSequenceUpdateSchema);
  if (body instanceof NextResponse) return body;

  const updated = await prisma.$transaction(async (tx) => {
    if (body.steps && body.steps.length > 0) {
      await tx.sequenceStep.deleteMany({ where: { sequenceId: id } });
      await tx.sequenceStep.createMany({
        data: body.steps.map((step, index) => ({
          sequenceId: id,
          stepNumber: index + 1,
          subject: step.subject,
          body: step.body,
          delayDays: step.delayDays,
        })),
      });
    }

    return tx.emailSequence.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        isActive: body.isActive,
      },
    });
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/email/sequences/[id]
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const sequence = await getAllowedSequence(id, session);
  if (!sequence) return errorResponse('Sequence not found', 404);

  if (sequence._count.enrollments > 0) {
    return errorResponse('Cannot delete sequence with active enrollments', 409);
  }

  await prisma.$transaction(async (tx) => {
    await tx.sequenceStep.deleteMany({ where: { sequenceId: id } });
    await tx.emailSequence.delete({ where: { id } });
  });

  return NextResponse.json({ deleted: true });
}
