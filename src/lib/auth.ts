// ============================================================================
// File: src/lib/auth.ts
// Description: Authentication helpers for Vega CRM.
//              Includes bcrypt password hashing/verification, TOTP 2FA via
//              otplib (secret generation, token verification, backup codes),
//              rate-limited login verification, and iron-session management.
// ============================================================================

import { compare, hash } from "bcryptjs";
import { authenticator } from "otplib";
import { randomBytes, timingSafeEqual } from "crypto";
import type { IronSession } from "iron-session";
import type { User } from "@prisma/client";

import { prisma } from "./db";
import { defaultSession, type SessionData } from "./rbac";

/** Number of bcrypt rounds used when hashing passwords. */
const BCRYPT_ROUNDS = 12;

/** Maximum failed password attempts before an account is locked. */
const MAX_FAILED_ATTEMPTS = 5;

/** Lockout duration in minutes after exceeding max failed attempts. */
const LOCKOUT_MINUTES = 30;

/** Length of each one-time TOTP backup code. */
const BACKUP_CODE_LENGTH = 10;

/** Number of backup codes generated per user. */
const BACKUP_CODE_COUNT = 8;

/**
 * Custom error thrown when authentication or authorization fails.
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Custom error thrown when an account is temporarily locked due to failed
 * login attempts.
 */
export class AccountLockedError extends AuthError {
  public lockedUntil: Date;

  constructor(lockedUntil: Date) {
    super("Account is temporarily locked due to too many failed login attempts.");
    this.name = "AccountLockedError";
    this.lockedUntil = lockedUntil;
  }
}

// ============================================================================
// Password helpers
// ============================================================================

/**
 * Hashes a plain-text password using bcrypt.
 *
 * @param plainPassword - The password to hash.
 * @returns The bcrypt hash string.
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, BCRYPT_ROUNDS);
}

/**
 * Verifies a plain-text password against a bcrypt hash.
 *
 * @param plainPassword - The password supplied by the user.
 * @param passwordHash - The stored bcrypt hash.
 * @returns `true` if the password matches, otherwise `false`.
 */
export async function verifyPassword(
  plainPassword: string,
  passwordHash: string
): Promise<boolean> {
  return compare(plainPassword, passwordHash);
}

// ============================================================================
// TOTP helpers
// ============================================================================

/**
 * Generates a new base32-encoded TOTP secret suitable for provisioning an
 * authenticator app.
 *
 * @returns A base32 TOTP secret.
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Verifies a TOTP code against a user's secret.
 *
 * @param secret - The base32-encoded TOTP secret.
 * @param code - The 6-digit code provided by the user.
 * @returns `true` if the code is valid, otherwise `false`.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  return authenticator.check(code, secret);
}

/**
 * Generates a batch of random backup codes for TOTP recovery.
 *
 * @param count - Number of codes to generate. Defaults to {@link BACKUP_CODE_COUNT}.
 * @returns An array of uppercase alphanumeric backup codes.
 */
export function generateTotpBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(BACKUP_CODE_LENGTH)
      .toString("base64url")
      .slice(0, BACKUP_CODE_LENGTH)
      .toUpperCase()
  );
}

/**
 * Checks a supplied code against a list of backup codes and returns the
 * remaining unused codes if a match is found.
 *
 * Uses a constant-time comparison to mitigate timing attacks.
 *
 * @param backupCodes - The user's stored backup codes.
 * @param code - The code to validate.
 * @returns An object indicating whether the code was valid and the updated list
 *          of remaining codes.
 */
export function verifyBackupCode(
  backupCodes: string[],
  code: string
): { valid: boolean; remainingCodes: string[] } {
  const normalizedCode = code.trim().toUpperCase();
  let matchIndex = -1;

  for (let i = 0; i < backupCodes.length; i += 1) {
    const stored = backupCodes[i].trim().toUpperCase();
    if (stored.length !== normalizedCode.length) {
      continue;
    }
    try {
      const a = Buffer.from(stored, "utf8");
      const b = Buffer.from(normalizedCode, "utf8");
      if (timingSafeEqual(a, b)) {
        matchIndex = i;
        break;
      }
    } catch {
      // Length mismatch already handled; ignore and continue.
      continue;
    }
  }

  if (matchIndex === -1) {
    return { valid: false, remainingCodes: backupCodes };
  }

  const remainingCodes = backupCodes.filter((_, index) => index !== matchIndex);
  return { valid: true, remainingCodes };
}

// ============================================================================
// Rate limiting helpers
// ============================================================================

/**
 * Records a failed login attempt and locks the account if the threshold is
 * exceeded.
 *
 * Lockout rule: 5 failed attempts within a 15-minute window results in a
 * 30-minute lockout. The Prisma `updatedAt` field is used as a proxy for the
 * last failed attempt timestamp because the schema does not track it
 * separately.
 *
 * @param user - The user whose login attempt failed.
 * @returns The updated user record.
 */
