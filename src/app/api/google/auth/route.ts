// ============================================================================
// GET, POST /api/google/auth — Vega CRM
// ============================================================================
// GET: Build Google OAuth consent URL and redirect the browser.
//      Accepts ?tenantId=xxx to use per-tenant OAuth credentials.
// POST: Exchange authorization code for tokens and persist them on the user.
//       Accepts tenantId in the body to use per-tenant OAuth credentials.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { google } from 'googleapis';
import { getOAuth2Client, GOOGLE_SCOPES } from '@/lib/google';
import { prisma } from '@/lib/db';
import { requireSession, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const GoogleAuthCodeSchema = z.object({
  code: z.string().min(1),
  tenantId: z.string().optional(),
});

/**
 * GET /api/google/auth?tenantId=xxx
 *
 * Redirects the user to Google's OAuth consent screen with the required
 * Gmail + Calendar scopes. Uses a stateless flow; the redirect URI must be
 * registered in the Google Cloud Console.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantId = req.nextUrl.searchParams.get('tenantId') || undefined;

  try {
    const oauth2Client = await getOAuth2Client(tenantId);
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GOOGLE_SCOPES,
      prompt: 'consent',
      include_granted_scopes: true,
    });
    return NextResponse.redirect(url);
  } catch (err) {
    console.error('Google auth URL error:', err);
    return errorResponse('Google OAuth not configured', 500);
  }
}

/**
 * POST /api/google/auth
 *
 * Exchanges the temporary authorization code returned by Google for long-lived
 * tokens, then stores the access token, refresh token, expiry, and connected
 * email address on the authenticated user record.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, GoogleAuthCodeSchema);
  if (body instanceof NextResponse) return body;

  try {
    const oauth2Client = await getOAuth2Client(body.tenantId);
    const { tokens } = await (oauth2Client as any).getToken(body.code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return errorResponse('Google did not return required tokens', 400);
    }

    // Confirm the email address associated with the connected account.
    (oauth2Client as any).setCredentials(tokens);
    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const { data: userInfo } = await oauth2.userinfo.get();
    const googleEmail = userInfo.email;

    if (!googleEmail) {
      return errorResponse('Could not retrieve Google account email', 400);
    }

    const expiryDate = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    await prisma.user.update({
      where: { id: session.userId! },
      data: {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token,
        googleTokenExpiry: expiryDate,
        googleEmail,
        googleScope: GOOGLE_SCOPES.join(' '),
      },
    });

    return NextResponse.json({
      connected: true,
      email: googleEmail,
      scopes: GOOGLE_SCOPES,
    });
  } catch (err) {
    console.error('Google token exchange error:', err);
    return errorResponse('Failed to connect Google account', 500);
  }
}