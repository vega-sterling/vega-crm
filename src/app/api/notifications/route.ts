// ============================================================================
// File: src/app/api/notifications/route.ts
// Description: GET /api/notifications — list notifications for current user
//              PATCH /api/notifications — mark notifications as read
//              POST /api/notifications — backwards-compat trigger for the
//              full smart reminder scan (the canonical endpoint is now
//              POST /api/notifications/check).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { runNotificationScan } from '@/lib/notifications';

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
 * POST /api/notifications
 * Backwards-compat trigger for the smart reminder scan. Now runs the full
 * scan (all generators) and returns ok plus generated as the total across
 * all types. New callers should use POST /api/notifications/check.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const generated = await runNotificationScan();

  const total = Object.values(generated).reduce((sum, n) => sum + n, 0);

  return NextResponse.json({ ok: true, generated: total });
}