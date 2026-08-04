"use client";

import { useEffect, useState, useCallback } from "react";
import ProtectedLayout from "../../components/ProtectedLayout";
import Spinner from "../../components/Spinner";
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
  const [showModal, setShowModal] = useState(false);
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
      setShowModal(false);
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1 style={typeography.title}>Lead Forms</h1>
          <button style={buttons.primary} onClick={() => setShowModal(true)}>+ New Form</button>
        </div>

        {error && <div style={{ color: "var(--rust)", marginBottom: 16 }}>{error}</div>}

        {leadForms.length === 0 ? (
          <div style={{ ...panel.container, textAlign: "center", padding: 48 }}>
            <p style={typeography.muted}>No lead forms yet. Create one to start capturing leads from your website.</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ overflowX: "auto" }}>
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>FORM NAME</th>
                  <th style={table.th}>PUBLIC URL</th>
                  <th style={table.th}>SUBMISSIONS</th>
                  <th style={table.th}>STATUS</th>
                  <th style={table.th}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {leadForms.map(f => (
                  <tr key={f.id}>
                    <td style={table.td}>{f.name}</td>
                    <td style={table.td}>
                      <button onClick={() => copyLink(f.slug)} style={{ ...buttons.small, cursor: "pointer" }}>
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
        )}

        {showModal && (
          <div onClick={() => setShowModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ ...panel.container, maxWidth: 600, maxHeight: "85vh", overflowY: "auto", width: "100%" }}>
              <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Create Lead Form</h2>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={forms.label}>Tenant</label>
                  <select style={forms.select} value={tenantId} onChange={e => setTenantId(e.target.value)} required>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={forms.label}>Form Name</label>
                  <input style={forms.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Contact Us" required />
                </div>
                <div>
                  <label style={forms.label}>Redirect URL (optional)</label>
                  <input style={forms.input} value={form.redirectUrl} onChange={e => setForm({ ...form, redirectUrl: e.target.value })} placeholder="https://..." />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <label style={forms.label}>Fields</label>
                    <button type="button" style={buttons.small} onClick={addField}>+ Add Field</button>
                  </div>
                  {form.fields.map((field, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
                      <div style={{ flex: 1 }}>
                        <input style={forms.input} placeholder="Label" value={field.label} onChange={e => updateField(i, "label", e.target.value)} />
                      </div>
                      <div style={{ width: 120 }}>
                        <select style={forms.select} value={field.type} onChange={e => updateField(i, "type", e.target.value)}>
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
                      <button type="button" style={buttons.danger} onClick={() => removeField(i)}>✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" style={buttons.secondary} onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" style={buttons.primary} disabled={saving}>{saving ? "Creating..." : "Create Form"}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}