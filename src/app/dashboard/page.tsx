'use client'

// ============================================================================
// File: src/app/dashboard/page.tsx
// Description: Modern sales command center dashboard.
//              KPI cards, recent activity feed, my tasks widget, deals
//              pipeline summary, quick actions panel.
//              Phase 1-3 UI/UX: SVG icons, empty state CTAs, depth shadows.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import {
  IconBuilding, IconUsers, IconDiamond, IconCheckSquare,
  IconActivity, IconMail, IconPhone, IconPlus,
  IconTrendingUp, IconTrendingDown,
} from '../components/Icons'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, statusBadge, statusDot, buttons } from '../lib/styles'
import type { Activity, Task, Deal, PipelineStage, User } from '../lib/types'

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const formatCurrency = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const activityColor: Record<string, string> = {
  CALL: 'var(--blue)',
  EMAIL: 'var(--emerald)',
  NOTE: 'var(--gold)',
  MEETING: 'var(--violet)',
  TASK: 'var(--cyan)',
}

const activityIconMap: Record<string, React.FC<{ size?: number }>> = {
  CALL: IconPhone,
  EMAIL: IconMail,
  NOTE: IconActivity,
  MEETING: IconUsers,
  TASK: IconCheckSquare,
}

const priorityColor: Record<string, string> = {
  LOW: 'var(--fg-dim)',
  MEDIUM: 'var(--blue)',
  HIGH: 'var(--gold)',
  URGENT: 'var(--rust)',
}

interface DashboardData {
  counts: {
    companies: number
    contacts: number
    activities: number
    tasks: number
    pendingTasks: number
    completedTasks: number
  }
  recentActivities: (Activity & {
    company?: { id: string; name: string }
    contact?: { id: string; firstName: string; lastName: string }
    user?: { id: string; name: string }
  })[]
  taskSummary: { status: string; count: number }[]
}

interface DealsResponse {
  stages: PipelineStage[]
  deals: (Deal & {
    company?: { id: string; name: string }
    contact?: { id: string; firstName: string; lastName: string }
    stage?: { id: string; name: string; color: string } | null
  })[]
}

interface TasksResponse {
  data: (Task & {
    company?: { id: string; name: string }
    assignee?: { id: string; name: string }
  })[]
}

