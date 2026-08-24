"use client"

// ============================================================================
// File: src/app/campaigns/page.tsx
// Description: Email Campaigns list with inline create form.
//              Phase 23: Converted from modal to inline form pattern.
// ============================================================================

import { useEffect, useState, useCallback } from "react"
import ProtectedLayout from "../components/ProtectedLayout"
import Spinner from "../components/Spinner"
import { IconPlus } from "../components/Icons"
import { apiFetch } from "../lib/api"
import { layout, panel, typeography, forms, buttons, statusBadge } from "../lib/styles"

interface Campaign {
  id: string
  name: string
  subject: string
  status: string
  totalSent: number
  totalOpened: number
  totalClicked: number
  totalReplied: number
  scheduledAt: string | null
  sentAt: string | null
  createdAt: string
  _count?: { recipients: number }
}

interface Tenant {
  id: string
  name: string
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#8b8d98",
  SCHEDULED: "#60a5fa",
  SENDING: "#f59e0b",
  SENT: "#4ade80",
  PAUSED: "#e57373",
}

const emptyForm = { name: "", subject: "", body: "", tenantId: "" }

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const loadData = useCallback(async () => {
    try {
      const [campRes, tenRes] = await Promise.all([
        apiFetch<{ data: Campaign[] }>("/api/email/campaigns"),
        apiFetch<{ data?: Tenant[] } | Tenant[]>("/api/admin/tenants"),
      ])
      setCampaigns(campRes.data || [])
      const tList = Array.isArray(tenRes) ? tenRes : tenRes.data || []
      setTenants(tList)
      if (tList[0]) setForm((f) => ({ ...f, tenantId: tList[0].id }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await apiFetch("/api/email/campaigns", {
        method: "POST",
        body: JSON.stringify(form),
      })
      setShowForm(false)
      setForm({ ...emptyForm, tenantId: tenants[0]?.id || "" })
      loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create campaign")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <ProtectedLayout>
        <div style={{ ...layout.page, display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
          <Spinner size={40} />
        </div>
      </ProtectedLayout>
    )
  }

  return (
    <ProtectedLayout>
      <div style={{ ...layout.page, maxWidth: 1000 }}>
        <div style={layout.header}>
          <h1 style={typeography.title}>Email Campaigns</h1>
          <button className="btn-touch" style={{ ...buttons.primary, display: "flex", alignItems: "center", gap: 6 }} onClick={() => { setForm({ ...emptyForm, tenantId: tenants[0]?.id || "" }); setShowForm(true) }}>
            <IconPlus size={16} /> New Campaign
          </button>
        </div>

        {error && (
          <div style={{ backgroundColor: "rgba(184,80,74,0.12)", color: "var(--rust)", border: "1px solid rgba(184,80,74,0.3)", borderRadius: 8, padding: 12, marginBottom: 16 }}>{error}</div>
        )}

        {/* ── Inline Create Form ── */}
        {showForm && (
          <div className="panel-container" style={{ ...panel.container, marginBottom: 24, animation: "slideUp 0.25s ease-out" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ ...typeography.subtitle, margin: 0 }}>Create Campaign</h2>
              <button className="btn-touch" style={{ ...buttons.secondary, padding: "6px 12px", fontSize: 13 }} onClick={() => setShowForm(false)}>✕ Close</button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Tenant</span>
                <select className="form-select" style={forms.select} value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} required>
                  {tenants.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                </select>
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Campaign Name</span>
                <input className="form-input" style={forms.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Subject</span>
                <input className="form-input" style={forms.input} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Email Body (HTML)</span>
                <textarea className="form-textarea" style={{ ...forms.textarea, minHeight: 120 }} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
              </label>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn-touch" style={buttons.secondary} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-touch" style={{ ...buttons.primary, opacity: saving ? 0.6 : 1 }} disabled={saving}>{saving ? "Creating…" : "Create Campaign"}</button>
              </div>
            </form>
          </div>
        )}

        {campaigns.length === 0 ? (
          <div className="panel-container" style={{ ...panel.container, textAlign: "center" }}>
            <p style={typeography.muted}>No campaigns yet. Create one to send bulk emails to your contacts.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {campaigns.map((c) => (
              <div key={c.id} className="panel-container" style={{ ...panel.container }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px", color: "var(--fg)" }}>{c.name}</h3>
                    <p style={{ fontSize: 13, color: "var(--fg-dim)", margin: 0 }}>{c.subject}</p>
                  </div>
                  <span style={statusBadge(STATUS_COLORS[c.status] || "#8b8d98")}>{c.status}</span>
                </div>
                <div style={{ display: "flex", gap: 24, fontSize: 12, color: "var(--fg-dim)", flexWrap: "wrap" }}>
                  <span>Recipients: {c._count?.recipients || 0}</span>
                  <span>Sent: {c.totalSent}</span>
                  <span>Opened: {c.totalOpened}</span>
                  <span>Clicked: {c.totalClicked}</span>
                  <span>Replied: {c.totalReplied}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedLayout>
  )
}