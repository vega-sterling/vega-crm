// ============================================================================
// File: src/app/api/notifications/check/route.ts
// Description: POST /api/notifications/check — runs the smart reminder
//              scan (overdue tasks, due-soon tasks, past-close-date deals,
//              stale deals) and returns per-type generated counts. Fixes
//              the 404 the NotificationBell hit when only the root
//              /api/notifications POST handler existed.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { runNotificationScan } from '@/lib/notifications';

/**
 * POST /api/notifications/check
 * Triggers the full notification scan and returns generated counts per type.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const generated = await runNotificationScan();

  return NextResponse.json({ ok: true, generated });
}