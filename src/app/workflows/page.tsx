"use client";

// ============================================================================
// File: src/app/workflows/page.tsx
// Description: Workflow Automation Builder — Priority 6
//              Pipedrive/Close-style card-based visual flow builder.
//              List view with active/inactive toggles, execution counts.
//              Inline editor: trigger card → condition cards → action cards.
//              Fully responsive (desktop 3-col sidebar, tablet 2-col, phone 1-col).
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import ProtectedLayout from "../components/ProtectedLayout";
import Spinner from "../components/Spinner";
import ConfirmDialog from "../components/ConfirmDialog";
import { apiFetch, ApiError } from "../lib/api";
import { layout, panel, typeography, forms, buttons, statusBadge, statusDot } from "../lib/styles";
import type { Workflow } from "../lib/types";

// --- Types ---

interface Tenant { id: string; name: string }

interface WorkflowCondition {
  field: string;
  operator: string;
  value: unknown;
}

interface WorkflowAction {
  type: string;
  cfg: Record<string, unknown>;
}

interface WorkflowRaw {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  trigger: string;
  triggerConfig: Record<string, unknown> | null;
  conditions: unknown;
  actions: unknown;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  _count?: { executions: number };
  creator?: { id: string; name: string };
  tenant?: { id: string; name: string; slug: string };
}

// --- Constants ---

const TRIGGER_TYPES = [
  { value: "DEAL_STAGE_CHANGE", label: "Deal moves to stage", icon: "🎯", color: "var(--blue)" },
  { value: "DEAL_CREATED", label: "New deal created", icon: "💼", color: "var(--emerald)" },
  { value: "NEW_CONTACT", label: "New contact created", icon: "👤", color: "var(--violet)" },
  { value: "TASK_ASSIGNED", label: "Task assigned", icon: "📋", color: "var(--amber)" },
  { value: "EMAIL_RECEIVED", label: "Email received", icon: "📧", color: "var(--cyan)" },
];

const OPERATORS = [
  { value: "EQUALS", label: "equals" },
  { value: "NOT_EQUALS", label: "does not equal" },
  { value: "CONTAINS", label: "contains" },
  { value: "GREATER_THAN", label: "is greater than" },
  { value: "LESS_THAN", label: "is less than" },
  { value: "EXISTS", label: "exists (has value)" },
];

const ACTION_TYPES = [
  { value: "CREATE_TASK", label: "Create Task", icon: "✅", color: "var(--emerald)" },
  { value: "SEND_EMAIL", label: "Send Email", icon: "📤", color: "var(--cyan)" },
  { value: "ASSIGN_USER", label: "Assign User", icon: "👤", color: "var(--violet)" },
  { value: "MOVE_DEAL", label: "Move Deal to Stage", icon: "🎯", color: "var(--blue)" },
  { value: "ADD_TAG", label: "Add Tag", icon: "🏷️", color: "var(--amber)" },
];

const FIELD_OPTIONS = [
  { value: "deal.title", label: "Deal > Title" },
  { value: "deal.value", label: "Deal > Value" },
  { value: "deal.stageId", label: "Deal > Stage" },
  { value: "deal.status", label: "Deal > Status" },
  { value: "contact.firstName", label: "Contact > First Name" },
  { value: "contact.lastName", label: "Contact > Last Name" },
  { value: "contact.email", label: "Contact > Email" },
  { value: "contact.companyId", label: "Contact > Company" },
  { value: "task.title", label: "Task > Title" },
  { value: "task.priority", label: "Task > Priority" },
  { value: "task.status", label: "Task > Status" },
  { value: "email.subject", label: "Email > Subject" },
  { value: "email.fromAddress", label: "Email > From" },
  { value: "tag", label: "Tag" },
];

function triggerLabel(value: string): string {
  const t = TRIGGER_TYPES.find((t) => t.value === value || t.value === value.toUpperCase());
  return t ? t.label : value;
}

function triggerIcon(value: string): string {
  const t = TRIGGER_TYPES.find((t) => t.value === value || t.value === value.toUpperCase());
  return t ? t.icon : "⚡";
}

function actionLabel(type: string): string {
  const a = ACTION_TYPES.find((a) => a.value === type);
  return a ? a.label : type;
}

