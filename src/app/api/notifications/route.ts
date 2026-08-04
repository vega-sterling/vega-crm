// ============================================================================
// File: src/app/api/notifications/route.ts
// Description: GET /api/notifications — list notifications for current user
//              PATCH /api/notifications — mark notifications as read
//              POST /api/notifications/check — scan for overdue tasks etc.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, errorResponse } from '@/lib/session';
import { generateOverdueTaskNotifications } from '@/lib/notifications';

/**
 * GET /api/notifications
 * Query params: ?unread=true to filter only unread, ?limit=20
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const unreadOnly = req.nextUrl.searchParams.get('unread') === 'true';
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);

  const notifications = await prisma.notification.findMany({
    where: {
      userId: session.userId!,
      ...(unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: session.userId!, isRead: false },
  });

  return NextResponse.json({ data: notifications, unreadCount });
}

/**
 * PATCH /api/notifications
 * Body: { id?: string } to mark one as read, or {} to mark all as read
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const { id } = body;

  if (id) {
    await prisma.notification.updateMany({
      where: { id, userId: session.userId! },
      data: { isRead: true },
    });
  } else {
    // Mark all as read
    await prisma.notification.updateMany({
      where: { userId: session.userId!, isRead: false },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
}

/**
 * POST /api/notifications/check
 * Triggers overdue task scan and other automated notification generators.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const overdueCount = await generateOverdueTaskNotifications();

  return NextResponse.json({ generated: overdueCount });
}