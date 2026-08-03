// ============================================================================
// Google OAuth + API helpers — Vega CRM
// ============================================================================
// Provides an authenticated OAuth2 client and refreshes the stored access token
// when expired. Safe helpers to build Gmail / Calendar service clients.
// ============================================================================

import { google } from 'googleapis';
import { OAuth2Client } from 'googleapis-common';
import { prisma } from '@/lib/db';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
];

/**
 * Build a Google OAuth2 client using the configured client ID/secret.
 */
export function getOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/google/auth`.replace(
      /\/$/,
      ''
    );
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri) as unknown as OAuth2Client;
}

/**
 * Get a fresh access token for a user, refreshing if necessary and persisting
 * the new token back to the user record. Returns the OAuth2 client configured
 * with the user's credentials.
 */
export async function getGoogleClientForUser(userId: string): Promise<OAuth2Client | null> {
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

  const oauth2Client = getOAuth2Client();
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
        : new Date(Date.now() + 3600 * 1000);

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
