// ============================================================================
// Google OAuth + API helpers — Vega CRM
// ============================================================================
// Provides an authenticated OAuth2 client and refreshes the stored access token
// when expired. Now supports per-tenant OAuth credentials stored in the
// TenantSetting table, falling back to environment variables.
// ============================================================================

import { google } from 'googleapis';
import { OAuth2Client } from 'googleapis-common';
import { prisma } from '@/lib/db';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
];

// Setting keys used in the TenantSetting table
export const SETTING_KEYS = {
  OAUTH_CLIENT_ID: 'google_oauth_client_id',
  OAUTH_CLIENT_SECRET: 'google_oauth_client_secret',
  OAUTH_REDIRECT_URI: 'google_oauth_redirect_uri',
} as const;

/**
 * Fetch a single tenant setting by key.
 */
async function getTenantSetting(tenantId: string, key: string): Promise<string | null> {
  const setting = await prisma.tenantSetting.findUnique({
    where: {
      tenantId_key: { tenantId, key },
    },
  });
  return setting?.value || null;
}

/**
 * Fetch per-tenant OAuth credentials from the TenantSetting table.
 * Returns null if not configured for this tenant.
 */
export async function getTenantOAuthConfig(
  tenantId: string
): Promise<{ clientId: string; clientSecret: string; redirectUri: string } | null> {
  const [clientId, clientSecret, redirectUri] = await Promise.all([
    getTenantSetting(tenantId, SETTING_KEYS.OAUTH_CLIENT_ID),
    getTenantSetting(tenantId, SETTING_KEYS.OAUTH_CLIENT_SECRET),
    getTenantSetting(tenantId, SETTING_KEYS.OAUTH_REDIRECT_URI),
  ]);

  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri || `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/google/auth`.replace(
      /\/$/,
      ''
    ),
  };
}

/**
 * Build a Google OAuth2 client.
 * If tenantId is provided, tries per-tenant credentials first, then falls back to env.
 */
export async function getOAuth2Client(tenantId?: string): Promise<OAuth2Client> {
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  let redirectUri: string | undefined;

  // Try per-tenant config first
  if (tenantId) {
    const tenantConfig = await getTenantOAuthConfig(tenantId);
    if (tenantConfig) {
      clientId = tenantConfig.clientId;
      clientSecret = tenantConfig.clientSecret;
      redirectUri = tenantConfig.redirectUri;
    }
  }

  // Fall back to environment variables
  if (!clientId || !clientSecret || !redirectUri) {
    clientId = process.env.GOOGLE_CLIENT_ID;
    clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/google/auth`.replace(/\/$/, '');
  }

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri) as unknown as OAuth2Client;
}

/**
 * Synchronous version for the auth route (uses env fallback only).
 * Per-tenant config requires async DB lookup — use getOAuth2Client for that.
 */
export function getOAuth2ClientSync(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/google/auth`.replace(/\/$/, '');
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri) as unknown as OAuth2Client;
}

/**
 * Get a fresh access token for a user, refreshing if necessary and persisting
 * the new token back to the user record. Returns the OAuth2 client configured
 * with the user's credentials.
 */
export async function getGoogleClientForUser(
  userId: string,
  tenantId?: string
): Promise<OAuth2Client | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
      googleEmail: true,
    },
  });

  if (!user || !user.googleRefreshToken || !user.googleEmail) return null;

  const oauth2Client = await getOAuth2Client(tenantId);
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken ?? undefined,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiry?.getTime(),
  });

  const now = Date.now();
  const isExpired =
    !user.googleAccessToken ||
    !user.googleTokenExpiry ||
    user.googleTokenExpiry.getTime() - 60000 <= now;

  if (isExpired) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      const newAccessToken = credentials.access_token ?? null;
      const newExpiry = credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(now + 3600 * 1000);

      await prisma.user.update({
        where: { id: userId },
        data: {
          googleAccessToken: newAccessToken,
          googleTokenExpiry: newExpiry,
        },
      });

      oauth2Client.setCredentials({
        access_token: newAccessToken ?? undefined,
        refresh_token: user.googleRefreshToken,
        expiry_date: newExpiry.getTime(),
      });
    } catch (err) {
      console.error('Failed to refresh Google access token:', err);
      return null;
    }
  }

  return oauth2Client;
}

/**
 * Helper to determine whether a Google connection is fully usable.
 */
export function hasGoogleConnection(user: {
  googleRefreshToken?: string | null;
  googleEmail?: string | null;
}): boolean {
  return Boolean(user.googleRefreshToken && user.googleEmail);
}