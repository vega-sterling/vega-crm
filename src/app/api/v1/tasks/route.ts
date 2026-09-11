// ============================================================================
// File: src/app/api/v1/tasks/route.ts
// Description: Public API v1 endpoint for tasks — authenticated via
//   x-api-key header (not session cookie). Supports read:tasks scope.
//   Follows the exact pattern of /api/v1/companies.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/apiKeyAuth';

const VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

/**
 * GET /api/v1/tasks
 * Returns a paginated list of tasks accessible to the API key.
 * Requires scope: read:tasks
 *
 * Query params:
 *   page    - page number (default 1)
 *   limit   - page size (default 50, max 100)
 *   search  - search by title
 *   status  - filter by task status (PENDING | IN_PROGRESS | COMPLETED | CANCELLED)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:tasks');
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const search = searchParams.get('search')?.trim() || '';
  const status = searchParams.get('status')?.trim().toUpperCase() || '';

  const where: Record<string, unknown> = {};
  if (ctx.tenantId) {
    where.tenantId = ctx.tenantId;
  } else if (!ctx.isSuperAdminKey) {
    // Non-super-admin keys with null tenantId should see nothing
    // (they were created by tenant admins, not super admins)
    // This is a safety check — the key should have a tenantId
    where.tenantId = '__none__';
  }

  if (search) {
    where.title = { contains: search, mode: 'insensitive' };
  }

  if (status) {
    if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return NextResponse.json(
        { error: 'Invalid status. Valid values: PENDING, IN_PROGRESS, COMPLETED, CANCELLED' },
        { status: 400 }
      );
    }
    where.status = status;
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        contact: { select: { id: true, firstName: true, lastName: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.task.count({ where }),
  ]);

  return NextResponse.json({
    data: tasks,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}