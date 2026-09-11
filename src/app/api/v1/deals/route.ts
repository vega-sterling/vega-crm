// ============================================================================
// File: src/app/api/v1/deals/route.ts
// Description: Public API v1 endpoint for deals — authenticated via
//   x-api-key header (not session cookie). Supports read:deals scope.
//   Follows the exact pattern of /api/v1/companies.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/apiKeyAuth';

const VALID_STATUSES = ['OPEN', 'WON', 'LOST'] as const;

/**
 * GET /api/v1/deals
 * Returns a paginated list of deals accessible to the API key.
 * Requires scope: read:deals
 *
 * Query params:
 *   page    - page number (default 1)
 *   limit   - page size (default 50, max 100)
 *   search  - search by title
 *   status  - filter by deal status (OPEN | WON | LOST)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:deals');
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
        { error: 'Invalid status. Valid values: OPEN, WON, LOST' },
        { status: 400 }
      );
    }
    where.status = status;
  }

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        value: true,
        currency: true,
        probability: true,
        status: true,
        expectedCloseDate: true,
        actualCloseDate: true,
        createdAt: true,
        updatedAt: true,
        stage: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.deal.count({ where }),
  ]);

  return NextResponse.json({
    data: deals,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}