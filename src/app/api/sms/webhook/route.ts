// ============================================================================
// POST /api/sms/webhook — Vega CRM (PUBLIC — no session auth)
// ============================================================================
// Twilio inbound-SMS webhook (messaging "when a message comes in"). This
// route authenticates via a per-tenant secret passed as ?secret= — the same
// secret stored in the tenant's sms.webhook_secret setting. There is NO
// Twilio signature validation (proxy URL complexity); the secret param is
// the auth. The route must be public because Twilio has no Vega session.
//
// Flow:
//   1. Parse the form-encoded body via await req.text() + URLSearchParams
//   2. Resolve the tenant: take the 'To' param, find the tenant whose
//      sms.twilio_from_number matches (exact or last-10-digits). No match → 404
//   3. Validate ?secret= against sms.webhook_secret. Missing/mismatch → 403
//   4. Idempotency: if MessageSid is present and an SmsMessage with the same
//      externalId exists, return 200 without duplicating (Twilio retries)
//   5. Create an INBOUND SmsMessage; match the contact by phone within the
//      tenant (normalized, last-10-digits)
//   6. Respond 200 with content-type text/xml and an empty <Response/> TwiML
//
// SECURITY: never logs or returns the webhook secret or auth token values.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadSmsSettings, findTenantIdByFromNumber, matchContactByPhone } from "@/lib/sms";

/** Empty TwiML response Twilio expects from a messaging webhook. */
const TWIML_RESPONSE = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Builds a 200 TwiML response. */
function twimlResponse(): NextResponse {
  return new NextResponse(TWIML_RESPONSE, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

/** Builds a plain 4xx response with a JSON error body. */
function reject(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/sms/webhook?secret=...
 * Body: form-encoded Twilio message payload (From, To, Body, MessageSid, SmsStatus...)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Parse the form-encoded body.
  const text = await req.text();
  const params = new URLSearchParams(text);

  const to = params.get("To") || "";
  const from = params.get("From") || "";
  const body = params.get("Body") || "";
  const messageSid = params.get("MessageSid") || params.get("SmsSid") || "";
  const smsStatus = params.get("SmsStatus") || "";

  if (!to) return reject("Missing 'To' parameter", 400);
  if (!from) return reject("Missing 'From' parameter", 400);

  // 2. Resolve the tenant that owns this number.
  const tenantId = await findTenantIdByFromNumber(to);
  if (!tenantId) return reject("No tenant is configured for this number", 404);

  // 3. Validate the secret param.
  const settings = await loadSmsSettings(tenantId);
  const providedSecret = req.nextUrl.searchParams.get("secret") || "";
  if (!settings.webhookSecret || providedSecret !== settings.webhookSecret) {
    return reject("Invalid webhook secret", 403);
  }

  // 4. Idempotency — Twilio retries webhooks. A message SID we've already
  //    stored must not be duplicated.
  if (messageSid) {
    const existing = await prisma.smsMessage.findFirst({
      where: { tenantId, externalId: messageSid },
      select: { id: true },
    });
    if (existing) return twimlResponse();
  }

  // 5. Match the sender to a contact within the tenant.
  const contactId = await matchContactByPhone(tenantId, from);

  // 6. Persist the inbound message.
  //    Status: use Twilio's SmsStatus when present, default DELIVERED
  //    (the message text itself reached us, which is what the inbox shows).
  await prisma.smsMessage.create({
    data: {
      tenantId,
      contactId,
      userId: null,
      direction: "INBOUND",
      body,
      status: smsStatus || "DELIVERED",
      externalId: messageSid || null,
      fromNumber: from,
      toNumber: to,
    },
  });

  return twimlResponse();
}