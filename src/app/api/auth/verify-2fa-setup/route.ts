// ============================================================================
// POST /api/auth/verify-2fa-setup — Vega CRM
// ============================================================================
// Verify the first TOTP code generated from a newly created secret and
// permanently enable 2FA for the authenticated user.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, errorResponse, getSession } from '@/lib/session';

const VerifySetupSchema = z.object({
  code: z.string().min(6).max(6),
});

/**
 * POST /api/auth/verify-2fa-setup
 *
 * @param req - JSON body with 6-digit TOTP code
 * @returns Confirmation that 2FA is now enabled
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await requireSession(req);
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => ({}));
  const parsed = VerifySetupSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('Invalid verification code', 422, parsed.error.issues);
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId! },
  });
  if (!dbUser || !dbUser.totpSecret) {
    return errorResponse('No pending 2FA setup', 400);
  }

  const isValid = authenticator.verify({
    token: parsed.data.code,
    secret: dbUser.totpSecret,
  });
  if (!isValid) {
    return errorResponse('Invalid verification code', 401);
  }

  await prisma.user.update({
    where: { id: user.userId! },
    data: { totpEnabled: true },
  });

  const session = await getSession(req);
  if (session.userId) {
    session.totpVerified = true;
    await session.save();
  }

  return NextResponse.json({ totpEnabled: true });
}
