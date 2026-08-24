'use client'

// ============================================================================
// File: src/app/companies/page.tsx
// Description: Enhanced companies list with search bar, industry filter, sort,
//              table/card grid toggle, pagination, and hover row actions.
//              Phase 23: Inline create/edit form (no modal), matching Bryan's
//              "inline actions over modals" design principle.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import RowActions from '../components/RowActions'
import Pagination from '../components/Pagination'
import { IconSearch, IconPlus, IconBuilding, IconMail, IconPhone } from '../components/Icons'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, table } from '../lib/styles'
import type { Company, Tenant } from '../lib/types'

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

type ViewMode = 'table' | 'card'
type SortMode = 'name-asc' | 'name-desc' | 'recent' | 'activities'

const PAGE_SIZE = 10

interface CompanyListItem extends Company {
  _count?: { contacts?: number; deals?: number; activities?: number }
  lastActivityAt?: string | null
}

const emptyForm = { tenantId: '', name: '', industry: '', website: '', phone: '', email: '', address: '', description: '' }

function CompaniesContent() {
  const [companies, setCompanies] = useState<CompanyListItem[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [industryFilter, setIndustryFilter] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('name-asc')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [page, setPage] = useState(1)

  // ── Inline form state (replaces modal) ──
  const [showForm, setShowForm] = useState(false)
  const [editingCompany, setEditingCompany] = useState<CompanyListItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    try {
      const [companiesRes, tenantsRes] = await Promise.all([
        apiFetch<{ data: CompanyListItem[] }>('/api/companies?limit=100'),
        apiFetch<{ data: Tenant[] }>('/api/admin/tenants'),
      ])
      setCompanies(companiesRes.data || [])
      setTenants(tenantsRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load companies')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, industryFilter, sortMode])

  // Extract unique industries
  const industries = useMemo(() => {
    const set = new Set<string>()
    companies.forEach((c) => { if (c.industry) set.add(c.industry) })
    return Array.from(set).sort()
  }, [companies])

  // Filtered + sorted companies
  const filtered = useMemo(() => {
    let result = [...companies]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      )
    }
    if (industryFilter) {
      result = result.filter((c) => c.industry === industryFilter)
    }
    switch (sortMode) {
      case 'name-asc': result.sort((a, b) => a.name.localeCompare(b.name)); break
      case 'name-desc': result.sort((a, b) => b.name.localeCompare(a.name)); break
      case 'recent': result.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()); break
      case 'activities': result.sort((a, b) => (b._count?.activities ?? 0) - (a._count?.activities ?? 0)); break
    }
    return result
  }, [companies, search, industryFilter, sortMode])

  // Paginated slice
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const openNew = () => {
    setEditingCompany(null)
    setForm({ ...emptyForm, tenantId: tenants[0]?.id || '' })
    setShowForm(true)
  }

  const openEdit = (c: CompanyListItem) => {
    setEditingCompany(c)
    setForm({ tenantId: c.tenantId, name: c.name, industry: c.industry || '', website: c.website || '', phone: c.phone || '', email: c.email || '', address: c.address || '', description: c.description || '' })
    setShowForm(true)
    setTimeout(() => {
      document.getElementById('inline-company-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  const handleDelete = async (c: CompanyListItem) => {
    if (!window.confirm(`Delete company "${c.name}"?`)) return
    try {
      await apiFetch(`/api/companies/${c.id}`, { method: 'DELETE' })
      setCompanies((prev) => prev.filter((x) => x.id !== c.id))
    } catch (err: any) { setError(err.message || 'Failed to delete company') }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const body = { ...form, tenantId: form.tenantId || tenants[0]?.id }
      if (editingCompany) {
        const updated = await apiFetch<Company>(`/api/companies/${editingCompany.id}`, { method: 'PUT', body: JSON.stringify(body) })
        setCompanies((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } as CompanyListItem : c)))
      } else {
        const created = await apiFetch<Company>('/api/companies', { method: 'POST', body: JSON.stringify(body) })
        setCompanies((prev) => [{ ...created, _count: { contacts: 0, deals: 0, activities: 0 } }, ...prev])
      }
      setShowForm(false)
    } catch (err: any) { setError(err.message || 'Failed to save company') }
    finally { setSubmitting(false) }
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>
  }

  const toolbarStyle: React.CSSProperties = {
    display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16,
  }
  const selectStyle: React.CSSProperties = { ...forms.select, width: 'auto', minWidth: 140 }

  return (
    <div style={layout.page}>
      <div style={layout.header}>
        <h1 style={typeography.title}>Companies</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="view-mode-toggle" style={{ display: 'flex', border: '1px solid var(--panel-border)', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => setViewMode('table')} style={{
              padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              backgroundColor: viewMode === 'table' ? 'var(--panel-elevated)' : 'transparent',
              color: viewMode === 'table' ? 'var(--gold)' : 'var(--fg-dim)', border: 'none',
            }}>Table</button>
            <button onClick={() => setViewMode('card')} style={{
              padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              backgroundColor: viewMode === 'card' ? 'var(--panel-elevated)' : 'transparent',
              color: viewMode === 'card' ? 'var(--gold)' : 'var(--fg-dim)', border: 'none',
            }}>Cards</button>
          </div>
          <button className="btn-touch export-btn" style={{ ...buttons.secondary, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            onClick={async () => {
              try {
                const res = await fetch('/api/export?entity=companies', { credentials: 'include' })
                if (!res.ok) throw new Error('Export failed')
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `companies-export-${new Date().toISOString().slice(0,10)}.csv`
                document.body.appendChild(a); a.click(); document.body.removeChild(a)
                URL.revokeObjectURL(url)
              } catch (err) { alert('Export failed: ' + (err as Error).message) }
            }}>
            ⬇ Export
          </button>
          <button className="btn-touch" style={{ ...buttons.primary, display: 'flex', alignItems: 'center', gap: 6 }} onClick={openNew}>
            <IconPlus size={16} /> New Company
          </button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(184,80,74,0.12)', color: 'var(--rust)', border: '1px solid rgba(184,80,74,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>{error}</div>
      )}

      {/* ── Toolbar: Search + Industry Filter + Sort ── */}
      <div className="list-toolbar" style={toolbarStyle}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-dim)', display: 'flex', alignItems: 'center' }}>
            <IconSearch size={16} strokeWidth={1.5} />
          </span>
          <input className="form-input" style={{ ...forms.input, paddingLeft: 36 }} placeholder="Search by name, industry, or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={selectStyle} value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}>
          <option value="">All Industries</option>
          {industries.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
        </select>
        <select className="form-select" style={selectStyle} value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
          <option value="recent">Most Recent</option>
          <option value="activities">Most Activities</option>
        </select>
      </div>

      <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginBottom: 16 }}>
        {filtered.length} {filtered.length === 1 ? 'company' : 'companies'}
      </div>

      {/* ── Inline Create/Edit Form ── */}
      {showForm && (
        <div id="inline-company-form" className="panel-container" style={{ ...panel.container, marginBottom: 24, animation: 'slideUp 0.25s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ ...typeography.subtitle, margin: 0 }}>{editingCompany ? 'Edit Company' : 'New Company'}</h2>
            <button className="btn-touch" style={{ ...buttons.secondary, padding: '6px 12px', fontSize: 13 }} onClick={() => setShowForm(false)}>✕ Close</button>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={forms.group}>
              <span style={forms.label}>Tenant</span>
              <select className="form-select" style={forms.select} required value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })}>
                <option value="">Select tenant</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}><span style={forms.label}>Name</span>
                <input className="form-input" style={forms.input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label style={forms.group}><span style={forms.label}>Industry</span>
                <input className="form-input" style={forms.input} value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></label>
            </div>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}><span style={forms.label}>Website</span>
                <input className="form-input" style={forms.input} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
              <label style={forms.group}><span style={forms.label}>Phone</span>
                <input className="form-input" style={forms.input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            </div>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}><span style={forms.label}>Email</span>
                <input className="form-input" style={forms.input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label style={forms.group}><span style={forms.label}>Address</span>
                <input className="form-input" style={forms.input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            </div>
            <label style={forms.group}><span style={forms.label}>Description</span>
              <textarea className="form-textarea" style={forms.textarea} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-touch" style={buttons.secondary} onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn-touch" style={{ ...buttons.primary, opacity: submitting ? 0.6 : 1 }} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Table View ── */}
      <div className="panel-container list-table-view" style={{ ...panel.container, display: viewMode === 'table' ? 'block' : 'none' }}>
          <div className="table-wrapper" style={{ overflowX: 'auto' }}>
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>Name</th>
                  <th style={table.th}>Industry</th>
                  <th style={table.th}>Phone</th>
                  <th style={table.th}>Email</th>
                  <th style={table.th}>Contacts</th>
                  <th style={table.th}>Created</th>
                  <th style={{ ...table.th, width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={7} style={{ ...table.td, color: 'var(--fg-dim)', textAlign: 'center', padding: 32 }}>No companies found.</td></tr>
                ) : (
                  paginated.map((c) => (
                    <tr key={c.id} className="vega-table-row" style={table.tr}>
                      <td style={table.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'var(--panel-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>
                            <IconBuilding size={16} strokeWidth={1.5} />
                          </div>
                          <Link href={`/companies/${c.id}`} style={{ fontWeight: 600, color: 'var(--fg)' }}>{c.name}</Link>
                        </div>
                      </td>
                      <td style={table.td}>{c.industry || '—'}</td>
                      <td style={table.td}>
                        {c.phone ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <IconPhone size={14} strokeWidth={1.5} />
                            {c.phone}
                          </span>
                        ) : (
                          <button onClick={() => openEdit(c)} style={{ background: 'none', border: 'none', color: 'var(--fg-dimmer)', fontSize: 13, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <IconPlus size={12} /> Add phone
                          </button>
                        )}
                      </td>
                      <td style={table.td}>
                        {c.email ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <IconMail size={14} strokeWidth={1.5} />
                            {c.email}
                          </span>
                        ) : (
                          <button onClick={() => openEdit(c)} style={{ background: 'none', border: 'none', color: 'var(--fg-dimmer)', fontSize: 13, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <IconPlus size={12} /> Add email
                          </button>
                        )}
                      </td>
                      <td style={table.td}>{c._count?.contacts ?? 0}</td>
                      <td style={{ ...table.td, color: 'var(--fg-dim)', fontSize: 12 }}>{formatDate(c.createdAt)}</td>
                      <td style={table.td}>
                        <RowActions onEdit={() => openEdit(c)} onDelete={() => handleDelete(c)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      {/* ── Card Grid View ── */}
      <div className="card-grid list-card-view" style={{
        display: viewMode === 'card' ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16,
      }}>
          {filtered.length === 0 ? (
            <div className="panel-container" style={{ ...panel.container, gridColumn: '1 / -1', textAlign: 'center', color: 'var(--fg-dim)' }}>No companies found.</div>
          ) : (
            filtered.map((c) => (
              <Link key={c.id} href={`/companies/${c.id}`} style={{ textDecoration: 'none' }}>
                <div className="panel-container" style={{ ...panel.container, height: '100%', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--fg)' }}>{c.name}</div>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, backgroundColor: 'var(--panel-elevated)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)', flexShrink: 0,
                    }}>
                      <IconBuilding size={18} strokeWidth={1.5} />
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 12 }}>{c.industry || 'No industry'}</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 'auto' }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{c._count?.contacts ?? 0}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Contacts</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>{c._count?.deals ?? 0}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Deals</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--emerald)' }}>{c._count?.activities ?? 0}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Activities</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fg-dimmer)', borderTop: '1px solid var(--panel-border)', paddingTop: 8 }}>
                    Created {formatDate(c.createdAt)}
                  </div>
                </div>
              </Link>
            ))
          )}
      </div>
    </div>
  )
}

export default function CompaniesPage() {
  return <ProtectedLayout><CompaniesContent /></ProtectedLayout>
}