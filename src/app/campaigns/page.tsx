"use client"

import { useEffect, useState, useCallback } from "react"
import ProtectedLayout from "../components/ProtectedLayout"
import Spinner from "../components/Spinner"
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

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: "", subject: "", body: "", tenantId: "" })

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
      setShowModal(false)
      setForm({ name: "", subject: "", body: "", tenantId: tenants[0]?.id || "" })
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1 style={typeography.title}>Email Campaigns</h1>
          <button style={buttons.primary} onClick={() => setShowModal(true)}>+ New Campaign</button>
        </div>

        {error && (
          <div style={{ color: "var(--rust)", marginBottom: 16, fontSize: 14 }}>{error}</div>
        )}

        {campaigns.length === 0 ? (
          <div style={{ ...panel.container, textAlign: "center" }}>
            <p style={typeography.muted}>No campaigns yet. Create one to send bulk emails to your contacts.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {campaigns.map((c) => (
              <div key={c.id} style={{ ...panel.container }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px", color: "var(--fg)" }}>{c.name}</h3>
                    <p style={{ fontSize: 13, color: "var(--fg-dim)", margin: 0 }}>{c.subject}</p>
                  </div>
                  <span style={statusBadge(STATUS_COLORS[c.status] || "#8b8d98")}>{c.status}</span>
                </div>
                <div style={{ display: "flex", gap: 24, fontSize: 12, color: "var(--fg-dim)" }}>
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

        {showModal && (
          <div
            onClick={() => setShowModal(false)}
            className="vega-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ ...panel.container, maxWidth: 600, width: "100%", maxHeight: "85vh", overflowY: "auto" }}
            >
              <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Create Campaign</h2>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={forms.label}>Tenant</label>
                  <select style={forms.select} value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} required>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={forms.label}>Campaign Name</label>
                  <input style={forms.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <label style={forms.label}>Subject</label>
                  <input style={forms.input} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
                </div>
                <div>
                  <label style={forms.label}>Email Body (HTML)</label>
                  <textarea style={{ ...forms.textarea, minHeight: 120 }} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" style={buttons.secondary} onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" style={buttons.primary} disabled={saving}>{saving ? "Creating..." : "Create Campaign"}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  )
}