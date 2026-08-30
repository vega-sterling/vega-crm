// ============================================================================
// File: src/app/api/admin/tenants/[id]/settings/test-email/route.ts
// Description: POST /api/admin/tenants/[id]/settings/test-email
//              Sends a one-off test email using the tenant's outbound_email.*
//              settings. Resolves the configured provider (SMTP /
//              GOOGLE_WORKSPACE / MICROSOFT_365) and NEVER falls back to a
//              different provider or from-address than the tenant's config.
//              Requires SUPER_ADMIN access. The recipient address is used for
//              this request only and is never stored.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { requireSession, errorResponse } from "@/lib/session";
import { requireSuperAdminGuard } from "@/lib/rbac";

/** Max duration for any external call (token endpoints, Graph/Gmail, SMTP). */
const TIMEOUT_MS = 20000;

const BodySchema = z.object({ to: z.email() });

/** Thrown when a required setting key is missing / invalid — maps to HTTP 400. */
class MissingConfigError extends Error {}

interface TestSendResult {
  provider: string;
  from: string;
  messageId?: string;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

async function loadOutboundSettings(tenantId: string): Promise<Record<string, string>> {
  const rows = await prisma.tenantSetting.findMany({
    where: { tenantId, key: { startsWith: "outbound_email." } },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value || "";
  return map;
}

/** POST an OAuth token endpoint (form-encoded) and return the access token. */
async function oauthTokenRequest(url: string, params: Record<string, string>): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const desc = String(data.error_description || data.error || `HTTP ${res.status}`);
    throw new Error(String(desc).split("\r\n")[0].slice(0, 300));
  }
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new Error("Token endpoint returned no access_token");
  }
  return data.access_token;
}

// ── SMTP ────────────────────────────────────────────────────────────────────

async function sendViaSmtp(
  s: Record<string, string>,
  from: string,
  fromName: string,
  to: string,
  subject: string,
  text: string
): Promise<TestSendResult> {
  const host = s["outbound_email.smtp_host"];
  if (!host) throw new MissingConfigError("Missing setting key outbound_email.smtp_host");

  const port = Number(s["outbound_email.smtp_port"] || "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new MissingConfigError("Setting outbound_email.smtp_port must be a number between 1 and 65535");
  }

  const encryption = (s["outbound_email.smtp_encryption"] || "STARTTLS").toUpperCase();
  if (!["STARTTLS", "SSL", "NONE"].includes(encryption)) {
    throw new MissingConfigError("Setting outbound_email.smtp_encryption must be STARTTLS, SSL, or NONE");
  }

  const username = s["outbound_email.smtp_username"] || "";
  const password = s["outbound_email.smtp_password"] || "";

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: encryption === "SSL",
    requireTLS: encryption === "STARTTLS",
    ...(username ? { auth: { user: username, pass: password } } : {}),
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });

  try {
    const info = await transporter.sendMail({
      from: fromName ? `"${fromName.replace(/"/g, "")}" <${from}>` : from,
      to,
      subject,
      text,
    });
    return { provider: "SMTP", from, messageId: info.messageId || undefined };
  } catch (e: unknown) {
    const err = e as { response?: string; code?: string; message?: string };
    const detail = err.response || err.message || String(e);
    throw new Error(`SMTP send failed (${host}:${port}): ${detail}`);
  } finally {
    transporter.close();
  }
}

// ── GOOGLE_WORKSPACE (Gmail API) ────────────────────────────────────────────

async function sendViaGoogle(
  s: Record<string, string>,
  from: string,
  fromName: string,
  to: string,
  subject: string,
  text: string
): Promise<TestSendResult> {
  const clientId = s["outbound_email.google_client_id"];
  if (!clientId) throw new MissingConfigError("Missing setting key outbound_email.google_client_id");
  const clientSecret = s["outbound_email.google_client_secret"];
  if (!clientSecret) throw new MissingConfigError("Missing setting key outbound_email.google_client_secret");
  const refreshToken = s["outbound_email.google_refresh_token"];
  if (!refreshToken) throw new MissingConfigError("Missing setting key outbound_email.google_refresh_token");

  const accessToken = await oauthTokenRequest("https://oauth2.googleapis.com/token", {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  }).catch((e: unknown) => {
    throw new Error(`Google auth failed: ${e instanceof Error ? e.message : String(e)}`);
  });

  const mime = [
    `To: ${to}`,
    `From: ${fromName ? `${fromName.replace(/"/g, "")} <${from}>` : from}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text,
  ].join("\r\n");

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(from)}/messages/send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(`Gmail send failed (HTTP ${res.status}): ${data.error?.message || "send request rejected"}`);
  }
  return { provider: "GOOGLE_WORKSPACE", from, messageId: data.id || undefined };
}

