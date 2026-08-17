'use client'

// ============================================================================
// File: src/app/activities/page.tsx
// Phase 16: Unified Activity Center — HubSpot-style activity command center.
//
// Features:
//   - Multi-type activity creation (Note, Log Call, Schedule Meeting) with
//     company selector — no modal, all inline
//   - Activity type filter tabs (All, Notes, Calls, Emails, Tasks, Meetings)
//     with live counts
//   - Quick stats bar (Today's activities, This week, Upcoming meetings)
//   - Date-grouped activity feed (Today, Yesterday, This Week, Earlier)
//     with sticky group headers — like HubSpot/Close
//   - Search within activities (subject + description)
//   - Responsive: full rich layout on desktop, stacked on phone
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import ActivityCard from '../components/ActivityCard'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons } from '../lib/styles'
import { IconSearch } from '../components/Icons'
import type { Activity, Company, User, Tenant } from '../lib/types'

type ActivityTypeFilter = 'ALL' | 'NOTE' | 'CALL' | 'EMAIL' | 'TASK' | 'MEETING'
type DateRange = 'today' | 'week' | 'month' | 'all'
type QuickAction = 'note' | 'call' | 'meeting' | null

type ActivityWithRels = Activity & {
  company?: { id: string; name: string } | null
  contact?: { id: string; firstName: string; lastName: string } | null
  user?: { id: string; name: string } | null
}

const FILTER_LABELS: Record<ActivityTypeFilter, { label: string; icon: string; color: string }> = {
  ALL:     { label: 'All',      icon: '📋', color: 'var(--fg)' },
  NOTE:    { label: 'Notes',    icon: '📝', color: 'var(--gold)' },
  CALL:    { label: 'Calls',    icon: '📞', color: 'var(--blue)' },
  EMAIL:   { label: 'Emails',   icon: '✉️', color: 'var(--emerald)' },
  TASK:    { label: 'Tasks',    icon: '☑️', color: 'var(--cyan)' },
  MEETING: { label: 'Meetings', icon: '🤝', color: 'var(--violet)' },
}

const FILTER_ORDER: ActivityTypeFilter[] = ['ALL', 'NOTE', 'CALL', 'EMAIL', 'TASK', 'MEETING']

// ── Date grouping helper ──
function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())

  if (date >= todayStart) return 'Today'
  if (date >= yesterdayStart) return 'Yesterday'
  if (date >= weekStart) return 'This Week'
  return 'Earlier'
}

function formatDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function isInRange(dateStr: string, range: DateRange): boolean {
  if (range === 'all') return true
  const date = new Date(dateStr)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (range === 'today') return date >= start
  if (range === 'week') {
    const weekStart = new Date(start)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    return date >= weekStart
  }
  if (range === 'month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    return date >= monthStart
  }
  return true
}

