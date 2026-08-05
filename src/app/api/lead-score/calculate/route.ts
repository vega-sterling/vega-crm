export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const CalcSchema = z.object({ contactId: z.cuid() });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const body = await validateBody(req, CalcSchema);
  if (body instanceof NextResponse) return body;

  const { contactId } = body;
  const [activities, emailOpens, deals] = await Promise.all([
    prisma.activity.findMany({ where: { contactId }, select: { type: true, createdAt: true } }),
    prisma.emailOpen.findMany({ where: { emailMessage: { contactId } }, select: { openedAt: true } }),
    prisma.deal.findMany({ where: { contactId }, select: { stageId: true, createdAt: true, updatedAt: true } }),
  ]);

  let score = 0;
  const breakdown: Array<{ event: string; points: number }> = [];

  const activityPoints = activities.length * 5;
  score += activityPoints;
  if (activityPoints > 0) breakdown.push({ event: `${activities.length} activities`, points: activityPoints });

  const openPoints = emailOpens.length * 3;
  score += openPoints;
  if (openPoints > 0) breakdown.push({ event: `${emailOpens.length} email opens`, points: openPoints });

  const dealPoints = deals.length * 10;
  score += dealPoints;
  if (dealPoints > 0) breakdown.push({ event: `${deals.length} deals`, points: dealPoints });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const hasRecentActivity = activities.some(a => a.createdAt > thirtyDaysAgo);
  if (!hasRecentActivity && activities.length > 0) {
    score -= 15;
    breakdown.push({ event: 'No activity in 30 days', points: -15 });
  }

  return NextResponse.json({ score, breakdown });
}