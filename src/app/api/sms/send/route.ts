// ============================================================================
// POST /api/sms/send — Vega CRM
// ============================================================================
// Sends an outbound SMS via Twilio. Session-authenticated; tenant access is
// verified via getAccessibleTenantIds (same pattern as /api/email/send).
// Flow:
//   1. Validate body (tenantId, to, body, optional contactId)
//   2. Verify tenant access; verify contactId belongs to that tenant
//   3. Load sms.* settings; require provider TWILIO + full Twilio creds
//   4. Create SmsMessage with status PENDING (persisted intent to send)
//   5. Call Twilio Messages API; update to SENT + externalId on success,
//      update to FAILED and return 502 with Twilio's message on failure
//   6. Audit-log the creation (non-blocking try/catch)
//
// SECURITY: the Twilio auth token is loaded server-side only and is never
// included in any API response.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, getAccessibleTenantIds, errorResponse } from "@/lib/session";
import { validateBody } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { loadSmsSettings, isTwilioConfigured, sendViaTwilio } from "@/lib/sms";

/** Body schema for the send endpoint. */
const smsSendSchema = z.object({
  tenantId: z.cuid(),
  to: z.string().trim().min(7, "Destination phone number is required"),
  body: z.string().min(1, "Message body is required").max(1600, "Message body is too long"),
  contactId: z.cuid().optional(),
});

/**
 * POST /api/sms/send
 * Body: { tenantId, to, body, contactId? }
 * Returns { data: SmsMessage } with the post-send status applied.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const input = await validateBody(req, smsSendSchema);
  if (input instanceof NextResponse) return input;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && !tenantIds.includes(input.tenantId)) {
    return errorResponse("Access denied for this tenant", 403);
  }

  // Verify the optional contact belongs to the target tenant.
  if (input.contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { tenantId: true },
    });
    if (!contact || contact.tenantId !== input.tenantId) {
      return errorResponse("Contact not found", 404);
    }
  }

  // Load SMS settings and refuse to send when Twilio isn't fully configured.
  const settings = await loadSmsSettings(input.tenantId);
  if (!isTwilioConfigured(settings)) {
    return errorResponse("SMS is not configured for this tenant", 400);
  }

  // Persist the intent to send BEFORE calling Twilio so nothing is lost.
  const record = await prisma.smsMessage.create({
    data: {
      tenantId: input.tenantId,
      contactId: input.contactId ?? null,
      userId: session.userId ?? null,
      direction: "OUTBOUND",
      body: input.body,
      status: "PENDING",
      fromNumber: settings.fromNumber,
      toNumber: input.to,
    },
  });

  // Audit-log the creation (non-blocking — must never break the send).
  try {
    await logAudit({
      userId: session.userId!,
      action: "create",
      entity: "sms_message",
      entityId: record.id,
      changes: {
        tenantId: record.tenantId,
        direction: record.direction,
        toNumber: record.toNumber,
        contactId: record.contactId,
      },
      req,
    });
  } catch {
    // already swallowed inside logAudit; kept for clarity
  }

  // Call Twilio.
  const result = await sendViaTwilio({
    accountSid: settings.accountSid,
    authToken: settings.authToken,
    from: settings.fromNumber,
    to: input.to,
    body: input.body,
  });

  if (result.ok && result.sid) {
    const updated = await prisma.smsMessage.update({
      where: { id: record.id },
      data: {
        status: "SENT",
        externalId: result.sid,
      },
    });
    return NextResponse.json({ data: updated });
  }

  // Twilio failed — persist FAILED and surface the provider's message.
  await prisma.smsMessage.update({
    where: { id: record.id },
    data: { status: "FAILED" },
  });
  return errorResponse(result.error || "Twilio send failed", 502, [
    { message: result.error || "Twilio send failed", path: ["body"] },
  ]);
}