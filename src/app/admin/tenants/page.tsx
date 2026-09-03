"use client";

// ============================================================================
// File: src/app/admin/tenants/page.tsx
// Description: Tenant management page. Lists all tenants with inline create/edit.
//              Phase 23: Converted from modal to inline form pattern.
//              Per-tenant 'Outbound Email' and 'SMS (Twilio)' settings
//              sections (settings API keys: outbound_email.* and sms.*).
//              Requires SUPER_ADMIN access (enforced by API route).
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import ProtectedLayout from "../../components/ProtectedLayout";
import Spinner from "../../components/Spinner";
import { IconPlus } from "../../components/Icons";
import { apiFetch } from "../../lib/api";
import { layout, panel, typeography, forms, buttons, table } from "../../lib/styles";
import type { Tenant } from "../../lib/types";
import OutboundEmailSection from "./OutboundEmailSection";
import SmsSettingsSection from "./SmsSettingsSection";

const emptyForm = { name: "", slug: "", description: "" };

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await apiFetch<{ data?: Tenant[] } | Tenant[]>("/api/admin/tenants");
      setTenants(Array.isArray(data) ? data : data.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openNew = () => {
    setEditingTenant(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setForm({
      name: tenant.name,
      slug: tenant.slug,
      description: tenant.description || "",
    });
    setShowForm(true);
    setTimeout(() => {
      document.getElementById("inline-tenant-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const toggleExpanded = (tenantId: string, section: "email" | "sms") => {
    const key = `${tenantId}:${section}`;
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (editingTenant) {
        await apiFetch(`/api/admin/tenants/${editingTenant.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...form, slug }),
        });
      } else {
        await apiFetch("/api/admin/tenants", {
          method: "POST",
          body: JSON.stringify({ ...form, slug }),
        });
      }
      setShowForm(false);
      setEditingTenant(null);
      setForm({ ...emptyForm });
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${editingTenant ? "update" : "create"} tenant`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ProtectedLayout><div style={{ padding: 40 }}><Spinner size={32} /></div></ProtectedLayout>;

  return (
    <ProtectedLayout>
      <div style={layout.page}>
        <div style={layout.header}>
          <h1 style={typeography.title}>Tenants</h1>
          <button className="btn-touch" style={{ ...buttons.primary, display: "flex", alignItems: "center", gap: 6 }} onClick={openNew}>
            <IconPlus size={16} /> New Tenant
          </button>
        </div>

        {error && (
          <div style={{ backgroundColor: "rgba(184,80,74,0.12)", color: "var(--rust)", border: "1px solid rgba(184,80,74,0.3)", borderRadius: 8, padding: 12, marginBottom: 16 }}>{error}</div>
        )}

        {/* ── Inline Create/Edit Form ── */}
        {showForm && (
          <div id="inline-tenant-form" className="panel-container" style={{ ...panel.container, marginBottom: 24, animation: "slideUp 0.25s ease-out" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ ...typeography.subtitle, margin: 0 }}>{editingTenant ? "Edit Tenant" : "New Tenant"}</h2>
              <button className="btn-touch" style={{ ...buttons.secondary, padding: "6px 12px", fontSize: 13 }} onClick={() => setShowForm(false)}>✕ Close</button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Name *</span>
                <input className="form-input" type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={forms.input} placeholder="Acme Corp" />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Slug (auto-generated if blank)</span>
                <input className="form-input" type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} style={forms.input} placeholder="acme-corp" />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Description</span>
                <textarea className="form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={forms.textarea} placeholder="Optional description" />
              </label>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn-touch" style={buttons.secondary} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-touch" style={{ ...buttons.primary, opacity: saving ? 0.6 : 1 }} disabled={saving}>
                  {saving ? "Saving…" : editingTenant ? "Save Changes" : "Create Tenant"}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="panel-container" style={panel.container}>
          <div className="table-wrapper" style={{ overflowX: "auto" }}>
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>Name</th>
                  <th style={table.th}>Slug</th>
                  <th style={table.th}>Description</th>
                  <th style={table.th}>Active</th>
                  <th style={{ ...table.th, width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 ? (
                  <tr>
                    <td style={table.td} colSpan={5}>
                      <span style={typeography.muted}>No tenants found</span>
                    </td>
                  </tr>
                ) : (
                  tenants.map((t) => (
                    <>
                      <tr key={t.id} className="vega-table-row" style={table.tr}>
                        <td style={table.td}>{t.name}</td>
                        <td style={table.td}><code style={{ fontSize: 13, color: "var(--fg-dim)" }}>{t.slug}</code></td>
                        <td style={table.td}>{t.description || "—"}</td>
                        <td style={table.td}>
                          <span style={{ color: t.isActive !== false ? "var(--emerald)" : "var(--rust)", fontSize: 14 }}>
                            {t.isActive !== false ? "✓ Active" : "✕ Inactive"}
                          </span>
                        </td>
                        <td style={table.td}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn-touch" style={buttons.small} onClick={() => openEdit(t)}>Edit</button>
                            <button
                              className="btn-touch"
                              style={{ ...buttons.small, ...(expandedKey === `${t.id}:email` ? { backgroundColor: "var(--gold)", color: "var(--bg)", borderColor: "var(--gold)" } : {}) }}
                              onClick={() => toggleExpanded(t.id, "email")}
                              aria-expanded={expandedKey === `${t.id}:email`}
                            >
                              {expandedKey === `${t.id}:email` ? "▾ Hide Email" : "▸ Email"}
                            </button>
                            <button
                              className="btn-touch"
                              style={{ ...buttons.small, ...(expandedKey === `${t.id}:sms` ? { backgroundColor: "var(--gold)", color: "var(--bg)", borderColor: "var(--gold)" } : {}) }}
                              onClick={() => toggleExpanded(t.id, "sms")}
                              aria-expanded={expandedKey === `${t.id}:sms`}
                            >
                              {expandedKey === `${t.id}:sms` ? "▾ Hide SMS" : "▸ SMS"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedKey === `${t.id}:email` && (
                        <tr key={`${t.id}-outbound`}>
                          <td style={{ padding: 0 }} colSpan={5}>
                            <OutboundEmailSection tenantId={t.id} tenantName={t.name} />
                          </td>
                        </tr>
                      )}
                      {expandedKey === `${t.id}:sms` && (
                        <tr key={`${t.id}-sms`}>
                          <td style={{ padding: 0 }} colSpan={5}>
                            <SmsSettingsSection tenantId={t.id} tenantName={t.name} />
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}