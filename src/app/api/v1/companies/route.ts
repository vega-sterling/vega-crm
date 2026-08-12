// ============================================================================
// File: src/app/api/v1/companies/route.ts
// Description: Public API v1 endpoint for companies — authenticated via
//   x-api-key header (not session cookie). Supports read:companies scope.
//   This is the first REST API endpoint for external integrations.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/apiKeyAuth';

/**
 * GET /api/v1/companies
 * Returns a paginated list of companies accessible to the API key.
 * Requires scope: read:companies
 *
 * Query params:
 *   page    - page number (default 1)
 *   limit   - page size (default 50, max 100)
 *   search  - search by name
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:companies');
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const search = searchParams.get('search')?.trim() || '';

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
    where.name = { contains: search, mode: 'insensitive' };
  }

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        industry: true,
        website: true,
        phone: true,
        email: true,
        address: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        tenant: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.company.count({ where }),
  ]);

  return NextResponse.json({
    data: companies,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}