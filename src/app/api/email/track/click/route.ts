// ============================================================================
// GET /api/email/track/click — Vega CRM email click tracking redirect
// ============================================================================
// Public endpoint. Records an EmailClick for the supplied emailMessageId and
// target URL, then 302-redirects the browser to the real URL. If the target URL
// is missing or invalid, redirect to a safe fallback to avoid leaking info.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/email/track/click?id=EMAIL_MESSAGE_ID&url=ENCODED_URL
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const emailMessageId = searchParams.get("id");
  const encodedUrl = searchParams.get("url");

  let targetUrl = encodedUrl ? decodeURIComponent(encodedUrl) : "";

  // Basic safety: reject non-http(s) schemes to avoid open-redirect abuse.
  if (
    targetUrl &&
    !targetUrl.startsWith("http://") &&
    !targetUrl.startsWith("https://")
  ) {
    targetUrl = "";
  }

  if (emailMessageId && targetUrl) {
    try {
      await prisma.emailClick.create({
        data: {
          emailMessageId,
          url: targetUrl,
          clickedAt: new Date(),
          ipAddress: req.headers.get("x-forwarded-for") || req.headers.get('x-forwarded-for') || 'unknown' || null,
          userAgent: req.headers.get("user-agent") || null,
        },
      });
    } catch {
      // Swallow errors so we still redirect even if logging fails.
    }
  }

  return NextResponse.redirect(targetUrl || "/", 302);
}
