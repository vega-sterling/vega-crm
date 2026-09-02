'use client'

// ============================================================================
// File: src/app/admin/activity/page.tsx
// Description: User Activity Reports — admin-only page showing per-user
//   productivity metrics computed from the audit log: who did what, how
//   much, and when, over a rolling 7/30/90-day window. KPI cards, per-user
//   responsive table (cards on phone), inline mini bar charts, and an
//   inline expanded detail section (top entities + full daily breakdown).
// ============================================================================

import { useEffect, useState, useCallback } from 'react'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import Pagination from '../../components/Pagination'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, buttons, table, statusBadge } from '../../lib/styles'

interface ActivityUser {
  userId: string
  name: string
  email: string
  globalRole: 'SUPER_ADMIN' | 'ADMIN' | 'USER'
  totalActions: number
  creates: number
  updates: number
  deletes: number
  imports: number
  exports: number
  lastActiveAt: string | null
  activeDays: number
  actionsByDay: { date: string; count: number }[]
  topEntities: { entity: string; count: number }[]
}

interface ActivityResponse {
  data: {
    users: ActivityUser[]
    totals: { users: number; activeUsers: number; totalActions: number }
  }
  pagination: { page: number; pageSize: number; total: number; pages: number }
}

const PERIODS = [
  { value: 7, label: '7 Days' },
  { value: 30, label: '30 Days' },
  { value: 90, label: '90 Days' },
]

const roleColor: Record<string, string> = {
  SUPER_ADMIN: 'var(--gold, #b8924a)',
  ADMIN: 'var(--slate-blue, #64748b)',
  USER: 'var(--emerald, #10b981)',
}

const entityIcon: Record<string, string> = {
  company: '🏢',
  contact: '👤',
  deal: '💰',
  activity: '📞',
  task: '✓',
  user: '🔐',
  tenant: '🌐',
  workflow: '⚡',
  lead: '🎯',
  project: '📁',
}

/** Format a date relative to now — "2h ago", "3d ago", etc. */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}

