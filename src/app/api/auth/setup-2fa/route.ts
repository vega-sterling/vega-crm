// ============================================================================
// POST /api/auth/setup-2fa — Vega CRM
// ============================================================================
// Generate a new TOTP secret and provisioning URI (QR code) for the
// authenticated user. Does not enable 2FA until setup is verified.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';

/**
 * POST /api/auth/setup-2fa
 *
 * @param req - Authenticated request
 * @returns TOTP secret, QR code data URL, and provisioning URI
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await requireSession(req);
  if (user instanceof NextResponse) return user;

  const secret = authenticator.generateSecret();
  const issuer = process.env.OTP_ISSUER ?? 'Vega CRM';
  const otpauth = authenticator.keyuri(user.email!, issuer, secret);
  const qrCode = await QRCode.toDataURL(otpauth);

  await prisma.user.update({
    where: { id: user.userId! },
    data: { totpSecret: secret },
  });

  return NextResponse.json({
    secret,
    otpauth,
    qrCode,
  });
}
