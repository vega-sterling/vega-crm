// ============================================================================
// POST /api/auth/logout — Vega CRM
// ============================================================================
// Destroy the current iron-session cookie.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/lib/session';

/**
 * POST /api/auth/logout
 *
 * @returns Empty success response after session destruction
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  await destroySession(req);
  return NextResponse.json({ success: true });
}
