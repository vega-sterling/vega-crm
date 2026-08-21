// ============================================================================
// GET /api/dashboard/insights — Vega CRM Sales Intelligence
// ============================================================================
// Returns computed sales metrics for the dashboard command center:
//   - Win rate (won deals / (won + lost))
//   - Average deal size (won deals)
//   - Average sales cycle length (won deals: createdAt → actualCloseDate)
//   - Deals won/lost counts (last 30 days)
//   - 7-day activity trend (daily activity counts by type)
//   - Stale deals (open deals not updated in 14+ days)
//   - Pipeline velocity: total open pipeline value + weighted forecast
//   - Top performers: deals by assignee (won count + value)
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds } from '@/lib/session';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);

  const baseWhere = {
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  // ── Date ranges ──
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // ── Run all queries in parallel ──
  const [
    wonDeals,
    lostDeals,
    wonDeals30d,
    lostDeals30d,
    staleDeals,
    openDeals,
    activityTrend,
    topPerformersRaw,
  ] = await Promise.all([
    // Won deals (all time) — for avg deal size, avg sales cycle
    prisma.deal.findMany({
      where: { ...baseWhere, status: 'WON' },
      select: {
        id: true, value: true, currency: true,
        createdAt: true, actualCloseDate: true,
        assignedToId: true,
      },
    }),

    // Lost deals (all time)
    prisma.deal.count({
      where: { ...baseWhere, status: 'LOST' },
    }),

    // Won deals in last 30 days
    prisma.deal.count({
      where: {
        ...baseWhere,
        status: 'WON',
        actualCloseDate: { gte: thirtyDaysAgo },
      },
    }),

    // Lost deals in last 30 days
    prisma.deal.count({
      where: {
        ...baseWhere,
        status: 'LOST',
        actualCloseDate: { gte: thirtyDaysAgo },
      },
    }),

    // Stale deals: open, not updated in 14+ days
    prisma.deal.findMany({
      where: {
        ...baseWhere,
        status: 'OPEN',
        updatedAt: { lt: fourteenDaysAgo },
      },
      select: {
        id: true, title: true, value: true, currency: true,
        probability: true, updatedAt: true, expectedCloseDate: true,
        stage: { select: { id: true, name: true, color: true } },
        company: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'asc' },
      take: 10,
    }),

    // Open deals — for pipeline value + weighted forecast
    prisma.deal.findMany({
      where: { ...baseWhere, status: 'OPEN' },
      select: {
        id: true, value: true, currency: true, probability: true,
      },
    }),

    // 7-day activity trend — group by day + type
    prisma.activity.findMany({
      where: {
        ...baseWhere,
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        id: true,
        type: true,
        createdAt: true,
      },
    }),

    // Top performers: won deals grouped by assignee
    prisma.deal.findMany({
      where: { ...baseWhere, status: 'WON' },
      select: {
        id: true, value: true, currency: true,
        assignee: { select: { id: true, name: true } },
      },
    }),
  ]);

  // ── Compute win rate ──
  const totalClosed = wonDeals.length + lostDeals;
  const winRate = totalClosed > 0 ? Math.round((wonDeals.length / totalClosed) * 100) : 0;

  // ── Compute average deal size (won deals) ──
  const wonValues = wonDeals.map((d) => d.value || 0);
  const avgDealSize = wonValues.length > 0
    ? wonValues.reduce((s, v) => s + v, 0) / wonValues.length
    : 0;

  // ── Compute average sales cycle (createdAt → actualCloseDate, in days) ──
  const cycleLengths = wonDeals
    .filter((d) => d.actualCloseDate)
    .map((d) => {
      const diff = new Date(d.actualCloseDate!).getTime() - new Date(d.createdAt).getTime();
      return diff / (1000 * 60 * 60 * 24); // days
    });
  const avgSalesCycle = cycleLengths.length > 0
    ? Math.round(cycleLengths.reduce((s, v) => s + v, 0) / cycleLengths.length)
    : 0;

  // ── Pipeline value + weighted forecast ──
  const pipelineValue = openDeals.reduce((s, d) => s + (d.value || 0), 0);
  const weightedForecast = openDeals.reduce(
    (s, d) => s + (d.value || 0) * (d.probability || 0) / 100,
    0
  );

  // ── 7-day activity trend — build daily buckets ──
  const days: { date: string; label: string; total: number; byType: Record<string, number> }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({
      date: dateStr,
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      total: 0,
      byType: {},
    });
  }
  const dayMap = new Map(days.map((d) => [d.date, d]));
  for (const act of activityTrend) {
    const dateStr = new Date(act.createdAt).toISOString().slice(0, 10);
    const bucket = dayMap.get(dateStr);
    if (bucket) {
      bucket.total++;
      bucket.byType[act.type] = (bucket.byType[act.type] || 0) + 1;
    }
  }

  // ── Top performers: group by assignee ──
  const performerMap = new Map<string, { name: string; wonCount: number; totalValue: number }>();
  for (const d of topPerformersRaw) {
    const key = d.assignee?.id || 'unknown';
    const name = d.assignee?.name || 'Unknown';
    const existing = performerMap.get(key) || { name, wonCount: 0, totalValue: 0 };
    existing.wonCount++;
    existing.totalValue += d.value || 0;
    performerMap.set(key, existing);
  }
  const topPerformers = Array.from(performerMap.values())
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 5);

  return NextResponse.json({
    salesMetrics: {
      winRate,
      avgDealSize: Math.round(avgDealSize),
      avgSalesCycle, // days
      dealsWon30d: wonDeals30d,
      dealsLost30d: lostDeals30d,
      totalWon: wonDeals.length,
      totalLost: lostDeals,
    },
    pipeline: {
      totalValue: Math.round(pipelineValue),
      weightedForecast: Math.round(weightedForecast),
      openDealCount: openDeals.length,
    },
    activityTrend: days,
    staleDeals,
    topPerformers,
  });
}