'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import InlineNoteComposer from '../../components/InlineNoteComposer'
import QuickActionBar from '../../components/QuickActionBar'
import TimelineFilterTabs, { type TimelineFilter } from '../../components/TimelineFilterTabs'
import ActivityCard from '../../components/ActivityCard'
import PinnedNotes, { usePinnedNote } from '../../components/PinnedNotes'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge } from '../../lib/styles'
import type { Deal, PipelineStage, Company, Contact, User, Activity, Task, EmailMessage } from '../../lib/types'

const currencyFmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const formatDate = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatDateTime = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'var(--blue)',
  WON: 'var(--emerald)',
  LOST: 'var(--rust)',
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'var(--rust)',
  HIGH: 'var(--gold)',
  MEDIUM: 'var(--blue)',
  LOW: 'var(--fg-dim)',
}

const TASK_STATUS_COLORS: Record<string, string> = {
  PENDING: 'var(--fg-dim)',
  IN_PROGRESS: 'var(--blue)',
  COMPLETED: 'var(--emerald)',
  CANCELLED: 'var(--rust)',
}

function DealDetailContent() {
  const params = useParams()
  const router = useRouter()
  const dealId = params.id as string

  const [deal, setDeal] = useState<Deal | null>(null)
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [emails, setEmails] = useState<EmailMessage[]>([])
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('ALL')

  // Pinned notes hook
  const { pinnedId, pin, unpin } = usePinnedNote('deal', dealId)

  const [form, setForm] = useState<{
    title: string
    value: number
    currency: string
    probability: number
    stageId: string
    assignedToId: string
    companyId: string
    contactId: string
    expectedCloseDate: string
    description: string
    status: 'OPEN' | 'WON' | 'LOST'
  }>({
    title: '',
    value: 0,
    currency: 'USD',
    probability: 0,
    stageId: '',
    assignedToId: '',
    companyId: '',
    contactId: '',
    expectedCloseDate: '',
    description: '',
    status: 'OPEN',
  })

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Fetch deal, users, and stages — the deal itself is the critical path
      const [dealRes, usersRes, stagesRes] = await Promise.all([
        apiFetch<Deal>(`/api/deals/${dealId}`),
        apiFetch<{ data: User[] }>('/api/admin/users').catch(() => ({ data: [] as User[] })),
        apiFetch<{ data: PipelineStage[] }>('/api/pipeline-stages').catch(() => ({ data: [] as PipelineStage[] })),
      ])
      setDeal(dealRes)
      setUsers(usersRes.data || [])
      setStages(stagesRes.data || [])

      // Get current user id from /api/auth/me
      try {
        const me = await apiFetch<User>('/api/auth/me')
        setCurrentUserId(me.id)
      } catch {}

      if (!dealRes) {
        setError('Deal not found')
        setLoading(false)
        return
      }

      // Fetch activities, tasks, emails, companies, contacts in parallel
      // — each fetch is independent and gracefully handles failure
      const [activitiesRes, tasksRes, emailsRes, companiesRes, contactsRes] = await Promise.all([
        apiFetch<{ data: Activity[] }>(`/api/activities?dealId=${dealId}&limit=100`).catch(() => ({ data: [] as Activity[] })),
        apiFetch<{ data: Task[] }>(`/api/tasks?companyId=${dealRes.companyId}&limit=100`).catch(() => ({ data: [] as Task[] })),
        apiFetch<{ data: EmailMessage[] }>(`/api/email/messages?dealId=${dealId}&limit=50`).catch(() => ({ data: [] as EmailMessage[] })),
        apiFetch<{ data: Company[] }>('/api/companies').catch(() => ({ data: [] as Company[] })),
        apiFetch<{ data: Contact[] }>(`/api/contacts?companyId=${dealRes.companyId}&limit=100`).catch(() => ({ data: [] as Contact[] })),
      ])

      setActivities(activitiesRes.data || [])
      setTasks(tasksRes.data || [])
      setEmails(emailsRes.data || [])
      setCompanies(companiesRes.data || [])
      setContacts(contactsRes.data || [])

      // Populate form
      setForm({
        title: dealRes.title || '',
        value: dealRes.value || 0,
        currency: dealRes.currency || 'USD',
        probability: dealRes.probability || 0,
        stageId: dealRes.stageId || '',
        assignedToId: dealRes.assignedToId || '',
        companyId: dealRes.companyId || '',
        contactId: dealRes.contactId || '',
        expectedCloseDate: dealRes.expectedCloseDate ? new Date(dealRes.expectedCloseDate).toISOString().slice(0, 10) : '',
        description: dealRes.description || '',
        status: dealRes.status || 'OPEN',
      })
    } catch (err: any) {
      console.error('Failed to load deal:', err)
      setError(err.message || 'Failed to load deal')
    } finally {
      setLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // ── Timeline filtering ──
  const timelineCounts = useMemo(() => {
    const counts: Record<TimelineFilter, number> = { ALL: 0, NOTE: 0, CALL: 0, EMAIL: 0, TASK: 0, MEETING: 0 }
    for (const a of activities) {
      counts.ALL++
      if (counts[a.type] !== undefined) counts[a.type]++
    }
    return counts
  }, [activities])

  const filteredActivities = useMemo(() => {
    // Pinned note always shows at top (if present in activities list)
    if (timelineFilter === 'ALL') return activities
    return activities.filter((a) => a.type === timelineFilter)
  }, [activities, timelineFilter])

  const pinnedActivity = pinnedId ? activities.find((a) => a.id === pinnedId) : null

  const handlePinToggle = (id: string) => {
    if (pinnedId === id) {
      unpin()
    } else {
      pin(id)
    }
  }

  // ── Handlers ──
  const handleNoteCreated = (activity: Activity) => {
    setActivities((prev) => [activity, ...prev])
  }

  const handleActivityCreated = (activity: Activity) => {
    setActivities((prev) => [activity, ...prev])
  }

  const handleTaskCreated = (task: Task) => {
    setTasks((prev) => [task, ...prev])
  }

  const handleActivityDelete = async (id: string) => {
    if (!confirm('Delete this activity? This cannot be undone.')) return
    try {
      await apiFetch(`/api/activities/${id}`, { method: 'DELETE' })
      setActivities((prev) => prev.filter((a) => a.id !== id))
      if (pinnedId === id) unpin()
    } catch (err: any) {
      alert('Failed to delete: ' + err.message)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.stageId || !form.assignedToId || !form.companyId) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        title: form.title,
        value: form.value,
        currency: form.currency,
        probability: form.probability,
        stageId: form.stageId,
        assignedToId: form.assignedToId,
        companyId: form.companyId,
        contactId: form.contactId || null,
        description: form.description || null,
        status: form.status,
      }
      if (form.expectedCloseDate) body.expectedCloseDate = form.expectedCloseDate
      const updated = await apiFetch<Deal>(`/api/deals/${dealId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      setDeal(updated)
      setEditing(false)
    } catch (err: any) {
      alert('Failed to save: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this deal? This cannot be undone.')) return
    try {
      await apiFetch(`/api/deals/${dealId}`, { method: 'DELETE' })
      router.push('/deals')
    } catch (err: any) {
      alert('Failed to delete: ' + err.message)
    }
  }

  const handleStageChange = async (newStageId: string) => {
    if (!deal || newStageId === deal.stageId) return
    try {
      const updated = await apiFetch<Deal>(`/api/deals/${dealId}`, {
        method: 'PUT',
        body: JSON.stringify({ stageId: newStageId }),
      })
      setDeal(updated)
      // Update probability to match stage default
      const stage = stages.find((s) => s.id === newStageId)
      if (stage) setForm((f) => ({ ...f, stageId: newStageId, probability: stage.probability }))
    } catch (err: any) {
      alert('Failed to change stage: ' + err.message)
    }
  }

  // Quick stage change dropdown
  const handleStatusChange = async (newStatus: 'OPEN' | 'WON' | 'LOST') => {
    if (!deal || newStatus === deal.status) return
    try {
      const updated = await apiFetch<Deal>(`/api/deals/${dealId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      })
      setDeal(updated)
      setForm((f) => ({ ...f, status: newStatus }))
    } catch (err: any) {
      alert('Failed to change status: ' + err.message)
    }
  }

  if (loading) {
    return (
      <ProtectedLayout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <Spinner />
        </div>
      </ProtectedLayout>
    )
  }

  if (error || !deal) {
    return (
      <ProtectedLayout>
        <div style={{ ...panel.container, textAlign: 'center' }}>
          <p style={{ ...typeography.title, color: 'var(--rust)' }}>{error || 'Deal not found'}</p>
          <Link href="/deals" style={{ color: 'var(--gold)', fontSize: 16 }}>← Back to Deals</Link>
        </div>
      </ProtectedLayout>
    )
  }

  // ── Edit Mode ──
  if (editing) {
    return (
      <ProtectedLayout>
        <div style={{ ...layout.page, maxWidth: 800 }}>
          <div style={layout.header}>
            <h1 style={{ ...typeography.title, margin: 0 }}>Edit Deal</h1>
            <button className="btn-touch" style={buttons.secondary} onClick={() => setEditing(false)}>Cancel</button>
          </div>
          <form onSubmit={handleSave} style={{ ...panel.container, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={forms.group}>
              <span style={forms.label}>Title *</span>
              <input className="form-input" style={forms.input} required value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Value</span>
                <input className="form-input" style={forms.input} type="number" value={form.value}
                  onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Currency</span>
                <select className="form-select" style={forms.select} value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Probability (%)</span>
                <input className="form-input" style={forms.input} type="number" min={0} max={100} value={form.probability}
                  onChange={(e) => setForm({ ...form, probability: parseInt(e.target.value, 10) || 0 })} />
              </label>
            </div>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Stage *</span>
                <select className="form-select" style={forms.select} required value={form.stageId}
                  onChange={(e) => setForm({ ...form, stageId: e.target.value })}>
                  <option value="">Select…</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Status</span>
                <select className="form-select" style={forms.select} value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as 'OPEN' | 'WON' | 'LOST' })}>
                  <option value="OPEN">Open</option>
                  <option value="WON">Won</option>
                  <option value="LOST">Lost</option>
                </select>
              </label>
            </div>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Company *</span>
                <select className="form-select" style={forms.select} required value={form.companyId}
                  onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                  <option value="">Select…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Contact</span>
                <select className="form-select" style={forms.select} value={form.contactId}
                  onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
                  <option value="">None</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Assignee *</span>
                <select className="form-select" style={forms.select} required value={form.assignedToId}
                  onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
                  <option value="">Select…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Expected Close Date</span>
                <input className="form-input" style={forms.input} type="date" value={form.expectedCloseDate}
                  onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} />
              </label>
            </div>
            <label style={forms.group}>
              <span style={forms.label}>Description</span>
              <textarea className="form-textarea" style={forms.textarea} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-touch" style={buttons.danger} onClick={handleDelete}>Delete Deal</button>
              <button type="submit" className="btn-touch" style={buttons.primary} disabled={submitting}>
                {submitting ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </ProtectedLayout>
    )
  }

  // ── View Mode: HubSpot-style 3-column layout ──
  const openTasks = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
  const dealCompany = deal.company
  const dealContact = deal.contact
  const dealStage = deal.stage
  const dealAssignee = deal.assignee

  // Weighted value for forecasting
  const weightedValue = (deal.value || 0) * (deal.probability || 0) / 100

  return (
    <ProtectedLayout>
      <div style={{ ...layout.page, maxWidth: 1400 }}>
        {/* ── Header ── */}
        <div className="page-header" style={{ ...layout.header, marginBottom: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <Link href="/deals" style={{ color: 'var(--fg-dim)', fontSize: 14, textDecoration: 'none' }}>← Deals</Link>
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{deal.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              <span style={{ ...statusBadge(STATUS_COLORS[deal.status] || 'var(--blue)'), fontSize: 13 }}>
                {deal.status}
              </span>
              <span style={{ ...statusBadge(dealStage?.color || 'var(--gold)'), fontSize: 13 }}>
                {dealStage?.name || '—'}
              </span>
              <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--gold)' }}>
                {currencyFmt(deal.value, deal.currency)}
              </span>
              <span style={{ ...typeography.muted, fontSize: 13 }}>
                {deal.probability}% prob · {currencyFmt(weightedValue, deal.currency)} weighted
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-touch" style={buttons.secondary} onClick={() => setEditing(true)}>✏️ Edit</button>
          </div>
        </div>

        {/* ── 3-column layout ── */}
        <div className="record-3col" style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: '280px 1fr 320px',
          alignItems: 'start',
        }}>
          {/* ── LEFT: Properties ── */}
          <div className="record-left" style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 88 }}>
            {/* Deal Properties */}
            <div className="panel-container" style={panel.container}>
              <h2 style={{ ...typeography.subtitle, fontSize: 16, marginBottom: 16 }}>Deal Properties</h2>

              {/* Quick stage changer */}
              <div style={{ marginBottom: 16 }}>
                <span style={forms.label}>Stage</span>
                <select
                  className="form-select"
                  style={{ ...forms.select, marginTop: 4 }}
                  value={deal.stageId}
                  onChange={(e) => handleStageChange(e.target.value)}
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Quick status changer */}
              <div style={{ marginBottom: 16 }}>
                <span style={forms.label}>Status</span>
                <select
                  className="form-select"
                  style={{ ...forms.select, marginTop: 4 }}
                  value={deal.status}
                  onChange={(e) => handleStatusChange(e.target.value as 'OPEN' | 'WON' | 'LOST')}
                >
                  <option value="OPEN">Open</option>
                  <option value="WON">Won</option>
                  <option value="LOST">Lost</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <span style={forms.label}>Value</span>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)', marginTop: 4 }}>
                    {currencyFmt(deal.value, deal.currency)}
                  </div>
                </div>
                <div>
                  <span style={forms.label}>Probability</span>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{deal.probability}%</div>
                </div>
                <div>
                  <span style={forms.label}>Weighted Value</span>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, color: 'var(--blue)' }}>
                    {currencyFmt(weightedValue, deal.currency)}
                  </div>
                </div>
                <div>
                  <span style={forms.label}>Expected Close</span>
                  <div style={{ fontSize: 14, marginTop: 4 }}>{formatDate(deal.expectedCloseDate)}</div>
                </div>
                <div>
                  <span style={forms.label}>Actual Close</span>
                  <div style={{ fontSize: 14, marginTop: 4 }}>{formatDate(deal.actualCloseDate)}</div>
                </div>
                <div>
                  <span style={forms.label}>Lead Source</span>
                  <div style={{ fontSize: 14, marginTop: 4 }}>{deal.leadSource || '—'}</div>
                </div>
                <div>
                  <span style={forms.label}>Assignee</span>
                  <div style={{ fontSize: 14, marginTop: 4 }}>{dealAssignee?.name || '—'}</div>
                </div>
                <div>
                  <span style={forms.label}>Created</span>
                  <div style={{ fontSize: 14, marginTop: 4 }}>{formatDate(deal.createdAt)}</div>
                </div>
              </div>
            </div>

            {/* Description */}
            {deal.description && (
              <div className="panel-container" style={panel.container}>
                <h2 style={{ ...typeography.subtitle, fontSize: 16, marginBottom: 12 }}>Description</h2>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--fg)', whiteSpace: 'pre-wrap' }}>
                  {deal.description}
                </p>
              </div>
            )}
          </div>

          {/* ── MIDDLE: Timeline ── */}
          <div className="record-middle" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {/* Inline note composer */}
            <InlineNoteComposer
              companyId={deal.companyId}
              tenantId={deal.tenantId}
              dealId={dealId}
              contactId={deal.contactId || undefined}
              onCreated={handleNoteCreated}
              users={users}
            />

            {/* Quick action bar */}
            <QuickActionBar
              companyId={deal.companyId}
              tenantId={deal.tenantId}
              dealId={dealId}
              contactId={deal.contactId || undefined}
              contactName={dealContact ? `${dealContact.firstName} ${dealContact.lastName}` : undefined}
              contactEmail={contacts.find((c) => c.id === deal.contactId)?.email}
              users={users}
              onActivityCreated={handleActivityCreated}
              onTaskCreated={handleTaskCreated}
              onSendEmail={() => {/* email handled elsewhere */}}
            />

            {/* Timeline filter tabs */}
            <TimelineFilterTabs
              active={timelineFilter}
              onChange={setTimelineFilter}
              counts={timelineCounts}
            />

            {/* Pinned note */}
            {pinnedActivity && timelineFilter === 'ALL' && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>📌</span>
                  <span style={{ ...typeography.subtitle, margin: 0, fontSize: 15 }}>Pinned Note</span>
                </div>
                <div style={{ border: '2px solid var(--gold)', borderRadius: 12, overflow: 'hidden' }}>
                  <ActivityCard
                    activity={pinnedActivity}
                    users={users}
                    pinned={true}
                    onPin={handlePinToggle}
                    onDelete={handleActivityDelete}
                  />
                </div>
              </div>
            )}

            {/* Activity timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredActivities.length === 0 ? (
                <div className="panel-container" style={{ ...panel.container, textAlign: 'center' }}>
                  <p style={{ ...typeography.muted, fontSize: 14 }}>
                    {timelineFilter === 'ALL'
                      ? 'No activities yet. Write a note above to get started.'
                      : `No ${timelineFilter.toLowerCase()}s yet.`}
                  </p>
                </div>
              ) : (
                filteredActivities.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    users={users}
                    pinned={pinnedId === activity.id}
                    onPin={handlePinToggle}
                    onDelete={handleActivityDelete}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── RIGHT: Associated records ── */}
          <div className="record-right" style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 88 }}>
            {/* Company */}
            <div className="panel-container" style={{ ...panel.compact, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--fg-dimmer)' }}>▶</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Company</span>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {dealCompany ? (
                  <Link
                    href={`/companies/${dealCompany.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 8,
                      textDecoration: 'none', color: 'var(--fg)',
                      border: '1px solid var(--panel-border)',
                      fontWeight: 600, fontSize: 14,
                    }}
                  >
                    🏢 {dealCompany.name}
                  </Link>
                ) : (
                  <p style={{ ...typeography.muted, fontSize: 13 }}>No company linked.</p>
                )}
              </div>
            </div>

            {/* Contact */}
            <div className="panel-container" style={{ ...panel.compact, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--fg-dimmer)' }}>▶</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Contact</span>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {dealContact ? (
                  <Link
                    href={`/contacts/${dealContact.id}`}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 2,
                      padding: '8px 10px', borderRadius: 8,
                      textDecoration: 'none', color: 'var(--fg)',
                      border: '1px solid var(--panel-border)',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{dealContact.firstName} {dealContact.lastName}</span>
                  </Link>
                ) : (
                  <p style={{ ...typeography.muted, fontSize: 13 }}>No contact linked.</p>
                )}
              </div>
            </div>

            {/* Open Tasks */}
            <div className="panel-container" style={{ ...panel.compact, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--fg-dimmer)' }}>▶</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Open Tasks</span>
                {openTasks.length > 0 && (
                  <span style={{
                    backgroundColor: 'var(--panel-elevated)', color: 'var(--fg-dim)',
                    borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600,
                  }}>{openTasks.length}</span>
                )}
              </div>
              <div style={{ padding: '12px 16px' }}>
                {openTasks.length === 0 ? (
                  <p style={{ ...typeography.muted, fontSize: 13 }}>No open tasks.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {openTasks.slice(0, 5).map((t) => (
                      <div key={t.id} style={{
                        display: 'flex', flexDirection: 'column', gap: 4,
                        padding: '8px 10px', borderRadius: 8,
                        border: '1px solid var(--panel-border)',
                      }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ ...statusBadge(PRIORITY_COLORS[t.priority] || 'var(--fg-dim)'), fontSize: 11 }}>
                            {t.priority}
                          </span>
                          <span style={{ ...statusBadge(TASK_STATUS_COLORS[t.status] || 'var(--fg-dim)'), fontSize: 11 }}>
                            {t.status.replace('_', ' ')}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                            Due {formatDate(t.dueDate)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Emails */}
            <div className="panel-container" style={{ ...panel.compact, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--fg-dimmer)' }}>▶</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Recent Emails</span>
                {emails.length > 0 && (
                  <span style={{
                    backgroundColor: 'var(--panel-elevated)', color: 'var(--fg-dim)',
                    borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600,
                  }}>{emails.length}</span>
                )}
              </div>
              <div style={{ padding: '12px 16px' }}>
                {emails.length === 0 ? (
                  <p style={{ ...typeography.muted, fontSize: 13 }}>No emails tracked.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {emails.slice(0, 5).map((em) => (
                      <div key={em.id} style={{
                        display: 'flex', flexDirection: 'column', gap: 4,
                        padding: '8px 10px', borderRadius: 8,
                        border: '1px solid var(--panel-border)',
                      }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>
                          {em.direction === 'OUTBOUND' ? '↗' : '↙'} {em.subject}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                          {formatDateTime(em.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  )
}

export default function DealDetailPage() {
  return <DealDetailContent />
}