'use client'

// ============================================================================
// File: src/app/tasks/page.tsx
// Phase 3: Enhanced tasks page with My/All toggle, filters (status, priority,
// company), sort options, task cards, bulk complete, and kanban columns on
// desktop / stacked lists on phone. Fully responsive.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge } from '../lib/styles'
import type { Task, Company, User, Tenant } from '../lib/types'

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const priorityColor: Record<string, string> = {
  LOW: 'var(--fg-dim)',
  MEDIUM: 'var(--blue)',
  HIGH: 'var(--gold)',
  URGENT: 'var(--rust)',
}

const statusColor: Record<string, string> = {
  PENDING: 'var(--fg-dim)',
  IN_PROGRESS: 'var(--blue)',
  COMPLETED: 'var(--emerald)',
  CANCELLED: 'var(--rust)',
}

type TaskWithRels = Task & {
  company?: { id: string; name: string } | null
  assignee?: { id: string; name: string } | null
}

type SortMode = 'dueDate' | 'priority' | 'created'
type ViewScope = 'my' | 'all'

function TasksContent() {
  const [tasks, setTasks] = useState<TaskWithRels[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [scope, setScope] = useState<ViewScope>('my')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('dueDate')

  // Bulk select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // New task form
  const [showNew, setShowNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    tenantId: '', companyId: '', title: '', description: '',
    priority: 'MEDIUM', status: 'PENDING', assignedToId: '',
    dueDate: '',
  })

  const load = useCallback(async () => {
    try {
      const [tasksRes, coRes, usersRes, tenantsRes, meRes] = await Promise.all([
        apiFetch<{ data: TaskWithRels[] }>('/api/tasks?limit=200'),
        apiFetch<{ data: Company[] }>('/api/companies?limit=100'),
        apiFetch<{ data: User[] }>('/api/admin/users'),
        apiFetch<{ data: Tenant[] }>('/api/admin/tenants'),
        apiFetch<{ user: User }>('/api/auth/me'),
      ])
      setTasks(tasksRes.data || [])
      setCompanies(coRes.data || [])
      setUsers(usersRes.data || [])
      setTenants(tenantsRes.data || [])
      setCurrentUser(meRes.user)
    } catch (err: any) {
      setError(err.message || 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Filtered + sorted tasks
  const filtered = useMemo(() => {
    let result = [...tasks]
    if (scope === 'my' && currentUser) {
      result = result.filter((t) => t.assignedToId === currentUser.id)
    }
    if (statusFilter) result = result.filter((t) => t.status === statusFilter)
    if (priorityFilter) result = result.filter((t) => t.priority === priorityFilter)
    if (companyFilter) result = result.filter((t) => t.companyId === companyFilter)
    // Sort
    const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    switch (sortMode) {
      case 'dueDate':
        result.sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        })
        break
      case 'priority':
        result.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3))
        break
      case 'created':
        result.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
        break
    }
    return result
  }, [tasks, scope, currentUser, statusFilter, priorityFilter, companyFilter, sortMode])

  // Group by status for kanban view
  const kanbanGroups = useMemo(() => {
    const groups: Record<string, TaskWithRels[]> = { PENDING: [], IN_PROGRESS: [], COMPLETED: [], CANCELLED: [] }
    filtered.forEach((t) => {
      if (groups[t.status]) groups[t.status].push(t)
      else groups.PENDING.push(t)
    })
    return groups
  }, [filtered])

  const handleToggleSingle = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    try {
      await apiFetch(`/api/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) })
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)))
    } catch (err: any) { setError(err.message || 'Failed to update task') }
  }

  const handleSelect = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const handleBulkComplete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      await Promise.all(
        ids.map((id) => apiFetch(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'COMPLETED' }) }))
      )
      setTasks((prev) => prev.map((t) => (selectedIds.has(t.id) ? { ...t, status: 'COMPLETED' } : t)))
      setSelectedIds(new Set())
    } catch (err: any) { setError(err.message || 'Failed to bulk complete tasks') }
  }

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.assignedToId || !form.tenantId) {
      setError('Title, assignee, and tenant are required.')
      return
    }
    setSubmitting(true)
    try {
      const body = { ...form, tenantId: form.tenantId || tenants[0]?.id }
      const created = await apiFetch<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(body) })
      setTasks((prev) => [{ ...created, company: companies.find((c) => c.id === form.companyId) ? { id: form.companyId, name: companies.find((c) => c.id === form.companyId)!.name } : null, assignee: { id: form.assignedToId, name: users.find((u) => u.id === form.assignedToId)?.name || '' } } as TaskWithRels, ...prev])
      setShowNew(false)
      setError('')
    } catch (err: any) { setError(err.message || 'Failed to create task') }
    finally { setSubmitting(false) }
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>
  }

  const toolbarStyle: React.CSSProperties = {
    display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16,
  }
  const selectStyle: React.CSSProperties = { ...forms.select, width: 'auto', minWidth: 130 }

  const TaskCard = ({ task }: { task: TaskWithRels }) => {
    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED'
    return (
      <div className="panel-container" style={{
        ...panel.compact,
        opacity: task.status === 'COMPLETED' ? 0.6 : 1,
        borderLeft: `3px solid ${priorityColor[task.priority] || 'var(--fg-dim)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {/* Bulk select checkbox */}
          <input
            type="checkbox"
            checked={selectedIds.has(task.id)}
            onChange={() => handleSelect(task.id)}
            style={{ marginTop: 3, cursor: 'pointer', width: 18, height: 18, accentColor: 'var(--gold)' }}
          />
          {/* Complete checkbox */}
          <input
            type="checkbox"
            checked={task.status === 'COMPLETED'}
            onChange={() => handleToggleSingle(task.id)}
            style={{ marginTop: 3, cursor: 'pointer', width: 18, height: 18, accentColor: 'var(--emerald)' }}
            title="Mark complete"
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: task.status === 'COMPLETED' ? 400 : 600,
              fontSize: 14,
              textDecoration: task.status === 'COMPLETED' ? 'line-through' : 'none',
              color: task.status === 'COMPLETED' ? 'var(--fg-dim)' : 'var(--fg)',
            }}>
              {task.title}
            </div>
            {task.description && (
              <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginTop: 4 }}>{task.description}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={statusBadge(priorityColor[task.priority])}>{task.priority}</span>
              <span style={statusBadge(statusColor[task.status])}>{task.status.replace('_', ' ')}</span>
              {task.dueDate && (
                <span style={{
                  fontSize: 12,
                  color: isOverdue ? 'var(--rust)' : 'var(--fg-dim)',
                  fontWeight: isOverdue ? 600 : 400,
                }}>
                  Due {formatDate(task.dueDate)}
                </span>
              )}
              {task.company && (
                <Link href={`/companies/${task.company.id}`} style={{ fontSize: 12, color: 'var(--fg-dim)', textDecoration: 'none' }}>
                  {task.company.name}
                </Link>
              )}
              {task.assignee && (
                <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>· {task.assignee.name}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const kanbanColumnOrder = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
  const kanbanColumnLabels: Record<string, string> = {
    PENDING: 'Pending',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  }

  return (
    <div style={layout.page}>
      <div style={layout.header}>
        <h1 style={typeography.title}>Tasks</h1>
        <button className="btn-touch" style={buttons.primary} onClick={() => {
          setForm({ tenantId: tenants[0]?.id || '', companyId: '', title: '', description: '', priority: 'MEDIUM', status: 'PENDING', assignedToId: currentUser?.id || '', dueDate: '' })
          setShowNew(true)
        }}>+ New Task</button>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>{error}</div>
      )}

      {/* ── Inline New Task Form ── */}
      {showNew && (
        <div className="panel-container" style={{ ...panel.container, marginBottom: 24 }}>
          <h2 style={{ ...typeography.subtitle, margin: '0 0 16px' }}>New Task</h2>
          <form onSubmit={handleSaveTask} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={forms.group}><span style={forms.label}>Title</span>
              <input className="form-input" style={forms.input} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <div style={forms.row}>
              <label style={forms.group}><span style={forms.label}>Company (optional)</span>
                <select className="form-select" style={forms.select} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                  <option value="">None</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></label>
              <label style={forms.group}><span style={forms.label}>Assignee</span>
                <select className="form-select" style={forms.select} required value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
                  <option value="">Select user</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select></label>
            </div>
            <div style={forms.row}>
              <label style={forms.group}><span style={forms.label}>Priority</span>
                <select className="form-select" style={forms.select} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select></label>
              <label style={forms.group}><span style={forms.label}>Due Date</span>
                <input className="form-input" style={forms.input} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
            </div>
            <label style={forms.group}><span style={forms.label}>Description</span>
              <textarea className="form-textarea" style={forms.textarea} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-touch" style={buttons.secondary} onClick={() => setShowNew(false)}>Cancel</button>
              <button type="submit" className="btn-touch" style={{ ...buttons.primary, opacity: submitting ? 0.6 : 1 }} disabled={submitting}>{submitting ? 'Saving…' : 'Create Task'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Toolbar: Scope Toggle + Filters + Sort ── */}
      <div className="list-toolbar" style={toolbarStyle}>
        {/* My / All toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--panel-border)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => setScope('my')} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            backgroundColor: scope === 'my' ? 'var(--panel-elevated)' : 'transparent',
            color: scope === 'my' ? 'var(--gold)' : 'var(--fg-dim)', border: 'none',
          }}>My Tasks</button>
          <button onClick={() => setScope('all')} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            backgroundColor: scope === 'all' ? 'var(--panel-elevated)' : 'transparent',
            color: scope === 'all' ? 'var(--gold)' : 'var(--fg-dim)', border: 'none',
          }}>All Tasks</button>
        </div>
        <select className="form-select" style={selectStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select className="form-select" style={selectStyle} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">All Priority</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
        <select className="form-select" style={selectStyle} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="">All Companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-select" style={selectStyle} value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
          <option value="dueDate">Due Date</option>
          <option value="priority">Priority</option>
          <option value="created">Created Date</option>
        </select>
      </div>

      {/* ── Bulk Complete Bar ── */}
      {selectedIds.size > 0 && (
        <div className="panel-container" style={{
          ...panel.container,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'rgba(201,169,110,0.08)',
          borderColor: 'var(--gold)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedIds.size} selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-touch" style={buttons.secondary} onClick={() => setSelectedIds(new Set())}>Clear</button>
            <button className="btn-touch" style={buttons.primary} onClick={handleBulkComplete}>✓ Mark Complete</button>
          </div>
        </div>
      )}

      <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginBottom: 16 }}>
        {filtered.length} {filtered.length === 1 ? 'task' : 'tasks'}
      </div>

      {/* ── Kanban Columns (desktop) / Stacked (phone) ── */}
      <div className="task-kanban task-kanban-desktop" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
      }}>
        {kanbanColumnOrder.map((col) => (
          <div key={col} className="kanban-column" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{
              padding: '10px 14px', borderRadius: '8px 8px 0 0',
              backgroundColor: 'var(--bg-soft)', border: '1px solid var(--panel-border)', borderBottom: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{kanbanColumnLabels[col]}</span>
              <span style={{ color: 'var(--fg-dim)', fontSize: 12 }}>{kanbanGroups[col]?.length || 0}</span>
            </div>
            <div style={{
              flex: 1, minHeight: 100, padding: 12,
              backgroundColor: 'var(--bg-soft)', border: '1px solid var(--panel-border)', borderTop: 'none',
              borderRadius: '0 0 8px 8px', display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {kanbanGroups[col]?.length === 0 ? (
                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--fg-dimmer)', fontSize: 13 }}>No tasks</div>
              ) : (
                kanbanGroups[col]?.map((task) => <TaskCard key={task.id} task={task} />)
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Stacked view for phone (same data, different CSS class) ── */}
      <div className="task-kanban task-kanban-phone" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 ? (
          <div className="panel-container" style={{ ...panel.container, textAlign: 'center', color: 'var(--fg-dim)' }}>No tasks found.</div>
        ) : (
          filtered.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  )
}

export default function TasksPage() {
  return <ProtectedLayout><TasksContent /></ProtectedLayout>
}