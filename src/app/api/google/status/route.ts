// ============================================================================
// GET /api/google/status — Vega CRM
// ============================================================================
// Returns whether the current user has connected a Google account and the
// associated email address if available.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';

/**
 * GET /api/google/status
 *
 * @returns { connected: boolean, email: string | null }
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.userId! },
    select: { googleEmail: true, googleRefreshToken: true },
  });

  const connected = Boolean(user?.googleRefreshToken && user?.googleEmail);

  return NextResponse.json({
    connected,
    email: user?.googleEmail ?? null,
  });
}