// ── Inline Call Form ──
function CallForm({ companies, tenants, onCreated, onCancel }: {
  companies: Company[]
  tenants: Tenant[]
  onCreated: (a: ActivityWithRels) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    companyId: '', subject: '', direction: 'OUTBOUND', outcome: '', duration: '', notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.companyId || !form.subject.trim()) return
    setSubmitting(true)
    try {
      const company = companies.find(c => c.id === form.companyId)
      const body: Record<string, unknown> = {
        type: 'CALL',
        subject: form.subject,
        description: form.notes || null,
        companyId: form.companyId,
        tenantId: company?.tenantId || tenants[0]?.id,
        callDirection: form.direction,
        callOutcome: form.outcome || null,
        callDuration: form.duration ? parseInt(form.duration, 10) : null,
      }
      const created = await apiFetch<Activity>('/api/activities', { method: 'POST', body: JSON.stringify(body) })
      onCreated({
        ...created,
        company: { id: form.companyId, name: company?.name || '' },
        user: { id: '', name: 'You' },
      } as ActivityWithRels)
    } catch (err: any) {
      console.error('Failed to log call:', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="quick-action-form" style={{ ...panel.container, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={forms.group}>
        <span style={forms.label}>Company *</span>
        <select className="form-select" style={forms.select} required value={form.companyId}
          onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
          <option value="">Select a company…</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="form-grid" style={forms.row}>
        <label style={forms.group}>
          <span style={forms.label}>Subject *</span>
          <input className="form-input" style={forms.input} required value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Call subject" />
        </label>
        <label style={forms.group}>
          <span style={forms.label}>Direction</span>
          <select className="form-select" style={forms.select} value={form.direction}
            onChange={(e) => setForm({ ...form, direction: e.target.value })}>
            <option value="OUTBOUND">Outbound</option>
            <option value="INBOUND">Inbound</option>
          </select>
        </label>
      </div>
      <div className="form-grid" style={forms.row}>
        <label style={forms.group}>
          <span style={forms.label}>Outcome</span>
          <input className="form-input" style={forms.input} value={form.outcome}
            onChange={(e) => setForm({ ...form, outcome: e.target.value })} placeholder="e.g. Left voicemail, Connected" />
        </label>
        <label style={forms.group}>
          <span style={forms.label}>Duration (min)</span>
          <input className="form-input" style={forms.input} type="number" value={form.duration}
            onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="5" />
        </label>
      </div>
      <label style={forms.group}>
        <span style={forms.label}>Notes</span>
        <textarea className="form-textarea" style={forms.textarea} value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Call notes…" />
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-touch" style={buttons.secondary} onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-touch" style={{ ...buttons.primary, opacity: submitting || !form.companyId || !form.subject.trim() ? 0.5 : 1 }} disabled={submitting}>
          {submitting ? 'Saving…' : 'Log Call'}
        </button>
      </div>
    </form>
  )
}

// ── Inline Meeting Form ──
function MeetingForm({ companies, tenants, onCreated, onCancel }: {
  companies: Company[]
  tenants: Tenant[]
  onCreated: (a: ActivityWithRels) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({ companyId: '', subject: '', scheduledAt: '', description: '' })
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.companyId || !form.subject.trim()) return
    setSubmitting(true)
    try {
      const company = companies.find(c => c.id === form.companyId)
      const body: Record<string, unknown> = {
        type: 'MEETING',
        subject: form.subject,
        description: form.description || null,
        companyId: form.companyId,
        tenantId: company?.tenantId || tenants[0]?.id,
      }
      if (form.scheduledAt) body.scheduledAt = form.scheduledAt
      const created = await apiFetch<Activity>('/api/activities', { method: 'POST', body: JSON.stringify(body) })
      onCreated({
        ...created,
        company: { id: form.companyId, name: company?.name || '' },
        user: { id: '', name: 'You' },
      } as ActivityWithRels)
    } catch (err: any) {
      console.error('Failed to schedule meeting:', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="quick-action-form" style={{ ...panel.container, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={forms.group}>
        <span style={forms.label}>Company *</span>
        <select className="form-select" style={forms.select} required value={form.companyId}
          onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
          <option value="">Select a company…</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label style={forms.group}>
        <span style={forms.label}>Subject *</span>
        <input className="form-input" style={forms.input} required value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Meeting subject" />
      </label>
      <label style={forms.group}>
        <span style={forms.label}>Date & Time</span>
        <input className="form-input" style={forms.input} type="datetime-local" value={form.scheduledAt}
          onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
      </label>
      <label style={forms.group}>
        <span style={forms.label}>Description</span>
        <textarea className="form-textarea" style={forms.textarea} value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Meeting agenda…" />
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-touch" style={buttons.secondary} onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-touch" style={{ ...buttons.primary, opacity: submitting || !form.companyId || !form.subject.trim() ? 0.5 : 1 }} disabled={submitting}>
          {submitting ? 'Saving…' : 'Schedule Meeting'}
        </button>
      </div>
    </form>
  )
}

// ── Stats Bar ──
function StatsBar({ activities }: { activities: ActivityWithRels[] }) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())

  const todayCount = activities.filter(a => new Date(a.createdAt) >= todayStart).length
  const weekCount = activities.filter(a => new Date(a.createdAt) >= weekStart).length
  const upcomingMeetings = activities.filter(a =>
    a.type === 'MEETING' && a.scheduledAt && new Date(a.scheduledAt) > now
  ).length
  const callsToday = activities.filter(a =>
    a.type === 'CALL' && new Date(a.createdAt) >= todayStart
  ).length

  const stats = [
    { label: "Today's Activities", value: todayCount, color: 'var(--gold)' },
    { label: 'This Week', value: weekCount, color: 'var(--blue)' },
    { label: 'Calls Today', value: callsToday, color: 'var(--emerald)' },
    { label: 'Upcoming Meetings', value: upcomingMeetings, color: 'var(--violet)' },
  ]

  return (
    <div className="stat-grid" style={{ ...layout.grid, marginBottom: 24 }}>
      {stats.map(s => (
        <div key={s.label} className="panel-container" style={panel.container}>
          <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.value}</div>
          <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginTop: 4 }}>{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main Content ──
function ActivitiesContent() {
  const [activities, setActivities] = useState<ActivityWithRels[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [typeFilter, setTypeFilter] = useState<ActivityTypeFilter>('ALL')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [companyFilter, setCompanyFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Quick action state
  const [quickAction, setQuickAction] = useState<QuickAction>(null)
  const [noteText, setNoteText] = useState('')
  const [noteCompany, setNoteCompany] = useState('')
  const [noteFocused, setNoteFocused] = useState(false)
  const [submittingNote, setSubmittingNote] = useState(false)

  const load = useCallback(async () => {
    try {
      const [actRes, coRes, usersRes, tenantsRes] = await Promise.all([
        apiFetch<{ data: ActivityWithRels[] }>('/api/activities?limit=200'),
        apiFetch<{ data: Company[] }>('/api/companies?limit=100'),
        apiFetch<{ data: User[] }>('/api/admin/users'),
        apiFetch<{ data: Tenant[] }>('/api/admin/tenants'),
      ])
      setActivities(actRes.data || [])
      setCompanies(coRes.data || [])
      setUsers(usersRes.data || [])
      setTenants(tenantsRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load activities')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Type filter counts ──
  const typeCounts = useMemo(() => {
    const counts: Record<ActivityTypeFilter, number> = {
      ALL: activities.length,
      NOTE: 0, CALL: 0, EMAIL: 0, TASK: 0, MEETING: 0,
    }
    activities.forEach(a => {
      if (a.type === 'NOTE') counts.NOTE++
      else if (a.type === 'CALL') counts.CALL++
      else if (a.type === 'EMAIL') counts.EMAIL++
      else if (a.type === 'TASK') counts.TASK++
      else if (a.type === 'MEETING') counts.MEETING++
    })
    return counts
  }, [activities])

  // ── Filtered activities ──
  const filtered = useMemo(() => {
    let result = [...activities]
    if (typeFilter !== 'ALL') result = result.filter(a => a.type === typeFilter)
    if (dateRange !== 'all') result = result.filter(a => a.createdAt && isInRange(a.createdAt, dateRange))
    if (companyFilter) result = result.filter(a => a.companyId === companyFilter)
    if (userFilter) result = result.filter(a => a.userId === userFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(a =>
        a.subject?.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q)
      )
    }
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return result
  }, [activities, typeFilter, dateRange, companyFilter, userFilter, searchQuery])

  // ── Grouped activities by date ──
  const grouped = useMemo(() => {
    const groups: Record<string, ActivityWithRels[]> = {}
    filtered.forEach(a => {
      const group = getDateGroup(a.createdAt)
      if (!groups[group]) groups[group] = []
      groups[group].push(a)
    })
    return groups
  }, [filtered])

  // ── Note creation ──
  const handleAddNote = async () => {
    const trimmed = noteText.trim()
    if (!trimmed || submittingNote || !noteCompany) return
    setSubmittingNote(true)
    try {
      const company = companies.find(c => c.id === noteCompany)
      const body = {
        type: 'NOTE',
        subject: trimmed.slice(0, 100),
        description: trimmed,
        companyId: noteCompany,
        tenantId: company?.tenantId || tenants[0]?.id,
      }
      const created = await apiFetch<Activity>('/api/activities', { method: 'POST', body: JSON.stringify(body) })
      setActivities(prev => [{
        ...created,
        company: { id: noteCompany, name: company?.name || '' },
        user: { id: '', name: 'You' },
      } as ActivityWithRels, ...prev])
      setNoteText('')
      setNoteFocused(false)
    } catch (err: any) {
      setError(err.message || 'Failed to add note')
    } finally {
      setSubmittingNote(false)
    }
  }

  const handleActivityCreated = (a: ActivityWithRels) => {
    setActivities(prev => [a, ...prev])
    setQuickAction(null)
  }

  const handleDeleteActivity = (id: string) => {
    setActivities(prev => prev.filter(a => a.id !== id))
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <Spinner size={32} />
      </div>
    )
  }

  const selectStyle: React.CSSProperties = { ...forms.select, width: 'auto', minWidth: 140 }
  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier']

  return (
    <div style={layout.page}>
      {/* ── Page Header ── */}
      <div style={layout.header}>
        <h1 style={typeography.title}>Activity Center</h1>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* ── Quick Stats Bar ── */}
      <StatsBar activities={activities} />

      {/* ── Quick Action Bar ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn-touch quick-action-btn"
            style={{
              ...buttons.secondary,
              backgroundColor: quickAction === 'note' ? 'var(--panel-elevated)' : 'transparent',
              borderColor: quickAction === 'note' ? 'var(--gold)' : 'var(--panel-border)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onClick={() => setQuickAction(quickAction === 'note' ? null : 'note')}
          >
            <span style={{ fontSize: 16 }}>📝</span> Note
          </button>
          <button
            className="btn-touch quick-action-btn"
            style={{
              ...buttons.secondary,
              backgroundColor: quickAction === 'call' ? 'var(--panel-elevated)' : 'transparent',
              borderColor: quickAction === 'call' ? 'var(--gold)' : 'var(--panel-border)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onClick={() => setQuickAction(quickAction === 'call' ? null : 'call')}
          >
            <span style={{ fontSize: 16 }}>📞</span> Log Call
          </button>
          <button
            className="btn-touch quick-action-btn"
            style={{
              ...buttons.secondary,
              backgroundColor: quickAction === 'meeting' ? 'var(--panel-elevated)' : 'transparent',
              borderColor: quickAction === 'meeting' ? 'var(--gold)' : 'var(--panel-border)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onClick={() => setQuickAction(quickAction === 'meeting' ? null : 'meeting')}
          >
            <span style={{ fontSize: 16 }}>🤝</span> Schedule Meeting
          </button>
        </div>

        {/* ── Note Composer (inline, no modal) ── */}
        {quickAction === 'note' && (
          <div className="panel-container" style={{ ...panel.container, marginTop: 8, padding: noteFocused ? 20 : 16, transition: 'padding .15s' }}>
            <div style={{ marginBottom: 12 }}>
              <select className="form-select" style={{ ...forms.select, maxWidth: 300 }} value={noteCompany} onChange={(e) => setNoteCompany(e.target.value)}>
                <option value="">Select a company…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <textarea
              className="form-textarea note-composer-input"
              style={{ ...forms.textarea, minHeight: noteFocused ? 100 : 56 }}
              placeholder={noteCompany ? "Write a note for this company…  (Enter to save, Shift+Enter for new line)" : "Select a company above to write a note…"}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => { if (!noteText.trim()) setNoteFocused(false) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleAddNote()
                }
              }}
              disabled={!noteCompany}
            />
            {(noteFocused || noteText.trim()) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button className="btn-touch" style={buttons.secondary} onMouseDown={(e) => e.preventDefault()} onClick={() => { setNoteText(''); setNoteFocused(false) }}>Cancel</button>
                <button className="btn-touch" style={{ ...buttons.primary, opacity: submittingNote || !noteText.trim() || !noteCompany ? 0.5 : 1 }} disabled={submittingNote || !noteText.trim() || !noteCompany} onClick={handleAddNote}>
                  {submittingNote ? 'Saving…' : 'Add Note'}
                </button>
              </div>
            )}
          </div>
        )}

        {quickAction === 'call' && (
          <CallForm companies={companies} tenants={tenants} onCreated={handleActivityCreated} onCancel={() => setQuickAction(null)} />
        )}

        {quickAction === 'meeting' && (
          <MeetingForm companies={companies} tenants={tenants} onCreated={handleActivityCreated} onCancel={() => setQuickAction(null)} />
        )}
      </div>

      {/* ── Type Filter Tabs ── */}
      <div
        className="timeline-filter-tabs"
        style={{
          display: 'flex',
          gap: 4,
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--panel-border)',
          marginBottom: 16,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {FILTER_ORDER.map(filter => {
          const { label, icon } = FILTER_LABELS[filter]
          const isActive = typeFilter === filter
          const count = typeCounts[filter] || 0
          return (
            <button
              key={filter}
              className="btn-touch filter-tab"
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--gold)' : '2px solid transparent',
                color: isActive ? 'var(--fg)' : 'var(--fg-dim)',
                padding: '10px 14px',
                fontWeight: isActive ? 600 : 500,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
                transition: 'color 0.15s, border-color 0.15s',
              }}
              onClick={() => setTypeFilter(filter)}
            >
              <span style={{ fontSize: 14 }}>{icon}</span>
              {label}
              {count > 0 && (
                <span style={{
                  backgroundColor: isActive ? 'var(--gold)22' : 'var(--panel-elevated)',
                  color: isActive ? 'var(--gold)' : 'var(--fg-dimmer)',
                  borderRadius: 10,
                  padding: '1px 7px',
                  fontSize: 11,
                  fontWeight: 600,
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Filter Toolbar ── */}
      <div className="list-toolbar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <IconSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-dim)', width: 16, height: 16 }} />
          <input
            className="form-input"
            style={{ ...forms.input, paddingLeft: 34 }}
            placeholder="Search activities…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select className="form-select" style={selectStyle} value={dateRange} onChange={(e) => setDateRange(e.target.value as DateRange)}>
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
        <select className="form-select" style={selectStyle} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="">All Companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-select" style={selectStyle} value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
          <option value="">All Users</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      {/* ── Activity count ── */}
      <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginBottom: 16 }}>
        {filtered.length} {filtered.length === 1 ? 'activity' : 'activities'}
        {searchQuery.trim() && <span> matching "{searchQuery}"</span>}
      </div>

      {/* ── Date-Grouped Activity Feed ── */}
      {filtered.length === 0 ? (
        <div className="panel-container" style={{ ...panel.container, textAlign: 'center', color: 'var(--fg-dim)' }}>
          No activities found. {searchQuery.trim() && 'Try a different search term.'}
        </div>
      ) : (
        <div className="activity-cards-list" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {groupOrder.map(groupName => {
            const items = grouped[groupName]
            if (!items || items.length === 0) return null
            return (
              <div key={groupName} style={{ marginBottom: 24 }}>
                {/* Sticky date header */}
                <div
                  className="activity-date-header"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 0',
                    marginBottom: 8,
                    position: 'sticky',
                    top: 0,
                    zIndex: 5,
                    backgroundColor: 'var(--bg)',
                  }}
                >
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    color: 'var(--fg-dim)',
                  }}>
                    {groupName}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: 'var(--fg-dimmer)',
                    backgroundColor: 'var(--panel-elevated)',
                    borderRadius: 10,
                    padding: '1px 8px',
                    fontWeight: 600,
                  }}>
                    {items.length}
                  </span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--panel-border)' }} />
                </div>
                {/* Activity cards in this group */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {items.map(a => (
                    <ActivityCard
                      key={a.id}
                      activity={a}
                      users={users}
                      onDelete={handleDeleteActivity}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Company link for context ── */}
      {companyFilter && (
        <div style={{ marginTop: 24 }}>
          <Link
            href={`/companies/${companyFilter}`}
            style={{
              ...buttons.secondary,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              textDecoration: 'none',
            }}
          >
            View {companies.find(c => c.id === companyFilter)?.name || 'Company'} →
          </Link>
        </div>
      )}
    </div>
  )
}

export default function ActivitiesPage() {
  return (
    <ProtectedLayout>
      <ActivitiesContent />
    </ProtectedLayout>
  )
}