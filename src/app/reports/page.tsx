'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge } from '../lib/styles'
import type { Deal, PipelineStage, Tenant, Activity, User } from '../lib/types'

const currencyFmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const formatDate = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

interface DealsResponse {
  stages?: PipelineStage[]
  deals?: Deal[]
}

function Bar({ value, max, color, label, suffix }: { value: number; max: number; color: string; label: string; suffix?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <div style={{ width: 120, fontSize: 13, color: 'var(--fg-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ flex: 1, height: 22, backgroundColor: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, transition: 'width .4s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bg)', textShadow: '0 1px 2px rgba(0,0,0,.3)' }}>
            {suffix || currencyFmt(value)}
          </span>
        </div>
      </div>
    </div>
  )
}

function Donut({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  let acc = 0
  const size = 140
  const stroke = 18
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((seg, i) => {
          const pct = total > 0 ? seg.value / total : 0
          const offset = circumference - pct * circumference
          const dash = `${pct * circumference} ${circumference}`
          const rot = (acc / total) * 360 - 90
          acc += seg.value
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform={`rotate(${rot} ${size / 2} ${size / 2})`}
              style={{ transition: 'stroke-dasharray .4s ease' }}
            />
          )
        })}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="var(--fg)" fontSize="16" fontWeight="700">
          {total}
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: seg.color }} />
            <span style={{ color: 'var(--fg-dim)' }}>{seg.label}:</span>
            <span style={{ fontWeight: 600 }}>{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportsContent() {
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(async () => {
    try {
      const [dealsRes, actsRes, tenantsRes, usersRes] = await Promise.all([
        apiFetch<DealsResponse>('/api/deals'),
        apiFetch<{ data: Activity[] }>('/api/activities'),
        apiFetch<{ data: Tenant[] }>('/api/admin/tenants'),
        apiFetch<{ data: User[] }>('/api/admin/users'),
      ])
      setStages(dealsRes.stages || [])
      setDeals(dealsRes.deals || [])
      setActivities(actsRes.data || [])
      setTenants(tenantsRes.data || [])
      setUsers(usersRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      if (dateFrom && d.expectedCloseDate && new Date(d.expectedCloseDate) < new Date(dateFrom)) return false
      if (dateTo && d.expectedCloseDate && new Date(d.expectedCloseDate) > new Date(dateTo)) return false
      return true
    })
  }, [deals, dateFrom, dateTo])

  const funnel = useMemo(() => {
    return stages.map((stage) => {
      const stageDeals = filteredDeals.filter((d) => d.stageId === stage.id)
      return {
        stage,
        count: stageDeals.length,
        value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
        weighted: stageDeals.reduce((sum, d) => sum + (d.value || 0) * (d.probability || 0) / 100, 0),
      }
    })
  }, [stages, filteredDeals])

  const revenueForecast = useMemo(() => funnel.reduce((s, f) => s + f.weighted, 0), [funnel])

  const velocity = useMemo(() => {
    return stages.map((stage) => {
      const stageDeals = filteredDeals.filter((d) => d.stageId === stage.id)
      const avgDays = stageDeals.length
        ? stageDeals.reduce((sum, d) => {
            const created = new Date(d.createdAt).getTime()
            const now = Date.now()
            return sum + (now - created) / 86400000
          }, 0) / stageDeals.length
        : 0
      return { stage, avgDays }
    })
  }, [stages, filteredDeals])

  const conversion = useMemo(() => {
    return stages.map((stage) => {
      const inStage = filteredDeals.filter((d) => d.stageId === stage.id)
      const wonFromStage = inStage.filter((d) => d.status === 'WON').length
      const pct = inStage.length ? Math.round((wonFromStage / inStage.length) * 100) : 0
      return { stage, pct }
    })
  }, [stages, filteredDeals])

  const activityByUser = useMemo(() => {
    const counts: Record<string, number> = {}
    activities.forEach((a) => {
      counts[a.userId] = (counts[a.userId] || 0) + 1
    })
    return Object.entries(counts).map(([userId, count]) => ({
      user: users.find((u) => u.id === userId),
      count,
    }))
  }, [activities, users])

  const leadSources = useMemo(() => {
    const map: Record<string, number> = {}
    filteredDeals.forEach((d) => {
      const src = d.leadSource || 'Unknown'
      map[src] = (map[src] || 0) + 1
    })
    const colors = ['var(--gold)', 'var(--blue)', 'var(--emerald)', 'var(--violet)', 'var(--cyan)', 'var(--rust)']
    return Object.entries(map).map(([label, value], i) => ({ label, value, color: colors[i % colors.length] }))
  }, [filteredDeals])

  const revenueByTenant = useMemo(() => {
    const map: Record<string, number> = {}
    filteredDeals.forEach((d) => {
      map[d.tenantId] = (map[d.tenantId] || 0) + (d.value || 0)
    })
    const max = Math.max(...Object.values(map), 1)
    return { rows: Object.entries(map).map(([tenantId, value]) => ({ tenant: tenants.find((t) => t.id === tenantId), value })), max }
  }, [filteredDeals, tenants])

  const handleExport = () => {
    const data = {
      generatedAt: new Date().toISOString(),
      dateRange: { from: dateFrom || null, to: dateTo || null },
      funnel,
      revenueForecast,
      velocity,
      conversion,
      activityByUser,
      leadSources,
      revenueByTenant: revenueByTenant.rows,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vega-reports-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <Spinner size={32} />
      </div>
    )
  }

  const maxFunnelValue = Math.max(...funnel.map((f) => f.value), 1)
  const maxVelocity = Math.max(...velocity.map((v) => v.avgDays), 1)
  const maxActivity = Math.max(...activityByUser.map((a) => a.count), 1)

  return (
    <div style={layout.page}>
      <div style={layout.header}>
        <h1 style={{ ...typeography.title, marginBottom: 0 }}>Reports</h1>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input style={{ ...forms.input, width: 'auto' }} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input style={{ ...forms.input, width: 'auto' }} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <button style={buttons.primary} onClick={handleExport}>Export JSON</button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div className="stat-grid" style={layout.grid}>
        {[
          { label: 'Total pipeline', value: currencyFmt(filteredDeals.reduce((s, d) => s + (d.value || 0), 0)), color: 'var(--gold)' },
          { label: 'Weighted forecast', value: currencyFmt(revenueForecast), color: 'var(--emerald)' },
          { label: 'Open deals', value: filteredDeals.filter((d) => d.status === 'OPEN').length, color: 'var(--blue)' },
          { label: 'Won deals', value: filteredDeals.filter((d) => d.status === 'WON').length, color: 'var(--violet)' },
        ].map((s) => (
          <div key={s.label} className="panel-container" style={panel.container}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ color: 'var(--fg-dim)', fontSize: 14, marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="project-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 24 }}>
        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Sales funnel</h2>
          {funnel.map((f) => (
            <Bar key={f.stage.id} label={f.stage.name} value={f.value} max={maxFunnelValue} color={f.stage.color} suffix={`${f.count} · ${currencyFmt(f.value)}`} />
          ))}
        </div>

        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Revenue forecast</h2>
          <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--emerald)' }}>{currencyFmt(revenueForecast)}</div>
          <p style={{ ...typeography.muted, marginTop: 8 }}>Weighted pipeline value based on deal probability.</p>
        </div>

        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Pipeline velocity</h2>
          {velocity.map((v) => (
            <Bar key={v.stage.id} label={v.stage.name} value={v.avgDays} max={maxVelocity} color="var(--blue)" suffix={`${Math.round(v.avgDays)} days`} />
          ))}
        </div>

        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Deal conversion rates</h2>
          {conversion.map((c) => (
            <Bar key={c.stage.id} label={c.stage.name} value={c.pct} max={100} color={c.stage.color} suffix={`${c.pct}%`} />
          ))}
        </div>

        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Activity by team member</h2>
          {activityByUser.length === 0 && <p style={typeography.muted}>No activity data.</p>}
          {activityByUser.map((a) => (
            <Bar key={a.user?.id || 'unknown'} label={a.user?.name || 'Unknown'} value={a.count} max={maxActivity} color="var(--cyan)" suffix={`${a.count}`} />
          ))}
        </div>

        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Lead source breakdown</h2>
          <Donut segments={leadSources} />
        </div>

        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Revenue by tenant</h2>
          {revenueByTenant.rows.map((r) => (
            <Bar key={r.tenant?.id || 'unknown'} label={r.tenant?.name || 'Unknown'} value={r.value} max={revenueByTenant.max} color="var(--gold)" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  return (
    <ProtectedLayout>
      <ReportsContent />
    </ProtectedLayout>
  )
}
