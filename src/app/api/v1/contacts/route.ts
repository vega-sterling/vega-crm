// ============================================================================
// File: src/app/api/v1/contacts/route.ts
// Description: Public API v1 endpoint for contacts — authenticated via
//   x-api-key header. Requires scope: read:contacts
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/apiKeyAuth';

/**
 * GET /api/v1/contacts
 * Returns a paginated list of contacts accessible to the API key.
 * Requires scope: read:contacts
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:contacts');
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const search = searchParams.get('search')?.trim() || '';
  const companyId = searchParams.get('companyId');

  const where: Record<string, unknown> = {};
  if (ctx.tenantId) {
    where.tenantId = ctx.tenantId;
  } else if (!ctx.isSuperAdminKey) {
    where.tenantId = '__none__';
  }

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (companyId) {
    where.companyId = companyId;
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        mobile: true,
        title: true,
        department: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({
    data: contacts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}