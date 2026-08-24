"use client";

// ============================================================================
// File: src/app/admin/lead-forms/page.tsx
// Description: Lead Forms management page with inline create form.
//              Phase 23: Converted from modal to inline form pattern.
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import ProtectedLayout from "../../components/ProtectedLayout";
import Spinner from "../../components/Spinner";
import { IconPlus } from "../../components/Icons";
import { apiFetch } from "../../lib/api";
import { layout, panel, typeography, forms, buttons, table, statusBadge } from "../../lib/styles";

interface LeadForm {
  id: string;
  name: string;
  slug: string;
  fields: any[];
  isActive: boolean;
  redirectUrl: string | null;
  webhookUrl: string | null;
  _count?: { submissions: number };
  createdAt: string;
}

const emptyForm = { name: "", fields: [{ name: "name", label: "Name", type: "text", required: true }], redirectUrl: "", webhookUrl: "" };

export default function LeadFormsPage() {
  const [leadForms, setLeadForms] = useState<LeadForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [copiedSlug, setCopiedSlug] = useState("");

  const load = useCallback(async () => {
    try {
      const [formsRes, tenantsRes] = await Promise.all([
        apiFetch<{ data: LeadForm[] }>("/api/lead-forms"),
        apiFetch<{ data?: { id: string; name: string }[] } | { id: string; name: string }[]>("/api/admin/tenants"),
      ]);
      setLeadForms(formsRes.data || []);
      const tList = Array.isArray(tenantsRes) ? tenantsRes : tenantsRes.data || [];
      setTenants(tList);
      if (tList[0]) setTenantId(tList[0].id);
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addField = () => setForm(f => ({ ...f, fields: [...f.fields, { name: "", label: "", type: "text", required: false }] }));
  const removeField = (i: number) => setForm(f => ({ ...f, fields: f.fields.filter((_, idx) => idx !== i) }));
  const updateField = (i: number, key: string, val: any) => setForm(f => ({ ...f, fields: f.fields.map((fld, idx) => idx === i ? { ...fld, [key]: val } : fld) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/api/lead-forms", {
        method: "POST",
        body: JSON.stringify({
          tenantId,
          name: form.name,
          fields: form.fields.map(f => ({ ...f, name: f.name || f.label.toLowerCase().replace(/\s+/g, "_") })),
          redirectUrl: form.redirectUrl || null,
          webhookUrl: form.webhookUrl || null,
        }),
      });
      setShowForm(false);
      setForm({ ...emptyForm });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/forms/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(""), 2000);
  };

  if (loading) return <ProtectedLayout><div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner size={40} /></div></ProtectedLayout>;

  return (
    <ProtectedLayout>
      <div style={{ ...layout.page, maxWidth: "900px" }}>
        <div style={layout.header}>
          <h1 style={typeography.title}>Lead Forms</h1>
          <button className="btn-touch" style={{ ...buttons.primary, display: "flex", alignItems: "center", gap: 6 }} onClick={() => setShowForm(true)}>
            <IconPlus size={16} /> New Form
          </button>
        </div>

        {error && (
          <div style={{ backgroundColor: "rgba(184,80,74,0.12)", color: "var(--rust)", border: "1px solid rgba(184,80,74,0.3)", borderRadius: 8, padding: 12, marginBottom: 16 }}>{error}</div>
        )}

        {/* ── Inline Create Form ── */}
        {showForm && (
          <div className="panel-container" style={{ ...panel.container, marginBottom: 24, animation: "slideUp 0.25s ease-out" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ ...typeography.subtitle, margin: 0 }}>Create Lead Form</h2>
              <button className="btn-touch" style={{ ...buttons.secondary, padding: "6px 12px", fontSize: 13 }} onClick={() => setShowForm(false)}>✕ Close</button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Tenant</span>
                <select className="form-select" style={forms.select} value={tenantId} onChange={e => setTenantId(e.target.value)} required>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Form Name</span>
                <input className="form-input" style={forms.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Contact Us" required />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Redirect URL (optional)</span>
                <input className="form-input" style={forms.input} value={form.redirectUrl} onChange={e => setForm({ ...form, redirectUrl: e.target.value })} placeholder="https://..." />
              </label>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={forms.label}>Fields</span>
                  <button type="button" className="btn-touch" style={buttons.small} onClick={addField}>+ Add Field</button>
                </div>
                {form.fields.map((field, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <input className="form-input" style={forms.input} placeholder="Label" value={field.label} onChange={e => updateField(i, "label", e.target.value)} />
                    </div>
                    <div style={{ width: 120 }}>
                      <select className="form-select" style={forms.select} value={field.type} onChange={e => updateField(i, "type", e.target.value)}>
                        <option value="text">Text</option>
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                        <option value="textarea">Textarea</option>
                      </select>
                    </div>
                    <div style={{ width: 80 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--fg-dim)" }}>
                        <input type="checkbox" checked={field.required} onChange={e => updateField(i, "required", e.target.checked)} />
                        Req
                      </label>
                    </div>
                    <button type="button" className="btn-touch" style={buttons.danger} onClick={() => removeField(i)}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn-touch" style={buttons.secondary} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-touch" style={{ ...buttons.primary, opacity: saving ? 0.6 : 1 }} disabled={saving}>{saving ? "Creating…" : "Create Form"}</button>
              </div>
            </form>
          </div>
        )}

        {leadForms.length === 0 ? (
          <div className="panel-container" style={{ ...panel.container, textAlign: "center", padding: 48 }}>
            <p style={typeography.muted}>No lead forms yet. Create one to start capturing leads from your website.</p>
          </div>
        ) : (
          <div className="panel-container" style={panel.container}>
            <div className="table-wrapper" style={{ overflowX: "auto" }}>
              <table style={table.table}>
                <thead>
                  <tr>
                    <th style={table.th}>Form Name</th>
                    <th style={table.th}>Public URL</th>
                    <th style={table.th}>Submissions</th>
                    <th style={table.th}>Status</th>
                    <th style={table.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leadForms.map(f => (
                    <tr key={f.id} className="vega-table-row" style={table.tr}>
                      <td style={table.td}>{f.name}</td>
                      <td style={table.td}>
                        <button className="btn-touch" onClick={() => copyLink(f.slug)} style={{ ...buttons.small, cursor: "pointer" }}>
                          {copiedSlug === f.slug ? "✓ Copied" : "Copy Link"}
                        </button>
                      </td>
                      <td style={table.td}>{f._count?.submissions || 0}</td>
                      <td style={table.td}>
                        <span style={statusBadge(f.isActive ? "var(--emerald)" : "var(--fg-dim)")}>
                          {f.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={table.td}>
                        <a href={`/forms/${f.slug}`} target="_blank" style={{ ...buttons.small, textDecoration: "none", display: "inline-block" }}>View</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}