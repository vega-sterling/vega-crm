"use client";

// ============================================================================
// File: src/app/admin/tenants/SmsSettingsSection.tsx
// Description: Per-tenant 'SMS (Twilio)' settings block for the admin tenants
//              page. Reads/writes the tenant settings API using keys under
//              the sms.* prefix. Secret fields (auth token, webhook secret)
//              are stored isEncrypted, come back masked as '••••••••', and
//              are never re-POSTed when unchanged. Also renders the inbound
//              webhook URL (with the secret as a ?secret= query param) that
//              the operator pastes into the Twilio console — with a warning
//              to copy the secret before saving, since it's masked after.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { panel, typeography, forms, buttons } from "../../lib/styles";

const PROVIDERS = ["TWILIO", "NONE"] as const;
type Provider = (typeof PROVIDERS)[number];

/** Value the API masks encrypted settings with — never re-POST this. */
const MASK = "••••••••";

/** Base URL the inbound webhook lives at. */
const WEBHOOK_BASE = "https://earth.servers.onl/api/sms/webhook?secret=";

interface SettingRow {
  id: string;
  key: string;
  value: string;
  isEncrypted: boolean;
}

/** Plain (non-secret) sms.* setting keys rendered as normal text inputs. */
const PLAIN_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "sms.twilio_account_sid", label: "Twilio Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
  { key: "sms.twilio_from_number", label: "From Number (E.164)", placeholder: "+15551234567" },
];

/** Secret sms.* setting keys rendered as password inputs. */
const SECRET_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "sms.twilio_auth_token", label: "Twilio Auth Token" },
  { key: "sms.webhook_secret", label: "Webhook Secret", placeholder: "any random string, e.g. UUID" },
];

export default function SmsSettingsSection({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [provider, setProvider] = useState<Provider | "">("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ data?: SettingRow[] } | SettingRow[]>(`/api/admin/tenants/${tenantId}/settings`);
      const rows = Array.isArray(data) ? data : data.data || [];
      const next: Record<string, string> = {};
      for (const r of rows) {
        if (r.key.startsWith("sms.")) next[r.key] = r.value || "";
      }
      setValues(next);
      const p = next["sms.provider"] as Provider | undefined;
      setProvider(p && PROVIDERS.includes(p) ? p : "");
      setLoaded(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load SMS settings");
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

  const validate = (): string | null => {
    if (provider === "NONE" || provider === "") return null;
    if (!(values["sms.twilio_account_sid"] || "").trim()) return "Twilio Account SID is required";
    if (!(values["sms.twilio_from_number"] || "").trim()) return "From Number is required";
    if (!(values["sms.webhook_secret"] || "").trim()) return "Webhook Secret is required";
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

      puts.push({ key: "sms.provider", value: provider || "NONE" });

      if (provider !== "NONE") {
        for (const f of PLAIN_FIELDS) {
          puts.push({ key: f.key, value: (values[f.key] || "").trim() });
        }
      }

      for (const f of SECRET_FIELDS) {
        const val = (values[f.key] || "").trim();
        // Never re-POST the mask or an empty secret — don't clobber the stored secret.
        if (val && val !== MASK) puts.push({ key: f.key, value: val, isEncrypted: true });
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
      setError(err instanceof Error ? err.message : "Failed to save SMS settings");
    } finally {
      setSaving(false);
    }
  };

  const status =
    !loaded || !provider || provider === "NONE"
      ? "SMS: not configured"
      : `SMS: ${values["sms.twilio_from_number"] || "(no from number)"} via Twilio`;

  const secretHint = `${WEBHOOK_BASE}YOUR_WEBHOOK_SECRET`;

  return (
    <div className="panel-container" style={{ ...panel.compact, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <h3 style={{ ...typeography.subtitle, margin: 0, fontSize: 15 }}>SMS (Twilio) — {tenantName}</h3>
        <span style={typeography.small}>{status}</span>
      </div>

      <div style={{ ...typeography.muted, marginBottom: 12, fontSize: 13 }}>
        Configure Twilio credentials per tenant to enable the SMS channel in the Universal Inbox. Inbound webhook URL to
        paste into the Twilio console (Messaging → phone number → &quot;when a message comes in&quot;):{" "}
        <code style={{ fontSize: 12, color: "var(--fg)", wordBreak: "break-all" }}>{secretHint}</code>
        {" "}— copy the secret value <em>before</em> saving, since it is masked as {MASK} after save.
      </div>

      {loading && !loaded && <span style={typeography.small}>Loading…</span>}

      {error && (
        <div style={{ backgroundColor: "rgba(184,80,74,0.12)", color: "var(--rust)", border: "1px solid rgba(184,80,74,0.3)", borderRadius: 8, padding: 12, marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* ── Provider toggle (flat buttons, like the outbound email provider select) ── */}
        <div>
          <span style={forms.label}>Provider</span>
          <div style={{ display: "flex", gap: 8 }}>
            {PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                className="btn-touch"
                style={{
                  ...buttons.secondary,
                  ...(provider === p ? { backgroundColor: "var(--gold)", color: "var(--bg)", borderColor: "var(--gold)", fontWeight: 600 } : {}),
                }}
                onClick={() => selectProvider(p)}
                aria-pressed={provider === p}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {provider && provider !== "NONE" && (
          <div style={{ ...panel.compact, backgroundColor: "var(--bg)" }}>
            <div style={{ ...typeography.small, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Twilio transport
            </div>
            <div style={forms.row}>
              {PLAIN_FIELDS.map((f) => (
                <label key={f.key} style={forms.group}>
                  <span style={forms.label}>{f.label}</span>
                  <input
                    className="form-input"
                    type="text"
                    value={values[f.key] || ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    style={forms.input}
                    placeholder={f.placeholder || ""}
                  />
                </label>
              ))}
              {SECRET_FIELDS.map((f) => (
                <label key={f.key} style={forms.group}>
                  <span style={forms.label}>{f.label}</span>
                  <input
                    className="form-input"
                    type="password"
                    value={values[f.key] || ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    style={forms.input}
                    placeholder={f.placeholder || (values[f.key] ? "stored — enter a new value to replace" : "not set")}
                    autoComplete="new-password"
                  />
                </label>
              ))}
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
            {saving ? "Saving…" : "Save SMS Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}