function actionIcon(type: string): string {
  const a = ACTION_TYPES.find((a) => a.value === type);
  return a ? a.icon : "⚙️";
}

// --- Component ---

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowRaw[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<WorkflowRaw | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<WorkflowRaw | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [wfRes, tenantsRes] = await Promise.all([
        apiFetch<{ data: WorkflowRaw[] }>("/api/workflows"),
        apiFetch<{ data?: Tenant[] } | Tenant[]>("/api/admin/tenants"),
      ]);
      setWorkflows(wfRes.data || []);
      const tList = Array.isArray(tenantsRes) ? tenantsRes : tenantsRes.data || [];
      setTenants(tList);
    } catch (err: any) {
      setError(err.message || "Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (wf: WorkflowRaw) => {
    try {
      await apiFetch(`/api/workflows/${wf.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !wf.isActive }),
      });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (wf: WorkflowRaw) => {
    try {
      await apiFetch(`/api/workflows/${wf.id}`, { method: "DELETE" });
      setConfirmDelete(null);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTestRun = async (wf: WorkflowRaw) => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch<any>("/api/workflows/execute", {
        method: "POST",
        body: JSON.stringify({
          tenantId: wf.tenantId,
          triggerType: wf.trigger.toUpperCase(),
          context: {},
        }),
      });
      const executed = result?.executed ?? result?.results?.length ?? 0;
      const succeeded = result?.succeeded ?? 0;
      setTestResult(`✓ Triggered — ${executed} workflow(s) evaluated, ${succeeded} action(s) executed`);
    } catch (err: any) {
      setTestResult(`✗ Test failed: ${err.message}`);
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  // --- Filtering ---
  const filtered = workflows.filter((wf) => {
    if (filterStatus === "active" && !wf.isActive) return false;
    if (filterStatus === "inactive" && wf.isActive) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!wf.name.toLowerCase().includes(q) && !triggerLabel(wf.trigger).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const activeCount = workflows.filter((w) => w.isActive).length;

  // --- Render: Loading ---
  if (loading) {
    return (
      <ProtectedLayout>
        <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spinner size={40} />
        </div>
      </ProtectedLayout>
    );
  }

  // --- Render: Builder ---
  if (showBuilder || editing) {
    return (
      <WorkflowBuilder
        workflow={editing}
        tenants={tenants}
        onSave={() => {
          setShowBuilder(false);
          setEditing(null);
          load();
        }}
        onCancel={() => {
          setShowBuilder(false);
          setEditing(null);
        }}
      />
    );
  }

  // --- Render: List ---
  return (
    <ProtectedLayout>
      <div style={layout.page}>
        {/* Header */}
        <div style={layout.header}>
          <div>
            <h1 style={{ ...typeography.title, fontSize: 32, marginBottom: 4 }}>Workflow Automations</h1>
            <p style={typeography.muted}>
              {workflows.length} workflow{workflows.length !== 1 ? "s" : ""} · {activeCount} active
            </p>
          </div>
          <button
            style={{ ...buttons.primary, display: "flex", alignItems: "center", gap: 8 }}
            onClick={() => setShowBuilder(true)}
          >
            <span style={{ fontSize: 18 }}>+</span> New Workflow
          </button>
        </div>

        {error && (
          <div style={{ ...panel.compact, color: "var(--rust)", marginBottom: 16, borderColor: "var(--rust)" }}>
            {error}
            <button style={{ ...buttons.small, marginLeft: 12 }} onClick={() => setError("")}>Dismiss</button>
          </div>
        )}

        {testResult && (
          <div style={{ ...panel.compact, marginBottom: 16, borderColor: testResult.startsWith("✓") ? "var(--emerald)" : "var(--rust)" }}>
            {testResult}
          </div>
        )}

        {/* Filters */}
        <div style={{ ...panel.compact, marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            style={{ ...forms.input, flex: 1, minWidth: 200, maxWidth: 400 }}
            placeholder="Search workflows…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "active", "inactive"] as const).map((s) => (
              <button
                key={s}
                style={{
                  ...buttons.small,
                  backgroundColor: filterStatus === s ? "var(--gold)" : "var(--panel-elevated)",
                  color: filterStatus === s ? "var(--bg)" : "var(--fg)",
                  border: filterStatus === s ? "none" : "1px solid var(--panel-border)",
                  textTransform: "capitalize",
                }}
                onClick={() => setFilterStatus(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Workflow Cards */}
        {filtered.length === 0 ? (
          <div style={{ ...panel.container, textAlign: "center", padding: "60px 24px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
            <h2 style={{ ...typeography.subtitle, marginTop: 0, marginBottom: 8 }}>
              {workflows.length === 0 ? "No workflows yet" : "No workflows match your filters"}
            </h2>
            <p style={{ ...typeography.muted, marginBottom: 24 }}>
              {workflows.length === 0
                ? "Automate repetitive tasks — create tasks, send emails, move deals, and more when things happen."
                : "Try adjusting your search or filters."}
            </p>
            {workflows.length === 0 && (
              <button style={buttons.primary} onClick={() => setShowBuilder(true)}>
                Create your first workflow
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map((wf) => (
              <div
                key={wf.id}
                style={{
                  ...panel.container,
                  padding: 20,
                  opacity: wf.isActive ? 1 : 0.6,
                  transition: "opacity .2s, border-color .2s",
                  cursor: "default",
                }}
                className="workflow-card"
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                  {/* Trigger icon */}
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: "var(--panel-elevated)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 24,
                      flexShrink: 0,
                    }}
                  >
                    {triggerIcon(wf.trigger)}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em" }}>{wf.name}</h3>
                      <span
                        style={{
                          ...statusBadge(wf.isActive ? "var(--emerald)" : "var(--grey)"),
                          fontSize: 11,
                          padding: "2px 8px",
                        }}
                      >
                        {wf.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    {wf.description && (
                      <p style={{ ...typeography.muted, fontSize: 13, margin: "0 0 8px" }}>{wf.description}</p>
                    )}
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--fg-dim)" }}>
                      <span>
                        <strong style={{ color: "var(--fg)" }}>WHEN</strong> {triggerLabel(wf.trigger)}
                      </span>
                      {Array.isArray(wf.conditions) && wf.conditions.length > 0 && (
                        <span>
                          <strong style={{ color: "var(--fg)" }}>IF</strong> {String(wf.conditions.length)} condition{String(wf.conditions.length) !== "1" ? "s" : ""}
                        </span>
                      )}
                      {Array.isArray(wf.actions) && (
                        <span>
                          <strong style={{ color: "var(--fg)" }}>THEN</strong> {String(wf.actions.length)} action{String(wf.actions.length) !== "1" ? "s" : ""}
                        </span>
                      )}
                      {wf._count && wf._count.executions > 0 && (
                        <span>
                          <strong style={{ color: "var(--fg)" }}>Runs:</strong> {wf._count.executions}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }} className="wf-card-actions">
                    <button
                      style={buttons.small}
                      onClick={() => handleTestRun(wf)}
                      disabled={testing}
                      title="Test run"
                    >
                      ▶ Test
                    </button>
                    <button
                      style={buttons.small}
                      onClick={() => setEditing(wf)}
                      title="Edit"
                    >
                      ✎ Edit
                    </button>
                    <button
                      style={buttons.small}
                      onClick={() => handleToggle(wf)}
                      title={wf.isActive ? "Deactivate" : "Activate"}
                    >
                      {wf.isActive ? "⏸ Pause" : "▶ Activate"}
                    </button>
                    <button
                      style={{ ...buttons.small, color: "var(--rust)", borderColor: "var(--rust)" }}
                      onClick={() => setConfirmDelete(wf)}
                      title="Delete"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete workflow?"
        message={confirmDelete ? `Are you sure you want to delete "${confirmDelete.name}"? This will also remove all execution history. This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </ProtectedLayout>
  );
}

// ============================================================================
// WorkflowBuilder — Inline visual flow editor
// ============================================================================

interface BuilderProps {
  workflow: WorkflowRaw | null;
  tenants: Tenant[];
  onSave: () => void;
  onCancel: () => void;
}

function WorkflowBuilder({ workflow, tenants, onSave, onCancel }: BuilderProps) {
  const isEdit = !!workflow;

  const [name, setName] = useState(workflow?.name || "");
  const [description, setDescription] = useState(workflow?.description || "");
  const [tenantId, setTenantId] = useState(workflow?.tenantId || tenants[0]?.id || "");
  const [triggerType, setTriggerType] = useState(
    workflow?.trigger?.toUpperCase() || "DEAL_STAGE_CHANGE"
  );
  const [conditions, setConditions] = useState<WorkflowCondition[]>(
    Array.isArray(workflow?.conditions) ? (workflow!.conditions as WorkflowCondition[]) : []
  );
  const [actions, setActions] = useState<WorkflowAction[]>(
    Array.isArray(workflow?.actions) ? (workflow!.actions as WorkflowAction[]) : [{ type: "CREATE_TASK", cfg: {} }]
  );
  const [isActive, setIsActive] = useState(workflow?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addCondition = () => {
    setConditions([...conditions, { field: "deal.title", operator: "CONTAINS", value: "" }]);
  };

  const removeCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx: number, key: keyof WorkflowCondition, value: unknown) => {
    setConditions(conditions.map((c, i) => (i === idx ? { ...c, [key]: value } : c)));
  };

  const addAction = () => {
    setActions([...actions, { type: "CREATE_TASK", cfg: {} }]);
  };

  const removeAction = (idx: number) => {
    setActions(actions.filter((_, i) => i !== idx));
  };

  const updateAction = (idx: number, key: keyof WorkflowAction, value: unknown) => {
    setActions(actions.map((a, i) => (i === idx ? { ...a, [key]: value } : a)));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Workflow name is required");
      return;
    }
    if (!tenantId) {
      setError("Please select a tenant");
      return;
    }
    if (actions.length === 0) {
      setError("At least one action is required");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      tenantId,
      name: name.trim(),
      description: description.trim() || null,
      triggerType,
      triggerCfg: {},
      conditions: conditions.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.operator === "EXISTS" ? null : c.value,
      })),
      actions: actions.map((a) => ({ type: a.type, cfg: a.cfg })),
      isActive,
    };

    try {
      if (isEdit && workflow) {
        await apiFetch(`/api/workflows/${workflow.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/workflows", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSave();
    } catch (err: any) {
      setError(err.message || "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  };

  const triggerMeta = TRIGGER_TYPES.find((t) => t.value === triggerType);

  return (
    <ProtectedLayout>
      <div style={layout.page}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <button style={buttons.secondary} onClick={onCancel}>
            ← Back
          </button>
          <h1 style={{ ...typeography.title, margin: 0, flex: 1, fontSize: 28 }}>
            {isEdit ? "Edit Workflow" : "New Workflow"}
          </h1>
          <button style={buttons.primary} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Workflow"}
          </button>
        </div>

        {error && (
          <div style={{ ...panel.compact, color: "var(--rust)", marginBottom: 16, borderColor: "var(--rust)" }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr)" }}>
          {/* Settings bar */}
          <div style={{ ...panel.container, padding: 20 }}>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <div style={forms.group}>
                <label style={forms.label}>Workflow Name</label>
                <input
                  style={forms.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Welcome new leads"
                  maxLength={255}
                />
              </div>
              <div style={forms.group}>
                <label style={forms.label}>Tenant</label>
                <select style={forms.select} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div style={forms.group}>
                <label style={forms.label}>Description (optional)</label>
                <input
                  style={forms.input}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this workflow do?"
                  maxLength={500}
                />
              </div>
              <div style={{ ...forms.group, justifyContent: "flex-end" }}>
                <label style={forms.label}>Status</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 0" }}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 14 }}>{isActive ? "Active" : "Inactive"}</span>
                </label>
              </div>
            </div>
          </div>

          {/* TRIGGER card */}
          <FlowStep
            number={1}
            label="WHEN this happens"
            color="var(--blue)"
            icon="⚡"
            onAdd={undefined}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <select
                style={{ ...forms.select, maxWidth: 300 }}
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
              >
                {TRIGGER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
              {triggerMeta && (
                <span style={{ ...typeography.muted, fontSize: 13 }}>
                  {triggerMeta.icon} {triggerMeta.label}
                </span>
              )}
            </div>
          </FlowStep>

          {/* Connector */}
          <FlowConnector />

          {/* CONDITIONS card */}
          <FlowStep
            number={2}
            label="IF these conditions are met (optional)"
            color="var(--amber)"
            icon="🔀"
            onAdd={addCondition}
            addLabel="+ Add condition"
          >
            {conditions.length === 0 ? (
              <p style={{ ...typeography.muted, fontSize: 13, margin: 0 }}>
                No conditions — this workflow runs for every matching trigger.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {conditions.map((cond, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      padding: "12px",
                      backgroundColor: "var(--bg)",
                      borderRadius: 8,
                      border: "1px solid var(--panel-border)",
                    }}
                    className="wf-condition-row"
                  >
                    <select
                      style={{ ...forms.select, flex: "1 1 180px", minWidth: 160 }}
                      value={cond.field}
                      onChange={(e) => updateCondition(idx, "field", e.target.value)}
                    >
                      {FIELD_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                    <select
                      style={{ ...forms.select, flex: "0 1 150px", minWidth: 120 }}
                      value={cond.operator}
                      onChange={(e) => updateCondition(idx, "operator", e.target.value)}
                    >
                      {OPERATORS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {cond.operator !== "EXISTS" && (
                      <input
                        style={{ ...forms.input, flex: "1 1 120px", minWidth: 100 }}
                        value={String(cond.value ?? "")}
                        onChange={(e) => updateCondition(idx, "value", e.target.value)}
                        placeholder="Value"
                      />
                    )}
                    <button
                      style={{ ...buttons.small, color: "var(--rust)", borderColor: "var(--rust)", flexShrink: 0 }}
                      onClick={() => removeCondition(idx)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </FlowStep>

          {/* Connector */}
          <FlowConnector />

          {/* ACTIONS card */}
          <FlowStep
            number={3}
            label="THEN do these actions"
            color="var(--emerald)"
            icon="⚙️"
            onAdd={addAction}
            addLabel="+ Add action"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {actions.map((action, idx) => {
                const meta = ACTION_TYPES.find((a) => a.value === action.type);
                return (
                  <div
                    key={idx}
                    style={{
                      padding: "16px",
                      backgroundColor: "var(--bg)",
                      borderRadius: 10,
                      border: "1px solid var(--panel-border)",
                    }}
                    className="wf-action-row"
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 20 }}>{meta?.icon || "⚙️"}</span>
                      <select
                        style={{ ...forms.select, flex: 1, minWidth: 180 }}
                        value={action.type}
                        onChange={(e) => updateAction(idx, "type", e.target.value)}
                      >
                        {ACTION_TYPES.map((a) => (
                          <option key={a.value} value={a.value}>{a.icon} {a.label}</option>
                        ))}
                      </select>
                      {actions.length > 1 && (
                        <button
                          style={{ ...buttons.small, color: "var(--rust)", borderColor: "var(--rust)" }}
                          onClick={() => removeAction(idx)}
                        >
                          ✕ Remove
                        </button>
                      )}
                    </div>
                    {/* Action-specific config */}
                    <ActionConfig action={action} updateAction={updateAction} idx={idx} />
                  </div>
                );
              })}
            </div>
          </FlowStep>

          {/* Save bar */}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={buttons.secondary} onClick={onCancel}>Cancel</button>
            <button style={buttons.primary} onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Update Workflow" : "Create Workflow"}
            </button>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}

// --- ActionConfig: renders config fields per action type ---

function ActionConfig({
  action,
  updateAction,
  idx,
}: {
  action: WorkflowAction;
  updateAction: (idx: number, key: keyof WorkflowAction, value: unknown) => void;
  idx: number;
}) {
  const setCfg = (key: string, value: unknown) => {
    updateAction(idx, "cfg", { ...action.cfg, [key]: value });
  };

  const inputStyle: React.CSSProperties = {
    ...forms.input,
    fontSize: 13,
    padding: "8px 10px",
  };

  switch (action.type) {
    case "CREATE_TASK":
      return (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div style={forms.group}>
            <label style={forms.label}>Task Title</label>
            <input style={inputStyle} value={String(action.cfg.title ?? "")} onChange={(e) => setCfg("title", e.target.value)} placeholder="Follow up with lead" />
          </div>
          <div style={forms.group}>
            <label style={forms.label}>Priority</label>
            <select style={inputStyle} value={String(action.cfg.priority ?? "MEDIUM")} onChange={(e) => setCfg("priority", e.target.value)}>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
          <div style={forms.group}>
            <label style={forms.label}>Due in (days)</label>
            <input type="number" style={inputStyle} value={String(action.cfg.dueInDays ?? "1")} onChange={(e) => setCfg("dueInDays", parseInt(e.target.value) || 0)} />
          </div>
        </div>
      );

    case "SEND_EMAIL":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <div style={forms.group}>
              <label style={forms.label}>To (email or field)</label>
              <input style={inputStyle} value={String(action.cfg.to ?? "")} onChange={(e) => setCfg("to", e.target.value)} placeholder="contact.email" />
            </div>
            <div style={forms.group}>
              <label style={forms.label}>Template ID (optional)</label>
              <input style={inputStyle} value={String(action.cfg.templateId ?? "")} onChange={(e) => setCfg("templateId", e.target.value)} placeholder="Template ID" />
            </div>
          </div>
          <div style={forms.group}>
            <label style={forms.label}>Subject</label>
            <input style={inputStyle} value={String(action.cfg.subject ?? "")} onChange={(e) => setCfg("subject", e.target.value)} placeholder="Welcome, {contact.firstName}!" />
          </div>
          <div style={forms.group}>
            <label style={forms.label}>Body</label>
            <textarea style={{ ...forms.textarea, fontSize: 13, minHeight: 60 }} value={String(action.cfg.body ?? "")} onChange={(e) => setCfg("body", e.target.value)} placeholder="Email body… Use {contact.firstName} for variables." />
          </div>
        </div>
      );

    case "ASSIGN_USER":
      return (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div style={forms.group}>
            <label style={forms.label}>User ID to assign</label>
            <input style={inputStyle} value={String(action.cfg.userId ?? "")} onChange={(e) => setCfg("userId", e.target.value)} placeholder="User ID" />
          </div>
          <div style={forms.group}>
            <label style={forms.label}>Assign to entity</label>
            <select style={inputStyle} value={String(action.cfg.entityType ?? "deal")} onChange={(e) => setCfg("entityType", e.target.value)}>
              <option value="deal">Deal</option>
              <option value="contact">Contact</option>
              <option value="task">Task</option>
            </select>
          </div>
        </div>
      );

    case "MOVE_DEAL":
      return (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div style={forms.group}>
            <label style={forms.label}>Target Stage ID</label>
            <input style={inputStyle} value={String(action.cfg.stageId ?? "")} onChange={(e) => setCfg("stageId", e.target.value)} placeholder="Pipeline stage ID" />
          </div>
        </div>
      );

    case "ADD_TAG":
      return (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div style={forms.group}>
            <label style={forms.label}>Tag to add</label>
            <input style={inputStyle} value={String(action.cfg.tag ?? "")} onChange={(e) => setCfg("tag", e.target.value)} placeholder="e.g. hot-lead" />
          </div>
        </div>
      );

    default:
      return null;
  }
}

// --- FlowStep: visual card wrapper for trigger/condition/action sections ---

function FlowStep({
  number,
  label,
  color,
  icon,
  children,
  onAdd,
  addLabel,
}: {
  number: number;
  label: string;
  color: string;
  icon: string;
  children: React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div
      style={{
        backgroundColor: "var(--panel)",
        border: `2px solid ${color}`,
        borderRadius: 12,
        padding: 0,
        overflow: "hidden",
      }}
      className="flow-step"
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 20px",
          backgroundColor: `${color}15`,
          borderBottom: `1px solid ${color}30`,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: color,
            color: "var(--bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {number}
        </div>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", flex: 1 }}>{label}</span>
        {onAdd && addLabel && (
          <button
            style={{
              ...buttons.small,
              backgroundColor: `${color}20`,
              borderColor: color,
              color: color,
            }}
            onClick={onAdd}
          >
            {addLabel}
          </button>
        )}
      </div>
      {/* Body */}
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

// --- FlowConnector: visual line between steps ---

function FlowConnector() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }} className="flow-connector">
      <div
        style={{
          width: 2,
          height: 24,
          backgroundColor: "var(--panel-border-hot)",
          borderRadius: 1,
        }}
      />
    </div>
  );
}