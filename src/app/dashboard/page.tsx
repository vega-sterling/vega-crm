'use client'

// ============================================================================
// File: src/app/dashboard/page.tsx
// Description: Dashboard overview with stats cards, recent activities, and
//              task summary. Fetches from /api/dashboard.
// ============================================================================

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, statusBadge } from '../lib/styles'
import type { Activity } from '../lib/types'

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const activityColor: Record<string, string> = {
  CALL: 'var(--blue)',
  EMAIL: 'var(--emerald)',
  NOTE: 'var(--gold)',
  MEETING: 'var(--violet)',
  TASK: 'var(--cyan)',
}

function ActivityItem({ a }: { a: Activity }) {
  const color = activityColor[a.type] || 'var(--gold)'
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--panel-border)' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: `${color}22`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
        {a.type?.[0] || '?'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{a.subject}</span>
          <span style={statusBadge(color)}>{a.type}</span>
        </div>
        <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginTop: 4 }}>
          {a.company?.name}
          {a.contact && ` · ${a.contact.firstName} ${a.contact.lastName}`}
          {' · '}{a.user?.name}
        </div>
        {a.description && <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--fg-dim)', lineHeight: 1.4 }}>{a.description}</p>}
      </div>
      <div style={{ color: 'var(--fg-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(a.createdAt)}</div>
    </div>
  )
}

function DashboardContent() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<any>('/api/dashboard')
      setData(res)
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <Spinner size={32} />
      </div>
    )
  }

  // Safely extract counts — API returns "counts" not "stats"
  const counts = data?.counts || data?.stats || { companies: 0, contacts: 0, activities: 0, tasks: 0 }
  const recentActivities = data?.recentActivities || []
  const taskSummary = Array.isArray(data?.taskSummary) ? {} : (data?.taskSummary || {})
  const pending = taskSummary.pending ?? counts.pendingTasks ?? 0
  const inProgress = taskSummary.inProgress ?? taskSummary.inProgress ?? 0
  const completed = taskSummary.completed ?? counts.completedTasks ?? 0
  const overdue = taskSummary.overdue ?? counts.overdueTasks ?? 0

  return (
    <div style={layout.page}>
      <h1 style={typeography.title}>Dashboard</h1>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div style={layout.grid}>
        {[
          { label: 'Companies', value: counts.companies ?? 0, color: 'var(--blue)' },
          { label: 'Contacts', value: counts.contacts ?? 0, color: 'var(--emerald)' },
          { label: 'Activities', value: counts.activities ?? 0, color: 'var(--gold)' },
          { label: 'Tasks', value: counts.tasks ?? 0, color: 'var(--cyan)' },
        ].map((s) => (
          <div key={s.label} style={panel.container}>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ color: 'var(--fg-dim)', fontSize: 14, marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginTop: 24 }}>
        <div style={panel.container}>
          <div style={{ ...layout.header, marginBottom: 8 }}>
            <h2 style={{ ...typeography.subtitle, margin: 0 }}>Recent activity</h2>
            <Link href="/activities" style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
          </div>
          {recentActivities.length > 0 ? (
            recentActivities.map((a: Activity) => <ActivityItem key={a.id} a={a} />)
          ) : (
            <p style={{ color: 'var(--fg-dim)' }}>No recent activity.</p>
          )}
        </div>

        <div style={panel.container}>
          <h2 style={{ ...typeography.subtitle, margin: '0 0 20px' }}>Task summary</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Pending', value: pending, color: 'var(--gold)' },
              { label: 'In progress', value: inProgress, color: 'var(--blue)' },
              { label: 'Completed', value: completed, color: 'var(--emerald)' },
              { label: 'Overdue', value: overdue, color: 'var(--rust)' },
            ].map((r) => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--panel-border)' }}>
                <span style={{ color: 'var(--fg-dim)', fontSize: 14 }}>{r.label}</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: r.color }}>{r.value}</span>
              </div>
            ))}
          </div>
          <Link href="/tasks" style={{ display: 'inline-block', marginTop: 16, color: 'var(--gold)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Open task board →</Link>
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