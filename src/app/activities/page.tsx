'use client'

// ============================================================================
// File: src/app/activities/page.tsx
// Phase 3: Enhanced activities page with date range filter, company filter,
// user filter, activity cards (reusing ActivityCard component style),
// inline note creation at top (with company selector). Fully responsive.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import ProtectedLayout from '../components/ProtectedLayout'
import ActivityCard from '../components/ActivityCard'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons } from '../lib/styles'
import type { Activity, Company, User, Tenant } from '../lib/types'

type DateRange = 'today' | 'week' | 'month' | 'all'

type ActivityWithRels = Activity & {
  company?: { id: string; name: string } | null
  contact?: { id: string; firstName: string; lastName: string } | null
  user?: { id: string; name: string } | null
}

function ActivitiesContent() {
  const [activities, setActivities] = useState<ActivityWithRels[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [companyFilter, setCompanyFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')

  // Inline note composer state
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

  // Date range filter helper
  const isInRange = useCallback((dateStr: string, range: DateRange) => {
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
  }, [])

  // Filtered activities
  const filtered = useMemo(() => {
    let result = [...activities]
    if (dateRange !== 'all') {
      result = result.filter((a) => a.createdAt && isInRange(a.createdAt, dateRange))
    }
    if (companyFilter) {
      result = result.filter((a) => a.companyId === companyFilter)
    }
    if (userFilter) {
      result = result.filter((a) => a.userId === userFilter)
    }
    // Sort by createdAt descending (most recent first)
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return result
  }, [activities, dateRange, companyFilter, userFilter, isInRange])

  const handleAddNote = async () => {
    const trimmed = noteText.trim()
    if (!trimmed || submittingNote || !noteCompany) return
    setSubmittingNote(true)
    try {
      const company = companies.find((c) => c.id === noteCompany)
      const body = {
        type: 'NOTE',
        subject: trimmed.slice(0, 100),
        description: trimmed,
        companyId: noteCompany,
        tenantId: company?.tenantId || tenants[0]?.id,
      }
      const created = await apiFetch<Activity>('/api/activities', { method: 'POST', body: JSON.stringify(body) })
      setActivities((prev) => [{ ...created, company: { id: noteCompany, name: company?.name || '' }, user: { id: '', name: 'You' } } as ActivityWithRels, ...prev])
      setNoteText('')
      setNoteFocused(false)
    } catch (err: any) {
      setError(err.message || 'Failed to add note')
    } finally {
      setSubmittingNote(false)
    }
  }

  const handleDeleteActivity = (id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id))
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>
  }

  const toolbarStyle: React.CSSProperties = {
    display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16,
  }
  const selectStyle: React.CSSProperties = { ...forms.select, width: 'auto', minWidth: 140 }

  return (
    <div style={layout.page}>
      <div style={layout.header}>
        <h1 style={typeography.title}>Activities</h1>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>{error}</div>
      )}

      {/* ── Inline Note Composer with Company Selector ── */}
      <div className="panel-container" style={{ ...panel.container, marginBottom: 24, padding: noteFocused ? 20 : 16, transition: 'padding .15s' }}>
        <div style={{ marginBottom: 12 }}>
          <select className="form-select" style={{ ...forms.select, maxWidth: 300 }} value={noteCompany} onChange={(e) => setNoteCompany(e.target.value)}>
            <option value="">Select a company…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <textarea
          className="form-textarea note-composer-input"
          style={{ ...forms.textarea, minHeight: noteFocused ? 100 : 56 }}
          placeholder={noteCompany ? "Write a note for this company…  (Enter to save)" : "Select a company above to write a note…"}
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

      {/* ── Toolbar: Date Range + Company Filter + User Filter ── */}
      <div className="list-toolbar" style={toolbarStyle}>
        <select className="form-select" style={selectStyle} value={dateRange} onChange={(e) => setDateRange(e.target.value as DateRange)}>
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
        <select className="form-select" style={selectStyle} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="">All Companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-select" style={selectStyle} value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
          <option value="">All Users</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginBottom: 16 }}>
        {filtered.length} {filtered.length === 1 ? 'activity' : 'activities'}
      </div>

      {/* ── Activity Cards ── */}
      <div className="activity-cards-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 ? (
          <div className="panel-container" style={{ ...panel.container, textAlign: 'center', color: 'var(--fg-dim)' }}>No activities found.</div>
        ) : (
          filtered.map((a) => (
            <ActivityCard
              key={a.id}
              activity={a}
              users={users}
              onDelete={handleDeleteActivity}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default function ActivitiesPage() {
  return <ProtectedLayout><ActivitiesContent /></ProtectedLayout>
}