// ============================================================================
// File: src/app/api/auth/verify-2fa/route.ts
// Description: POST /api/auth/verify-2fa — Complete login by verifying a TOTP
//              code against the pending 2FA session.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { authenticator } from "otplib";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, errorResponse } from "@/lib/session";

const Verify2FASchema = z.object({
  code: z.string().min(6).max(6),
});

/**
 * POST /api/auth/verify-2fa
 * @param req - JSON body: { code: "123456" }
 * @returns Active session after successful TOTP verification
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const parsed = Verify2FASchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid verification code", 422, parsed.error.issues);
  }

  const session = await getSession(req);
  if (!session.pendingUserId) {
    return errorResponse("No pending 2FA challenge", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.pendingUserId },
  });
  if (!user || !user.totpEnabled || !user.totpSecret) {
    session.destroy();
    await session.save();
    return errorResponse("2FA challenge invalid", 401);
  }

  const isValid = authenticator.verify({
    token: parsed.data.code,
    secret: user.totpSecret,
  });
  if (!isValid) {
    return errorResponse("Invalid verification code", 401);
  }

  // Complete the login
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.globalRole = user.globalRole as "SUPER_ADMIN" | "ADMIN" | "USER";
  session.totpVerified = true;
  session.pendingUserId = undefined;
  await session.save();

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      globalRole: user.globalRole,
    },
  });
}