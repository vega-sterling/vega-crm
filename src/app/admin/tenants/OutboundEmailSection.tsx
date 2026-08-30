"use client";

// ============================================================================
// File: src/app/admin/tenants/OutboundEmailSection.tsx
// Description: Per-tenant 'Outbound Email' settings block for the admin
//              tenants page. Reads/writes the tenant settings API using keys
//              under the outbound_email.* prefix. Provider-selective forms
//              (SMTP / GOOGLE_WORKSPACE / MICROSOFT_365 / NONE) with secret
//              fields stored isEncrypted and never re-POSTed when masked.
//              Also exposes a 'Send Test Email' action backed by
//              POST /api/admin/tenants/[id]/settings/test-email.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { panel, typeography, forms, buttons } from "../../lib/styles";

const PROVIDERS = ["MICROSOFT_365", "GOOGLE_WORKSPACE", "SMTP", "NONE"] as const;
type Provider = (typeof PROVIDERS)[number];

const SMTP_ENCRYPTIONS = ["STARTTLS", "SSL", "NONE"] as const;

/** Full setting keys grouped per provider. Secrets are stored isEncrypted. */
const FIELD_GROUPS: Record<string, { key: string; label: string; secret?: boolean; placeholder?: string }[]> = {
  SMTP: [
    { key: "outbound_email.smtp_host", label: "SMTP host", placeholder: "smtp.example.com" },
    { key: "outbound_email.smtp_port", label: "SMTP port", placeholder: "587" },
    { key: "outbound_email.smtp_encryption", label: "Encryption" },
    { key: "outbound_email.smtp_username", label: "SMTP username", placeholder: "user@example.com" },
    { key: "outbound_email.smtp_password", label: "SMTP password", secret: true },
  ],
  GOOGLE_WORKSPACE: [
    { key: "outbound_email.google_client_id", label: "OAuth client ID" },
    { key: "outbound_email.google_client_secret", label: "OAuth client secret", secret: true },
    { key: "outbound_email.google_refresh_token", label: "OAuth refresh token", secret: true },
  ],
  MICROSOFT_365: [
    { key: "outbound_email.m365_tenant_id", label: "Azure tenant ID (GUID)" },
    { key: "outbound_email.m365_client_id", label: "App client ID" },
    { key: "outbound_email.m365_client_secret", label: "App client secret", secret: true },
    { key: "outbound_email.m365_username", label: "ROPC username (optional fallback)" },
    { key: "outbound_email.m365_password", label: "ROPC password (optional fallback)", secret: true },
  ],
};

/** Value the API masks encrypted settings with — never re-POST this. */
const MASK = "••••••••";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SettingRow {
  id: string;
  key: string;
  value: string;
  isEncrypted: boolean;
}

interface TestResult {
  ok: boolean;
  message: string;
}

