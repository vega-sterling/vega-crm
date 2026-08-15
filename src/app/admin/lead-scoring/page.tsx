'use client'

// ============================================================================
// File: src/app/admin/lead-scoring/page.tsx
// Description: Enhanced Lead Scoring admin page — HubSpot-style rule builder,
//              score thresholds, contact score lookup, rule toggling.
//              Phase 14: Complete rewrite with proper rule management.
// ============================================================================

import { useEffect, useState, useCallback } from 'react'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import ConfirmDialog from '../../components/ConfirmDialog'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, table, statusBadge } from '../../lib/styles'

interface ScoreRule { id: string; tenantId: string; event: string; points: number; isActive: boolean }
interface Tenant { id: string; name: string }

/** Predefined scoring event types with descriptions */
const EVENT_TYPES: { value: string; label: string; description: string; defaultPoints: number }[] = [
  { value: 'ACTIVITY_CREATED', label: 'Activity Logged', description: 'Points per activity (call, note, meeting)', defaultPoints: 5 },
  { value: 'EMAIL_OPENED', label: 'Email Opened', description: 'Points per tracked email open', defaultPoints: 3 },
  { value: 'DEAL_CREATED', label: 'Deal Created', description: 'Points per deal associated with contact', defaultPoints: 10 },
  { value: 'HAS_EMAIL', label: 'Has Email', description: 'Bonus for having an email address', defaultPoints: 5 },
  { value: 'HAS_PHONE', label: 'Has Phone', description: 'Bonus for having a phone number', defaultPoints: 3 },
  { value: 'HAS_TITLE', label: 'Has Title', description: 'Bonus for having a job title', defaultPoints: 2 },
  { value: 'NO_ACTIVITY_30D', label: 'No Activity 30 Days', description: 'Penalty for stale contacts (negative points)', defaultPoints: -15 },
  { value: 'CONTACT_EXISTS', label: 'Contact Profile Exists', description: 'Base points for being a contact', defaultPoints: 1 },
]

/** Score tier thresholds */
const SCORE_TIERS = [
  { tier: 'HOT', minScore: 75, color: 'var(--rust)', bgColor: 'rgba(239,68,68,0.12)', label: '🔥 Hot Lead' },
  { tier: 'WARM', minScore: 40, color: 'var(--gold)', bgColor: 'rgba(245,158,11,0.12)', label: '⚡ Warm Lead' },
  { tier: 'COLD', minScore: -999, color: 'var(--cyan)', bgColor: 'rgba(6,182,212,0.12)', label: '❄️ Cold Lead' },
]

function getTier(score: number) {
  return SCORE_TIERS.find(t => score >= t.minScore) || SCORE_TIERS[SCORE_TIERS.length - 1]
}

interface ScoreResult {
  score: number
  tier: string
  breakdown: Array<{ event: string; label: string; points: number }>
  eventTypes?: string[]
}

interface ContactSearchResult {
  id: string
  firstName: string
  lastName: string
  email?: string | null
  company?: { id: string; name: string } | null
}

