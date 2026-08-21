'use client'

// ============================================================================
// File: src/app/dashboard/page.tsx
// Description: Modern sales command center dashboard.
//              Phase 20: Sales intelligence metrics, 7-day activity trend chart,
//              stale deals alert, top performers leaderboard, pipeline forecast.
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

const formatCurrencyCompact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}

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

// ── Types ──

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

interface InsightsData {
  salesMetrics: {
    winRate: number
    avgDealSize: number
    avgSalesCycle: number
    dealsWon30d: number
    dealsLost30d: number
    totalWon: number
    totalLost: number
  }
  pipeline: {
    totalValue: number
    weightedForecast: number
    openDealCount: number
  }
  activityTrend: {
    date: string
    label: string
    total: number
    byType: Record<string, number>
  }[]
  staleDeals: {
    id: string
    title: string
    value: number
    currency: string
    probability: number
    updatedAt: string
    expectedCloseDate: string | null
    stage: { id: string; name: string; color: string }
    company: { id: string; name: string }
    assignee: { id: string; name: string } | null
  }[]
  topPerformers: {
    name: string
    wonCount: number
    totalValue: number
  }[]
}

// ── KPI Card ──

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

// ── Sales Metric Card (compact, for the intelligence row) ──

function SalesMetricCard({ label, value, sublabel, color }: {
  label: string
  value: string | number
  sublabel?: string
  color: string
}) {
  return (
    <div className="panel-container" style={{
      ...panel.compact,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
        {value}
      </div>
      {sublabel && (
        <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{sublabel}</div>
      )}
    </div>
  )
}

// ── 7-Day Activity Trend SVG Chart ──

function ActivityTrendChart({ data }: { data: InsightsData['activityTrend'] }) {
  const maxVal = Math.max(...data.map((d) => d.total), 1)
  const chartWidth = 280
  const chartHeight = 80
  const barGap = 4
  const barWidth = (chartWidth - barGap * (data.length - 1)) / data.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <svg width={chartWidth} height={chartHeight + 20} viewBox={`0 0 ${chartWidth} ${chartHeight + 20}`} style={{ maxWidth: '100%' }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={0} x2={chartWidth}
            y1={chartHeight * frac} y2={chartHeight * frac}
            stroke="var(--panel-border)" strokeWidth={0.5} strokeDasharray="2 4"
          />
        ))}
        {/* Bars */}
        {data.map((d, i) => {
          const barH = d.total > 0 ? (d.total / maxVal) * chartHeight : 2
          const x = i * (barWidth + barGap)
          const y = chartHeight - barH
          const isToday = i === data.length - 1
          return (
            <g key={d.date}>
              <rect
                x={x} y={y} width={barWidth} height={barH}
                rx={3}
                fill={isToday ? 'var(--gold)' : 'var(--blue)'}
                opacity={d.total > 0 ? 0.85 : 0.2}
              >
                <title>{d.label}: {d.total} activities</title>
              </rect>
              <text
                x={x + barWidth / 2} y={chartHeight + 14}
                textAnchor="middle"
                fontSize={10} fill="var(--fg-dimmer)"
              >
                {d.label.charAt(0)}
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fg-dim)' }}>
        <span>Total: <strong style={{ color: 'var(--fg)' }}>{data.reduce((s, d) => s + d.total, 0)}</strong> activities</span>
        <span>Last 7 days</span>
      </div>
    </div>
  )
}

// ── Stale Deals Alert ──

function StaleDealsAlert({ deals }: { deals: InsightsData['staleDeals'] }) {
  if (deals.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 16, borderRadius: 8,
        backgroundColor: 'rgba(90,138,90,0.08)',
        border: '1px solid rgba(90,138,90,0.2)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          backgroundColor: 'rgba(90,138,90,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconCheckSquare size={16} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--emerald)' }}>All deals are active</div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>No stale deals (14+ days without update)</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {deals.slice(0, 5).map((d) => {
        const daysStale = Math.floor((Date.now() - new Date(d.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
        return (
          <Link key={d.id} href={`/deals/${d.id}`} style={{ textDecoration: 'none' }}>
            <div className="vega-table-row" style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--panel-border)',
              marginBottom: 6,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                backgroundColor: 'rgba(196,146,74,0.15)',
                color: 'var(--amber)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>
                {daysStale}d
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                  {d.company?.name || '—'} · {d.stage?.name || '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gold)' }}>
                  {formatCurrencyCompact(d.value)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                  {d.probability}% prob
                </div>
              </div>
            </div>
          </Link>
        )
      })}
      {deals.length > 5 && (
        <Link href="/deals" style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600, textDecoration: 'none', marginTop: 4 }}>
          View all {deals.length} stale deals →
        </Link>
      )}
    </div>
  )
}

// ── Top Performers Leaderboard ──

