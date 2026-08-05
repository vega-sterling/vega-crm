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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return NextResponse.json({ data: [] });
  const where = tenantIds ? { tenantId: { in: tenantIds } } : {};
  const rules = await prisma.leadScoreRule.findMany({ where, orderBy: { event: 'asc' } });
  return NextResponse.json({ data: rules });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const body = await validateBody(req, RuleSchema);
  if (body instanceof NextResponse) return body;
  const rule = await prisma.leadScoreRule.create({ data: { tenantId: body.tenantId, event: body.event, points: body.points } });
  return NextResponse.json({ data: rule }, { status: 201 });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return errorResponse('ID required', 400);
  await prisma.leadScoreRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}