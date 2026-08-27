'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons } from '../lib/styles'
import type { Tenant } from '../lib/types'

// ============================================================================
// Helpers
// ============================================================================

const currencyFmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)

const compactCurrency = (n: number) => {
  const v = n || 0
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return currencyFmt(v)
}

// ── Date range presets ──────────────────────────────────────────────────────

type PresetKey = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all'

interface DateRange { from: string; to: string }

function presetRange(preset: PresetKey): DateRange | null {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const iso = (d: Date) => d.toISOString().slice(0, 10)

  switch (preset) {
    case 'today':
      return { from: iso(today), to: iso(today) }
    case 'week': {
      const day = today.getDay() // 0 = Sunday
      const from = new Date(today)
      from.setDate(today.getDate() - day)
      const to = new Date(from)
      to.setDate(from.getDate() + 6)
      return { from: iso(from), to: iso(to) }
    }
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: iso(from), to: iso(to) }
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      const from = new Date(now.getFullYear(), q * 3, 1)
      const to = new Date(now.getFullYear(), q * 3 + 3, 0)
      return { from: iso(from), to: iso(to) }
    }
    case 'year': {
      const from = new Date(now.getFullYear(), 0, 1)
      const to = new Date(now.getFullYear(), 11, 31)
      return { from: iso(from), to: iso(to) }
    }
    case 'all':
      return null
  }
}

/** Returns the previous equal-length period for period-over-period comparison. */
function previousRange(range: DateRange | null): DateRange | null {
  if (!range) return null
  const from = new Date(range.from)
  const to = new Date(range.to)
  const len = to.getTime() - from.getTime()
  const prevTo = new Date(from.getTime() - 86400000) // day before `from`
  const prevFrom = new Date(prevTo.getTime() - len)
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) }
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
]

// ── Chart components (kept from original, lightly enhanced) ─────────────────

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

function Donut({ segments, centerLabel, centerValue }: { segments: { label: string; value: number; color: string }[]; centerLabel?: string; centerValue?: string }) {
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
          const rot = total > 0 ? (acc / total) * 360 - 90 : -90
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
          {centerValue ?? total}
        </text>
        {centerLabel && (
          <text x="50%" y="68%" textAnchor="middle" dominantBaseline="middle" fill="var(--fg-dim)" fontSize="9" fontWeight="500">
            {centerLabel}
          </text>
        )}
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

/** Progress ring — circular gauge for completion rate. */
function ProgressRing({ pct, color, label }: { pct: number; color: string; label: string }) {
  const size = 120
  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = `${(pct / 100) * circumference} ${circumference}`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--panel-border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={dash}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray .6s ease' }}
        />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="var(--fg)" fontSize="22" fontWeight="700">
          {pct}%
        </text>
      </svg>
      <span style={{ color: 'var(--fg-dim)', fontSize: 13 }}>{label}</span>
    </div>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, delta }: { label: string; value: string | number; color: string; delta?: { pct: number; positive: boolean } | null }) {
  return (
    <div className="panel-container" style={{ ...panel.container, position: 'relative' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ color: 'var(--fg-dim)', fontSize: 14, marginTop: 6 }}>{label}</div>
      {delta && (
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: delta.positive ? 'var(--emerald)' : 'var(--rust)' }}>
          <span>{delta.positive ? '↑' : '↓'}</span>
          <span>{Math.abs(delta.pct).toFixed(1)}%</span>
        </div>
      )}
    </div>
  )
}

function MiniKpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="panel-container" style={{ ...panel.compact, textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      <div style={{ color: 'var(--fg-dim)', fontSize: 12, marginTop: 4 }}>{label}</div>
    </div>
  )
}

// ============================================================================
// Report type definitions (matching server responses)
// ============================================================================

interface FunnelStage {
  stageId: string
  name: string
  color: string
  position: number
  probability: number
  dealCount: number
  totalValue: number
  avgDealValue: number
}
interface FunnelData { stages: FunnelStage[] }

interface ForecastMonth { month: string; count: number; weighted: number; raw: number }
interface ForecastData {
  periodStart: string
  periodEnd: string
  totalOpenValue: number
  totalWeightedValue: number
  byMonth: ForecastMonth[]
}

interface VelocityData {
  totalClosed: number
  averageDaysToClose: number
  won: { count: number; value: number }
  lost: { count: number; value: number }
}

