'use client'

// ============================================================================
// File: src/app/admin/audit-logs/page.tsx
// Description: Audit Log Viewer — admin-only page for viewing the complete
//   audit trail of all data mutations in Vega CRM. Salesforce/HubSpot-style
//   compliance view with filtering, search, CSV export, and detail expand.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import Pagination from '../../components/Pagination'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, table, statusBadge, statusDot } from '../../lib/styles'

interface AuditLogEntry {
  id: string
  userId: string
  action: string
  entity: string
  entityId: string
  changes: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    globalRole: string
  } | null
}

interface AuditStats {
  byAction: Array<{ action: string; _count: number }>
  byEntity: Array<{ entity: string; _count: number }>
}

interface AuditResponse {
  data: AuditLogEntry[]
  stats: AuditStats
  pagination: { page: number; limit: number; total: number; pages: number }
}

const ENTITY_OPTIONS = [
  { value: '', label: 'All Entities' },
  { value: 'company', label: 'Companies' },
  { value: 'contact', label: 'Contacts' },
  { value: 'deal', label: 'Deals' },
  { value: 'activity', label: 'Activities' },
  { value: 'task', label: 'Tasks' },
  { value: 'user', label: 'Users' },
  { value: 'tenant', label: 'Tenants' },
  { value: 'workflow', label: 'Workflows' },
]

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
]

