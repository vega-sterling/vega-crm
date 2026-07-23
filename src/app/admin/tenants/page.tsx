"use client";

// ============================================================================
// File: src/app/admin/tenants/page.tsx
// Description: Tenant management page. Lists all tenants with create and edit modals.
//              Requires SUPER_ADMIN access (enforced by API route).
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import ProtectedLayout from "../../components/ProtectedLayout";
import Spinner from "../../components/Spinner";
import { apiFetch } from "../../lib/api";
import { layout, panel, typeography, forms, buttons, table } from "../../lib/styles";
import type { Tenant } from "../../lib/types";

const emptyForm = { name: "", slug: "", description: "" };

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

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
    setShowModal(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setForm({
      name: tenant.name,
      slug: tenant.slug,
      description: tenant.description || "",
    });
    setShowModal(true);
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
        setShowModal(false);
        setEditingTenant(null);
        setForm({ ...emptyForm });
        await loadData();
      } else {
        await apiFetch("/api/admin/tenants", {
          method: "POST",
          body: JSON.stringify({ ...form, slug }),
        });
        setShowModal(false);
        setForm({ ...emptyForm });
        await loadData();
      }
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
          <button onClick={openNew} style={buttons.primary}>
            + New Tenant
          </button>
        </div>

        {error && (
          <div style={{ ...panel.compact, borderColor: "var(--rust)", color: "var(--rust)", marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={panel.container}>
          <table style={table.table}>
            <thead>
              <tr>
                <th style={table.th}>Name</th>
                <th style={table.th}>Slug</th>
                <th style={table.th}>Description</th>
                <th style={table.th}>Active</th>
                <th style={table.th}></th>
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
                  <tr key={t.id} style={table.tr}>
                    <td style={table.td}>{t.name}</td>
                    <td style={table.td}><code style={{ fontSize: 13, color: "var(--fg-dim)" }}>{t.slug}</code></td>
                    <td style={table.td}>{t.description || "—"}</td>
                    <td style={table.td}>
                      <span style={{ color: t.isActive !== false ? "var(--emerald)" : "var(--rust)", fontSize: 14 }}>
                        {t.isActive !== false ? "✓ Active" : "✕ Inactive"}
                      </span>
                    </td>
                    <td style={table.td}>
                      <button style={buttons.small} onClick={() => openEdit(t)}>Edit</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {showModal && (
          <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div style={{ ...panel.container, width: "100%", maxWidth: 480 }}>
              <h2 style={{ ...typeography.subtitle, marginBottom: 16 }}>{editingTenant ? "Edit Tenant" : "New Tenant"}</h2>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={forms.group}>
                  <label style={forms.label}>Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    style={forms.input}
                    placeholder="Acme Corp"
                  />
                </div>
                <div style={forms.group}>
                  <label style={forms.label}>Slug (auto-generated if blank)</label>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    style={forms.input}
                    placeholder="acme-corp"
                  />
                </div>
                <div style={forms.group}>
                  <label style={forms.label}>Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    style={forms.textarea}
                    placeholder="Optional description"
                  />
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setShowModal(false)} style={buttons.secondary}>
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} style={buttons.primary}>
                    {saving ? "Saving..." : editingTenant ? "Save Changes" : "Create Tenant"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
