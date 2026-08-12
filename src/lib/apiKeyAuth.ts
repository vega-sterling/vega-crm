// ============================================================================
// File: src/lib/apiKeyAuth.ts
// Description: API key authentication helper for external integrations.
//              Validates x-api-key header against stored hashes, checks scopes,
//              and returns the authenticated key context.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './db';
import { verifyApiKey, hasScope } from './apiKeys';

export interface ApiKeyContext {
  keyId: string;
  tenantId: string | null;
  scopes: string[];
  isSuperAdminKey: boolean; // true if tenantId is null (all tenants)
}

/**
 * Authenticates a request using the x-api-key header.
 * Returns the API key context if valid, or a 401 error response.
 *
 * Usage in API routes:
 *   const ctx = await authenticateApiKey(req, 'read:companies');
 *   if (ctx instanceof NextResponse) return ctx;
 */
export async function authenticateApiKey(
  req: NextRequest,
  requiredScope?: string
): Promise<ApiKeyContext | NextResponse> {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing x-api-key header' },
      { status: 401 }
    );
  }

  // Quick format check
  if (!apiKey.startsWith('vga_') || apiKey.length < 10) {
    return NextResponse.json(
      { error: 'Invalid API key format' },
      { status: 401 }
    );
  }

  // Look up by prefix to narrow the search (optimization)
  const prefix = apiKey.substring(0, 12);

  const candidates = await prisma.apiKey.findMany({
    where: {
      keyPrefix: prefix,
      isActive: true,
    },
    select: {
      id: true,
      keyHash: true,
      scopes: true,
      tenantId: true,
      expiresAt: true,
    },
  });

  // Verify against hash
  let matchedKey: (typeof candidates)[0] | null = null;
  for (const candidate of candidates) {
    if (verifyApiKey(apiKey, candidate.keyHash)) {
      matchedKey = candidate;
      break;
    }
  }

  if (!matchedKey) {
    return NextResponse.json(
      { error: 'Invalid or revoked API key' },
      { status: 401 }
    );
  }

  // Check expiry
  if (matchedKey.expiresAt && new Date(matchedKey.expiresAt) <= new Date()) {
    return NextResponse.json(
      { error: 'API key has expired' },
      { status: 401 }
    );
  }

  // Check scope
  if (requiredScope && !hasScope(matchedKey.scopes, requiredScope)) {
    return NextResponse.json(
      { error: "Insufficient scope. Required: " + requiredScope },
      { status: 403 }
    );
  }

  // Update last used (fire-and-forget, don't block the request)
  const ip = req.headers.get('x-forwarded-for') || null;
  prisma.apiKey.update({
    where: { id: matchedKey.id },
    data: { lastUsedAt: new Date(), lastUsedIp: ip },
  }).catch(() => {});

  return {
    keyId: matchedKey.id,
    tenantId: matchedKey.tenantId,
    scopes: matchedKey.scopes,
    isSuperAdminKey: matchedKey.tenantId === null,
  };
}
