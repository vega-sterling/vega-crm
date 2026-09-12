// ============================================================================
// File: src/app/api/v1/companies/[id]/route.ts
// Description: Public API v1 endpoint for a single company — authenticated
//   via x-api-key header (not session cookie). Requires scope: read:companies.
//   Follows the exact pattern of /api/v1/companies.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/apiKeyAuth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/companies/[id]
 * Returns a single company accessible to the API key.
 * Requires scope: read:companies
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:companies');
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;

  // Typed for Prisma findUnique (extended where unique): id plus tenant filter
  const where: { id: string; tenantId?: string } = { id };
  if (ctx.tenantId) {
    where.tenantId = ctx.tenantId;
  } else if (!ctx.isSuperAdminKey) {
    // Non-super-admin keys with null tenantId should see nothing
    // (they were created by tenant admins, not super admins)
    // This is a safety check — the key should have a tenantId
    where.tenantId = '__none__';
  }

  const company = await prisma.company.findUnique({
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
    },
  });

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  return NextResponse.json(company);
}