// ============================================================================
// File: src/lib/sms.ts
// Description: SMS channel helpers for Vega CRM. Loads per-tenant SMS
//              settings (sms.* keys in tenant_settings), normalizes phone
//              numbers, sends outbound messages via the Twilio REST API
//              (plain fetch, Basic auth — no SDK), and provides webhook
//              helpers (tenant resolution by 'To' number, contact matching
//              by phone).
//
//              Settings keys (managed via the existing per-tenant settings
//              API in the admin UI):
//                sms.provider             'TWILIO' | 'NONE' (default NONE)
//                sms.twilio_account_sid   plain
//                sms.twilio_auth_token    SECRET (isEncrypted)
//                sms.twilio_from_number   E.164, e.g. +15551234567
//                sms.webhook_secret       SECRET (isEncrypted)
//
//              SECURITY: auth tokens and webhook secrets are never logged
//              and never returned in API responses.
// ============================================================================

import { prisma } from "@/lib/db";

/** Prefix for all SMS-related tenant setting keys. */
export const SMS_SETTINGS_PREFIX = "sms.";

/** Individual setting keys used by the SMS channel. */
export const SMS_SETTING_KEYS = {
  provider: "sms.provider",
  accountSid: "sms.twilio_account_sid",
  authToken: "sms.twilio_auth_token",
  fromNumber: "sms.twilio_from_number",
  webhookSecret: "sms.webhook_secret",
} as const;

/** Fully-typed snapshot of a tenant's SMS settings. */
export interface SmsSettings {
  /** 'TWILIO' or 'NONE' (missing key defaults to NONE). */
  provider: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  webhookSecret: string;
}

// ============================================================================
// Settings loader
// ============================================================================

/**
 * Loads a tenant's SMS settings (all sms.* keys) in a single query.
 * Missing keys come back as empty strings; provider defaults to 'NONE'.
 */
export async function loadSmsSettings(tenantId: string): Promise<SmsSettings> {
  const rows = await prisma.tenantSetting.findMany({
    where: {
      tenantId,
      key: { startsWith: SMS_SETTINGS_PREFIX },
    },
    select: { key: true, value: true },
  });

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value || "";
  }

  return {
    provider: map[SMS_SETTING_KEYS.provider] || "NONE",
    accountSid: map[SMS_SETTING_KEYS.accountSid] || "",
    authToken: map[SMS_SETTING_KEYS.authToken] || "",
    fromNumber: map[SMS_SETTING_KEYS.fromNumber] || "",
    webhookSecret: map[SMS_SETTING_KEYS.webhookSecret] || "",
  };
}

/**
 * True when the tenant has Twilio sending fully configured
 * (provider TWILIO + account SID + auth token + from number).
 */
export function isTwilioConfigured(settings: SmsSettings): boolean {
  return (
    settings.provider === "TWILIO" &&
    Boolean(settings.accountSid) &&
    Boolean(settings.authToken) &&
    Boolean(settings.fromNumber)
  );
}

// ============================================================================
// Phone helpers
// ============================================================================

/** Strips everything except digits from a phone number string. */
export function normalizePhone(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

/**
 * Compares two phone numbers for equality. Exact digit-string match wins;
 * otherwise numbers with at least 10 digits each are compared by their
 * last 10 digits (so +15551234567 matches 5551234567 and 1+ (555) 123-4567).
 */
export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 10 && nb.length >= 10) {
    return na.slice(-10) === nb.slice(-10);
  }
  return false;
}

/**
 * Finds the contact (within a tenant) whose phone matches the given number
 * (normalized, last-10-digits tolerant). Returns the contact id or null.
 */
export async function matchContactByPhone(
  tenantId: string,
  phone: string
): Promise<string | null> {
  const contacts = await prisma.contact.findMany({
    where: {
      tenantId,
      phone: { not: null },
    },
    select: { id: true, phone: true },
  });

  for (const contact of contacts) {
    if (contact.phone && phonesMatch(contact.phone, phone)) {
      return contact.id;
    }
  }
  return null;
}

// ============================================================================
// Twilio sending (plain fetch — no SDK)
// ============================================================================

/** Options for a single Twilio Messages API call. */
export interface TwilioSendOptions {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}

/** Result of a Twilio Messages API call. */
export interface TwilioSendResult {
  ok: boolean;
  /** Message SID on success (HTTP 201). */
  sid?: string;
  /** Human-readable error message on failure. Never contains credentials. */
  error?: string;
}

/**
 * Sends one SMS via the Twilio REST API:
 *   POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json
 * with Basic auth (sid:token) and a form-encoded body {To, From, Body}.
 * A 201 response carries the new message SID. The call is aborted after
 * 15 seconds. Network/timeout errors are converted to { ok: false } —
 * callers decide how to persist the failure.
 */
export async function sendViaTwilio(
  opts: TwilioSendOptions
): Promise<TwilioSendResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    opts.accountSid
  )}/Messages.json`;
  const basicAuth = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: opts.to,
        From: opts.from,
        Body: opts.body,
      }).toString(),
      signal: AbortSignal.timeout(15000),
    });

    let json: { sid?: string; message?: string } | null = null;
    try {
      json = (await res.json()) as { sid?: string; message?: string };
    } catch {
      // Non-JSON error body — fall through to the generic message below.
    }

    if (res.status === 201 && json?.sid) {
      return { ok: true, sid: json.sid };
    }

    const message =
      json?.message || `Twilio API error (HTTP ${res.status})`;
    return { ok: false, error: message };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach Twilio API";
    return { ok: false, error: message };
  }
}

// ============================================================================
// Webhook helpers
// ============================================================================

/**
 * Resolves which tenant owns an inbound SMS by matching the webhook's 'To'
 * number (the tenant's Twilio from-number) against every tenant's
 * sms.twilio_from_number setting. Exact match is preferred; a last-10-digit
 * match is the fallback. Returns the tenant id or null when no tenant owns
 * the number.
 */
export async function findTenantIdByFromNumber(to: string): Promise<string | null> {
  const rows = await prisma.tenantSetting.findMany({
    where: { key: SMS_SETTING_KEYS.fromNumber },
    select: { tenantId: true, value: true },
  });

  const configured = rows.filter((r) => (r.value || "").trim() !== "");

  const exact = configured.find(
    (r) => (r.value || "").trim() === (to || "").trim()
  );
  if (exact) return exact.tenantId;

  const loose = configured.find((r) => phonesMatch(r.value || "", to));
  return loose ? loose.tenantId : null;
}