'use client'

// ============================================================================
// File: src/app/settings/page.tsx
import ProtectedLayout from '../components/ProtectedLayout'
// Description: User settings page — theme, language, Google integration, custom
//              properties, and workflow automation builder.
// ============================================================================

import { useApp } from "@/app/components/ThemeProvider";
import { layout, panel, typeography, forms, buttons, statusBadge } from "@/app/lib/styles";
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../lib/api";
import type { CustomProperty, Workflow } from "../lib/types";

const GOOGLE_SCOPES = ["Gmail send", "Gmail read", "Calendar"];
const FIELD_TYPES = ["TEXT", "NUMBER", "DROPDOWN", "DATE", "BOOLEAN"] as const;
const ENTITY_TYPES = ["COMPANY", "CONTACT"] as const;
const TRIGGERS = [
  { value: "DEAL_STAGE_CHANGE", label: "Deal stage changes" },
  { value: "NEW_CONTACT", label: "New contact created" },
  { value: "TASK_ASSIGNED", label: "Task assigned" },
  { value: "EMAIL_RECEIVED", label: "Email received" },
  { value: "DEAL_CREATED", label: "Deal created" },
] as const;
const OPERATORS = ["equals", "not_equals", "contains", "greater_than", "less_than"];
const ACTION_TYPES = [
  { value: "SEND_EMAIL", label: "Send email" },
  { value: "CREATE_TASK", label: "Create task" },
  { value: "UPDATE_DEAL", label: "Update deal" },
  { value: "SLACK_MESSAGE", label: "Slack message" },
] as const;

