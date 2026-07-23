// ============================================================================
// GET, PUT, DELETE /api/activities/[id] — Vega CRM
// ============================================================================
// Read, update, or delete a single activity within an accessible tenant.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ActivityType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const ActivityUpdateSchema = z.object({
  type: z.enum(['CALL', 'EMAIL', 'NOTE', 'TASK', 'MEETING']).optional(),
  subject: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  scheduledAt: z.coerce.date().optional().nullable(),
  completedAt: z.coerce.date().optional().nullable(),
  callDirection: z.string().optional().nullable(),
  callDuration: z.number().int().optional().nullable(),
  callOutcome: z.string().optional().nullable(),
  emailFrom: z.string().email().optional().nullable().or(z.literal('')),
  emailTo: z.string().email().optional().nullable().or(z.literal('')),
  emailCc: z.string().optional().nullable(),
  emailBody: z.string().optional().nullable(),
  externalId: z.string().optional().nullable(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAllowedActivity(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true, tenantId: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      user: { select: { id: true, name: true } },
    },
  });
  if (!activity) return null;
  if (tenantIds && !tenantIds.includes(activity.tenantId)) return null;
  return activity;
}

/**
 * GET /api/activities/[id]
 *
 * @returns Single activity details
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const activity = await getAllowedActivity(id, session);
  if (!activity) return errorResponse('Activity not found', 404);

  return NextResponse.json(activity);
}

/**
 * PUT /api/activities/[id]
 *
 * @param req - JSON body with updated activity fields
 * @returns Updated activity record
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const activity = await getAllowedActivity(id, session);
  if (!activity) return errorResponse('Activity not found', 404);

  const body = await validateBody(req, ActivityUpdateSchema);
  if (body instanceof NextResponse) return body;

  const cleaned = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, value === '' ? null : value])
  ) as Partial<typeof body>;

  const updated = await prisma.activity.update({
    where: { id },
    data: {
      ...cleaned,
      type: cleaned.type as ActivityType | undefined,
    },
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/activities/[id]
 *
 * Hard-deletes an activity. (Audit logs are separate.)
 *
 * @returns Success confirmation
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const activity = await getAllowedActivity(id, session);
  if (!activity) return errorResponse('Activity not found', 404);

  await prisma.activity.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
