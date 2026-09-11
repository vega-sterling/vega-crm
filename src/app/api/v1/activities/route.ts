// ============================================================================
// File: src/app/api/v1/activities/route.ts
// Description: Public API v1 endpoint for activities — authenticated via
//   x-api-key header (not session cookie). Supports read:activities scope.
//   Follows the exact pattern of /api/v1/companies.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/apiKeyAuth';

const VALID_TYPES = ['CALL', 'EMAIL', 'NOTE', 'TASK', 'MEETING'] as const;

/**
 * GET /api/v1/activities
 * Returns a paginated list of activities accessible to the API key,
 * newest first. Requires scope: read:activities
 *
 * Query params:
 *   page    - page number (default 1)
 *   limit   - page size (default 50, max 100)
 *   search  - search by subject
 *   type    - filter by activity type (CALL | EMAIL | NOTE | TASK | MEETING)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:activities');
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const search = searchParams.get('search')?.trim() || '';
  const type = searchParams.get('type')?.trim().toUpperCase() || '';

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
    where.subject = { contains: search, mode: 'insensitive' };
  }

  if (type) {
    if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
      return NextResponse.json(
        { error: 'Invalid type. Valid values: CALL, EMAIL, NOTE, TASK, MEETING' },
        { status: 400 }
      );
    }
    where.type = type;
  }

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      select: {
        id: true,
        type: true,
        subject: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        contact: { select: { id: true, firstName: true, lastName: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.activity.count({ where }),
  ]);

  return NextResponse.json({
    data: activities,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}