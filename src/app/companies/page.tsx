'use client'

// ============================================================================
// File: src/app/companies/page.tsx
// Phase 3: Enhanced companies list with search bar, industry filter, sort,
// table/card grid toggle. Fully responsive.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, table, statusBadge } from '../lib/styles'
import type { Company, Tenant } from '../lib/types'

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

type ViewMode = 'table' | 'card'
type SortMode = 'name-asc' | 'name-desc' | 'recent' | 'activities'

interface CompanyListItem extends Company {
  _count?: { contacts?: number; deals?: number; activities?: number }
  lastActivityAt?: string | null
}

function CompaniesContent() {
  const [companies, setCompanies] = useState<CompanyListItem[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [industryFilter, setIndustryFilter] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('name-asc')
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingCompany, setEditingCompany] = useState<CompanyListItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ tenantId: '', name: '', industry: '', website: '', phone: '', email: '', address: '', description: '' })

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

  // Extract unique industries
  const industries = useMemo(() => {
    const set = new Set<string>()
    companies.forEach((c) => { if (c.industry) set.add(c.industry) })
    return Array.from(set).sort()
  }, [companies])

  // Filtered + sorted companies
  const filtered = useMemo(() => {
    let result = [...companies]
    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        (c._count?.contacts ?? 0) > 0 // also matches by having contacts — simple
      )
    }
    // Industry filter
    if (industryFilter) {
      result = result.filter((c) => c.industry === industryFilter)
    }
    // Sort
    switch (sortMode) {
      case 'name-asc': result.sort((a, b) => a.name.localeCompare(b.name)); break
      case 'name-desc': result.sort((a, b) => b.name.localeCompare(a.name)); break
      case 'recent': result.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()); break
      case 'activities': result.sort((a, b) => (b._count?.activities ?? 0) - (a._count?.activities ?? 0)); break
    }
    return result
  }, [companies, search, industryFilter, sortMode])

  const openNew = () => {
    setEditingCompany(null)
    setForm({ tenantId: tenants[0]?.id || '', name: '', industry: '', website: '', phone: '', email: '', address: '', description: '' })
    setModalOpen(true)
  }

  const openEdit = (c: CompanyListItem) => {
    setEditingCompany(c)
    setForm({ tenantId: c.tenantId, name: c.name, industry: c.industry || '', website: c.website || '', phone: c.phone || '', email: c.email || '', address: c.address || '', description: c.description || '' })
    setModalOpen(true)
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
    try {
      const body = { ...form, tenantId: form.tenantId || tenants[0]?.id }
      if (editingCompany) {
        const updated = await apiFetch<Company>(`/api/companies/${editingCompany.id}`, { method: 'PUT', body: JSON.stringify(body) })
        setCompanies((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } as CompanyListItem : c)))
      } else {
        const created = await apiFetch<Company>('/api/companies', { method: 'POST', body: JSON.stringify(body) })
        setCompanies((prev) => [{ ...created, _count: { contacts: 0, deals: 0, activities: 0 } }, ...prev])
      }
      setModalOpen(false)
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
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--panel-border)', borderRadius: 8, overflow: 'hidden' }}>
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
          <button className="btn-touch" style={buttons.primary} onClick={openNew}>+ New Company</button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>{error}</div>
      )}

      {/* ── Toolbar: Search + Industry Filter + Sort ── */}
      <div className="list-toolbar" style={toolbarStyle}>
        <input className="form-input" style={{ ...forms.input, flex: 1, minWidth: 200 }} placeholder="Search by name or industry…" value={search} onChange={(e) => setSearch(e.target.value)} />
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

      {/* ── Table View (desktop) / Card View (phone or toggle) ── */}
      {viewMode === 'table' ? (
        <div className="panel-container list-table-view" style={panel.container}>
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
                  <th style={table.th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ ...table.td, color: 'var(--fg-dim)', textAlign: 'center' }}>No companies found.</td></tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id} style={table.tr}>
                      <td style={table.td}><Link href={`/companies/${c.id}`} style={{ fontWeight: 600, color: 'var(--fg)' }}>{c.name}</Link></td>
                      <td style={table.td}>{c.industry || '—'}</td>
                      <td style={table.td}>{c.phone || '—'}</td>
                      <td style={table.td}>{c.email || '—'}</td>
                      <td style={table.td}>{c._count?.contacts ?? 0}</td>
                      <td style={{ ...table.td, color: 'var(--fg-dim)', fontSize: 12 }}>{formatDate(c.createdAt)}</td>
                      <td style={table.td}><div style={{ display: 'flex', gap: 8 }}>
                        <button style={buttons.small} onClick={() => openEdit(c)}>Edit</button>
                        <button style={buttons.danger} onClick={() => handleDelete(c)}>Delete</button>
                      </div></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Card Grid View ── */
        <div className="card-grid list-card-view" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16,
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
                      width: 36, height: 36, borderRadius: 8, backgroundColor: 'var(--bg-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
                    }}>🏢</div>
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
      )}

      {/* ── New/Edit Modal ── */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }} onClick={() => setModalOpen(false)}>
          <div style={{ ...panel.container, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>{editingCompany ? 'Edit Company' : 'New Company'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Tenant</span>
                <select className="form-select" style={forms.select} required value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })}>
                  <option value="">Select tenant</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <div style={forms.row}>
                <label style={forms.group}><span style={forms.label}>Name</span>
                  <input className="form-input" style={forms.input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label style={forms.group}><span style={forms.label}>Industry</span>
                  <input className="form-input" style={forms.input} value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></label>
              </div>
              <div style={forms.row}>
                <label style={forms.group}><span style={forms.label}>Website</span>
                  <input className="form-input" style={forms.input} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
                <label style={forms.group}><span style={forms.label}>Phone</span>
                  <input className="form-input" style={forms.input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              </div>
              <label style={forms.group}><span style={forms.label}>Email</span>
                <input className="form-input" style={forms.input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label style={forms.group}><span style={forms.label}>Address</span>
                <input className="form-input" style={forms.input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
              <label style={forms.group}><span style={forms.label}>Description</span>
                <textarea className="form-textarea" style={forms.textarea} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-touch" style={buttons.secondary} onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-touch" style={{ ...buttons.primary, opacity: submitting ? 0.6 : 1 }} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CompaniesPage() {
  return <ProtectedLayout><CompaniesContent /></ProtectedLayout>
}