interface ConversionStage {
  stageId: string
  name: string
  count: number
  isWonStage: boolean
  isLostStage: boolean
}
interface ConversionData {
  totalDeals: number
  wonDeals: number
  conversionRate: number
  byStage: ConversionStage[]
}

interface ActivityData {
  periodDays: number
  dealsCreated: number
  dealsUpdated: number
  activitiesByType: { type: string; count: number }[]
}

interface LeadSourceData {
  sources: { leadSource: string; dealCount: number; totalValue: number; avgValue: number }[]
}

interface RevenueByTenantData {
  tenants: { tenantId: string; name: string; revenue: number; wonDeals: number }[]
  totalRevenue: number
}

interface TaskCompletionData {
  total: number
  completed: number
  overdue: number
  dueSoon: number
  completionRate: number
  byStatus: {
    PENDING: number
    IN_PROGRESS: number
    COMPLETED: number
    CANCELLED: number
  }
}

// ============================================================================
// Main content
// ============================================================================

function ReportsContent() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [preset, setPreset] = useState<PresetKey>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [tenantFilter, setTenantFilter] = useState('')

  // Report data
  const [funnel, setFunnel] = useState<FunnelData | null>(null)
  const [forecast, setForecast] = useState<ForecastData | null>(null)
  const [velocity, setVelocity] = useState<VelocityData | null>(null)
  const [conversion, setConversion] = useState<ConversionData | null>(null)
  const [activity, setActivity] = useState<ActivityData | null>(null)
  const [leadSource, setLeadSource] = useState<LeadSourceData | null>(null)
  const [revenueByTenant, setRevenueByTenant] = useState<RevenueByTenantData | null>(null)
  const [taskCompletion, setTaskCompletion] = useState<TaskCompletionData | null>(null)

  // Previous-period data for comparison
  const [prevForecast, setPrevForecast] = useState<ForecastData | null>(null)

  // ── Load tenants (for the filter dropdown) ────────────────────────────────
  useEffect(() => {
    apiFetch<{ data: Tenant[] }>('/api/admin/tenants?limit=100')
      .then((res) => setTenants(res.data || []))
      .catch(() => {/* non-admins can't list tenants — silently ignore */})
  }, [])

  // ── Apply a preset ────────────────────────────────────────────────────────
  const applyPreset = useCallback((key: PresetKey) => {
    setPreset(key)
    const range = presetRange(key)
    if (range) {
      setDateFrom(range.from)
      setDateTo(range.to)
    } else {
      setDateFrom('')
      setDateTo('')
    }
  }, [])

  // ── Build query string ───────────────────────────────────────────────────
  const buildQuery = useCallback((extra?: { dateFrom?: string; dateTo?: string }) => {
    const params = new URLSearchParams()
    if (tenantFilter) params.set('tenantId', tenantFilter)
    const df = extra?.dateFrom ?? dateFrom
    const dt = extra?.dateTo ?? dateTo
    if (df) params.set('dateFrom', df)
    if (dt) params.set('dateTo', dt)
    return params.toString()
  }, [tenantFilter, dateFrom, dateTo])

  // ── Load all reports ──────────────────────────────────────────────────────
  const loadReports = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const q = buildQuery()
      const qStr = q ? `?${q}` : ''

      const [
        funnelRes, forecastRes, velocityRes, conversionRes,
        activityRes, leadSourceRes, revenueRes, taskRes,
      ] = await Promise.all([
        apiFetch<{ type: string; data: FunnelData }>(`/api/reports?type=funnel${qStr ? `&${q}` : ''}`),
        apiFetch<{ type: string; data: ForecastData }>(`/api/reports?type=forecast${qStr ? `&${q}` : ''}`),
        apiFetch<{ type: string; data: VelocityData }>(`/api/reports?type=velocity${qStr ? `&${q}` : ''}`),
        apiFetch<{ type: string; data: ConversionData }>(`/api/reports?type=conversion${qStr ? `&${q}` : ''}`),
        apiFetch<{ type: string; data: ActivityData }>(`/api/reports?type=activity${qStr ? `&${q}` : ''}`),
        apiFetch<{ type: string; data: LeadSourceData }>(`/api/reports?type=lead-source${qStr ? `&${q}` : ''}`),
        apiFetch<{ type: string; data: RevenueByTenantData }>(`/api/reports?type=revenue-by-tenant${qStr ? `&${q}` : ''}`),
        apiFetch<{ type: string; data: TaskCompletionData }>(`/api/reports?type=task-completion${qStr ? `&${q}` : ''}`),
      ])

      setFunnel(funnelRes.data)
      setForecast(forecastRes.data)
      setVelocity(velocityRes.data)
      setConversion(conversionRes.data)
      setActivity(activityRes.data)
      setLeadSource(leadSourceRes.data)
      setRevenueByTenant(revenueRes.data)
      setTaskCompletion(taskRes.data)

      // Period-over-period: fetch previous-period forecast for comparison.
      // Only when we have an actual date range.
      if (dateFrom && dateTo) {
        const prev = previousRange({ from: dateFrom, to: dateTo })
        if (prev) {
          const prevQ = new URLSearchParams()
          if (tenantFilter) prevQ.set('tenantId', tenantFilter)
          prevQ.set('dateFrom', prev.from)
          prevQ.set('dateTo', prev.to)
          try {
            const prevForecastRes = await apiFetch<{ type: string; data: ForecastData }>(
              `/api/reports?type=forecast&${prevQ.toString()}`
            )
            setPrevForecast(prevForecastRes.data)
          } catch {
            setPrevForecast(null)
          }
        } else {
          setPrevForecast(null)
        }
      } else {
        setPrevForecast(null)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [buildQuery, dateFrom, dateTo, tenantFilter])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  // ── Derived values ────────────────────────────────────────────────────────
  const totalPipeline = useMemo(() => {
    return funnel?.stages.reduce((s, st) => s + st.totalValue, 0) ?? 0
  }, [funnel])

  const weightedForecast = useMemo(() => {
    return funnel?.stages.reduce((s, st) => s + st.totalValue * (st.probability / 100), 0) ?? 0
  }, [funnel])

  const prevTotalPipeline = useMemo(() => {
    if (!prevForecast) return null
    // Note: forecast returns open deals in a future window, so we approximate
    // previous-period "total pipeline" via totalOpenValue.
    return prevForecast.totalOpenValue
  }, [prevForecast])

  const prevWeightedForecast = useMemo(() => {
    if (!prevForecast) return null
    return prevForecast.totalWeightedValue
  }, [prevForecast])

  const deltaPct = (current: number, previous: number | null): { pct: number; positive: boolean } | null => {
    if (previous === null || previous === 0) return null
    const diff = current - previous
    const pct = (diff / previous) * 100
    return { pct, positive: pct >= 0 }
  }

  const totalPipelineDelta = deltaPct(totalPipeline, prevTotalPipeline)
  const weightedForecastDelta = deltaPct(weightedForecast, prevWeightedForecast)

  const maxFunnelValue = Math.max(...(funnel?.stages.map((f) => f.totalValue) ?? [1]), 1)

  // Win/loss derived
  const winRate = velocity && (velocity.won.count + velocity.lost.count) > 0
    ? Math.round((velocity.won.count / (velocity.won.count + velocity.lost.count)) * 100)
    : 0

  // Activity colors
  const activityColors: Record<string, string> = {
    CALL: 'var(--gold)',
    EMAIL: 'var(--blue)',
    NOTE: 'var(--emerald)',
    MEETING: 'var(--violet)',
  }
  const maxActivity = Math.max(...(activity?.activitiesByType.map((a) => a.count) ?? [1]), 1)

  // Lead source donut
  const leadSourceSegments = useMemo(() => {
    if (!leadSource) return []
    const colors = ['var(--gold)', 'var(--blue)', 'var(--emerald)', 'var(--violet)', 'var(--cyan)', 'var(--rust)']
    return leadSource.sources.map((s, i) => ({ label: s.leadSource, value: s.dealCount, color: colors[i % colors.length] }))
  }, [leadSource])

  // Revenue by tenant max
  const maxRevenue = Math.max(...(revenueByTenant?.tenants.map((t) => t.revenue) ?? [1]), 1)

  // Task completion donut
  const taskStatusSegments = useMemo(() => {
    if (!taskCompletion) return []
    return [
      { label: 'Pending', value: taskCompletion.byStatus.PENDING, color: 'var(--gold)' },
      { label: 'In Progress', value: taskCompletion.byStatus.IN_PROGRESS, color: 'var(--blue)' },
      { label: 'Completed', value: taskCompletion.byStatus.COMPLETED, color: 'var(--emerald)' },
      { label: 'Cancelled', value: taskCompletion.byStatus.CANCELLED, color: 'var(--fg-dimmer)' },
    ]
  }, [taskCompletion])

  // ── Export handlers ──────────────────────────────────────────────────────
  const handleExportJSON = () => {
    const data = {
      generatedAt: new Date().toISOString(),
      dateRange: { from: dateFrom || null, to: dateTo || null },
      tenantFilter: tenantFilter || null,
      funnel,
      forecast,
      velocity,
      conversion,
      activity,
      leadSource,
      revenueByTenant,
      taskCompletion,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vega-reports-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCSV = () => {
    if (!funnel) return
    const header = ['Stage Name', 'Deal Count', 'Total Value', 'Avg Value', 'Weighted Value']
    const rows = funnel.stages.map((s) => [
      `"${s.name}"`,
      s.dealCount,
      s.totalValue.toFixed(2),
      s.avgDealValue.toFixed(2),
      (s.totalValue * (s.probability / 100)).toFixed(2),
    ].join(','))
    const csv = [header.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vega-funnel-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading && !funnel) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div style={layout.page}>
      {/* Header */}
      <div style={layout.header}>
        <h1 style={{ ...typeography.title, fontSize: 40, fontWeight: 700, marginBottom: 0 }}>Reports & Analytics</h1>
        <div className="reports-controls" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input className="form-input" style={{ ...forms.input, width: 'auto' }} type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPreset('all') }} />
          <input className="form-input" style={{ ...forms.input, width: 'auto' }} type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPreset('all') }} />
          {tenants.length > 0 && (
            <select
              className="form-input"
              style={{ ...forms.select, width: 'auto' }}
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
            >
              <option value="">All Tenants</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          <button style={buttons.secondary} onClick={handleExportCSV}>Export CSV</button>
          <button style={buttons.primary} onClick={handleExportJSON}>Export JSON</button>
        </div>
      </div>

      {/* Date range presets */}
      <div className="reports-preset-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className="reports-preset-btn"
            style={preset === p.key
              ? { ...buttons.primary, fontSize: 13, padding: '8px 14px' }
              : { ...buttons.secondary, fontSize: 13, padding: '8px 14px' }}
            onClick={() => applyPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* KPI cards row */}
      <div className="stat-grid" style={layout.grid}>
        <KpiCard label="Total Pipeline" value={compactCurrency(totalPipeline)} color="var(--gold)" delta={totalPipelineDelta} />
        <KpiCard label="Weighted Forecast" value={compactCurrency(weightedForecast)} color="var(--emerald)" delta={weightedForecastDelta} />
        <KpiCard label="Open Deals Value" value={compactCurrency(forecast?.totalOpenValue ?? 0)} color="var(--blue)" />
        <KpiCard label="Won Revenue" value={compactCurrency(velocity?.won.value ?? 0)} color="var(--violet)" />
      </div>

      {/* Two-column analytics grid */}
      <div className="reports-analytics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 24 }}>

        {/* Sales Funnel */}
        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Sales Funnel</h2>
          {funnel?.stages.map((f) => (
            <Bar key={f.stageId} label={f.name} value={f.totalValue} max={maxFunnelValue} color={f.color} suffix={`${f.dealCount} · ${compactCurrency(f.totalValue)}`} />
          ))}
          {funnel && funnel.stages.length === 0 && <p style={typeography.muted}>No deals in pipeline.</p>}
        </div>

        {/* Monthly Forecast Chart */}
        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Monthly Forecast</h2>
          <div className="reports-forecast-chart" style={{ display: 'flex', gap: 16, alignItems: 'flex-end', height: 180, marginTop: 16, paddingBottom: 8 }}>
            {forecast?.byMonth.map((m) => {
              const maxVal = Math.max(...(forecast.byMonth.map((x) => Math.max(x.weighted, x.raw))), 1)
              const wH = (m.weighted / maxVal) * 140
              const rH = (m.raw / maxVal) * 140
              return (
                <div key={m.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1, minWidth: 80 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 150 }}>
                    <div title={`Raw: ${currencyFmt(m.raw)}`} style={{ width: 24, height: `${rH}px`, backgroundColor: 'var(--gold)', borderRadius: '4px 4px 0 0', transition: 'height .4s ease', opacity: 0.7 }} />
                    <div title={`Weighted: ${currencyFmt(m.weighted)}`} style={{ width: 24, height: `${wH}px`, backgroundColor: 'var(--emerald)', borderRadius: '4px 4px 0 0', transition: 'height .4s ease' }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
                    {new Date(m.month + '-01').toLocaleDateString(undefined, { month: 'short' })}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--fg-dimmer)' }}>{m.count} deals</span>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--fg-dim)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: 'var(--gold)', opacity: 0.7 }} />Raw Value</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: 'var(--emerald)' }} />Weighted</span>
          </div>
        </div>

        {/* Win/Loss Analysis */}
        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Win / Loss Analysis</h2>
          {velocity && (velocity.won.count + velocity.lost.count) > 0 ? (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              <Donut
                segments={[
                  { label: 'Won', value: velocity.won.count, color: 'var(--emerald)' },
                  { label: 'Lost', value: velocity.lost.count, color: 'var(--rust)' },
                ]}
                centerLabel="win rate"
                centerValue={`${winRate}%`}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minWidth: 200 }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Win Rate</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--emerald)' }}>{winRate}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Won Revenue</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)' }}>{currencyFmt(velocity.won.value)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Lost Value</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--rust)' }}>{currencyFmt(velocity.lost.value)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Avg Days to Close</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)' }}>{Math.round(velocity.averageDaysToClose)} days</div>
                </div>
              </div>
            </div>
          ) : (
            <p style={typeography.muted}>No closed deals to analyse.</p>
          )}
        </div>

        {/* Task Completion Panel */}
        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Task Completion</h2>
          {taskCompletion ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                <ProgressRing pct={taskCompletion.completionRate} color="var(--emerald)" label="Completion Rate" />
                <Donut
                  segments={taskStatusSegments}
                  centerLabel="tasks"
                  centerValue={`${taskCompletion.total}`}
                />
              </div>
              <div className="reports-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <MiniKpi label="Total" value={taskCompletion.total} color="var(--fg)" />
                <MiniKpi label="Completed" value={taskCompletion.completed} color="var(--emerald)" />
                <MiniKpi label="Overdue" value={taskCompletion.overdue} color="var(--rust)" />
                <MiniKpi label="Due Soon" value={taskCompletion.dueSoon} color="var(--gold)" />
              </div>
            </div>
          ) : (
            <p style={typeography.muted}>No task data.</p>
          )}
        </div>

        {/* Pipeline Velocity by Stage */}
        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Conversion by Stage</h2>
          {conversion?.byStage.map((s) => (
            <Bar key={s.stageId} label={s.name} value={s.count} max={Math.max(...conversion.byStage.map((x) => x.count), 1)} color={s.isWonStage ? 'var(--emerald)' : s.isLostStage ? 'var(--rust)' : 'var(--blue)'} suffix={`${s.count}`} />
          ))}
          {conversion && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--panel-border)' }}>
              <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Overall Conversion Rate</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--emerald)' }}>{conversion.conversionRate.toFixed(1)}%</div>
            </div>
          )}
        </div>

        {/* Activity Breakdown */}
        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Activity Breakdown (30 days)</h2>
          {activity?.activitiesByType.map((a) => (
            <Bar key={a.type} label={a.type.charAt(0) + a.type.slice(1).toLowerCase()} value={a.count} max={maxActivity} color={activityColors[a.type] || 'var(--cyan)'} suffix={`${a.count}`} />
          ))}
          {activity && (
            <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--panel-border)' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Deals Created</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{activity.dealsCreated}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Deals Updated</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{activity.dealsUpdated}</div>
              </div>
            </div>
          )}
        </div>

        {/* Lead Source Breakdown */}
        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Lead Source Breakdown</h2>
          {leadSourceSegments.length > 0 ? (
            <Donut segments={leadSourceSegments} />
          ) : (
            <p style={typeography.muted}>No lead source data.</p>
          )}
          {leadSource && leadSource.sources.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--panel-border)' }}>
              {leadSource.sources.map((s) => (
                <div key={s.leadSource} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: 'var(--fg-dim)' }}>{s.leadSource}</span>
                  <span style={{ fontWeight: 600 }}>{s.dealCount} · {compactCurrency(s.totalValue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revenue by Tenant */}
        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Revenue by Tenant</h2>
          {revenueByTenant?.tenants.map((t) => (
            <Bar key={t.tenantId} label={t.name} value={t.revenue} max={maxRevenue} color="var(--gold)" suffix={`${compactCurrency(t.revenue)} · ${t.wonDeals} won`} />
          ))}
          {revenueByTenant && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--panel-border)' }}>
              <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Total Won Revenue</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--gold)' }}>{currencyFmt(revenueByTenant.totalRevenue)}</div>
            </div>
          )}
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