function KPICard({ icon: Icon, label, value, color, trend }: {
  icon: React.FC<{ size?: number; strokeWidth?: number }>
  label: string
  value: string | number
  color: string
  trend?: 'up' | 'down' | null
}) {
  return (
    <div className="panel-container kpi-card" style={{
      ...panel.container,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        top: 0, right: 0,
        width: 80, height: 80,
        borderRadius: '50%',
        backgroundColor: `${color}11`,
        transform: 'translate(30px, -30px)',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          backgroundColor: `${color}22`, color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} strokeWidth={1.5} />
        </div>
        {trend && (
          <span style={{
            fontSize: 12, fontWeight: 600,
            color: trend === 'up' ? 'var(--emerald)' : 'var(--rust)',
            display: 'flex', alignItems: 'center', gap: 2,
          }}>
            {trend === 'up' ? <IconTrendingUp size={14} /> : <IconTrendingDown size={14} />}
          </span>
        )}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', color, lineHeight: 1.1, position: 'relative' }}>{value}</div>
      <div style={{ color: 'var(--fg-dim)', fontSize: 13, fontWeight: 500, position: 'relative' }}>{label}</div>
    </div>
  )
}

function ActivityFeedItem({ a }: { a: DashboardData['recentActivities'][0] }) {
  const color = activityColor[a.type] || 'var(--gold)'
  const ActivityIcon = activityIconMap[a.type] || IconActivity
  return (
    <Link href={a.company ? `/companies/${a.company.id}` : '#'} style={{ textDecoration: 'none' }}>
      <div className="vega-table-row" style={{
        display: 'flex', gap: 12, padding: '12px 0',
        borderBottom: '1px solid var(--panel-border)',
        borderRadius: 6,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          backgroundColor: `${color}22`, color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <ActivityIcon size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.subject}
          </div>
          <div style={{ color: 'var(--fg-dim)', fontSize: 12, marginTop: 2 }}>
            {a.company?.name || '—'}
            {a.contact && ` · ${a.contact.firstName} ${a.contact.lastName}`}
          </div>
        </div>
        <div style={{ color: 'var(--fg-dimmer)', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {formatDate(a.createdAt)}
        </div>
      </div>
    </Link>
  )
}

function MyTaskItem({ task, onToggle }: {
  task: TasksResponse['data'][0]
  onToggle: (id: string) => void
}) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED'
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '10px 0',
      borderBottom: '1px solid var(--panel-border)',
      alignItems: 'flex-start',
    }}>
      <input
        type="checkbox"
        checked={task.status === 'COMPLETED'}
        onChange={() => onToggle(task.id)}
        style={{ marginTop: 3, cursor: 'pointer', width: 18, height: 18, accentColor: 'var(--gold)' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link href={`/tasks`} style={{
          fontWeight: task.status === 'COMPLETED' ? 400 : 600,
          fontSize: 14,
          textDecoration: task.status === 'COMPLETED' ? 'line-through' : 'none',
          color: task.status === 'COMPLETED' ? 'var(--fg-dim)' : 'var(--fg)',
        }}>
          {task.title}
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={statusBadge(priorityColor[task.priority])}>
            <span style={statusDot(priorityColor[task.priority])} />
            {task.priority}
          </span>
          <span style={{
            fontSize: 12,
            color: isOverdue ? 'var(--rust)' : 'var(--fg-dim)',
            fontWeight: isOverdue ? 600 : 400,
          }}>
            {task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'}
          </span>
        </div>
      </div>
    </div>
  )
}

function PipelineBar({ stage, deals }: {
  stage: PipelineStage
  deals: Deal[]
}) {
  const stageDeals = deals.filter((d) => d.stageId === stage.id)
  const count = stageDeals.length
  const totalValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
  const color = stage.color || 'var(--gold)'

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{stage.name}</span>
        <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
          {count} · {formatCurrency(totalValue)}
        </span>
      </div>
      <div style={{
        height: 8, borderRadius: 4, backgroundColor: 'var(--bg-soft)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.max(4, count * 10)}%`,
          backgroundColor: color,
          borderRadius: 4,
          transition: 'width .3s ease',
        }} />
      </div>
    </div>
  )
}

function QuickActionPanel({ router }: { router: ReturnType<typeof useRouter> }) {
  const actions = [
    { label: 'Add Company', icon: IconBuilding, href: '/companies' },
    { label: 'Add Contact', icon: IconUsers, href: '/contacts' },
    { label: 'Log Call', icon: IconPhone, href: '/activities' },
    { label: 'Create Task', icon: IconCheckSquare, href: '/tasks' },
    { label: 'Send Email', icon: IconMail, href: '/inbox' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {actions.map((a) => (
        <button
          key={a.label}
          className="btn-touch"
          onClick={() => router.push(a.href)}
          style={{
            ...buttons.secondary,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left',
            padding: '14px 16px',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <a.icon size={18} strokeWidth={1.5} />
          {a.label}
        </button>
      ))}
    </div>
  )
}

function DashboardContent() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [dealsData, setDealsData] = useState<DealsResponse | null>(null)
  const [myTasks, setMyTasks] = useState<TasksResponse['data']>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [dashRes, dealsRes, tasksRes, meRes] = await Promise.all([
        apiFetch<DashboardData>('/api/dashboard'),
        apiFetch<DealsResponse>('/api/deals'),
        apiFetch<TasksResponse>('/api/tasks?limit=50'),
        apiFetch<{ user: User }>('/api/auth/me'),
      ])
      setData(dashRes)
      setDealsData(dealsRes)
      const user = meRes.user
      setCurrentUser(user)
      const assigned = (tasksRes.data || []).filter(
        (t) => t.assignedToId === user.id && t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
      )
      assigned.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      })
      setMyTasks(assigned.slice(0, 8))
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggleTask = async (taskId: string) => {
    const task = myTasks.find((t) => t.id === taskId)
    if (!task) return
    const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    try {
      await apiFetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      })
      setMyTasks((prev) => prev.filter((t) => t.id !== taskId))
    } catch (err: any) {
      setError(err.message || 'Failed to update task')
    }
  }

  const openDealsValue = useMemo(() => {
    if (!dealsData) return 0
    return dealsData.deals
      .filter((d) => d.status === 'OPEN' || !d.status)
      .reduce((sum, d) => sum + (d.value || 0), 0)
  }, [dealsData])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <Spinner size={32} />
      </div>
    )
  }

  const counts = data?.counts || { companies: 0, contacts: 0, activities: 0, tasks: 0, pendingTasks: 0, completedTasks: 0 }
  const recentActivities = data?.recentActivities || []
  const stages = dealsData?.stages || []
  const allDeals = dealsData?.deals || []

  return (
    <div style={layout.page}>
      <h1 style={typeography.title}>Dashboard</h1>

      {error && (
        <div style={{ backgroundColor: 'rgba(184,80,74,0.12)', color: 'var(--rust)', border: '1px solid rgba(184,80,74,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* ── Row 1: KPI Cards ── */}
      <div className="stat-grid kpi-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
        marginBottom: 24,
      }}>
        <KPICard icon={IconBuilding} label="Total Companies" value={counts.companies} color="var(--blue)" />
        <KPICard icon={IconUsers} label="Total Contacts" value={counts.contacts} color="var(--emerald)" />
        <KPICard icon={IconDiamond} label="Open Deals Value" value={formatCurrency(openDealsValue)} color="var(--gold)" />
        <KPICard icon={IconCheckSquare} label="Open Tasks" value={counts.pendingTasks || counts.tasks} color="var(--cyan)" />
      </div>

      {/* ── Row 2: Recent Activity + My Tasks ── */}
      <div className="dashboard-grid-2col" style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr',
        gap: 16,
        marginBottom: 24,
      }}>
        {/* Recent Activity */}
        <div className="panel-container" style={panel.container}>
          <div style={{ ...layout.header, marginBottom: 12 }}>
            <h2 style={{ ...typeography.subtitle, margin: 0 }}>Recent Activity</h2>
            <Link href="/activities" style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
          </div>
          {recentActivities.length > 0 ? (
            recentActivities.slice(0, 10).map((a) => <ActivityFeedItem key={a.id} a={a} />)
          ) : (
            <div className="vega-empty-state">
              <IconActivity size={32} strokeWidth={1.5} />
              <p className="vega-empty-state-text" style={{ marginTop: 12 }}>No recent activity yet.</p>
              <Link href="/activities" style={{ ...buttons.small, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <IconPlus size={14} /> Log activity
              </Link>
            </div>
          )}
        </div>

        {/* My Tasks — with empty state CTA */}
        <div className="panel-container" style={panel.container}>
          <div style={{ ...layout.header, marginBottom: 12 }}>
            <h2 style={{ ...typeography.subtitle, margin: 0 }}>My Tasks</h2>
            <Link href="/tasks" style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Open task board →</Link>
          </div>
          {myTasks.length > 0 ? (
            myTasks.map((t) => <MyTaskItem key={t.id} task={t} onToggle={handleToggleTask} />)
          ) : (
            <div className="vega-empty-state">
              <IconCheckSquare size={32} strokeWidth={1.5} />
              <p className="vega-empty-state-text" style={{ marginTop: 12 }}>No open tasks — you're all caught up.</p>
              <Link href="/tasks" style={{ ...buttons.small, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <IconPlus size={14} /> Create a task
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Deals Pipeline + Quick Actions ── */}
      <div className="dashboard-grid-2col" style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr',
        gap: 16,
      }}>
        {/* Deals Pipeline Summary — with empty state CTA */}
        <div className="panel-container" style={panel.container}>
          <div style={{ ...layout.header, marginBottom: 16 }}>
            <h2 style={{ ...typeography.subtitle, margin: 0 }}>Deals Pipeline</h2>
            <Link href="/deals" style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>View board →</Link>
          </div>
          {stages.length > 0 && allDeals.length > 0 ? (
            stages.map((stage) => <PipelineBar key={stage.id} stage={stage} deals={allDeals} />)
          ) : stages.length > 0 ? (
            <div className="vega-empty-state">
              <IconDiamond size={32} strokeWidth={1.5} />
              <p className="vega-empty-state-text" style={{ marginTop: 12 }}>No deals yet — create your first deal to start tracking.</p>
              <Link href="/deals" style={{ ...buttons.small, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <IconPlus size={14} /> Create your first deal
              </Link>
            </div>
          ) : (
            <div className="vega-empty-state">
              <IconDiamond size={32} strokeWidth={1.5} />
              <p className="vega-empty-state-text" style={{ marginTop: 12 }}>No pipeline stages configured.</p>
              <Link href="/settings" style={{ ...buttons.small, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Configure pipeline
              </Link>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, margin: '0 0 16px' }}>Quick Actions</h2>
          <QuickActionPanel router={router} />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <ProtectedLayout>
      <DashboardContent />
    </ProtectedLayout>
  )
}