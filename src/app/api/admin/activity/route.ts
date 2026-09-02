// ============================================================================
// GET /api/admin/activity — Vega CRM User Activity Reports API
// ============================================================================
// Admin-only endpoint computing per-user productivity metrics from the
// EXISTING audit_logs table (no new tables, no schema changes). Answers
// "who did what, how much, when" over a rolling 7/30/90-day window.
// Super admins see all users; tenant admins see users in their accessible
// tenants (same scoping pattern as /api/admin/audit-logs).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin, getAccessibleTenantIds, errorResponse } from '@/lib/session';

/** Allowed report windows in days. */
const ALLOWED_WINDOWS = [7, 30, 90];

/** Per-user aggregation accumulator. */
interface UserAgg {
  totalActions: number;
  creates: number;
  updates: number;
  deletes: number;
  imports: number;
  exports: number;
  lastActiveAt: Date | null; // latest action within the window
  activeDays: Set<string>; // distinct UTC date keys with any action
  byDay: Map<string, number>; // UTC date key -> count
  entities: Map<string, number>; // entity type -> count
}

/**
 * GET /api/admin/activity
 *
 * @query days     - report window: 7, 30 or 90 days (default 30)
 * @query userId   - optional: restrict to a single user
 * @query sort     - 'actions' (default) or 'lastActive'
 * @query page     - page number (default 1)
 * @query pageSize - page size (default 20, max 100)
 * @returns Per-user activity metrics + totals + pagination
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(req);
  if (session instanceof NextResponse) return session;

  try {
    const { searchParams } = new URL(req.url);
    const daysRaw = parseInt(searchParams.get('days') ?? '30', 10);
    const days = ALLOWED_WINDOWS.includes(daysRaw) ? daysRaw : 30;
    const userId = searchParams.get('userId')?.trim() || null;
    const sort = searchParams.get('sort') === 'lastActive' ? 'lastActive' : 'actions';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)));

    // Window start — midnight of (today - days), UTC
    const now = new Date();
    const windowStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)
    );

    // Tenant scoping (same pattern as audit-logs route):
    // super admin (tenantIds === null) sees all users; tenant admin sees
    // only users belonging to their accessible tenants.
    const tenantIds = await getAccessibleTenantIds(session);
    let visibleUserIds: string[] | null = null;
    if (tenantIds !== null) {
      const tenantUsers = await prisma.userTenant.findMany({
        where: { tenantId: { in: tenantIds } },
        select: { userId: true },
        distinct: ['userId'],
      });
      visibleUserIds = tenantUsers.map((ut) => ut.userId);
    }

    // Optional single-user filter (intersected with tenant visibility)
    if (userId) {
      visibleUserIds =
        visibleUserIds === null
          ? [userId]
          : visibleUserIds.includes(userId)
            ? [userId]
            : [];
    }

    const userWhere: Record<string, unknown> = {};
    if (visibleUserIds !== null) userWhere.id = { in: visibleUserIds };

    const users = await prisma.user.findMany({
      where: userWhere,
      select: { id: true, name: true, email: true, globalRole: true },
    });
    const userIds = users.map((u) => u.id);

    // All audit entries for visible users within the window
    const windowLogs = userIds.length
      ? await prisma.auditLog.findMany({
          where: { userId: { in: userIds }, createdAt: { gte: windowStart } },
          select: { userId: true, action: true, entity: true, createdAt: true },
        })
      : [];

    // Latest activity EVER per user — used for users with no actions in the
    // window so "Last Active" never shows a blank when history exists.
    const overallLast = userIds.length
      ? await prisma.auditLog.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds } },
          _max: { createdAt: true },
        })
      : [];
    const overallLastMap = new Map(overallLast.map((g) => [g.userId, g._max.createdAt]));

    // Aggregate in JS — volumes are small at current scale
    const aggMap = new Map<string, UserAgg>();
    for (const log of windowLogs) {
      let a = aggMap.get(log.userId);
      if (!a) {
        a = {
          totalActions: 0,
          creates: 0,
          updates: 0,
          deletes: 0,
          imports: 0,
          exports: 0,
          lastActiveAt: null,
          activeDays: new Set(),
          byDay: new Map(),
          entities: new Map(),
        };
        aggMap.set(log.userId, a);
      }
      a.totalActions++;
      if (log.action === 'create') a.creates++;
      else if (log.action === 'update') a.updates++;
      else if (log.action === 'delete') a.deletes++;
      else if (log.action === 'import') a.imports++;
      else if (log.action === 'export') a.exports++;

      if (!a.lastActiveAt || log.createdAt > a.lastActiveAt) a.lastActiveAt = log.createdAt;

      const dayKey = log.createdAt.toISOString().slice(0, 10);
      a.activeDays.add(dayKey);
      a.byDay.set(dayKey, (a.byDay.get(dayKey) || 0) + 1);
      a.entities.set(log.entity, (a.entities.get(log.entity) || 0) + 1);
    }

    // Bar-chart date keys — last 14 days (clamped to the window length)
    const barCount = Math.min(days, 14);
    const barDays: string[] = [];
    for (let i = barCount - 1; i >= 0; i--) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)
      );
      barDays.push(d.toISOString().slice(0, 10));
    }

    // Build per-user metrics rows
    const rows = users.map((u) => {
      const a = aggMap.get(u.id);
      const lastActiveAt = a?.lastActiveAt ?? overallLastMap.get(u.id) ?? null;
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        globalRole: u.globalRole,
        totalActions: a?.totalActions ?? 0,
        creates: a?.creates ?? 0,
        updates: a?.updates ?? 0,
        deletes: a?.deletes ?? 0,
        imports: a?.imports ?? 0,
        exports: a?.exports ?? 0,
        lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
        activeDays: a?.activeDays.size ?? 0,
        actionsByDay: barDays.map((date) => ({ date, count: a?.byDay.get(date) || 0 })),
        topEntities: a
          ? Array.from(a.entities.entries())
              .sort((x, y) => y[1] - x[1])
              .slice(0, 3)
              .map(([entity, count]) => ({ entity, count }))
          : [],
      };
    });

    // Sort: total actions desc (default) or last active desc (nulls last)
    rows.sort((x, y) => {
      if (sort === 'lastActive') {
        const xt = x.lastActiveAt ? new Date(x.lastActiveAt).getTime() : 0;
        const yt = y.lastActiveAt ? new Date(y.lastActiveAt).getTime() : 0;
        if (yt !== xt) return yt - xt;
        return y.totalActions - x.totalActions;
      }
      if (y.totalActions !== x.totalActions) return y.totalActions - x.totalActions;
      const xt = x.lastActiveAt ? new Date(x.lastActiveAt).getTime() : 0;
      const yt = y.lastActiveAt ? new Date(y.lastActiveAt).getTime() : 0;
      return yt - xt;
    });

    // Totals across ALL visible users (before pagination)
    const totals = {
      users: rows.length,
      activeUsers: rows.filter((r) => r.totalActions > 0).length,
      totalActions: rows.reduce((sum, r) => sum + r.totalActions, 0),
    };

    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    return NextResponse.json({
      data: {
        users: pageRows,
        totals,
      },
      pagination: {
        page,
        pageSize,
        total: rows.length,
        pages: Math.ceil(rows.length / pageSize),
      },
    });
  } catch (err) {
    console.error('[api/admin/activity] Failed to compute activity metrics:', err);
    return errorResponse('Failed to load user activity', 500);
  }
}