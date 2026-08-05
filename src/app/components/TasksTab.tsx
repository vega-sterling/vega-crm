'use client'

// ============================================================================
// TasksTab — Tasks tab for company detail page.
// Shows tasks in a list with inline creation, checkbox toggle for completion,
// and status dropdown. No modals.
// ============================================================================

import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { forms, buttons, panel, typeography, table, statusBadge } from '../lib/styles'
import type { Task, User } from '../lib/types'

interface TasksTabProps {
  companyId?: string
  contactId?: string
  tenantId: string
  users: User[]
  currentUserId?: string
  tasks: Task[]
  onTasksChanged: () => void
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'var(--rust)',
  HIGH: 'var(--gold)',
  MEDIUM: 'var(--blue)',
  LOW: 'var(--fg-dim)',
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'var(--fg-dim)',
  IN_PROGRESS: 'var(--blue)',
  COMPLETED: 'var(--emerald)',
  CANCELLED: 'var(--rust)',
}

const formatDate = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TasksTab({ companyId, contactId, tenantId, users, currentUserId, tasks, onTasksChanged }: TasksTabProps) {
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    priority: 'MEDIUM',
    dueDate: '',
    assignedToId: currentUserId || '',
    description: '',
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.assignedToId) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        title: form.title,
        description: form.description || null,
        tenantId,
        assignedToId: form.assignedToId,
        priority: form.priority,
      }
      if (companyId) body.companyId = companyId
      if (contactId) body.contactId = contactId
      if (form.dueDate) body.dueDate = form.dueDate
      await apiFetch<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(body) })
      setForm({ title: '', priority: 'MEDIUM', dueDate: '', assignedToId: currentUserId || '', description: '' })
      setShowForm(false)
      onTasksChanged()
    } catch (err: any) {
      console.error('Failed to create task:', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleComplete = async (task: Task) => {
    setUpdatingId(task.id)
    const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    try {
      await apiFetch<Task>(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      })
      onTasksChanged()
    } catch (err: any) {
      console.error('Failed to update task:', err.message)
    } finally {
      setUpdatingId(null)
    }
  }

  const changeStatus = async (taskId: string, status: string) => {
    setUpdatingId(taskId)
    try {
      await apiFetch<Task>(`/api/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      onTasksChanged()
    } catch (err: any) {
      console.error('Failed to update task status:', err.message)
    } finally {
      setUpdatingId(null)
    }
  }

  const sorted = [...tasks].sort((a, b) => {
    // Completed at bottom, then by due date
    if (a.status === 'COMPLETED' && b.status !== 'COMPLETED') return 1
    if (a.status !== 'COMPLETED' && b.status === 'COMPLETED') return -1
    const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
    const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
    return aDate - bDate
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ ...typeography.subtitle, margin: 0 }}>
          Tasks ({tasks.length})
        </h3>
        <button className="btn-touch" style={buttons.primary} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Close' : '+ New Task'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="panel-container" style={{ ...panel.container, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={forms.group}>
            <span style={forms.label}>Task Title *</span>
            <input className="form-input" style={forms.input} required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="What needs to be done?" autoFocus />
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
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Task details…" />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-touch" style={buttons.secondary} onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn-touch" style={buttons.primary} disabled={submitting || !form.assignedToId}>
              {submitting ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <div className="panel-container" style={panel.container}>
          <p style={{ color: 'var(--fg-dim)' }}>No tasks yet. Click "New Task" to create one.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map((task) => (
            <div
              key={task.id}
              className="panel-container"
              style={{
                ...panel.compact,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                opacity: task.status === 'COMPLETED' ? 0.6 : 1,
              }}
            >
              {/* Checkbox */}
              <button
                className="btn-touch"
                style={{
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  minHeight: 44,
                  minWidth: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                  backgroundColor: task.status === 'COMPLETED' ? 'var(--emerald)' : 'transparent',
                  border: task.status === 'COMPLETED' ? '2px solid var(--emerald)' : '2px solid var(--panel-border-hot)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color: 'var(--bg)',
                  fontWeight: 700,
                  fontSize: 14,
                }}
                disabled={updatingId === task.id}
                onClick={() => toggleComplete(task)}
              >
                {task.status === 'COMPLETED' ? '✓' : ''}
              </button>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 600,
                  textDecoration: task.status === 'COMPLETED' ? 'line-through' : 'none',
                  fontSize: 15,
                }}>
                  {task.title}
                </div>
                {task.description && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.4 }}>
                    {task.description}
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <span style={statusBadge(PRIORITY_COLORS[task.priority])}>{task.priority}</span>
                  <span style={statusBadge(STATUS_COLORS[task.status])}>{task.status.replace('_', ' ')}</span>
                  {task.dueDate && (
                    <span style={{ ...typeography.small, fontSize: 13 }}>
                      📅 {formatDate(task.dueDate)}
                    </span>
                  )}
                  {task.assignee && (
                    <span style={{ ...typeography.small, fontSize: 13 }}>
                      👤 {task.assignee.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Status dropdown */}
              <select
                className="form-select"
                style={{
                  ...forms.select,
                  width: 'auto',
                  minWidth: 130,
                  flexShrink: 0,
                  padding: '6px 8px',
                  fontSize: 13,
                }}
                value={task.status}
                disabled={updatingId === task.id}
                onChange={(e) => changeStatus(task.id, e.target.value)}
              >
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}