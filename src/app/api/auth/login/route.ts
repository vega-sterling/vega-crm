// ============================================================================
// File: src/app/api/auth/login/route.ts
// Description: POST /api/auth/login — Authenticate user by email+password.
//              If 2FA is enabled, returns a 2FA challenge with pendingUserId.
//              Otherwise creates a full session.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { compareSync } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, errorResponse } from "@/lib/session";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/auth/login
 * @param req - JSON body: { email, password }
 * @returns { user } on success, { requires2FA: true } if 2FA needed
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid email or password", 422, parsed.error.issues);
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !user.isActive || !compareSync(password, user.passwordHash)) {
    return errorResponse("Invalid email or password", 401);
  }

  // Check account lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return errorResponse("Account locked. Try again in 30 minutes.", 423);
  }

  const session = await getSession(req);

  // If 2FA is enabled, stash pending user ID and require TOTP
  if (user.totpEnabled) {
    session.pendingUserId = user.id;
    await session.save();
    return NextResponse.json({ requires2FA: true });
  }

  // Full login — set session fields
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.globalRole = user.globalRole as "SUPER_ADMIN" | "ADMIN" | "USER";
  session.totpVerified = true;
  session.pendingUserId = undefined;
  await session.save();

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
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