/** Initials for the avatar circle — "Bryan O'Malley" → "BO". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Small color-coded action breakdown chip. */
function ActionChip({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}44`,
        borderRadius: 6,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
      title={`${label}: ${count}`}
    >
      {label} {count}
    </span>
  )
}

function UserActivityContent() {
  const [rows, setRows] = useState<ActivityUser[]>([])
  const [totals, setTotals] = useState({ users: 0, activeUsers: 0, totalActions: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [days, setDays] = useState(30)
  const [sort, setSort] = useState<'actions' | 'lastActive'>('actions')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, pages: 0 })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('days', String(days))
      params.set('sort', sort)
      params.set('page', String(page))
      params.set('pageSize', '20')
      const res = await apiFetch<ActivityResponse>(`/api/admin/activity?${params.toString()}`)
      setRows(res.data?.users || [])
      setTotals(res.data?.totals || { users: 0, activeUsers: 0, totalActions: 0 })
      setPagination(res.pagination || { page: 1, pageSize: 20, total: 0, pages: 0 })
    } catch (err: any) {
      setError(err.message || 'Failed to load user activity')
    } finally {
      setLoading(false)
    }
  }, [days, sort, page])

  useEffect(() => {
    load()
  }, [load])

  const selectPeriod = (value: number) => {
    if (value === days) return
    setDays(value)
    setPage(1)
    setExpandedId(null)
  }

  const selectSort = (value: 'actions' | 'lastActive') => {
    if (value === sort) return
    setSort(value)
    setPage(1)
    setExpandedId(null)
  }

  // KPI: average actions per active user per day
  const avgPerUserDay =
    totals.activeUsers > 0
      ? Math.round((totals.totalActions / totals.activeUsers / days) * 10) / 10
      : 0

  // KPI: most active user on the current page
  const mostActive = rows.reduce<ActivityUser | null>(
    (best, r) => (best === null || r.totalActions > best.totalActions ? r : best),
    null
  )

  return (
    <div style={layout.page}>
      {/* Header */}
      <div style={layout.header}>
        <div>
          <h1 style={{ ...typeography.title, fontSize: 32, margin: '0 0 4px' }}>User Activity</h1>
          <p style={typeography.muted}>
            Per-user productivity from the audit log — who did what, how much, and when.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={buttons.secondary} onClick={load} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Controls: period toggle + sort toggle */}
      <div
        style={{
          ...panel.compact,
          marginBottom: 16,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => selectPeriod(p.value)}
              disabled={loading}
              style={
                days === p.value
                  ? { ...buttons.primary, padding: '10px 16px', minHeight: 44 }
                  : { ...buttons.secondary, padding: '10px 16px', minHeight: 44 }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => selectSort('actions')}
            disabled={loading}
            style={
              sort === 'actions'
                ? { ...buttons.primary, padding: '10px 16px', minHeight: 44 }
                : { ...buttons.secondary, padding: '10px 16px', minHeight: 44 }
            }
          >
            By Activity
          </button>
          <button
            onClick={() => selectSort('lastActive')}
            disabled={loading}
            style={
              sort === 'lastActive'
                ? { ...buttons.primary, padding: '10px 16px', minHeight: 44 }
                : { ...buttons.secondary, padding: '10px 16px', minHeight: 44 }
            }
          >
            By Last Active
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ ...panel.compact, marginBottom: 16, borderColor: 'var(--rust)', color: 'var(--rust)' }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && <Spinner />}

      {/* KPI Cards */}
      {!loading && (
        <div
          style={{
            ...layout.grid,
            marginBottom: 24,
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          }}
        >
          <div style={panel.container}>
            <div style={{ fontSize: 13, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Actions
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 8 }}>
              {totals.totalActions.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>last {days} days</div>
          </div>
          <div style={panel.container}>
            <div style={{ fontSize: 13, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Active Users
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 8 }}>
              {totals.activeUsers}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>
              of {totals.users} visible users
            </div>
          </div>
          <div style={panel.container}>
            <div style={{ fontSize: 13, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Avg Actions/User/Day
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 8 }}>
              {avgPerUserDay}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>
              per active user, daily mean
            </div>
          </div>
          <div style={panel.container}>
            <div style={{ fontSize: 13, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Most Active User
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 12, lineHeight: 1.3 }}>
              {mostActive && mostActive.totalActions > 0 ? mostActive.name : '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>
              {mostActive && mostActive.totalActions > 0
                ? `${mostActive.totalActions.toLocaleString()} actions this page`
                : 'No activity recorded'}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && rows.length === 0 && !error && (
        <div style={{ ...panel.container, textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <h2 style={{ ...typeography.subtitle, marginBottom: 8 }}>No Users Found</h2>
          <p style={typeography.muted}>User activity metrics will appear here as users work in the CRM.</p>
        </div>
      )}

      {/* Per-User Table — Desktop / Tablet */}
      {!loading && rows.length > 0 && (
        <div className="table-wrapper" style={panel.container}>
          <table style={table.table} className="activity-table-desktop">
            <thead>
              <tr>
                <th style={table.th}>User</th>
                <th style={table.th}>Actions</th>
                <th style={table.th}>Breakdown</th>
                <th style={table.th}>Active Days</th>
                <th style={table.th}>Last Active</th>
                <th style={table.th}>Trend (14d)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr
                  key={u.userId}
                  style={table.tr}
                  className="audit-row"
                  onClick={() => setExpandedId(expandedId === u.userId ? null : u.userId)}
                >
                  <td style={table.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          backgroundColor: 'var(--bg)',
                          border: '1px solid var(--panel-border)',
                          color: 'var(--gold)',
                          fontSize: 13,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {initials(u.name)}
                      </span>
                      <span>
                        <span style={{ display: 'block', fontWeight: 500 }}>{u.name}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-dim)' }}>{u.email}</span>
                      </span>
                    </div>
                  </td>
                  <td style={table.td}>
                    <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
                      {u.totalActions.toLocaleString()}
                    </span>
                    <div style={{ marginTop: 4 }}>
                      <span style={statusBadge(roleColor[u.globalRole] || 'var(--fg-dim)')}>{u.globalRole}</span>
                    </div>
                  </td>
                  <td style={table.td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 220 }}>
                      {u.creates > 0 && <ActionChip label="C" count={u.creates} color="var(--emerald, #10b981)" />}
                      {u.updates > 0 && <ActionChip label="U" count={u.updates} color="var(--gold, #b8924a)" />}
                      {u.deletes > 0 && <ActionChip label="D" count={u.deletes} color="var(--rust, #c0392b)" />}
                      {u.imports > 0 && <ActionChip label="I" count={u.imports} color="var(--slate-blue, #64748b)" />}
                      {u.exports > 0 && <ActionChip label="E" count={u.exports} color="var(--slate-blue, #64748b)" />}
                      {u.totalActions === 0 && (
                        <span style={{ color: 'var(--fg-dim)', fontSize: 12 }}>—</span>
                      )}
                    </div>
                  </td>
                  <td style={table.td}>
                    <span style={{ fontWeight: 500 }}>{u.activeDays}</span>
                    <span style={{ color: 'var(--fg-dim)', fontSize: 12 }}> / {days}d</span>
                  </td>
                  <td style={table.td}>
                    <span style={{ fontSize: 13 }}>{u.lastActiveAt ? relativeTime(u.lastActiveAt) : 'Never'}</span>
                  </td>
                  <td style={table.td}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 32, minWidth: 120 }}>
                      {u.actionsByDay.map((d) => {
                        const max = Math.max(...u.actionsByDay.map((x) => x.count), 1)
                        const h = d.count === 0 ? 2 : Math.max(4, Math.round((d.count / max) * 32))
                        return (
                          <div
                            key={d.date}
                            title={`${d.date}: ${d.count} actions`}
                            style={{
                              flex: 1,
                              minWidth: 4,
                              height: h,
                              borderRadius: 2,
                              backgroundColor:
                                d.count === 0 ? 'var(--panel-border)' : 'var(--gold, #b8924a)',
                              opacity: d.count === 0 ? 0.5 : 1,
                            }}
                          />
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginTop: 2 }}>
                      {expandedId === u.userId ? '▲ Hide details' : '▼ View details'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Inline expanded detail — desktop */}
          {expandedId && (
            <div
              className="activity-detail-desktop"
              style={{ borderTop: '1px solid var(--panel-border)', padding: '16px 24px', backgroundColor: 'var(--bg)' }}
            >
              {(() => {
                const u = rows.find((r) => r.userId === expandedId)
                if (!u) return null
                return (
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--fg-dim)',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 12,
                      }}
                    >
                      {u.name} — Detail Breakdown
                    </div>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      {/* Top entities */}
                      <div style={{ minWidth: 180, flex: '1 1 180px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Top Entities</div>
                        {u.topEntities.length === 0 ? (
                          <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>No actions in window</div>
                        ) : (
                          u.topEntities.map((e) => (
                            <div
                              key={e.entity}
                              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}
                            >
                              <span>
                                <span style={{ marginRight: 6 }}>{entityIcon[e.entity] || '📄'}</span>
                                <span style={{ textTransform: 'capitalize' }}>{e.entity}</span>
                              </span>
                              <span style={{ fontWeight: 600 }}>{e.count}</span>
                            </div>
                          ))
                        )}
                      </div>
                      {/* Full daily breakdown */}
                      <div style={{ flex: '2 1 260px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Actions by Day</div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48 }}>
                          {u.actionsByDay.map((d) => {
                            const max = Math.max(...u.actionsByDay.map((x) => x.count), 1)
                            const h = d.count === 0 ? 2 : Math.max(4, Math.round((d.count / max) * 48))
                            return (
                              <div key={d.date} style={{ flex: 1, textAlign: 'center' }}>
                                <div
                                  title={`${d.date}: ${d.count} actions`}
                                  style={{
                                    width: '100%',
                                    height: h,
                                    borderRadius: 2,
                                    backgroundColor:
                                      d.count === 0 ? 'var(--panel-border)' : 'var(--gold, #b8924a)',
                                    opacity: d.count === 0 ? 0.5 : 1,
                                  }}
                                />
                                <div style={{ fontSize: 9, color: 'var(--fg-dim)', marginTop: 2 }}>
                                  {d.date.slice(8)}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Mobile card view */}
          <div className="activity-cards-mobile" style={{ display: 'none' }}>
            {rows.map((u) => {
              const max = Math.max(...u.actionsByDay.map((x) => x.count), 1)
              return (
                <div
                  key={u.userId}
                  className="audit-card"
                  onClick={() => setExpandedId(expandedId === u.userId ? null : u.userId)}
                >
                  {/* Header: avatar + name + role */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        backgroundColor: 'var(--bg)',
                        border: '1px solid var(--panel-border)',
                        color: 'var(--gold)',
                        fontSize: 15,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {initials(u.name)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.email}
                      </div>
                    </div>
                    <span style={statusBadge(roleColor[u.globalRole] || 'var(--fg-dim)')}>{u.globalRole}</span>
                  </div>

                  {/* Totals row: big number + last active */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: 8,
                    }}
                  >
                    <span>
                      <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
                        {u.totalActions.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--fg-dim)', marginLeft: 4 }}>actions</span>
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
                      {u.lastActiveAt ? relativeTime(u.lastActiveAt) : 'Never'}
                    </span>
                  </div>

                  {/* Breakdown chips — 44px touch-safe */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {u.creates > 0 && <ActionChip label="Creates" count={u.creates} color="var(--emerald, #10b981)" />}
                    {u.updates > 0 && <ActionChip label="Updates" count={u.updates} color="var(--gold, #b8924a)" />}
                    {u.deletes > 0 && <ActionChip label="Deletes" count={u.deletes} color="var(--rust, #c0392b)" />}
                    {u.imports > 0 && <ActionChip label="Imports" count={u.imports} color="var(--slate-blue, #64748b)" />}
                    {u.exports > 0 && <ActionChip label="Exports" count={u.exports} color="var(--slate-blue, #64748b)" />}
                  </div>

                  {/* Meta + mini chart */}
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 8 }}>
                    Active {u.activeDays} of {days} days
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
                    {u.actionsByDay.map((d) => {
                      const h = d.count === 0 ? 2 : Math.max(4, Math.round((d.count / max) * 36))
                      return (
                        <div
                          key={d.date}
                          title={`${d.date}: ${d.count} actions`}
                          style={{
                            flex: 1,
                            minWidth: 6,
                            height: h,
                            borderRadius: 2,
                            backgroundColor: d.count === 0 ? 'var(--panel-border)' : 'var(--gold, #b8924a)',
                            opacity: d.count === 0 ? 0.5 : 1,
                          }}
                        />
                      )
                    })}
                  </div>

                  {/* Inline expanded detail — mobile */}
                  {expandedId === u.userId && (
                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: '1px solid var(--panel-border)',
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        Top Entities
                      </div>
                      {u.topEntities.length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>No actions in window</div>
                      ) : (
                        u.topEntities.map((e) => (
                          <div
                            key={e.entity}
                            style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', minHeight: 28 }}
                          >
                            <span>
                              <span style={{ marginRight: 6 }}>{entityIcon[e.entity] || '📄'}</span>
                              <span style={{ textTransform: 'capitalize' }}>{e.entity}</span>
                            </span>
                            <span style={{ fontWeight: 600 }}>{e.count}</span>
                          </div>
                        ))
                      )}
                      <div style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '12px 0 8px' }}>
                        Actions by Day
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48 }}>
                        {u.actionsByDay.map((d) => {
                          const h = d.count === 0 ? 2 : Math.max(4, Math.round((d.count / max) * 48))
                          return (
                            <div key={d.date} style={{ flex: 1, textAlign: 'center' }}>
                              <div
                                title={`${d.date}: ${d.count} actions`}
                                style={{
                                  width: '100%',
                                  height: h,
                                  borderRadius: 2,
                                  backgroundColor: d.count === 0 ? 'var(--panel-border)' : 'var(--gold, #b8924a)',
                                  opacity: d.count === 0 ? 0.5 : 1,
                                }}
                              />
                              <div style={{ fontSize: 9, color: 'var(--fg-dim)', marginTop: 2 }}>{d.date.slice(8)}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {!loading && pagination.pages > 1 && (
        <div style={{ marginTop: 16 }}>
          <Pagination
            page={pagination.page}
            totalPages={pagination.pages}
            totalItems={pagination.total}
            pageSize={pagination.pageSize}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  )
}

export default function UserActivityPage() {
  return (
    <ProtectedLayout>
      <UserActivityContent />
    </ProtectedLayout>
  )
}