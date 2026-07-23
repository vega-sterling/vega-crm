// ============================================================================
// GET /api/dashboard — Vega CRM
// ============================================================================
// Returns aggregated CRM stats for the user's accessible tenants:
// counts, recent activities, and task summary.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds } from '@/lib/session';

/**
 * GET /api/dashboard
 *
 * @returns Aggregated counts, recent activities, and task summary
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);

  const baseWhere = {
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  const [
    companies,
    contacts,
    activities,
    tasks,
    pendingTasks,
    completedTasks,
    recentActivities,
    taskSummary,
  ] = await Promise.all([
    prisma.company.count({ where: { ...baseWhere, isActive: true } }),
    prisma.contact.count({ where: { ...baseWhere, isActive: true } }),
    prisma.activity.count({ where: baseWhere }),
    prisma.task.count({ where: baseWhere }),
    prisma.task.count({ where: { ...baseWhere, status: 'PENDING' } }),
    prisma.task.count({ where: { ...baseWhere, status: 'COMPLETED' } }),
    prisma.activity.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.task.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { status: true },
    }),
  ]);

  return NextResponse.json({
    counts: {
      companies,
      contacts,
      activities,
      tasks,
      pendingTasks,
      completedTasks,
    },
    recentActivities,
    taskSummary: taskSummary.map((row: { status: string; _count: { status: number } }) => ({
      status: row.status,
      count: row._count.status,
    })),
  });
}
