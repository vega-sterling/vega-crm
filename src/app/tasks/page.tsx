'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge } from '../lib/styles'
import type { Task, Company, User } from '../lib/types'

type TaskStatus = Task['status']
type TaskPriority = Task['priority']

const statuses: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

const statusLabels: Record<TaskStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const statusColor: Record<TaskStatus, string> = {
  PENDING: 'var(--gold)',
  IN_PROGRESS: 'var(--blue)',
  COMPLETED: 'var(--emerald)',
  CANCELLED: 'var(--fg-dim)',
}

const priorityColor: Record<TaskPriority, string> = {
  LOW: 'var(--fg-dim)',
  MEDIUM: 'var(--blue)',
  HIGH: 'var(--gold)',
  URGENT: 'var(--rust)',
}

interface TaskListResponse {
  data: Task[]
}

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const emptyForm = {
  title: '',
  description: '',
  companyId: '',
  contactId: '',
  priority: 'MEDIUM' as TaskPriority,
  assignedToId: '',
  dueDate: '',
  tenantId: '',
}

/**
 * TasksPage — kanban-style task board with 4 status columns, new task modal, edit, and delete.
 */
function TasksContent() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({ ...emptyForm })

  const load = useCallback(async () => {
    try {
      const [tasksRes, companiesRes, usersRes] = await Promise.all([
        apiFetch<TaskListResponse>('/api/tasks'),
        apiFetch<{ data: Company[] }>('/api/companies'),
        apiFetch<{ data: User[] }>('/api/admin/users'),
      ])
      setTasks(Array.isArray(tasksRes) ? tasksRes : tasksRes.data || [])
      setCompanies(Array.isArray(companiesRes) ? companiesRes : companiesRes.data || [])
      setUsers(Array.isArray(usersRes) ? usersRes : usersRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const companyMap = new Map(companies.map((c) => [c.id, c]))

  const openNew = () => {
    setEditingTask(null)
    setForm({ ...emptyForm })
    setModalOpen(true)
  }

  const openEdit = (task: Task) => {
    setEditingTask(task)
    setForm({
      title: task.title,
      description: task.description || '',
      companyId: task.companyId,
      contactId: task.contactId || '',
      priority: task.priority,
      assignedToId: task.assignedToId,
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '',
      tenantId: task.tenantId,
    })
    setModalOpen(true)
  }

  const handleDelete = async (task: Task) => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return
    try {
      await apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
    } catch (err: any) {
      setError(err.message || 'Failed to delete task')
    }
  }

  const handleCompanyChange = (companyId: string) => {
    const company = companyMap.get(companyId)
    setForm((prev) => ({
      ...prev,
      companyId,
      contactId: '',
      tenantId: company?.tenantId || '',
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const body: any = {
        title: form.title,
        description: form.description,
        companyId: form.companyId,
        tenantId: form.tenantId,
        priority: form.priority,
        assignedToId: form.assignedToId,
      }
      if (form.contactId) body.contactId = form.contactId
      if (form.dueDate) body.dueDate = form.dueDate
      if (editingTask) {
        const updated = await apiFetch<Task>(`/api/tasks/${editingTask.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      } else {
        const created = await apiFetch<Task>('/api/tasks', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        setTasks((prev) => [created, ...prev])
      }
      setModalOpen(false)
      setEditingTask(null)
      setForm({ ...emptyForm })
    } catch (err: any) {
      setError(err.message || `Failed to ${editingTask ? 'update' : 'create'} task`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div style={layout.page}>
      <div style={layout.header}>
        <h1 style={typeography.title}>Tasks</h1>
        <button style={buttons.primary} onClick={openNew}>New Task</button>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div style={layout.board}>
        {statuses.map((status) => (
          <div key={status} style={layout.column}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
                padding: '0 4px',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: statusColor[status],
                }}
              />
              <span style={{ fontWeight: 700, fontSize: 14 }}>{statusLabels[status]}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--fg-dim)', fontSize: 13 }}>
                {tasks.filter((t) => t.status === status).length}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                minHeight: 120,
                padding: 12,
                backgroundColor: 'var(--bg-soft)',
                border: '1px solid var(--panel-border)',
                borderRadius: 12,
              }}
            >
              {tasks
                .filter((t) => t.status === status)
                .map((t) => (
                  <div key={t.id} style={panel.compact}>
                    <Link href={`/tasks/${t.id}`} style={{ fontWeight: 600, color: 'var(--fg)', display: 'block', marginBottom: 8 }}>
                      {t.title}
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={statusBadge(priorityColor[t.priority])}>{t.priority}</span>
                      <span style={{ color: 'var(--fg-dim)', fontSize: 12 }}>Due {formatDate(t.dueDate)}</span>
                    </div>
                    <div style={{ color: 'var(--fg-dim)', fontSize: 13 }}>
                      👤 {t.assignee?.name || 'Unassigned'}
                    </div>
                    {t.company && (
                      <div style={{ marginTop: 8, fontSize: 13 }}>
                        <Link href={`/companies/${t.company.id}`} style={{ color: 'var(--gold)' }}>
                          {t.company.name}
                        </Link>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button style={buttons.small} onClick={() => openEdit(t)}>Edit</button>
                      <button style={buttons.danger} onClick={() => handleDelete(t)}>Delete</button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 24,
          }}
          onClick={() => setModalOpen(false)}
        >
          <div style={{ ...panel.container, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>{editingTask ? 'Edit Task' : 'New Task'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Title</span>
                <input style={forms.input} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </label>

              <label style={forms.group}>
                <span style={forms.label}>Description</span>
                <textarea style={forms.textarea} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>

              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Company</span>
                  <select
                    style={forms.select}
                    required
                    value={form.companyId}
                    onChange={(e) => handleCompanyChange(e.target.value)}
                  >
                    <option value="">Select company</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Priority</span>
                  <select
                    style={forms.select}
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </label>
              </div>

              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Assignee</span>
                  <select
                    style={forms.select}
                    required
                    value={form.assignedToId}
                    onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
                  >
                    <option value="">Select user</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Due date</span>
                  <input
                    style={forms.input}
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  />
                </label>
              </div>

              <input type="hidden" value={form.tenantId} />

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : editingTask ? 'Save Changes' : 'Save Task'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TasksPage() {
  return (
    <ProtectedLayout>
      <TasksContent />
    </ProtectedLayout>
  )
}
