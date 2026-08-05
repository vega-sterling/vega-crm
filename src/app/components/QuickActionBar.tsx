'use client'

// ============================================================================
// QuickActionBar — Inline action buttons above the timeline.
// Log Call, Create Task, Send Email, Schedule Meeting.
// Each opens an inline form (not a modal) directly below the bar.
// ============================================================================

import { useState, useRef, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { forms, buttons, panel, typeography } from '../lib/styles'
import type { Activity, Task, User } from '../lib/types'

type ActionType = 'call' | 'task' | 'email' | 'meeting' | null

interface QuickActionBarProps {
  companyId: string
  tenantId: string
  contactId?: string
  dealId?: string
  contactName?: string
  contactEmail?: string
  users: User[]
  onActivityCreated: (a: Activity) => void
  onTaskCreated: (t: Task) => void
  onSendEmail: () => void
}

// ── Sub-components for inline forms ──

function CallForm({ companyId, tenantId, contactId, dealId, onCreated, onCancel }: {
  companyId: string; tenantId: string; contactId?: string; dealId?: string
  onCreated: (a: Activity) => void; onCancel: () => void
}) {
  const [form, setForm] = useState({
    subject: '', direction: 'OUTBOUND', outcome: '', duration: '', notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.subject.trim()) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        type: 'CALL',
        subject: form.subject,
        description: form.notes || null,
        companyId, tenantId,
        callDirection: form.direction,
        callOutcome: form.outcome || null,
        callDuration: form.duration ? parseInt(form.duration, 10) : null,
      }
      if (contactId) body.contactId = contactId
      if (dealId) body.dealId = dealId
      const created = await apiFetch<Activity>('/api/activities', {
        method: 'POST', body: JSON.stringify(body),
      })
      onCreated(created)
    } catch (err: any) {
      console.error('Failed to log call:', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="quick-action-form" style={{ ...panel.container, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
        <button type="submit" className="btn-touch" style={buttons.primary} disabled={submitting}>
          {submitting ? 'Saving…' : 'Log Call'}
        </button>
      </div>
    </form>
  )
}

function MeetingForm({ companyId, tenantId, contactId, dealId, onCreated, onCancel }: {
  companyId: string; tenantId: string; contactId?: string; dealId?: string
  onCreated: (a: Activity) => void; onCancel: () => void
}) {
  const [form, setForm] = useState({ subject: '', scheduledAt: '', description: '' })
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.subject.trim()) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        type: 'MEETING',
        subject: form.subject,
        description: form.description || null,
        companyId, tenantId,
      }
      if (contactId) body.contactId = contactId
      if (dealId) body.dealId = dealId
      if (form.scheduledAt) body.scheduledAt = form.scheduledAt
      const created = await apiFetch<Activity>('/api/activities', {
        method: 'POST', body: JSON.stringify(body),
      })
      onCreated(created)
    } catch (err: any) {
      console.error('Failed to schedule meeting:', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="quick-action-form" style={{ ...panel.container, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
        <button type="submit" className="btn-touch" style={buttons.primary} disabled={submitting}>
          {submitting ? 'Saving…' : 'Schedule Meeting'}
        </button>
      </div>
    </form>
  )
}

function TaskForm({ companyId, tenantId, contactId, users, currentUserId, onCreated, onCancel }: {
  companyId: string; tenantId: string; contactId?: string
  users: User[]; currentUserId?: string
  onCreated: (t: Task) => void; onCancel: () => void
}) {
  const [form, setForm] = useState({
    title: '', priority: 'MEDIUM', dueDate: '', assignedToId: currentUserId || '', description: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.assignedToId) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        title: form.title,
        description: form.description || null,
        companyId, tenantId,
        assignedToId: form.assignedToId,
        priority: form.priority,
      }
      if (contactId) body.contactId = contactId
      if (form.dueDate) body.dueDate = form.dueDate
      const created = await apiFetch<Task>('/api/tasks', {
        method: 'POST', body: JSON.stringify(body),
      })
      onCreated(created)
    } catch (err: any) {
      console.error('Failed to create task:', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="quick-action-form" style={{ ...panel.container, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={forms.group}>
        <span style={forms.label}>Task Title *</span>
        <input className="form-input" style={forms.input} required value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What needs to be done?" />
      </label>
      <div className="form-grid" style={forms.row}>
        <label style={forms.group}>
          <span style={forms.label}>Priority</span>
          <select className="form-select" style={forms.select} value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </label>
        <label style={forms.group}>
          <span style={forms.label}>Due Date</span>
          <input className="form-input" style={forms.input} type="date" value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </label>
      </div>
      <label style={forms.group}>
        <span style={forms.label}>Assignee *</span>
        <select className="form-select" style={forms.select} required value={form.assignedToId}
          onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
          <option value="">Select…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
          ))}
        </select>
      </label>
      <label style={forms.group}>
        <span style={forms.label}>Description</span>
        <textarea className="form-textarea" style={forms.textarea} value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Task details…" />
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-touch" style={buttons.secondary} onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-touch" style={buttons.primary} disabled={submitting || !form.assignedToId}>
          {submitting ? 'Creating…' : 'Create Task'}
        </button>
      </div>
    </form>
  )
}

// ── Main QuickActionBar component ──

export default function QuickActionBar({
  companyId, tenantId, contactId, dealId, contactName, contactEmail,
  users, onActivityCreated, onTaskCreated, onSendEmail,
}: QuickActionBarProps) {
  const [activeAction, setActiveAction] = useState<ActionType>(null)
  const formRef = useRef<HTMLDivElement>(null)

  // Close form on outside click
  useEffect(() => {
    if (!activeAction) return
    const handler = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        // Only close if clicking outside the entire quick-action area
        const target = e.target as HTMLElement
        if (!target.closest('.quick-action-bar')) {
          setActiveAction(null)
        }
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [activeAction])

  const actionBtn = (label: string, icon: string, action: ActionType) => ({
    label, icon, action,
  })

  const actions = [
    actionBtn('Log Call', '📞', 'call'),
    actionBtn('Create Task', '☑️', 'task'),
    actionBtn('Send Email', '✉️', 'email'),
    actionBtn('Schedule Meeting', '🤝', 'meeting'),
  ]

  return (
    <div className="quick-action-bar" ref={formRef}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {actions.map((a) => (
          <button
            key={a.action}
            className="btn-touch quick-action-btn"
            style={{
              ...buttons.secondary,
              backgroundColor: activeAction === a.action ? 'var(--panel-elevated)' : 'transparent',
              borderColor: activeAction === a.action ? 'var(--gold)' : 'var(--panel-border)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 14,
            }}
            onClick={() => {
              if (a.action === 'email') {
                onSendEmail()
                setActiveAction(null)
              } else {
                setActiveAction(activeAction === a.action ? null : a.action)
              }
            }}
          >
            <span style={{ fontSize: 16 }}>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>

      {activeAction === 'call' && (
        <CallForm
          companyId={companyId} tenantId={tenantId} contactId={contactId} dealId={dealId}
          onCreated={(a) => { onActivityCreated(a); setActiveAction(null) }}
          onCancel={() => setActiveAction(null)}
        />
      )}

      {activeAction === 'meeting' && (
        <MeetingForm
          companyId={companyId} tenantId={tenantId} contactId={contactId} dealId={dealId}
          onCreated={(a) => { onActivityCreated(a); setActiveAction(null) }}
          onCancel={() => setActiveAction(null)}
        />
      )}

      {activeAction === 'task' && (
        <TaskForm
          companyId={companyId} tenantId={tenantId} contactId={contactId}
          users={users}
          onCreated={(t) => { onTaskCreated(t); setActiveAction(null) }}
          onCancel={() => setActiveAction(null)}
        />
      )}
    </div>
  )
}