function TopPerformers({ performers }: { performers: InsightsData['topPerformers'] }) {
  if (performers.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 20, color: 'var(--fg-dim)', fontSize: 13 }}>
        No won deals yet — close your first deal to appear here.
      </div>
    )
  }

  const maxValue = Math.max(...performers.map((p) => p.totalValue), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {performers.map((p, i) => {
        const pct = Math.round((p.totalValue / maxValue) * 100)
        const medalColors = ['var(--gold)', 'var(--blue)', 'var(--cyan)', 'var(--fg-dim)', 'var(--fg-dim)']
        return (
          <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              backgroundColor: `${medalColors[i] || 'var(--fg-dim)'}22`,
              color: medalColors[i] || 'var(--fg-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}>
              {i + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)' }}>
                  {formatCurrencyCompact(p.totalValue)}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, backgroundColor: 'var(--bg-soft)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  backgroundColor: medalColors[i] || 'var(--fg-dim)',
                  borderRadius: 3, transition: 'width .4s ease',
                }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                {p.wonCount} deal{p.wonCount !== 1 ? 's' : ''} won
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Activity Feed Item ──

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

// ── Main Dashboard Content ──

function DashboardContent() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [dealsData, setDealsData] = useState<DealsResponse | null>(null)
  const [myTasks, setMyTasks] = useState<TasksResponse['data']>([])
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [dashRes, dealsRes, tasksRes, meRes, insightsRes] = await Promise.all([
        apiFetch<DashboardData>('/api/dashboard'),
        apiFetch<DealsResponse>('/api/deals'),
        apiFetch<TasksResponse>('/api/tasks?limit=50'),
        apiFetch<{ user: User }>('/api/auth/me'),
        apiFetch<InsightsData>('/api/dashboard/insights'),
      ])
      setData(dashRes)
      setDealsData(dealsRes)
      setInsights(insightsRes)
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
  const sm = insights?.salesMetrics
  const pipeline = insights?.pipeline

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
        <KPICard icon={IconDiamond} label="Open Pipeline" value={formatCurrencyCompact(pipeline?.totalValue || openDealsValue)} color="var(--gold)" />
        <KPICard icon={IconCheckSquare} label="Open Tasks" value={counts.pendingTasks || counts.tasks} color="var(--cyan)" />
      </div>

      {/* ── Row 2: Sales Intelligence Metrics ── */}
      {sm && (
        <div className="sales-metrics-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}>
          <SalesMetricCard
            label="Win Rate"
            value={`${sm.winRate}%`}
            sublabel={`${sm.totalWon} won / ${sm.totalLost} lost`}
            color="var(--emerald)"
          />
          <SalesMetricCard
            label="Avg Deal Size"
            value={formatCurrencyCompact(sm.avgDealSize)}
            sublabel={`${sm.totalWon} won deals`}
            color="var(--gold)"
          />
          <SalesMetricCard
            label="Avg Sales Cycle"
            value={sm.avgSalesCycle > 0 ? `${sm.avgSalesCycle}d` : '—'}
            sublabel="createdAt → close"
            color="var(--blue)"
          />
          <SalesMetricCard
            label="Won (30d)"
            value={sm.dealsWon30d}
            sublabel={`${sm.dealsLost30d} lost in 30d`}
            color="var(--cyan)"
          />
          <SalesMetricCard
            label="Forecast"
            value={formatCurrencyCompact(pipeline?.weightedForecast || 0)}
            sublabel="Weighted pipeline"
            color="var(--violet)"
          />
        </div>
      )}

      {/* ── Row 3: Activity Trend + Stale Deals Alert ── */}
      {insights && (
        <div className="dashboard-grid-2col" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 24,
        }}>
          {/* 7-Day Activity Trend */}
          <div className="panel-container" style={panel.container}>
            <h2 style={{ ...typeography.subtitle, margin: '0 0 16px' }}>7-Day Activity Trend</h2>
            <ActivityTrendChart data={insights.activityTrend} />
          </div>

          {/* Stale Deals Alert */}
          <div className="panel-container" style={panel.container}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ ...typeography.subtitle, margin: 0 }}>Stale Deals Alert</h2>
              {insights.staleDeals.length > 0 && (
                <span style={statusBadge('var(--amber)')}>
                  <span style={statusDot('var(--amber)')} />
                  {insights.staleDeals.length} stale
                </span>
              )}
            </div>
            <StaleDealsAlert deals={insights.staleDeals} />
          </div>
        </div>
      )}

      {/* ── Row 4: Recent Activity + My Tasks ── */}
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

      {/* ── Row 5: Pipeline + Top Performers / Quick Actions ── */}
      <div className="dashboard-grid-2col" style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr',
        gap: 16,
        marginBottom: 24,
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

        {/* Top Performers */}
        {insights && insights.topPerformers.length > 0 && (
          <div className="panel-container" style={panel.container}>
            <h2 style={{ ...typeography.subtitle, margin: '0 0 16px' }}>Top Performers</h2>
            <TopPerformers performers={insights.topPerformers} />
          </div>
        )}
      </div>

      {/* ── Row 6: Quick Actions ── */}
      <div className="panel-container" style={panel.container}>
        <h2 style={{ ...typeography.subtitle, margin: '0 0 16px' }}>Quick Actions</h2>
        <QuickActionPanel router={router} />
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