export default function OutboundEmailSection({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [provider, setProvider] = useState<Provider | "">("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [saved, setSaved] = useState(false);

  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ data?: SettingRow[] } | SettingRow[]>(`/api/admin/tenants/${tenantId}/settings`);
      const rows = Array.isArray(data) ? data : data.data || [];
      const next: Record<string, string> = {};
      for (const r of rows) {
        if (r.key.startsWith("outbound_email.")) next[r.key] = r.value || "";
      }
      setValues(next);
      const p = next["outbound_email.provider"] as Provider | undefined;
      setProvider(p && PROVIDERS.includes(p) ? p : "");
      setLoaded(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load outbound email settings");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldError("");
    setSaved(false);
  };

  const selectProvider = (p: Provider | "") => {
    setProvider(p);
    setFieldError("");
    setSaved(false);
  };

  const fieldsFor = (p: Provider | ""): typeof FIELD_GROUPS[string] => FIELD_GROUPS[p] || [];

  const validate = (): string | null => {
    if (provider === "NONE" || provider === "") return null;
    const from = (values["outbound_email.from"] || "").trim();
    if (!from) return "From address is required";
    if (!EMAIL_RE.test(from)) return "From address must be a valid email";
    if (provider === "SMTP") {
      if (!(values["outbound_email.smtp_host"] || "").trim()) return "SMTP host is required";
      const port = Number(values["outbound_email.smtp_port"] || "587");
      if (!Number.isInteger(port) || port < 1 || port > 65535) return "SMTP port must be a number between 1 and 65535";
    }
    return null;
  };

  const handleSave = async () => {
    const vErr = validate();
    if (vErr) {
      setFieldError(vErr);
      return;
    }
    setSaving(true);
    setError("");
    setFieldError("");
    try {
      const puts: { key: string; value: string; isEncrypted?: boolean }[] = [];

      puts.push({ key: "outbound_email.provider", value: provider || "NONE" });

      if (provider === "NONE") {
        // Provider NONE clears/ignores the from fields.
        puts.push({ key: "outbound_email.from", value: "" });
        puts.push({ key: "outbound_email.from_name", value: "" });
      } else {
        puts.push({ key: "outbound_email.from", value: (values["outbound_email.from"] || "").trim() });
        puts.push({ key: "outbound_email.from_name", value: (values["outbound_email.from_name"] || "").trim() });
        for (const f of fieldsFor(provider)) {
          const val = (values[f.key] || "").trim();
          if (f.secret) {
            // Never re-POST the mask or an empty secret — don't clobber the stored secret.
            if (val && val !== MASK) puts.push({ key: f.key, value: val, isEncrypted: true });
          } else {
            puts.push({ key: f.key, value: val });
          }
        }
      }

      for (const p of puts) {
        await apiFetch(`/api/admin/tenants/${tenantId}/settings`, {
          method: "PUT",
          body: JSON.stringify(p),
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save outbound email settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    const to = testTo.trim();
    if (!EMAIL_RE.test(to)) {
      setTestResult({ ok: false, message: "Enter a valid recipient email address" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch<{ ok?: boolean; provider?: string; from?: string; messageId?: string; error?: string }>(
        `/api/admin/tenants/${tenantId}/settings/test-email`,
        { method: "POST", body: JSON.stringify({ to }) }
      );
      if (res.ok) {
        setTestResult({
          ok: true,
          message: `✓ Sent via ${res.provider} from ${res.from}${res.messageId ? ` (messageId ${res.messageId})` : ""}`,
        });
        setTestTo("");
      } else {
        setTestResult({ ok: false, message: res.error || "Test email failed" });
      }
    } catch (err: unknown) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Test email failed" });
    } finally {
      setTesting(false);
    }
  };

  const from = values["outbound_email.from"] || "";
  const status =
    !loaded || !provider || provider === "NONE"
      ? "Outbound: not configured"
      : `Outbound: ${from || "(no from address)"} via ${provider}`;

  return (
    <div className="panel-container" style={{ ...panel.compact, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <h3 style={{ ...typeography.subtitle, margin: 0, fontSize: 15 }}>Outbound Email — {tenantName}</h3>
        <span style={typeography.small}>{status}</span>
      </div>

      {loading && !loaded && <span style={typeography.small}>Loading…</span>}

      {error && (
        <div style={{ backgroundColor: "rgba(184,80,74,0.12)", color: "var(--rust)", border: "1px solid rgba(184,80,74,0.3)", borderRadius: 8, padding: 12, marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={forms.row}>
          <label style={forms.group}>
            <span style={forms.label}>Provider</span>
            <select
              className="form-input"
              value={provider}
              onChange={(e) => selectProvider(e.target.value as Provider)}
              style={forms.select}
            >
              <option value="">—</option>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label style={forms.group}>
            <span style={forms.label}>From address</span>
            <input
              className="form-input"
              type="text"
              value={provider === "NONE" ? "" : values["outbound_email.from"] || ""}
              onChange={(e) => set("outbound_email.from", e.target.value)}
              style={{ ...forms.input, ...(fieldError ? { borderColor: "var(--rust)" } : {}) }}
              placeholder="vega@example.com"
              disabled={provider === "NONE"}
            />
          </label>
          <label style={forms.group}>
            <span style={forms.label}>From name</span>
            <input
              className="form-input"
              type="text"
              value={provider === "NONE" ? "" : values["outbound_email.from_name"] || ""}
              onChange={(e) => set("outbound_email.from_name", e.target.value)}
              style={forms.input}
              placeholder="Vega Sterling"
              disabled={provider === "NONE"}
            />
          </label>
        </div>

        {provider && provider !== "NONE" && (
          <div style={{ ...panel.compact, backgroundColor: "var(--bg)" }}>
            <div style={{ ...typeography.small, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {provider === "SMTP" ? "SMTP transport" : provider === "GOOGLE_WORKSPACE" ? "Google Workspace (Gmail API)" : "Microsoft 365 (Graph sendMail)"}
            </div>
            <div style={forms.row}>
              {fieldsFor(provider).map((f) =>
                f.key.endsWith("smtp_encryption") ? (
                  <label key={f.key} style={forms.group}>
                    <span style={forms.label}>{f.label}</span>
                    <select
                      className="form-input"
                      value={values[f.key] || "STARTTLS"}
                      onChange={(e) => set(f.key, e.target.value)}
                      style={forms.select}
                    >
                      {SMTP_ENCRYPTIONS.map((enc) => (
                        <option key={enc} value={enc}>{enc}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label key={f.key} style={forms.group}>
                    <span style={forms.label}>{f.label}</span>
                    <input
                      className="form-input"
                      type={f.secret ? "password" : "text"}
                      value={values[f.key] || ""}
                      onChange={(e) => set(f.key, e.target.value)}
                      style={forms.input}
                      placeholder={f.secret ? (values[f.key] ? "stored — enter a new value to replace" : "not set") : f.placeholder || ""}
                      autoComplete="new-password"
                    />
                  </label>
                )
              )}
            </div>
          </div>
        )}

        {fieldError && <div style={{ color: "var(--rust)", fontSize: 13 }}>{fieldError}</div>}

        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
          {saved && <span style={{ ...typeography.small, color: "var(--emerald)" }}>✓ Saved</span>}
          <button type="button" className="btn-touch" style={{ ...buttons.secondary, padding: "6px 12px", fontSize: 13 }} onClick={load} disabled={loading || saving}>
            Reset
          </button>
          <button
            type="button"
            className="btn-touch"
            style={{ ...buttons.primary, padding: "8px 14px", fontSize: 13, opacity: saving ? 0.6 : 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Outbound Email"}
          </button>
        </div>

        {/* ── Send Test Email (recipient is not stored) ── */}
        <div style={{ borderTop: "1px solid var(--panel-border)", paddingTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={forms.label} >Send test to</span>
          <input
            className="form-input"
            type="text"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            style={{ ...forms.input, width: 240, flex: "0 1 240px" }}
            placeholder="recipient@example.com"
          />
          <button
            type="button"
            className="btn-touch"
            style={{ ...buttons.secondary, padding: "8px 14px", fontSize: 13, opacity: testing ? 0.6 : 1 }}
            onClick={handleTestSend}
            disabled={testing}
          >
            {testing ? "Sending…" : "Send Test Email"}
          </button>
          {testResult && (
            <span style={{ ...typeography.small, color: testResult.ok ? "var(--emerald)" : "var(--rust)", flex: 1, minWidth: 200 }}>
              {testResult.message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}