export default function SettingsPage() {
  const { theme, setTheme, locale, setLocale, t, locales } = useApp();
  const [mounted, setMounted] = useState(false);

  const [google, setGoogle] = useState<{ connected: boolean; email?: string | null }>({ connected: false });
  const [properties, setProperties] = useState<CustomProperty[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [propModal, setPropModal] = useState<Partial<CustomProperty> | null>(null);
  const [workflowModal, setWorkflowModal] = useState<Partial<Workflow> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [propForm, setPropForm] = useState<{
    name: string;
    label: string;
    entityType: "COMPANY" | "CONTACT";
    fieldType: "TEXT" | "NUMBER" | "DROPDOWN" | "DATE" | "BOOLEAN";
    options: { value: string; label: string }[];
    isRequired: boolean;
    isVisible: boolean;
  }>({
    name: "",
    label: "",
    entityType: "COMPANY",
    fieldType: "TEXT",
    options: [],
    isRequired: false,
    isVisible: true,
  });

  const [workflowForm, setWorkflowForm] = useState<{
    name: string;
    description: string;
    triggerType: string;
    conditions: { field: string; operator: string; value: string }[];
    actions: { type: string; config: Record<string, string> }[];
    isActive: boolean;
  }>({
    name: "",
    description: "",
    triggerType: "DEAL_STAGE_CHANGE",
    conditions: [{ field: "", operator: "equals", value: "" }],
    actions: [{ type: "SEND_EMAIL", config: { subject: "", body: "" } }],
    isActive: true,
  });

  const load = useCallback(async () => {
    try {
      const [googleRes, propsRes, wfRes] = await Promise.all([
        apiFetch<{ connected: boolean; email?: string | null }>("/api/integrations/google/status"),
        apiFetch<{ data: CustomProperty[] }>("/api/custom-properties"),
        apiFetch<{ data: Workflow[] }>("/api/workflows"),
      ]);
      setGoogle(googleRes || { connected: false });
      setProperties(propsRes.data || []);
      setWorkflows(wfRes.data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load settings");
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    load();
  }, [load]);

  const handleConnectGoogle = () => {
    window.location.href = "/api/integrations/google/connect";
  };

  const handleDisconnectGoogle = async () => {
    try {
      await apiFetch("/api/integrations/google/disconnect", { method: "POST" });
      setGoogle({ connected: false });
    } catch (err: any) {
      setError(err.message || "Failed to disconnect");
    }
  };

  const openProperty = (p?: CustomProperty) => {
    if (p) {
      setPropForm({
        name: p.name,
        label: p.label,
        entityType: p.entityType,
        fieldType: p.fieldType,
        options: p.options || [],
        isRequired: p.isRequired,
        isVisible: p.isVisible,
      });
    } else {
      setPropForm({
        name: "",
        label: "",
        entityType: "COMPANY",
        fieldType: "TEXT",
        options: [],
        isRequired: false,
        isVisible: true,
      });
    }
    setPropModal(p || {});
  };

  const handleSaveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = propForm;
      if ("id" in (propModal || {}) && propModal?.id) {
        const updated = await apiFetch<CustomProperty>(`/api/custom-properties/${propModal.id}`, { method: "PUT", body: JSON.stringify(body) });
        setProperties((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const created = await apiFetch<CustomProperty>("/api/custom-properties", { method: "POST", body: JSON.stringify(body) });
        setProperties((prev) => [created, ...prev]);
      }
      setPropModal(null);
    } catch (err: any) {
      setError(err.message || "Failed to save property");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (!confirm("Delete this custom property?")) return;
    try {
      await apiFetch(`/api/custom-properties/${id}`, { method: "DELETE" });
      setProperties((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      setError(err.message || "Failed to delete property");
    }
  };

  const openWorkflow = (w?: Workflow) => {
    if (w) {
      setWorkflowForm({
        name: w.name,
        description: w.description || "",
        triggerType: w.triggerType,
        conditions: (w.conditions || []).map((c) => ({ ...c, value: String(c.value ?? "") })),
        actions: (w.actions || []).map((a) => ({ type: a.type, config: (a.config || {}) as Record<string, string> })),
        isActive: w.isActive,
      });
    } else {
      setWorkflowForm({
        name: "",
        description: "",
        triggerType: "DEAL_STAGE_CHANGE",
        conditions: [{ field: "", operator: "equals", value: "" }],
        actions: [{ type: "SEND_EMAIL", config: { subject: "", body: "" } }],
        isActive: true,
      });
    }
    setWorkflowModal(w || {});
  };

  const handleSaveWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...workflowForm,
        conditions: workflowForm.conditions.map((c) => ({ ...c, value: c.value })),
      };
      if ("id" in (workflowModal || {}) && workflowModal?.id) {
        const updated = await apiFetch<Workflow>(`/api/workflows/${workflowModal.id}`, { method: "PUT", body: JSON.stringify(body) });
        setWorkflows((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      } else {
        const created = await apiFetch<Workflow>("/api/workflows", { method: "POST", body: JSON.stringify(body) });
        setWorkflows((prev) => [created, ...prev]);
      }
      setWorkflowModal(null);
    } catch (err: any) {
      setError(err.message || "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  };

  const toggleWorkflow = async (w: Workflow) => {
    try {
      const updated = await apiFetch<Workflow>(`/api/workflows/${w.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !w.isActive }),
      });
      setWorkflows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err: any) {
      setError(err.message || "Failed to update workflow");
    }
  };

  const updateCondition = (idx: number, patch: Partial<{ field: string; operator: string; value: string }>) => {
    setWorkflowForm((prev) => {
      const conditions = [...prev.conditions];
      conditions[idx] = { ...conditions[idx], ...patch };
      return { ...prev, conditions };
    });
  };

  const addCondition = () => {
    setWorkflowForm((prev) => ({ ...prev, conditions: [...prev.conditions, { field: "", operator: "equals", value: "" }] }));
  };

  const removeCondition = (idx: number) => {
    setWorkflowForm((prev) => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== idx) }));
  };

  const updateAction = (idx: number, patch: Partial<{ type: string; config: Record<string, string> }>) => {
    setWorkflowForm((prev) => {
      const actions = [...prev.actions];
      actions[idx] = { ...actions[idx], ...patch };
      return { ...prev, actions };
    });
  };

  const updateActionConfig = (idx: number, key: string, value: string) => {
    setWorkflowForm((prev) => {
      const actions = [...prev.actions];
      actions[idx] = { ...actions[idx], config: { ...actions[idx].config, [key]: value } };
      return { ...prev, actions };
    });
  };

  const addAction = () => {
    setWorkflowForm((prev) => ({ ...prev, actions: [...prev.actions, { type: "SEND_EMAIL", config: { subject: "", body: "" } }] }));
  };

  const removeAction = (idx: number) => {
    setWorkflowForm((prev) => ({ ...prev, actions: prev.actions.filter((_, i) => i !== idx) }));
  };

  if (!mounted) return null;

  return (
    <ProtectedLayout>
    <div style={layout.page}>
      <h1 style={typeography.title}>{t("settings.title")}</h1>

      {error && (
        <div style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "var(--rust)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* Appearance Section */}
      <div style={{ ...panel.container, marginBottom: 24 }}>
        <div style={panel.header}>
          <h2 style={typeography.subtitle}>{t("settings.theme")}</h2>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
          <button
            onClick={() => setTheme("dark")}
            style={{
              ...buttons.secondary,
              borderColor: theme === "dark" ? "var(--gold)" : "var(--panel-border)",
              backgroundColor: theme === "dark" ? "var(--panel-elevated)" : "transparent",
            }}
          >
            🌙 {t("settings.dark_mode")}
          </button>
          <button
            onClick={() => setTheme("light")}
            style={{
              ...buttons.secondary,
              borderColor: theme === "light" ? "var(--gold)" : "var(--panel-border)",
              backgroundColor: theme === "light" ? "var(--panel-elevated)" : "transparent",
            }}
          >
            ☀️ {t("settings.light_mode")}
          </button>
        </div>
      </div>

      {/* Language Section */}
      <div style={{ ...panel.container, marginBottom: 24 }}>
        <div style={panel.header}>
          <h2 style={typeography.subtitle}>{t("settings.language")}</h2>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
          {locales.map((l) => (
            <button
              key={l.code}
              onClick={() => setLocale(l.code)}
              style={{
                ...buttons.secondary,
                borderColor: locale === l.code ? "var(--gold)" : "var(--panel-border)",
                backgroundColor: locale === l.code ? "var(--panel-elevated)" : "transparent",
                fontSize: 14,
              }}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Google Integration */}
      <div style={{ ...panel.container, marginBottom: 24 }}>
        <div style={panel.header}>
          <h2 style={typeography.subtitle}>Google Integration</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{google.connected ? `Connected as ${google.email || "Google account"}` : "Not connected"}</div>
            <div style={{ color: "var(--fg-dim)", fontSize: 14, marginTop: 4 }}>Permissions granted:</div>
            <ul style={{ color: "var(--fg-dim)", fontSize: 14, margin: "6px 0 0", paddingLeft: 20 }}>
              {GOOGLE_SCOPES.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <button
            style={google.connected ? buttons.danger : buttons.primary}
            onClick={google.connected ? handleDisconnectGoogle : handleConnectGoogle}
          >
            {google.connected ? "Disconnect" : "Connect Google"}
          </button>
        </div>
      </div>

      {/* Custom Properties */}
      <div style={{ ...panel.container, marginBottom: 24 }}>
        <div style={{ ...layout.header, marginBottom: 8 }}>
          <h2 style={typeography.subtitle}>Custom Properties</h2>
          <button style={buttons.primary} onClick={() => openProperty()}>+ Add Property</button>
        </div>
        <div className="table-wrapper">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", color: "var(--fg-dim)", fontSize: 12, textTransform: "uppercase" }}>Label</th>
                <th style={{ textAlign: "left", padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", color: "var(--fg-dim)", fontSize: 12, textTransform: "uppercase" }}>Entity</th>
                <th style={{ textAlign: "left", padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", color: "var(--fg-dim)", fontSize: 12, textTransform: "uppercase" }}>Type</th>
                <th style={{ textAlign: "left", padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", color: "var(--fg-dim)", fontSize: 12, textTransform: "uppercase" }}>Flags</th>
                <th style={{ textAlign: "right", padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", color: "var(--fg-dim)", fontSize: 12, textTransform: "uppercase" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id} style={{ transition: "background .2s" }}>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", fontSize: 14 }}>{p.label}</td>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", fontSize: 14, color: "var(--fg-dim)" }}>{p.entityType}</td>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", fontSize: 14, color: "var(--fg-dim)" }}>{p.fieldType}</td>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", fontSize: 14 }}>
                    {p.isRequired && <span style={statusBadge("var(--rust)")}>Required</span>}
                    {p.isVisible && <span style={statusBadge("var(--emerald)")}>Visible</span>}
                  </td>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", fontSize: 14, textAlign: "right" }}>
                    <button style={buttons.small} onClick={() => openProperty(p)}>Edit</button>
                    {" "}
                    <button style={buttons.danger} onClick={() => handleDeleteProperty(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Workflows */}
      <div style={{ ...panel.container, marginBottom: 24 }}>
        <div style={{ ...layout.header, marginBottom: 8 }}>
          <h2 style={typeography.subtitle}>Workflows</h2>
          <button style={buttons.primary} onClick={() => openWorkflow()}>+ New Workflow</button>
        </div>
        <div className="table-wrapper">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", color: "var(--fg-dim)", fontSize: 12, textTransform: "uppercase" }}>Workflow</th>
                <th style={{ textAlign: "left", padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", color: "var(--fg-dim)", fontSize: 12, textTransform: "uppercase" }}>Trigger</th>
                <th style={{ textAlign: "left", padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", color: "var(--fg-dim)", fontSize: 12, textTransform: "uppercase" }}>Status</th>
                <th style={{ textAlign: "right", padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", color: "var(--fg-dim)", fontSize: 12, textTransform: "uppercase" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr key={w.id} style={{ transition: "background .2s" }}>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", fontSize: 14 }}>
                    <div style={{ fontWeight: 600 }}>{w.name}</div>
                    <div style={{ color: "var(--fg-dim)", fontSize: 12 }}>{w.description}</div>
                  </td>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", fontSize: 14, color: "var(--fg-dim)" }}>{w.triggerType}</td>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", fontSize: 14 }}>
                    <button
                      style={w.isActive ? statusBadge("var(--emerald)") : statusBadge("var(--fg-dim)")}
                      onClick={() => toggleWorkflow(w)}
                    >
                      {w.isActive ? "On" : "Off"}
                    </button>
                  </td>
                  <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--panel-border)", fontSize: 14, textAlign: "right" }}>
                    <button style={buttons.small} onClick={() => openWorkflow(w)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Section */}
      <div style={{ ...panel.container, marginBottom: 24 }}>
        <div style={panel.header}>
          <h2 style={typeography.subtitle}>{t("settings.security")}</h2>
        </div>
        <p style={typeography.muted}>
          <a href="/setup-2fa" style={{ color: "var(--gold)" }}>
            {t("auth.2fa_setup_title")} →
          </a>
        </p>
      </div>

      {/* Account Section */}
      <div className="panel-container" style={panel.container}>
        <div style={panel.header}>
          <h2 style={typeography.subtitle}>{t("settings.account")}</h2>
        </div>
        <p style={typeography.muted}>Manage your account preferences here.</p>
      </div>

      {propModal && (
        <div
          className="modal-overlay"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setPropModal(null)}
        >
          <div className="modal-content" style={{ ...panel.container, width: "100%", maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>{propModal?.id ? "Edit Property" : "New Property"}</h2>
            <form onSubmit={handleSaveProperty} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Label</span>
                  <input style={forms.input} required value={propForm.label} onChange={(e) => setPropForm({ ...propForm, label: e.target.value, name: e.target.value.toLowerCase().replace(/\s+/g, "_") })} />
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Key (name)</span>
                  <input style={forms.input} value={propForm.name} onChange={(e) => setPropForm({ ...propForm, name: e.target.value })} />
                </label>
              </div>

              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Entity type</span>
                  <select style={forms.select} value={propForm.entityType} onChange={(e) => setPropForm({ ...propForm, entityType: e.target.value as any })}>
                    {ENTITY_TYPES.map((et) => (
                      <option key={et} value={et}>{et}</option>
                    ))}
                  </select>
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Field type</span>
                  <select style={forms.select} value={propForm.fieldType} onChange={(e) => setPropForm({ ...propForm, fieldType: e.target.value as any })}>
                    {FIELD_TYPES.map((ft) => (
                      <option key={ft} value={ft}>{ft}</option>
                    ))}
                  </select>
                </label>
              </div>

              {propForm.fieldType === "DROPDOWN" && (
                <div style={forms.group}>
                  <span style={forms.label}>Options (value:label, one per line)</span>
                  <textarea
                    style={forms.textarea}
                    rows={4}
                    value={propForm.options.map((o) => `${o.value}:${o.label}`).join("\n")}
                    onChange={(e) =>
                      setPropForm({
                        ...propForm,
                        options: e.target.value.split("\n").filter(Boolean).map((line) => {
                          const [value, label] = line.split(":");
                          return { value: value || line, label: label || value || line };
                        }),
                      })
                    }
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: 24 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <input type="checkbox" checked={propForm.isRequired} onChange={(e) => setPropForm({ ...propForm, isRequired: e.target.checked })} />
                  Required
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <input type="checkbox" checked={propForm.isVisible} onChange={(e) => setPropForm({ ...propForm, isVisible: e.target.checked })} />
                  Visible
                </label>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" style={buttons.secondary} onClick={() => setPropModal(null)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={saving}>{saving ? "Saving..." : "Save Property"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {workflowModal && (
        <div
          className="modal-overlay"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setWorkflowModal(null)}
        >
          <div className="modal-content" style={{ ...panel.container, width: "100%", maxWidth: 720, maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>{workflowModal?.id ? "Edit Workflow" : "New Workflow"}</h2>
            <form onSubmit={handleSaveWorkflow} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Name</span>
                <input style={forms.input} required value={workflowForm.name} onChange={(e) => setWorkflowForm({ ...workflowForm, name: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Description</span>
                <input style={forms.input} value={workflowForm.description} onChange={(e) => setWorkflowForm({ ...workflowForm, description: e.target.value })} />
              </label>

              <label style={forms.group}>
                <span style={forms.label}>Trigger</span>
                <select style={forms.select} value={workflowForm.triggerType} onChange={(e) => setWorkflowForm({ ...workflowForm, triggerType: e.target.value })}>
                  {TRIGGERS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>

              <div style={forms.group}>
                <div style={{ ...layout.header, marginBottom: 8 }}>
                  <span style={forms.label}>Conditions (all must match)</span>
                  <button type="button" style={buttons.small} onClick={addCondition}>+ Add condition</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {workflowForm.conditions.map((c, idx) => (
                    <div key={idx} style={{ ...forms.row, alignItems: "end" }}>
                      <label style={forms.group}>
                        <span style={forms.label}>Field</span>
                        <input style={forms.input} value={c.field} onChange={(e) => updateCondition(idx, { field: e.target.value })} />
                      </label>
                      <label style={forms.group}>
                        <span style={forms.label}>Operator</span>
                        <select style={forms.select} value={c.operator} onChange={(e) => updateCondition(idx, { operator: e.target.value })}>
                          {OPERATORS.map((op) => (
                            <option key={op} value={op}>{op}</option>
                          ))}
                        </select>
                      </label>
                      <label style={forms.group}>
                        <span style={forms.label}>Value</span>
                        <input style={forms.input} value={c.value} onChange={(e) => updateCondition(idx, { value: e.target.value })} />
                      </label>
                      <button type="button" style={buttons.danger} onClick={() => removeCondition(idx)}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={forms.group}>
                <div style={{ ...layout.header, marginBottom: 8 }}>
                  <span style={forms.label}>Actions</span>
                  <button type="button" style={buttons.small} onClick={addAction}>+ Add action</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {workflowForm.actions.map((a, idx) => (
                    <div key={idx} style={{ ...panel.compact, padding: 16 }}>
                      <div style={{ ...forms.row, alignItems: "end" }}>
                        <label style={forms.group}>
                          <span style={forms.label}>Action type</span>
                          <select
                            style={forms.select}
                            value={a.type}
                            onChange={(e) => updateAction(idx, { type: e.target.value, config: {} })}
                          >
                            {ACTION_TYPES.map((at) => (
                              <option key={at.value} value={at.value}>{at.label}</option>
                            ))}
                          </select>
                        </label>
                        <button type="button" style={buttons.danger} onClick={() => removeAction(idx)}>Remove</button>
                      </div>

                      {a.type === "SEND_EMAIL" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                          <label style={forms.group}>
                            <span style={forms.label}>Subject</span>
                            <input style={forms.input} value={a.config.subject || ""} onChange={(e) => updateActionConfig(idx, "subject", e.target.value)} />
                          </label>
                          <label style={forms.group}>
                            <span style={forms.label}>Body</span>
                            <textarea style={forms.textarea} rows={3} value={a.config.body || ""} onChange={(e) => updateActionConfig(idx, "body", e.target.value)} />
                          </label>
                        </div>
                      )}

                      {a.type === "CREATE_TASK" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                          <label style={forms.group}>
                            <span style={forms.label}>Title</span>
                            <input style={forms.input} value={a.config.title || ""} onChange={(e) => updateActionConfig(idx, "title", e.target.value)} />
                          </label>
                          <label style={forms.group}>
                            <span style={forms.label}>Assignee user id</span>
                            <input style={forms.input} value={a.config.assignedToId || ""} onChange={(e) => updateActionConfig(idx, "assignedToId", e.target.value)} />
                          </label>
                        </div>
                      )}

                      {a.type === "UPDATE_DEAL" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                          <label style={forms.group}>
                            <span style={forms.label}>Field</span>
                            <input style={forms.input} value={a.config.field || ""} onChange={(e) => updateActionConfig(idx, "field", e.target.value)} />
                          </label>
                          <label style={forms.group}>
                            <span style={forms.label}>Value</span>
                            <input style={forms.input} value={a.config.value || ""} onChange={(e) => updateActionConfig(idx, "value", e.target.value)} />
                          </label>
                        </div>
                      )}

                      {a.type === "SLACK_MESSAGE" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                          <label style={forms.group}>
                            <span style={forms.label}>Channel / webhook</span>
                            <input style={forms.input} value={a.config.channel || ""} onChange={(e) => updateActionConfig(idx, "channel", e.target.value)} />
                          </label>
                          <label style={forms.group}>
                            <span style={forms.label}>Message</span>
                            <textarea style={forms.textarea} rows={2} value={a.config.message || ""} onChange={(e) => updateActionConfig(idx, "message", e.target.value)} />
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" style={buttons.secondary} onClick={() => setWorkflowModal(null)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={saving}>{saving ? "Saving..." : "Save Workflow"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </ProtectedLayout>
  );
}