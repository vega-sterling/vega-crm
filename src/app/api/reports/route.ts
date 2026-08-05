// ============================================================================
// GET /api/reports — Vega CRM Deal Pipeline Reports
// ============================================================================
// Returns aggregated pipeline data for dashboards. Report types:
//   funnel, forecast, velocity, conversion, activity, lead-source,
//   revenue-by-tenant
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DealStatus } from "@prisma"
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';

const ReportTypeSchema = z.enum([
  'funnel',
  'forecast',
  'velocity',
  'conversion',
  'activity',
  'lead-source',
  'revenue-by-tenant',
]);

const VALID_REPORT_TYPES = ReportTypeSchema.options;

type ReportType = z.infer<typeof ReportTypeSchema>;

function accessibleWhere(
  tenantIds: string[] | null,
  tenantId?: string | null
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };
  if (tenantId) {
    where.tenantId = tenantId;
  }
  return where;
}

async function runFunnelReport(
  tenantIds: string[] | null,
  tenantId?: string | null
): Promise<unknown> {
  const stages = await prisma.pipelineStage.findMany({
    where: accessibleWhere(tenantIds, tenantId),
    orderBy: { position: 'asc' },
    select: { id: true, name: true, color: true, position: true, probability: true },
  });

  const totals = await prisma.deal.groupBy({
    by: ['stageId'],
    where: accessibleWhere(tenantIds, tenantId),
    _count: { id: true },
    _sum: { value: true },
    _avg: { value: true },
  });

  const totalsByStageId = new Map(
    totals.map((t) => [
      t.stageId,
      { count: t._count.id, value: t._sum.value ?? 0, avgValue: t._avg.value ?? 0 },
    ])
  );

  return {
    stages: stages.map((stage) => {
      const t = totalsByStageId.get(stage.id);
      return {
        stageId: stage.id,
        name: stage.name,
        color: stage.color,
        position: stage.position,
        probability: stage.probability,
        dealCount: t?.count ?? 0,
        totalValue: t?.value ?? 0,
        avgDealValue: t?.avgValue ?? 0,
      };
    }),
  };
}

async function runForecastReport(
  tenantIds: string[] | null,
  tenantId?: string | null
): Promise<unknown> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfNextQuarter = new Date(now.getFullYear(), now.getMonth() + 4, 0, 23, 59, 59);

  const deals = await prisma.deal.findMany({
    where: {
      ...accessibleWhere(tenantIds, tenantId),
      status: 'OPEN' as DealStatus,
      expectedCloseDate: { gte: startOfMonth, lte: endOfNextQuarter },
    },
    select: { expectedCloseDate: true, value: true, probability: true, tenantId: true },
    orderBy: { expectedCloseDate: 'asc' },
  });

  const buckets = new Map<string, { count: number; weighted: number; raw: number }>();
  const months: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(d.toISOString().slice(0, 7));
  }
  months.forEach((m) => buckets.set(m, { count: 0, weighted: 0, raw: 0 }));

  for (const deal of deals) {
    if (!deal.expectedCloseDate) continue;
    const key = deal.expectedCloseDate.toISOString().slice(0, 7);
    if (!buckets.has(key)) continue;
    const bucket = buckets.get(key)!;
    bucket.count++;
    bucket.raw += deal.value;
    bucket.weighted += deal.value * (deal.probability / 100);
  }

  return {
    periodStart: startOfMonth.toISOString(),
    periodEnd: endOfNextQuarter.toISOString(),
    totalOpenValue: deals.reduce((sum, d) => sum + d.value, 0),
    totalWeightedValue: deals.reduce((sum, d) => sum + d.value * (d.probability / 100), 0),
    byMonth: Array.from(buckets.entries()).map(([month, values]) => ({ month, ...values })),
  };
}

