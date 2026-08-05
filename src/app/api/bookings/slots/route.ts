// ============================================================================
// GET, POST /api/bookings/slots — Vega CRM
// ============================================================================
// Manage availability slot configurations for the authenticated user.
// Slots define recurring weekday windows during which prospects may book.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const BookingSlotCreateSchema = z.object({
  tenantId: z.cuid(),
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(timeRegex, 'Start time must be HH:MM'),
  endTime: z.string().regex(timeRegex, 'End time must be HH:MM'),
  durationMinutes: z.number().int().min(5).default(30),
  isActive: z.boolean().optional().default(true),
});

/**
 * GET /api/bookings/slots
 *
 * @query tenantId - restrict to a single tenant
 * @query userId - optional filter by host user
 * @query page - page number
 * @query limit - page size
 * @returns Paginated booking slot configs
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ data: [], pagination: { page: 1, limit: 20, total: 0 } });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const tenantId = searchParams.get('tenantId');
  const userId = searchParams.get('userId');

  const where: Record<string, unknown> = {
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  if (tenantId) {
    if (tenantIds && !tenantIds.includes(tenantId)) return errorResponse('Forbidden', 403);
    where.tenantId = tenantId;
  }
  if (userId) where.userId = userId;

  const [data, total] = await Promise.all([
    prisma.bookingSlot.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.bookingSlot.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/bookings/slots
 *
 * @param req - { tenantId, weekday, startTime, endTime, durationMinutes?, isActive? }
 * @returns Created BookingSlot record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, BookingSlotCreateSchema);
  if (body instanceof NextResponse) return body;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && !tenantIds.includes(body.tenantId)) {
    return errorResponse('Forbidden', 403);
  }

  if (body.endTime <= body.startTime) {
    return errorResponse('End time must be after start time', 400);
  }

  const slot = await prisma.bookingSlot.create({
    data: {
      tenantId: body.tenantId,
      userId: session.userId!,
      dayOfWeek: body.weekday,
      startTime: body.startTime,
      endTime: body.endTime,
      durationMin: body.durationMinutes,
      isActive: body.isActive,
    },
  });

  return NextResponse.json(slot, { status: 201 });
}