export async function recordFailedLoginAttempt(user: User): Promise<User> {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const attemptsInWindow =
    user.failedLoginAttempts > 0 && user.updatedAt >= fifteenMinutesAgo
      ? user.failedLoginAttempts + 1
      : 1;

  let lockedUntil: Date | null = user.lockedUntil ?? null;

  if (attemptsInWindow >= MAX_FAILED_ATTEMPTS) {
    lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
  }

  return prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: attemptsInWindow,
      lockedUntil,
    },
  });
}

/**
 * Clears failed login attempts and any active lockout after a successful
 * authentication.
 *
 * @param userId - The id of the authenticated user.
 */
export async function clearLoginLockout(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
}

/**
 * Throws if the user account is currently locked.
 *
 * @param user - The user to check.
 */
export function ensureAccountNotLocked(user: User): void {
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AccountLockedError(user.lockedUntil);
  }
}

// ============================================================================
// Session helpers
// ============================================================================

/**
 * Populates an iron-session with authenticated user data and persists it.
 *
 * @param session - The iron-session instance from the request/response.
 * @param user - The authenticated user record.
 */
export async function createSession(
  session: IronSession<SessionData>,
  user: User
): Promise<void> {
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.globalRole = user.globalRole as "SUPER_ADMIN" | "ADMIN" | "USER";
  session.totpVerified = !user.totpEnabled;
  session.pendingUserId = undefined;
  await session.save();
}

/**
 * Marks a session as having completed the TOTP step-up and persists it.
 *
 * @param session - The iron-session instance.
 */
export async function markTotpVerified(session: IronSession<SessionData>): Promise<void> {
  session.totpVerified = true;
  await session.save();
}

/**
 * Destroys the current session, clearing all stored data and removing the
 * session cookie.
 *
 * @param session - The iron-session instance.
 */
export async function destroySession(session: IronSession<SessionData>): Promise<void> {
  session.userId = undefined;
  session.email = undefined;
  session.name = undefined;
  session.globalRole = undefined;
  session.totpVerified = false;
  session.pendingUserId = undefined;
  session.destroy();
  await session.save();
}

// ============================================================================
// Login flow
// ============================================================================

/**
 * Result of a password-only login attempt.
 */
export type LoginResult =
  | { totpRequired: false; user: User }
  | { totpRequired: true; userId: string };

/**
 * Verifies email and password, enforces rate limiting, and either creates a
 * full session or returns a TOTP step-up requirement.
 *
 * @param email - The user's email address.
 * @param plainPassword - The user's password.
 * @param session - The iron-session instance.
 * @param ipAddress - Optional client IP for tracking.
 * @returns A {@link LoginResult} indicating whether TOTP verification is
 *          required or the user is fully authenticated.
 */
export async function login(
  email: string,
  plainPassword: string,
  session: IronSession<SessionData>,
  ipAddress?: string
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !user.isActive) {
    // Still perform a dummy hash compare to mitigate timing attacks.
    await hashPassword(plainPassword);
    throw new AuthError("Invalid credentials");
  }

  ensureAccountNotLocked(user);

  const passwordValid = await verifyPassword(plainPassword, user.passwordHash);

  if (!passwordValid) {
    await recordFailedLoginAttempt(user);
    throw new AuthError("Invalid credentials");
  }

  // Successful password verification: reset lockout state.
  await clearLoginLockout(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress ?? null,
    },
  });

  if (user.totpEnabled) {
    return { totpRequired: true, userId: user.id };
  }

  await createSession(session, user);
  return { totpRequired: false, user };
}

/**
 * Verifies a TOTP code or backup code and, if valid, completes the session.
 *
 * @param userId - The id of the user returned from the password step.
 * @param code - The TOTP code or backup code provided by the user.
 * @param session - The iron-session instance.
 * @returns The authenticated user record.
 */
export async function verifyTotpAndCreateSession(
  userId: string,
  code: string,
  session: IronSession<SessionData>
): Promise<User> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.isActive || !user.totpEnabled) {
    throw new AuthError("Invalid credentials");
  }

  ensureAccountNotLocked(user);

  const normalizedCode = code.trim();
  let totpValid = false;
  let updatedBackupCodes: string[] | undefined;

  if (user.totpSecret && verifyTotpCode(user.totpSecret, normalizedCode)) {
    totpValid = true;
  } else {
    const backupResult = verifyBackupCode(user.totpBackupCodes, normalizedCode);
    if (backupResult.valid) {
      totpValid = true;
      updatedBackupCodes = backupResult.remainingCodes;
    }
  }

  if (!totpValid) {
    await recordFailedLoginAttempt(user);
    throw new AuthError("Invalid credentials");
  }

  if (updatedBackupCodes) {
    await prisma.user.update({
      where: { id: user.id },
      data: { totpBackupCodes: updatedBackupCodes },
    });
  }

  await createSession(session, user);
  return user;
}