const actionColor: Record<string, string> = {
  create: 'var(--emerald, #10b981)',
  update: 'var(--gold, #b8924a)',
  delete: 'var(--rust, #c0392b)',
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

/** Format full date — "Aug 10, 2026 3:45 PM" */
function fullDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function AuditLogsContent() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [stats, setStats] = useState<AuditStats>({ byAction: [], byEntity: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filters
  const [entityFilter, setEntityFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '50')
      if (entityFilter) params.set('entity', entityFilter)
      if (actionFilter) params.set('action', actionFilter)
      if (search) params.set('search', search)
      if (fromDate) params.set('from', new Date(fromDate).toISOString())
      if (toDate) params.set('to', new Date(toDate).toISOString())

      const res = await apiFetch<AuditResponse>(`/api/admin/audit-logs?${params.toString()}`)
      setLogs(res.data || [])
      setStats(res.stats || { byAction: [], byEntity: [] })
      setPagination(res.pagination)
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }, [page, entityFilter, actionFilter, search, fromDate, toDate])

  useEffect(() => {
    load()
  }, [load])

  const handleFilter = () => {
    setPage(1)
    load()
  }

  const handleReset = () => {
    setEntityFilter('')
    setActionFilter('')
    setSearch('')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  const handleExport = () => {
    const params = new URLSearchParams()
    params.set('limit', '10000')
    if (entityFilter) params.set('entity', entityFilter)
    if (actionFilter) params.set('action', actionFilter)
    if (search) params.set('search', search)
    if (fromDate) params.set('from', new Date(fromDate).toISOString())
    if (toDate) params.set('to', new Date(toDate).toISOString())

    // Fetch full dataset and export as CSV
    fetch(`/api/admin/audit-logs?${params.toString()}`, {
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        const rows = data.data || []
        const headers = ['Timestamp', 'User', 'Email', 'Action', 'Entity', 'Entity ID', 'IP Address', 'Changes']
        const csvLines = [headers.join(',')]
        for (const row of rows) {
          const vals = [
            fullDate(row.createdAt),
            `"${row.user?.name || 'System'}"`,
            `"${row.user?.email || ''}"`,
            row.action,
            row.entity,
            row.entityId,
            row.ipAddress || '',
            `"${row.changes ? JSON.stringify(row.changes).replace(/"/g, '""') : ''}"`,
          ]
          csvLines.push(vals.join(','))
        }
        const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => setError('Export failed'))
  }

  const totalByAction = useMemo(
    () => stats.byAction.reduce((sum, s) => sum + s._count, 0),
    [stats]
  )

  return (
    <div style={layout.page}>
      {/* Header */}
      <div style={layout.header}>
        <div>
          <h1 style={{ ...typeography.title, fontSize: 32, margin: '0 0 4px' }}>Audit Log</h1>
          <p style={typeography.muted}>Complete trail of all data modifications — who, what, when.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={buttons.secondary} onClick={handleExport} disabled={loading}>
            ↓ Export CSV
          </button>
          <button style={buttons.secondary} onClick={handleFilter} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {!loading && stats.byAction.length > 0 && (
        <div style={{ ...layout.grid, marginBottom: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {stats.byAction.map((s) => (
            <div key={s.action} style={panel.container}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={statusDot(actionColor[s.action] || 'var(--fg-dim)')} />
                <span style={{ fontSize: 13, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {s.action}
                </span>
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 8 }}>
                {s._count}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>
                {totalByAction > 0 ? Math.round((s._count / totalByAction) * 100) : 0}% of total
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters Bar */}
      <div style={{ ...panel.compact, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ ...forms.group, minWidth: 160, flex: '1 1 160px' }}>
          <label style={forms.label}>Entity</label>
          <select
            style={forms.select}
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
          >
            {ENTITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ ...forms.group, minWidth: 140, flex: '1 1 140px' }}>
          <label style={forms.label}>Action</label>
          <select
            style={forms.select}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ ...forms.group, minWidth: 200, flex: '2 1 200px' }}>
          <label style={forms.label}>Search</label>
          <input
            style={forms.input}
            placeholder="Search entity or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
          />
        </div>
        <div style={{ ...forms.group, minWidth: 140, flex: '1 1 140px' }}>
          <label style={forms.label}>From Date</label>
          <input
            type="date"
            style={forms.input}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div style={{ ...forms.group, minWidth: 140, flex: '1 1 140px' }}>
          <label style={forms.label}>To Date</label>
          <input
            type="date"
            style={forms.input}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button style={buttons.primary} onClick={handleFilter} disabled={loading}>
            Filter
          </button>
          <button style={buttons.secondary} onClick={handleReset} disabled={loading}>
            Reset
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

      {/* Empty State */}
      {!loading && logs.length === 0 && (
        <div style={{ ...panel.container, textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <h2 style={{ ...typeography.subtitle, marginBottom: 8 }}>No Audit Entries Yet</h2>
          <p style={typeography.muted}>
            Audit entries will appear here as users create, update, and delete records in the CRM.
          </p>
        </div>
      )}

      {/* Audit Log Table — Desktop / Tablet */}
      {!loading && logs.length > 0 && (
        <div className="table-wrapper" style={panel.container}>
          <table style={table.table} className="audit-table-desktop">
            <thead>
              <tr>
                <th style={table.th}>When</th>
                <th style={table.th}>User</th>
                <th style={table.th}>Action</th>
                <th style={table.th}>Entity</th>
                <th style={table.th}>IP Address</th>
                <th style={table.th}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  style={table.tr}
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="audit-row"
                >
                  <td style={table.td}>
                    <div style={{ fontWeight: 500 }}>{relativeTime(log.createdAt)}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{fullDate(log.createdAt)}</div>
                  </td>
                  <td style={table.td}>
                    {log.user ? (
                      <div>
                        <div style={{ fontWeight: 500 }}>{log.user.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{log.user.email}</div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--fg-dim)', fontStyle: 'italic' }}>System</span>
                    )}
                  </td>
                  <td style={table.td}>
                    <span style={statusBadge(actionColor[log.action] || 'var(--fg-dim)')}>
                      <span style={statusDot(actionColor[log.action] || 'var(--fg-dim)')} />
                      {log.action}
                    </span>
                  </td>
                  <td style={table.td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 16 }}>{entityIcon[log.entity] || '📄'}</span>
                      <span style={{ textTransform: 'capitalize' }}>{log.entity}</span>
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2, fontFamily: 'monospace' }}>
                      {log.entityId.slice(0, 12)}…
                    </div>
                  </td>
                  <td style={table.td}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--fg-dim)' }}>
                      {log.ipAddress || '—'}
                    </span>
                  </td>
                  <td style={table.td}>
                    {log.changes ? (
                      <span style={{ fontSize: 13, color: 'var(--fg-dim)', cursor: 'pointer' }}>
                        {expandedId === log.id ? '▲ Hide' : '▼ View'}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--fg-dim)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Expanded detail row */}
          {expandedId && (
            <div style={{ borderTop: '1px solid var(--panel-border)', padding: '16px 24px', backgroundColor: 'var(--bg)' }}>
              {(() => {
                const log = logs.find((l) => l.id === expandedId)
                if (!log || !log.changes) return null
                return (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                      Change Details
                    </div>
                    <pre style={{
                      fontSize: 13,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      color: 'var(--fg)',
                      margin: 0,
                      lineHeight: 1.6,
                    }}>
                      {JSON.stringify(log.changes, null, 2)}
                    </pre>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Mobile card view */}
          <div className="audit-cards-mobile" style={{ display: 'none' }}>
            {logs.map((log) => (
              <div key={log.id} className="audit-card" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={statusBadge(actionColor[log.action] || 'var(--fg-dim)')}>
                    <span style={statusDot(actionColor[log.action] || 'var(--fg-dim)')} />
                    {log.action}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{relativeTime(log.createdAt)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>{entityIcon[log.entity] || '📄'}</span>
                  <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{log.entity}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
                  {log.user?.name || 'System'} · {fullDate(log.createdAt)}
                </div>
                {log.ipAddress && (
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'monospace', marginTop: 4 }}>
                    IP: {log.ipAddress}
                  </div>
                )}
                {log.changes && expandedId === log.id && (
                  <pre style={{
                    fontSize: 12,
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    color: 'var(--fg)',
                    margin: '8px 0 0',
                    padding: 12,
                    backgroundColor: 'var(--panel)',
                    borderRadius: 8,
                    lineHeight: 1.5,
                  }}>
                    {JSON.stringify(log.changes, null, 2)}
                  </pre>
                )}
              </div>
            ))}
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
            pageSize={pagination.limit}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  )
}

export default function AuditLogsPage() {
  return (
    <ProtectedLayout>
      <AuditLogsContent />
    </ProtectedLayout>
  )
}