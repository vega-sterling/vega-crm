'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, statusBadge } from '../lib/styles'
import type { DashboardData, Activity } from '../lib/types'

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const activityColor: Record<Activity['type'], string> = {
  CALL: 'var(--blue)',
  EMAIL: 'var(--emerald)',
  NOTE: 'var(--gold)',
  MEETING: 'var(--violet)',
  TASK: 'var(--cyan)',
}

function ActivityItem({ a }: { a: Activity }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--panel-border)' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: `${activityColor[a.type]}22`, color: activityColor[a.type], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
        {a.type[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{a.subject}</span>
          <span style={statusBadge(activityColor[a.type])}>{a.type}</span>
        </div>
        <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginTop: 4 }}>
          {a.company?.name}
          {a.contact && ` · ${a.contact.firstName} ${a.contact.lastName}`}
          {' · '}{a.user?.name}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--fg-dim)', lineHeight: 1.4 }}>{a.description}</p>
      </div>
      <div style={{ color: 'var(--fg-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(a.createdAt)}</div>
    </div>
  )
}

function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<DashboardData>('/api/dashboard')
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

  return (
    <div style={layout.page}>
      <h1 style={typeography.title}>Dashboard</h1>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div style={layout.grid}>
        {data && [
          { label: 'Companies', value: data.stats.companies, color: 'var(--blue)' },
          { label: 'Contacts', value: data.stats.contacts, color: 'var(--emerald)' },
          { label: 'Activities', value: data.stats.activities, color: 'var(--gold)' },
          { label: 'Tasks', value: data.stats.tasks, color: 'var(--cyan)' },
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
          {data?.recentActivities?.length ? (
            data.recentActivities.map((a) => <ActivityItem key={a.id} a={a} />)
          ) : (
            <p style={{ color: 'var(--fg-dim)' }}>No recent activity.</p>
          )}
        </div>

        <div style={panel.container}>
          <h2 style={{ ...typeography.subtitle, margin: '0 0 20px' }}>Task summary</h2>
          {data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Pending', value: data.taskSummary.pending, color: 'var(--gold)' },
                { label: 'In progress', value: data.taskSummary.inProgress, color: 'var(--blue)' },
                { label: 'Completed', value: data.taskSummary.completed, color: 'var(--emerald)' },
                { label: 'Overdue', value: data.taskSummary.overdue, color: 'var(--rust)' },
              ].map((r) => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--panel-border)' }}>
                  <span style={{ color: 'var(--fg-dim)', fontSize: 14 }}>{r.label}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: r.color }}>{r.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--fg-dim)' }}>No summary available.</p>
          )}
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