export default function LeadScoringPage() {
  const [rules, setRules] = useState<ScoreRule[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // New rule form
  const [newRule, setNewRule] = useState({ event: '', points: 5, tenantId: '' })
  const [saving, setSaving] = useState(false)

  // Contact score lookup
  const [contactSearch, setContactSearch] = useState('')
  const [searchResults, setSearchResults] = useState<ContactSearchResult[]>([])
  const [selectedContact, setSelectedContact] = useState<ContactSearchResult | null>(null)
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null)
  const [scoring, setScoring] = useState(false)

  // Edit inline
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPoints, setEditPoints] = useState(0)

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState<ScoreRule | null>(null)

  const load = useCallback(async () => {
    try {
      const [rulesRes, tenantsRes] = await Promise.all([
        apiFetch<{ data: ScoreRule[] }>('/api/lead-score/rules'),
        apiFetch<{ data?: Tenant[] } | Tenant[]>('/api/admin/tenants'),
      ])
      setRules(rulesRes.data || [])
      const tList = Array.isArray(tenantsRes) ? tenantsRes : tenantsRes.data || []
      setTenants(tList)
      if (tList[0] && !newRule.tenantId) setNewRule(r => ({ ...r, tenantId: tList[0].id }))
    } catch (err: any) {
      setError(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-dismiss success after 3s
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 3000)
      return () => clearTimeout(t)
    }
  }, [success])

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRule.event || !newRule.tenantId) return
    setSaving(true)
    setError('')
    try {
      await apiFetch('/api/lead-score/rules', {
        method: 'POST',
        body: JSON.stringify(newRule),
      })
      setNewRule(r => ({ ...r, event: '' }))
      setSuccess('Rule added successfully')
      await load()
    } catch (err: any) {
      setError(err.message || 'Failed to add rule')
    } finally {
      setSaving(false)
    }
  }

  const toggleRule = async (rule: ScoreRule) => {
    try {
      await apiFetch('/api/lead-score/rules', {
        method: 'PUT',
        body: JSON.stringify({ id: rule.id, isActive: !rule.isActive }),
      })
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: !r.isActive } : r))
    } catch (err: any) {
      setError(err.message)
    }
  }

  const startEdit = (rule: ScoreRule) => {
    setEditingId(rule.id)
    setEditPoints(rule.points)
  }

  const saveEdit = async (rule: ScoreRule) => {
    try {
      await apiFetch('/api/lead-score/rules', {
        method: 'PUT',
        body: JSON.stringify({ id: rule.id, points: editPoints }),
      })
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, points: editPoints } : r))
      setEditingId(null)
      setSuccess('Rule updated')
    } catch (err: any) {
      setError(err.message)
    }
  }

  const performDelete = async (rule: ScoreRule) => {
    try {
      await apiFetch(`/api/lead-score/rules?id=${rule.id}`, { method: 'DELETE' })
      setRules(prev => prev.filter(r => r.id !== rule.id))
      setSuccess('Rule deleted')
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Search contacts for score lookup
  const searchContacts = async (q: string) => {
    setContactSearch(q)
    if (q.trim().length < 2) {
      setSearchResults([])
      return
    }
    try {
      const res = await apiFetch<{ data: ContactSearchResult[] }>(
        `/api/contacts?limit=20`
      )
      const filtered = (res.data || []).filter(c => {
        const fullName = `${c.firstName} ${c.lastName}`.toLowerCase()
        return fullName.includes(q.toLowerCase()) ||
          (c.email || '').toLowerCase().includes(q.toLowerCase())
      }).slice(0, 8)
      setSearchResults(filtered)
    } catch {
      setSearchResults([])
    }
  }

  const calculateContactScore = async (contact: ContactSearchResult) => {
    setSelectedContact(contact)
    setScoring(true)
    setScoreResult(null)
    setSearchResults([])
    setContactSearch(`${contact.firstName} ${contact.lastName}`)
    try {
      const result = await apiFetch<ScoreResult>(
        `/api/lead-score/calculate?contactId=${contact.id}`
      )
      setScoreResult(result)
    } catch (err: any) {
      setError(err.message || 'Failed to calculate score')
    } finally {
      setScoring(false)
    }
  }

  // Get event label
  const eventLabel = (event: string) => {
    const found = EVENT_TYPES.find(e => e.value === event)
    return found ? found.label : event
  }

  if (loading) {
    return (
      <ProtectedLayout>
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={40} />
        </div>
      </ProtectedLayout>
    )
  }

  return (
    <ProtectedLayout>
      <div style={{ ...layout.page, maxWidth: 1000 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={typeography.title}>Lead Scoring</h1>
            <p style={{ ...typeography.muted, marginTop: 4 }}>
              Configure scoring rules to automatically rank contacts by engagement and fit.
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
            padding: '12px 16px', marginBottom: 16, fontSize: 14,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: 'var(--rust)', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        )}
        {success && (
          <div style={{
            backgroundColor: 'rgba(16,185,129,0.12)', color: 'var(--emerald)',
            border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8,
            padding: '12px 16px', marginBottom: 16, fontSize: 14,
          }}>
            {success}
          </div>
        )}

        {/* ── Score Tiers Card ── */}
        <div className="panel-container" style={{ ...panel.container, marginBottom: 24 }}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0, marginBottom: 16 }}>Score Tiers</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {SCORE_TIERS.map(t => (
              <div key={t.tier} style={{
                flex: '1 1 200px',
                padding: '16px 20px',
                borderRadius: 10,
                backgroundColor: t.bgColor,
                border: `1px solid ${t.color}33`,
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.color, marginBottom: 4 }}>
                  {t.label}
                </div>
                <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
                  Score ≥ {t.minScore > -999 ? t.minScore : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Add Rule Form ── */}
        <div className="panel-container" style={{ ...panel.container, marginBottom: 24 }}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0, marginBottom: 16 }}>Add Scoring Rule</h2>
          <form onSubmit={addRule} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 240px' }}>
              <label style={forms.label}>Event Type</label>
              <select
                style={{ ...forms.select, minHeight: 44 }}
                value={newRule.event}
                onChange={e => {
                  const event = e.target.value
                  const found = EVENT_TYPES.find(et => et.value === event)
                  setNewRule({ ...newRule, event, points: found?.defaultPoints ?? newRule.points })
                }}
                required
              >
                <option value="">Choose an event…</option>
                {EVENT_TYPES.map(et => (
                  <option key={et.value} value={et.value}>
                    {et.label} ({et.description})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 100 }}>
              <label style={forms.label}>Points</label>
              <input
                type="number"
                style={{ ...forms.input, minHeight: 44 }}
                value={newRule.points}
                onChange={e => setNewRule({ ...newRule, points: parseInt(e.target.value) || 0 })}
                required
              />
            </div>
            <div style={{ width: 160 }}>
              <label style={forms.label}>Tenant</label>
              <select
                style={{ ...forms.select, minHeight: 44 }}
                value={newRule.tenantId}
                onChange={e => setNewRule({ ...newRule, tenantId: e.target.value })}
                required
              >
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button type="submit" className="btn-touch" style={{ ...buttons.primary, minHeight: 44 }} disabled={saving}>
              {saving ? 'Adding...' : '+ Add Rule'}
            </button>
          </form>
        </div>

        {/* ── Current Rules ── */}
        <div className="panel-container" style={{ ...panel.container, marginBottom: 24 }}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0, marginBottom: 16 }}>
            Current Rules ({rules.length})
          </h2>
          {rules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--fg-dim)' }}>
              <p style={{ fontSize: 15, marginBottom: 8 }}>No rules configured yet.</p>
              <p style={{ fontSize: 13 }}>Default scoring will be used until custom rules are added.</p>
            </div>
          ) : (
            <div className="table-wrapper" style={{ overflowX: 'auto' }}>
              <table style={table.table}>
                <thead>
                  <tr>
                    <th style={table.th}>EVENT</th>
                    <th style={table.th}>POINTS</th>
                    <th style={table.th}>STATUS</th>
                    <th style={table.th}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id}>
                      <td style={table.td}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{eventLabel(r.event)}</div>
                        <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{r.event}</div>
                      </td>
                      <td style={table.td}>
                        {editingId === r.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="number"
                              style={{ ...forms.input, width: 70, minHeight: 36 }}
                              value={editPoints}
                              onChange={e => setEditPoints(parseInt(e.target.value) || 0)}
                              autoFocus
                            />
                            <button className="btn-touch" style={{ ...buttons.small, padding: '4px 10px' }} onClick={() => saveEdit(r)}>✓</button>
                            <button className="btn-touch" style={{ ...buttons.small, padding: '4px 10px' }} onClick={() => setEditingId(null)}>✕</button>
                          </div>
                        ) : (
                          <span style={statusBadge(r.points >= 0 ? 'var(--emerald)' : 'var(--rust)')}>
                            {r.points > 0 ? '+' : ''}{r.points}
                          </span>
                        )}
                      </td>
                      <td style={table.td}>
                        <button
                          className="btn-touch"
                          onClick={() => toggleRule(r)}
                          style={{
                            background: r.isActive ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)',
                            color: r.isActive ? 'var(--emerald)' : 'var(--fg-dim)',
                            border: `1px solid ${r.isActive ? 'rgba(16,185,129,0.3)' : 'rgba(107,114,128,0.3)'}`,
                            borderRadius: 6,
                            padding: '4px 12px',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            minHeight: 32,
                          }}
                        >
                          {r.isActive ? '● Active' : '○ Inactive'}
                        </button>
                      </td>
                      <td style={table.td}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {editingId !== r.id && (
                            <button className="btn-touch" style={{ ...buttons.small, padding: '4px 10px' }} onClick={() => startEdit(r)}>
                              Edit
                            </button>
                          )}
                          <button className="btn-touch" style={{ ...buttons.danger, padding: '4px 10px', fontSize: 13 }} onClick={() => setConfirmDelete(r)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Contact Score Lookup ── */}
        <div className="panel-container" style={{ ...panel.container, marginBottom: 24 }}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0, marginBottom: 16 }}>Score Lookup</h2>
          <p style={{ ...typeography.muted, marginBottom: 12, fontSize: 13 }}>
            Search for a contact to see their calculated lead score and breakdown.
          </p>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <input
              className="form-input btn-touch"
              style={{ ...forms.input, width: '100%', minHeight: 44 }}
              placeholder="Search contacts by name or email..."
              value={contactSearch}
              onChange={e => searchContacts(e.target.value)}
            />
            {/* Search results dropdown */}
            {searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                backgroundColor: 'var(--bg)', border: '1px solid var(--panel-border)',
                borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 10,
                marginTop: 4, overflow: 'hidden',
              }}>
                {searchResults.map(c => (
                  <button
                    key={c.id}
                    className="lead-score-search-result"
                    onClick={() => calculateContactScore(c)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '12px 16px', background: 'transparent', border: 'none',
                      borderBottom: '1px solid var(--panel-border)', cursor: 'pointer',
                      textAlign: 'left', color: 'var(--fg)', minHeight: 48,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {c.firstName} {c.lastName}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
                        {c.email || 'No email'} {c.company ? ` · ${c.company.name}` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Score Result */}
          {scoring && (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Spinner size={28} />
            </div>
          )}
          {scoreResult && !scoring && selectedContact && (
            <div style={{ marginTop: 16 }}>
              {/* Score Card */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
                padding: '20px 24px', borderRadius: 12, marginBottom: 16,
                backgroundColor: getTier(scoreResult.score).bgColor,
                border: `1px solid ${getTier(scoreResult.score).color}33`,
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 800,
                  backgroundColor: getTier(scoreResult.score).color,
                  color: 'white', flexShrink: 0,
                }}>
                  {scoreResult.score}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: getTier(scoreResult.score).color }}>
                    {getTier(scoreResult.score).label}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--fg-dim)', marginTop: 2 }}>
                    {selectedContact.firstName} {selectedContact.lastName}
                    {selectedContact.company ? ` · ${selectedContact.company.name}` : ''}
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              {scoreResult.breakdown.length > 0 ? (
                <div>
                  <h3 style={{ ...typeography.subtitle, fontSize: 14, marginBottom: 12 }}>Score Breakdown</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {scoreResult.breakdown.map((b, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 16px', borderRadius: 8,
                        backgroundColor: b.points > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                        border: `1px solid ${b.points > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                      }}>
                        <span style={{ fontSize: 14, color: 'var(--fg)' }}>{b.label}</span>
                        <span style={{
                          fontSize: 14, fontWeight: 700,
                          color: b.points > 0 ? 'var(--emerald)' : 'var(--rust)',
                        }}>
                          {b.points > 0 ? '+' : ''}{b.points}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--fg-dim)', fontSize: 14, padding: '16px 0' }}>
                  No scoring events triggered for this contact.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Scoring Rule?"
        itemName={confirmDelete ? eventLabel(confirmDelete.event) : undefined}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) performDelete(confirmDelete)
          setConfirmDelete(null)
        }}
      />
    </ProtectedLayout>
  )
}