// ============================================================================
// GET /api/admin/audit-logs — Vega CRM Audit Log Viewer API
// ============================================================================
// Admin-only endpoint for listing and filtering audit log entries.
// Supports pagination, filtering by entity, action, user, and date range.
// Super admins see all entries; tenant admins see entries for users in
// their accessible tenants.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin, getAccessibleTenantIds, errorResponse } from '@/lib/session';

/**
 * GET /api/admin/audit-logs
 *
 * @query page    - page number (default 1)
 * @query limit   - page size (default 50, max 200)
 * @query entity  - filter by entity type (company, contact, activity, task, user, tenant, deal, workflow)
 * @query action  - filter by action (create, update, delete)
 * @query userId  - filter by specific user
 * @query search  - full-text search on entity + entityId
 * @query from    - ISO date string — entries from this date
 * @query to      - ISO date string — entries up to this date
 * @returns Paginated audit log entries with user info
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const entity = searchParams.get('entity');
  const action = searchParams.get('action');
  const userId = searchParams.get('userId');
  const search = searchParams.get('search')?.trim() || '';
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  // Build the where clause
  const where: Record<string, unknown> = {};

  if (entity) where.entity = entity;
  if (action) where.action = action;
  if (userId) where.userId = userId;

  if (search) {
    where.OR = [
      { entity: { contains: search, mode: 'insensitive' } },
      { entityId: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Date range filtering
  if (from || to) {
    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      // "to" is inclusive — add 1 day to include the full end date
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      dateFilter.lt = toDate;
    }
    where.createdAt = dateFilter;
  }

  // Tenant admin restriction: only see audit logs from users in their tenants
  // Super admins (tenantIds === null) see everything
  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds !== null) {
    // Find user IDs that belong to the admin's accessible tenants
    const tenantUsers = await prisma.userTenant.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const allowedUserIds = tenantUsers.map((ut) => ut.userId);
    where.userId = { in: allowedUserIds };
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            globalRole: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Get summary stats for the dashboard cards
  const stats = await prisma.auditLog.groupBy({
    by: ['action'],
    _count: true,
    orderBy: { _count: { action: 'desc' } },
  });

  const entityStats = await prisma.auditLog.groupBy({
    by: ['entity'],
    _count: true,
    orderBy: { _count: { entity: 'desc' } },
  });

  return NextResponse.json({
    data,
    stats: {
      byAction: stats,
      byEntity: entityStats,
    },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * GET /api/admin/audit-logs/export — export filtered logs as CSV
 * Triggered by ?export=csv query param
 */