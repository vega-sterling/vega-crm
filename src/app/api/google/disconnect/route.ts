// ============================================================================
// POST /api/google/disconnect — Vega CRM
// ============================================================================
// Clears all stored Google OAuth tokens from the authenticated user's record.
// Does NOT revoke the token server-side; it simply removes our stored copy.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, errorResponse } from '@/lib/session';

/**
 * POST /api/google/disconnect
 *
 * @returns { disconnected: boolean }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.userId! },
    select: { id: true, googleRefreshToken: true },
  });

  if (!user?.googleRefreshToken) {
    return errorResponse('No Google account connected', 400);
  }

  await prisma.user.update({
    where: { id: session.userId! },
    data: {
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
      googleEmail: null,
      googleScope: null,
    },
  });

  return NextResponse.json({ disconnected: true });
}