// ── MICROSOFT_365 (Graph sendMail) ───────────────────────────────────────────

async function m365AcquireToken(s: Record<string, string>): Promise<string> {
  const tenantId = s["outbound_email.m365_tenant_id"];
  const clientId = s["outbound_email.m365_client_id"];
  const clientSecret = s["outbound_email.m365_client_secret"];
  const username = s["outbound_email.m365_username"];
  const password = s["outbound_email.m365_password"];

  const errors: string[] = [];

  // 1) Client credentials flow (confidential app)
  if (tenantId && clientId && clientSecret) {
    try {
      return await oauthTokenRequest(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        { grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: "https://graph.microsoft.com/.default" }
      );
    } catch (e: unknown) {
      errors.push(`client credentials grant: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    const missing = [
      !tenantId && "outbound_email.m365_tenant_id",
      !clientId && "outbound_email.m365_client_id",
      !clientSecret && "outbound_email.m365_client_secret",
    ].filter(Boolean);
    errors.push(`client credentials grant not configured (missing: ${missing.join(", ")})`);
  }

  // 2) ROPC password grant fallback (public client with username/password)
  if (username && password && clientId) {
    const authority = tenantId || "organizations";
    try {
      return await oauthTokenRequest(
        `https://login.microsoftonline.com/${authority}/oauth2/v2.0/token`,
        {
          grant_type: "password",
          client_id: clientId,
          username,
          password,
          scope: "https://graph.microsoft.com/.default",
          ...(clientSecret ? { client_secret: clientSecret } : {}),
        }
      );
    } catch (e: unknown) {
      errors.push(`ROPC password grant: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    const missing = [
      !username && "outbound_email.m365_username",
      !password && "outbound_email.m365_password",
      !clientId && "outbound_email.m365_client_id",
    ].filter(Boolean);
    errors.push(`ROPC password grant not configured (missing: ${missing.join(", ")})`);
  }

  throw new Error(`M365 auth failed — ${errors.join("; ")}`);
}

async function sendViaM365(
  s: Record<string, string>,
  from: string,
  fromName: string,
  to: string,
  subject: string,
  text: string
): Promise<TestSendResult> {
  const accessToken = await m365AcquireToken(s);

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "Text", content: text },
          from: { emailAddress: { address: from, name: fromName || undefined } },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Graph sendMail failed (HTTP ${res.status}): ${data.error?.message || "request rejected"}`);
  }
  return { provider: "MICROSOFT_365", from, messageId: res.headers.get("client-request-id") || undefined };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  try {
    requireSuperAdminGuard(session);
  } catch {
    return errorResponse("Super admin access required", 403);
  }

  const { id: tenantId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "A valid recipient email address is required" }, { status: 400 });
  }
  const to = parsed.data.to;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return errorResponse("Tenant not found", 404);

  const s = await loadOutboundSettings(tenantId);
  const provider = s["outbound_email.provider"];
  const from = s["outbound_email.from"] || "";
  const fromName = s["outbound_email.from_name"] || "";

  if (!provider || provider === "NONE") {
    return NextResponse.json(
      { ok: false, error: "Outbound email is not configured for this tenant (provider is NONE)" },
      { status: 400 }
    );
  }
  if (!from) {
    return NextResponse.json(
      { ok: false, error: "Missing setting key outbound_email.from — a from address is required to send" },
      { status: 400 }
    );
  }

  const subject = `[Vega CRM] Test email from ${tenant.name}`;
  const text = `This is a test email from Vega CRM outbound email configuration. Tenant: ${tenant.name}. Sent: ${new Date().toISOString()}.`;

  try {
    let result: TestSendResult;
    if (provider === "SMTP") {
      result = await sendViaSmtp(s, from, fromName, to, subject, text);
    } else if (provider === "GOOGLE_WORKSPACE") {
      result = await sendViaGoogle(s, from, fromName, to, subject, text);
    } else if (provider === "MICROSOFT_365") {
      result = await sendViaM365(s, from, fromName, to, subject, text);
    } else {
      return NextResponse.json(
        { ok: false, error: `Unknown outbound email provider '${provider}' (expected SMTP, GOOGLE_WORKSPACE, or MICROSOFT_365)` },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, provider: result.provider, from: result.from, messageId: result.messageId });
  } catch (e: unknown) {
    if (e instanceof MissingConfigError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Test email failed" },
      { status: 502 }
    );
  }
}