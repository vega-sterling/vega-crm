export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const RuleSchema = z.object({
  event: z.string().min(1),
  points: z.number().int(),
  tenantId: z.cuid(),
});

const UpdateSchema = z.object({
  id: z.cuid(),
  event: z.string().optional(),
  points: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

/** GET /api/lead-score/rules — list rules for accessible tenants */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return NextResponse.json({ data: [] });
  const where = tenantIds ? { tenantId: { in: tenantIds } } : {};
  const rules = await prisma.leadScoreRule.findMany({ where, orderBy: [{ event: 'asc' }, { createdAt: 'asc' }] });
  return NextResponse.json({ data: rules });
}

/** POST /api/lead-score/rules — create a new rule */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const body = await validateBody(req, RuleSchema);
  if (body instanceof NextResponse) return body;

  // upsert: if rule with same tenantId+event exists, update points
  const existing = await prisma.leadScoreRule.findUnique({
    where: { tenantId_event: { tenantId: body.tenantId, event: body.event } },
  });

  if (existing) {
    const updated = await prisma.leadScoreRule.update({
      where: { id: existing.id },
      data: { points: body.points, isActive: true },
    });
    return NextResponse.json({ data: updated });
  }

  const rule = await prisma.leadScoreRule.create({
    data: { tenantId: body.tenantId, event: body.event, points: body.points },
  });
  return NextResponse.json({ data: rule }, { status: 201 });
}

/** PUT /api/lead-score/rules — update an existing rule (event, points, isActive) */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const body = await validateBody(req, UpdateSchema);
  if (body instanceof NextResponse) return body;

  const { id, ...updates } = body;
  // Remove undefined fields
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );

  const updated = await prisma.leadScoreRule.update({
    where: { id },
    data: cleanUpdates,
  });
  return NextResponse.json({ data: updated });
}

/** DELETE /api/lead-score/rules?id=xxx — delete a rule */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return errorResponse('ID required', 400);
  await prisma.leadScoreRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}