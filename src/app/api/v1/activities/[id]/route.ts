// ============================================================================
// File: src/app/api/v1/activities/[id]/route.ts
// Description: Public API v1 endpoint for a single activity — authenticated
//   via x-api-key header (not session cookie). Requires scope: read:activities.
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
 * GET /api/v1/activities/[id]
 * Returns a single activity accessible to the API key.
 * Requires scope: read:activities
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:activities');
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

  const activity = await prisma.activity.findUnique({
    where,
    select: {
      id: true,
      type: true,
      subject: true,
      description: true,
      callDirection: true,
      callDuration: true,
      callOutcome: true,
      emailFrom: true,
      emailTo: true,
      emailCc: true,
      emailBody: true,
      source: true,
      externalId: true,
      scheduledAt: true,
      completedAt: true,
      isPinned: true,
      pinnedAt: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      deal: { select: { id: true, title: true } },
    },
  });

  if (!activity) {
    return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
  }

  return NextResponse.json(activity);
}