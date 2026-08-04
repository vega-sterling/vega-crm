// ============================================================================
// GET /api/email/track/open — Vega CRM email open tracking pixel
// ============================================================================
// Public endpoint. Returns a 1x1 transparent PNG and records an EmailOpen for
// the supplied emailMessageId. Always returns the pixel, even when the ID is
// missing or invalid, to avoid leaking existence information.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const TRANSPARENT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6KgAAAABJRU5ErkJggg==";

/**
 * GET /api/email/track/open?id=EMAIL_MESSAGE_ID
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const emailMessageId = searchParams.get("id");

  if (emailMessageId) {
    try {
      await prisma.emailOpen.create({
        data: {
          emailMessageId,
          openedAt: new Date(),
          ipAddress: req.headers.get("x-forwarded-for") || req.headers.get('x-forwarded-for') || 'unknown' || null,
          userAgent: req.headers.get("user-agent") || null,
        },
      });
    } catch {
      // Swallow errors (e.g. invalid emailMessageId) so we never leak info.
    }
  }

  const pixel = Buffer.from(TRANSPARENT_PNG_BASE64, "base64");

  return new NextResponse(pixel, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
