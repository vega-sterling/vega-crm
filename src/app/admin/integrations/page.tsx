"use client";

// ============================================================================
// File: src/app/admin/integrations/page.tsx
// Description: Integration management page. Allows SUPER_ADMIN to configure
//              per-tenant Google OAuth credentials (client ID, secret, redirect
//              URI) for Gmail + Calendar integration. Each tenant can use its
//              own Google Cloud Project or share global env-based credentials.
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import ProtectedLayout from "../../components/ProtectedLayout";
import Spinner from "../../components/Spinner";
import ConfirmDialog from "../../components/ConfirmDialog";
import { apiFetch } from "../../lib/api";
import { layout, panel, forms, buttons } from "../../lib/styles";

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface TenantSetting {
  id: string;
  key: string;
  value: string;
  isEncrypted: boolean;
  updatedAt: string;
}

interface TenantWithSettings extends Tenant {
  settings: TenantSetting[];
  expanded: boolean;
}

const GOOGLE_OAUTH_KEYS = [
  "google_oauth_client_id",
  "google_oauth_client_secret",
  "google_oauth_redirect_uri",
] as const;

const FIELD_LABELS: Record<string, string> = {
  google_oauth_client_id: "OAuth Client ID",
  google_oauth_client_secret: "OAuth Client Secret",
  google_oauth_redirect_uri: "OAuth Redirect URI",
};

const FIELD_ENCRYPTED: Record<string, boolean> = {
  google_oauth_client_id: false,
  google_oauth_client_secret: true,
  google_oauth_redirect_uri: false,
};

const FIELD_PLACEHOLDERS: Record<string, string> = {
  google_oauth_client_id: "xxxxx.apps.googleusercontent.com",
  google_oauth_client_secret: "GOCSPX-xxxxx",
  google_oauth_redirect_uri: "https://earth.servers.onl/api/google/auth",
};