async function runVelocityReport(
  tenantIds: string[] | null,
  tenantId?: string | null
): Promise<unknown> {
  const closedDeals = await prisma.deal.findMany({
    where: {
      ...accessibleWhere(tenantIds, tenantId),
      status: { in: ['WON', 'LOST'] as DealStatus[] },
      actualCloseDate: { not: null },
    },
    select: {
      status: true,
      createdAt: true,
      actualCloseDate: true,
      value: true,
      stageId: true,
    },
  });

  let totalDays = 0;
  let wonCount = 0;
  let lostCount = 0;
  let wonValue = 0;
  let lostValue = 0;

  for (const deal of closedDeals) {
    if (!deal.actualCloseDate) continue;
    const days =
      (deal.actualCloseDate.getTime() - deal.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    totalDays += days;
    if (deal.status === 'WON') {
      wonCount++;
      wonValue += deal.value;
    } else {
      lostCount++;
      lostValue += deal.value;
    }
  }

  return {
    totalClosed: closedDeals.length,
    averageDaysToClose: closedDeals.length > 0 ? totalDays / closedDeals.length : 0,
    won: { count: wonCount, value: wonValue },
    lost: { count: lostCount, value: lostValue },
  };
}

async function runConversionReport(
  tenantIds: string[] | null,
  tenantId?: string | null
): Promise<unknown> {
  const stages = await prisma.pipelineStage.findMany({
    where: accessibleWhere(tenantIds, tenantId),
    orderBy: { position: 'asc' },
    select: { id: true, name: true, isWonStage: true, isLostStage: true },
  });

  const counts = await prisma.deal.groupBy({
    by: ['stageId'],
    where: accessibleWhere(tenantIds, tenantId),
    _count: { id: true },
  });

  const countByStage = new Map(counts.map((c) => [c.stageId, c._count.id]));

  const wonStage = stages.find((s) => s.isWonStage);
  const total = Array.from(countByStage.values()).reduce((a, b) => a + b, 0);
  const won = wonStage ? countByStage.get(wonStage.id) ?? 0 : 0;

  return {
    totalDeals: total,
    wonDeals: won,
    conversionRate: total > 0 ? (won / total) * 100 : 0,
    byStage: stages.map((s) => ({
      stageId: s.id,
      name: s.name,
      count: countByStage.get(s.id) ?? 0,
      isWonStage: s.isWonStage,
      isLostStage: s.isLostStage,
    })),
  };
}

async function runActivityReport(
  tenantIds: string[] | null,
  tenantId?: string | null
): Promise<unknown> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [activitiesByType, dealsCreated, dealsUpdated] = await Promise.all([
    prisma.activity.groupBy({
      by: ['type'],
      where: {
        tenantId: tenantIds ? { in: tenantIds } : undefined,
        createdAt: { gte: since },
      },
      _count: { id: true },
    }),
    prisma.deal.count({
      where: {
        ...accessibleWhere(tenantIds, tenantId),
        createdAt: { gte: since },
      },
    }),
    prisma.deal.count({
      where: {
        ...accessibleWhere(tenantIds, tenantId),
        updatedAt: { gte: since },
      },
    }),
  ]);

  return {
    periodDays: 30,
    dealsCreated,
    dealsUpdated,
    activitiesByType: activitiesByType.map((a) => ({
      type: a.type,
      count: a._count.id,
    })),
  };
}

async function runLeadSourceReport(
  tenantIds: string[] | null,
  tenantId?: string | null
): Promise<unknown> {
  const sources = await prisma.deal.groupBy({
    by: ['leadSource'],
    where: accessibleWhere(tenantIds, tenantId),
    _count: { id: true },
    _sum: { value: true },
    _avg: { value: true },
  });

  return {
    sources: sources
      .filter((s) => s.leadSource)
      .map((s) => ({
        leadSource: s.leadSource,
        dealCount: s._count.id,
        totalValue: s._sum.value ?? 0,
        avgValue: s._avg.value ?? 0,
      })),
  };
}

async function runRevenueByTenantReport(
  tenantIds: string[] | null,
  tenantId?: string | null
): Promise<unknown> {
  if (tenantId) {
    return errorResponse('tenantId not supported for revenue-by-tenant', 400);
  }

  const tenants = await prisma.tenant.findMany({
    where: tenantIds ? { id: { in: tenantIds } } : undefined,
    select: { id: true, name: true },
  });

  const won = await prisma.deal.groupBy({
    by: ['tenantId'],
    where: { status: 'WON' as DealStatus, tenantId: tenantIds ? { in: tenantIds } : undefined },
    _sum: { value: true },
    _count: { id: true },
  });

  const wonByTenant = new Map(
    won.map((w) => [w.tenantId, { revenue: w._sum.value ?? 0, deals: w._count.id }])
  );

  return {
    tenants: tenants.map((t) => ({
      tenantId: t.id,
      name: t.name,
      revenue: wonByTenant.get(t.id)?.revenue ?? 0,
      wonDeals: wonByTenant.get(t.id)?.deals ?? 0,
    })),
    totalRevenue: Array.from(wonByTenant.values()).reduce((a, b) => a + b.revenue, 0),
  };
}

/**
 * GET /api/reports
 *
 * @query type - one of funnel, forecast, velocity, conversion, activity, lead-source, revenue-by-tenant
 * @query tenantId - restrict to tenant
 * @returns Aggregated report JSON
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ data: {} });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const tenantId = searchParams.get('tenantId');

  if (tenantId && tenantIds && !tenantIds.includes(tenantId)) {
    return errorResponse('Forbidden', 403);
  }

  if (!type || !VALID_REPORT_TYPES.includes(type as ReportType)) {
    return errorResponse(
      `Invalid report type. Must be one of: ${VALID_REPORT_TYPES.join(', ')}`,
      400
    );
  }

  const reportType = type as ReportType;

  let data: unknown;
  switch (reportType) {
    case 'funnel':
      data = await runFunnelReport(tenantIds, tenantId);
      break;
    case 'forecast':
      data = await runForecastReport(tenantIds, tenantId);
      break;
    case 'velocity':
      data = await runVelocityReport(tenantIds, tenantId);
      break;
    case 'conversion':
      data = await runConversionReport(tenantIds, tenantId);
      break;
    case 'activity':
      data = await runActivityReport(tenantIds, tenantId);
      break;
    case 'lead-source':
      data = await runLeadSourceReport(tenantIds, tenantId);
      break;
    case 'revenue-by-tenant':
      data = await runRevenueByTenantReport(tenantIds, tenantId);
      break;
    default:
      return errorResponse('Invalid report type', 400);
  }

  return NextResponse.json({ type: reportType, data });
}
