"use client";

import { useEffect, useState, useCallback } from "react";
import ProtectedLayout from "../../components/ProtectedLayout";
import Spinner from "../../components/Spinner";
import { apiFetch } from "../../lib/api";
import { layout, panel, typeography, forms, buttons, table, statusBadge } from "../../lib/styles";

interface ScoreRule { id: string; tenantId: string; event: string; points: number; isActive: boolean }
interface Tenant { id: string; name: string }

export default function LeadScoringPage() {
  const [rules, setRules] = useState<ScoreRule[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newRule, setNewRule] = useState({ event: "", points: 5, tenantId: "" });
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{ score: number; breakdown: Array<{ event: string; points: number }> } | null>(null);

  const load = useCallback(async () => {
    try {
      const [rulesRes, tenantsRes] = await Promise.all([
        apiFetch<{ data: ScoreRule[] }>("/api/lead-score/rules"),
        apiFetch<{ data?: Tenant[] } | Tenant[]>("/api/admin/tenants"),
      ]);
      setRules(rulesRes.data || []);
      const tList = Array.isArray(tenantsRes) ? tenantsRes : tenantsRes.data || [];
      setTenants(tList);
      if (tList[0] && !newRule.tenantId) setNewRule(r => ({ ...r, tenantId: tList[0].id }));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await apiFetch("/api/lead-score/rules", { method: "POST", body: JSON.stringify(newRule) });
      setNewRule(r => ({ ...r, event: "" }));
      load();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const deleteRule = async (id: string) => {
    try { await apiFetch(`/api/lead-score/rules?id=${id}`, { method: "DELETE" }); load(); }
    catch (err: any) { setError(err.message); }
  };

  if (loading) return <ProtectedLayout><div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner size={40} /></div></ProtectedLayout>;

  return (
    <ProtectedLayout>
      <div style={{ ...layout.page, maxWidth: "900px" }}>
        <h1 style={typeography.title}>Lead Scoring</h1>
        {error && <div style={{ color: "var(--rust)", marginBottom: 16 }}>{error}</div>}

        <div style={{ ...panel.container, marginBottom: 24 }}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Add Scoring Rule</h2>
          <form onSubmit={addRule} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={forms.label}>Event</label>
              <input style={forms.input} value={newRule.event} onChange={e => setNewRule({ ...newRule, event: e.target.value })} placeholder="email_open" required />
            </div>
            <div style={{ width: 100 }}>
              <label style={forms.label}>Points</label>
              <input type="number" style={forms.input} value={newRule.points} onChange={e => setNewRule({ ...newRule, points: parseInt(e.target.value) || 0 })} required />
            </div>
            <div style={{ width: 150 }}>
              <label style={forms.label}>Tenant</label>
              <select style={forms.select} value={newRule.tenantId} onChange={e => setNewRule({ ...newRule, tenantId: e.target.value })} required>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button type="submit" style={buttons.primary} disabled={saving}>{saving ? "Adding..." : "Add Rule"}</button>
          </form>
        </div>

        <div style={{ ...panel.container, marginBottom: 24 }}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Current Rules</h2>
          {rules.length === 0 ? <p style={typeography.muted}>No rules configured yet.</p> : (
            <div className="table-wrapper" style={{ overflowX: "auto" }}>
              <table style={table.table}>
                <thead><tr><th style={table.th}>EVENT</th><th style={table.th}>POINTS</th><th style={table.th}>STATUS</th><th style={table.th}>ACTIONS</th></tr></thead>
                <tbody>{rules.map(r => (
                  <tr key={r.id}>
                    <td style={table.td}>{r.event}</td>
                    <td style={table.td}><span style={statusBadge(r.points >= 0 ? "var(--emerald)" : "var(--rust)")}>{r.points > 0 ? "+" : ""}{r.points}</span></td>
                    <td style={table.td}>{r.isActive ? "Active" : "Inactive"}</td>
                    <td style={table.td}><button style={buttons.danger} onClick={() => deleteRule(r.id)}>Delete</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}