export default function IntegrationsPage() {
  const [tenants, setTenants] = useState<TenantWithSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<any>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      const tenantsData = await apiFetch<{ data?: Tenant[] } | Tenant[]>(
        "/api/admin/tenants"
      );
      const tenantList = Array.isArray(tenantsData)
        ? tenantsData
        : tenantsData.data || [];

      // Fetch settings for each tenant
      const withSettings = await Promise.all(
        tenantList.map(async (t) => {
          try {
            const res = await apiFetch<{ data?: TenantSetting[] } | TenantSetting[]>(
              `/api/admin/tenants/${t.id}/settings`
            );
            const settings = Array.isArray(res) ? res : res.data || [];
            return { ...t, settings, expanded: false };
          } catch {
            return { ...t, settings: [], expanded: false };
          }
        })
      );

      setTenants(withSettings);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleExpand = (tenantId: string) => {
    setTenants((prev) =>
      prev.map((t) =>
        t.id === tenantId ? { ...t, expanded: !t.expanded } : t
      )
    );
  };

  const getSettingValue = (tenant: TenantWithSettings, key: string): string => {
    const s = tenant.settings.find((s) => s.key === key);
    if (!s) return "";
    return s.isEncrypted && s.value ? "••••••••" : s.value;
  };

  const handleSave = async (
    tenantId: string,
    key: string,
    value: string,
    isEncrypted: boolean
  ) => {
    const compositeKey = `${tenantId}:${key}`;
    setSavingKey(compositeKey);
    setSaveStatus((prev) => ({ ...prev, [compositeKey]: "" }));

    try {
      // If encrypted and value is the mask, skip
      if (isEncrypted && value === "••••••••") {
        setSaveStatus((prev) => ({
          ...prev,
          [compositeKey]: "No changes — skipped",
        }));
        return;
      }

      await apiFetch(`/api/admin/tenants/${tenantId}/settings`, {
        method: "PUT",
        body: JSON.stringify({ key, value, isEncrypted }),
      });

      setSaveStatus((prev) => ({ ...prev, [compositeKey]: "✓ Saved" }));

      // Refresh settings for this tenant
      const res = await apiFetch<{ data?: TenantSetting[] } | TenantSetting[]>(
        `/api/admin/tenants/${tenantId}/settings`
      );
      const newSettings = Array.isArray(res) ? res : res.data || [];
      setTenants((prev) =>
        prev.map((t) =>
          t.id === tenantId ? { ...t, settings: newSettings } : t
        )
      );
    } catch (err: unknown) {
      setSaveStatus((prev) => ({
        ...prev,
        [compositeKey]: `✗ ${err instanceof Error ? err.message : "Failed"}`,
      }));
    } finally {
      setSavingKey(null);
      // Clear status after 3s
      setTimeout(() => {
        setSaveStatus((prev) => {
          const next = { ...prev };
          delete next[compositeKey];
          return next;
        });
      }, 3000);
    }
  };

  const handleClear = (tenantId: string, key: string) => {
    setConfirmClear({ tenantId, key });
  };

  const performClear = async (tenantId: string, key: string) => {
    const compositeKey = `${tenantId}:${key}`;
    setSavingKey(compositeKey);

    try {
      await apiFetch(`/api/admin/tenants/${tenantId}/settings?key=${key}`, {
        method: "DELETE",
      });

      setSaveStatus((prev) => ({ ...prev, [compositeKey]: "✓ Cleared" }));

      // Refresh settings
      const res = await apiFetch<{ data?: TenantSetting[] } | TenantSetting[]>(
        `/api/admin/tenants/${tenantId}/settings`
      );
      const newSettings = Array.isArray(res) ? res : res.data || [];
      setTenants((prev) =>
        prev.map((t) =>
          t.id === tenantId ? { ...t, settings: newSettings } : t
        )
      );
    } catch (err: unknown) {
      setSaveStatus((prev) => ({
        ...prev,
        [compositeKey]: `✗ ${err instanceof Error ? err.message : "Failed"}`,
      }));
    } finally {
      setSavingKey(null);
      setTimeout(() => {
        setSaveStatus((prev) => {
          const next = { ...prev };
          delete next[compositeKey];
          return next;
        });
      }, 3000);
    }
  };

  if (loading) {
    return (
      <ProtectedLayout>
        <div style={{ padding: "40px", textAlign: "center" }}>
          <Spinner />
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div style={{ ...layout.page, maxWidth: "900px" }}>
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 8px" }}>
            Integrations
          </h1>
          <p style={{ fontSize: 14, color: "var(--fg-dim)", lineHeight: 1.6 }}>
            Configure third-party integrations for each tenant. Google OAuth
            credentials allow users in that tenant to connect their Gmail and
            Calendar accounts.
          </p>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: "#fee2e2",
              border: "1px solid #ef4444",
              color: "#991b1b",
              padding: "12px 16px",
              marginBottom: "24px",
              borderRadius: "8px",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* Info banner */}
        <div
          style={{
            background: "var(--panel-elevated)",
            border: "1px solid var(--panel-border)",
            borderRadius: "12px",
            padding: "20px 24px",
            marginBottom: "32px",
          }}
        >
          <h3
            style={{
              fontSize: "15px",
              fontWeight: 600,
              marginBottom: "8px",
              color: "var(--fg)",
            }}
          >
            How Google OAuth per-tenant works
          </h3>
          <ul
            style={{
              margin: 0,
              paddingLeft: "20px",
              fontSize: "14px",
              color: "var(--fg-dim)",
              lineHeight: "1.8",
            }}
          >
            <li>
              Each tenant can have its own Google Cloud Project credentials, or
              share the global ones set in the server environment.
            </li>
            <li>
              Create a Google Cloud Project, enable Gmail API + Google Calendar
              API, create an OAuth 2.0 Client ID (Web application).
            </li>
            <li>
              Add the redirect URI below to the Authorized redirect URIs in
              Google Cloud Console.
            </li>
            <li>
              When a user clicks "Connect Google", the system checks for
              tenant-specific credentials first, then falls back to env vars.
            </li>
          </ul>
        </div>

        {/* Tenant cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {tenants.map((tenant) => {
            const configuredCount = GOOGLE_OAUTH_KEYS.filter((k) =>
              tenant.settings.some((s) => s.key === k && s.value)
            ).length;
            const isFullyConfigured = configuredCount === 3;

            return (
              <div
                key={tenant.id}
                style={{
                  ...panel.container,
                  borderRadius: "12px",
                  overflow: "hidden",
                }}
              >
                {/* Tenant header (clickable) */}
                <button
                  onClick={() => toggleExpand(tenant.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "20px 24px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--fg)",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <span
                      style={{
                        fontSize: "20px",
                        color: isFullyConfigured
                          ? "var(--emerald)"
                          : configuredCount > 0
                          ? "var(--gold)"
                          : "var(--fg-dim)",
                      }}
                    >
                      {isFullyConfigured ? "✓" : configuredCount > 0 ? "◐" : "○"}
                    </span>
                    <div>
                      <div style={{ fontSize: "16px", fontWeight: 600 }}>
                        {tenant.name}
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "var(--fg-dim)",
                        }}
                      >
                        {configuredCount}/3 Google OAuth fields configured
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "18px",
                      color: "var(--fg-dim)",
                      transition: "transform 0.2s",
                      transform: tenant.expanded ? "rotate(180deg)" : "none",
                    }}
                  >
                    ▼
                  </span>
                </button>

                {/* Expanded settings */}
                {tenant.expanded && (
                  <div
                    style={{
                      borderTop: "1px solid var(--panel-border)",
                      padding: "24px",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gap: "20px",
                      }}
                    >
                      {GOOGLE_OAUTH_KEYS.map((key) => {
                        const isEncrypted = FIELD_ENCRYPTED[key];
                        const currentValue = getSettingValue(tenant, key);
                        const compositeKey = `${tenant.id}:${key}`;
                        const status = saveStatus[compositeKey];

                        return (
                          <IntegrationField
                            key={key}
                            label={FIELD_LABELS[key]}
                            placeholder={FIELD_PLACEHOLDERS[key]}
                            initialValue={currentValue}
                            isEncrypted={isEncrypted}
                            isSaving={savingKey === compositeKey}
                            status={status}
                            onSave={(value) =>
                              handleSave(tenant.id, key, value, isEncrypted)
                            }
                            onClear={() => handleClear(tenant.id, key)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <ConfirmDialog
        open={!!confirmClear}
        title="Clear Setting?"
        itemName={confirmClear?.key}
        message="This will reset this integration setting to its default value."
        confirmLabel="Clear"
        onCancel={() => setConfirmClear(null)}
        onConfirm={() => { if (confirmClear) performClear(confirmClear.tenantId, confirmClear.key); setConfirmClear(null) }}
      />
    </ProtectedLayout>
  );
}

// ============================================================================
// IntegrationField — single setting input with save/clear
// ============================================================================

interface IntegrationFieldProps {
  label: string;
  placeholder: string;
  initialValue: string;
  isEncrypted: boolean;
  isSaving: boolean;
  status?: string;
  onSave: (value: string) => void;
  onClear: () => void;
}

function IntegrationField({
  label,
  placeholder,
  initialValue,
  isEncrypted,
  isSaving,
  status,
  onSave,
  onClear,
}: IntegrationFieldProps) {
  const [value, setValue] = useState(initialValue);

  // Sync when initialValue changes (after save/refresh)
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const hasValue = Boolean(initialValue && initialValue !== "••••••••");
  const isMasked = initialValue === "••••••••";
  const isChanged = value !== initialValue;

  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "13px",
          fontWeight: 600,
          marginBottom: "6px",
          color: "var(--fg)",
        }}
      >
        {label}
        {isEncrypted && (
          <span
            style={{
              marginLeft: "8px",
              fontSize: "11px",
              color: "var(--fg-dim)",
              background: "var(--panel-elevated)",
              padding: "2px 8px",
              borderRadius: "4px",
            }}
          >
            encrypted
          </span>
        )}
      </label>
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          type={isEncrypted && isMasked ? "password" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          style={{
            ...forms.input,
            flex: 1,
            fontFamily: "monospace",
            fontSize: "13px",
          }}
        />
        <button
          onClick={() => onSave(value)}
          disabled={isSaving || !isChanged}
          style={{
            ...buttons.primary,
            opacity: isSaving || !isChanged ? 0.5 : 1,
            cursor: isSaving || !isChanged ? "not-allowed" : "pointer",
            padding: "8px 16px",
            fontSize: "13px",
            whiteSpace: "nowrap",
          }}
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
        {hasValue && (
          <button
            onClick={onClear}
            disabled={isSaving}
            style={{
              ...buttons.secondary,
              opacity: isSaving ? 0.5 : 1,
              cursor: isSaving ? "not-allowed" : "pointer",
              padding: "8px 16px",
              fontSize: "13px",
              whiteSpace: "nowrap",
            }}
          >
            Clear
          </button>
        )}
      </div>
      {status && (
        <div
          style={{
            marginTop: "6px",
            fontSize: "12px",
            color: status.startsWith("✓")
              ? "var(--emerald)"
              : "var(--rust)",
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}