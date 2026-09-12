// ============================================================================
// File: src/app/api/v1/deals/[id]/route.ts
// Description: Public API v1 endpoint for a single deal — authenticated
//   via x-api-key header (not session cookie). Requires scope: read:deals.
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
 * GET /api/v1/deals/[id]
 * Returns a single deal accessible to the API key.
 * Requires scope: read:deals
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:deals');
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

  const deal = await prisma.deal.findUnique({
    where,
    select: {
      id: true,
      title: true,
      description: true,
      value: true,
      currency: true,
      probability: true,
      status: true,
      lossReason: true,
      leadSource: true,
      expectedCloseDate: true,
      actualCloseDate: true,
      createdAt: true,
      updatedAt: true,
      stage: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  return NextResponse.json(deal);
}