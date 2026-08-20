'use client'

// ============================================================================
// File: src/app/contacts/page.tsx
// Description: Enhanced contacts list with search bar, company filter, sort,
//              table/card grid toggle, pagination, and hover row actions.
//              Phase 1-3 UI/UX: SVG icons, avatar initials, hover-only delete
//              via ⋯ menu, pagination, inline "Add email/phone" CTAs.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import Avatar from '../components/Avatar'
import RowActions from '../components/RowActions'
import Pagination from '../components/Pagination'
import { IconSearch, IconMail, IconPhone, IconPlus } from '../components/Icons'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, table } from '../lib/styles'
import type { Contact, Company, Tenant } from '../lib/types'
import { LeadScoreMini } from '../components/LeadScoreBadge'

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

type ViewMode = 'table' | 'card'
type SortMode = 'name-asc' | 'name-desc' | 'recent'

const PAGE_SIZE = 10

interface ContactListItem extends Contact {
  company?: { id: string; name: string } | null
  linkedin?: string
  description?: string
  _count?: { activities?: number }
  lastActivityAt?: string | null
}

function ContactsContent() {
  const [contacts, setContacts] = useState<ContactListItem[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('name-asc')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [page, setPage] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<ContactListItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    tenantId: '', companyId: '', firstName: '', lastName: '', title: '',
    email: '', phone: '', mobile: '', linkedin: '', description: '',
  })

  const load = useCallback(async () => {
    try {
      const [contactsRes, companiesRes, tenantsRes] = await Promise.all([
        apiFetch<{ data: ContactListItem[] }>('/api/contacts?limit=100'),
        apiFetch<{ data: Company[] }>('/api/companies?limit=100'),
        apiFetch<{ data: Tenant[] }>('/api/admin/tenants'),
      ])
      setContacts(contactsRes.data || [])
      setCompanies(companiesRes.data || [])
      setTenants(tenantsRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load contacts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, companyFilter, sortMode])

  // Filtered + sorted contacts
  const filtered = useMemo(() => {
    let result = [...contacts]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((c) => {
        const fullName = `${c.firstName} ${c.lastName}`.toLowerCase()
        return fullName.includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.company?.name || '').toLowerCase().includes(q)
      })
    }
    if (companyFilter) {
      result = result.filter((c) => c.companyId === companyFilter)
    }
    switch (sortMode) {
      case 'name-asc': result.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)); break
      case 'name-desc': result.sort((a, b) => `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`)); break
      case 'recent': result.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()); break
    }
    return result
  }, [contacts, search, companyFilter, sortMode])

  // Paginated slice
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const openNew = () => {
    setEditingContact(null)
    setForm({ tenantId: tenants[0]?.id || '', companyId: '', firstName: '', lastName: '', title: '', email: '', phone: '', mobile: '', linkedin: '', description: '' })
    setModalOpen(true)
  }

  const openEdit = (c: ContactListItem) => {
    setEditingContact(c)
    setForm({
      tenantId: c.tenantId, companyId: c.companyId || '', firstName: c.firstName, lastName: c.lastName,
      title: c.title || '', email: c.email || '', phone: c.phone || '', mobile: c.mobile || '',
      linkedin: c.linkedin || '', description: c.description || '',
    })
    setModalOpen(true)
  }

  const handleDelete = async (c: ContactListItem) => {
    if (!window.confirm(`Delete contact "${c.firstName} ${c.lastName}"?`)) return
    try {
      await apiFetch(`/api/contacts/${c.id}`, { method: 'DELETE' })
      setContacts((prev) => prev.filter((x) => x.id !== c.id))
    } catch (err: any) { setError(err.message || 'Failed to delete contact') }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const body = { ...form, tenantId: form.tenantId || tenants[0]?.id }
      if (editingContact) {
        const updated = await apiFetch<Contact>(`/api/contacts/${editingContact.id}`, { method: 'PUT', body: JSON.stringify(body) })
        setContacts((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } as ContactListItem : c)))
      } else {
        const created = await apiFetch<Contact>('/api/contacts', { method: 'POST', body: JSON.stringify(body) })
        setContacts((prev) => [{ ...created, _count: { activities: 0 } }, ...prev])
      }
      setModalOpen(false)
    } catch (err: any) { setError(err.message || 'Failed to save contact') }
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
        <h1 style={typeography.title}>Contacts</h1>
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
                const res = await fetch('/api/export?entity=contacts', { credentials: 'include' })
                if (!res.ok) throw new Error('Export failed')
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `contacts-export-${new Date().toISOString().slice(0,10)}.csv`
                document.body.appendChild(a); a.click(); document.body.removeChild(a)
                URL.revokeObjectURL(url)
              } catch (err) { alert('Export failed: ' + (err as Error).message) }
            }}>
            ⬇ Export
          </button>
          <button className="btn-touch" style={{ ...buttons.primary, display: 'flex', alignItems: 'center', gap: 6 }} onClick={openNew}>
            <IconPlus size={16} /> New Contact
          </button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(184,80,74,0.12)', color: 'var(--rust)', border: '1px solid rgba(184,80,74,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>{error}</div>
      )}

      {/* ── Toolbar: Search + Company Filter + Sort ── */}
      <div className="list-toolbar" style={toolbarStyle}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-dim)', display: 'flex', alignItems: 'center' }}>
            <IconSearch size={16} strokeWidth={1.5} />
          </span>
          <input className="form-input" style={{ ...forms.input, paddingLeft: 36 }} placeholder="Search by name, email, or company…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={selectStyle} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="">All Companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-select" style={selectStyle} value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
          <option value="recent">Most Recent</option>
        </select>
      </div>

      <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginBottom: 16 }}>
        {filtered.length} {filtered.length === 1 ? 'contact' : 'contacts'}
      </div>

      {/* ── Table View ── Desktop manual toggle via viewMode; mobile: CSS hides automatically */}
      <div className="panel-container list-table-view" style={{ ...panel.container, display: viewMode === 'table' ? 'block' : 'none' }}>
          <div className="table-wrapper" style={{ overflowX: 'auto' }}>
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>Name</th>
                  <th style={table.th}>Title</th>
                  <th style={table.th}>Company</th>
                  <th style={table.th}>Email</th>
                  <th style={table.th}>Phone</th>
                  <th style={table.th}>Created</th>
                  <th style={table.th}>Score</th>
                  <th style={{ ...table.th, width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={8} style={{ ...table.td, color: 'var(--fg-dim)', textAlign: 'center', padding: 32 }}>No contacts found.</td></tr>
                ) : (
                  paginated.map((c) => (
                    <tr key={c.id} className="vega-table-row" style={table.tr}>
                      <td style={table.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={`${c.firstName} ${c.lastName}`} size={32} />
                          <Link href={`/contacts/${c.id}`} style={{ fontWeight: 600, color: 'var(--fg)' }}>{c.firstName} {c.lastName}</Link>
                        </div>
                      </td>
                      <td style={table.td}>{c.title || '—'}</td>
                      <td style={table.td}>{c.company?.name || '—'}</td>
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
                      <td style={{ ...table.td, color: 'var(--fg-dim)', fontSize: 12 }}>{formatDate(c.createdAt)}</td>
                      <td style={table.td}><LeadScoreMini contactId={c.id} /></td>
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
      {/* ── Card Grid View ── Desktop: visible only when viewMode=card; Mobile: CSS forces visible */}
      <div className="card-grid list-card-view" style={{
        display: viewMode === 'card' ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16,
      }}>
          {filtered.length === 0 ? (
            <div className="panel-container" style={{ ...panel.container, gridColumn: '1 / -1', textAlign: 'center', color: 'var(--fg-dim)' }}>No contacts found.</div>
          ) : (
            filtered.map((c) => (
              <Link key={c.id} href={`/contacts/${c.id}`} style={{ textDecoration: 'none' }}>
                <div className="panel-container" style={{ ...panel.container, height: '100%', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <Avatar name={`${c.firstName} ${c.lastName}`} size={44} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fg)' }}>{c.firstName} {c.lastName}</div>
                      <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>{c.title || 'No title'}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 8 }}>
                    {c.company?.name || 'No company'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--fg-dim)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {c.email && <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><IconMail size={14} /> {c.email}</span>}
                    {c.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconPhone size={14} /> {c.phone}</span>}
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fg-dimmer)', borderTop: '1px solid var(--panel-border)', paddingTop: 8 }}>
                    Added {formatDate(c.createdAt)}
                  </div>
                </div>
              </Link>
            ))
          )}
      </div>

      {/* ── New/Edit Modal ── */}
      {modalOpen && (
        <div className="vega-modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }} onClick={() => setModalOpen(false)}>
          <div className="vega-modal-content" style={{ ...panel.container, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>{editingContact ? 'Edit Contact' : 'New Contact'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}><span style={forms.label}>Tenant</span>
                <select className="form-select" style={forms.select} required value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })}>
                  <option value="">Select tenant</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <div style={forms.row}>
                <label style={forms.group}><span style={forms.label}>First Name</span>
                  <input className="form-input" style={forms.input} required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
                <label style={forms.group}><span style={forms.label}>Last Name</span>
                  <input className="form-input" style={forms.input} required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
              </div>
              <div style={forms.row}>
                <label style={forms.group}><span style={forms.label}>Title</span>
                  <input className="form-input" style={forms.input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
                <label style={forms.group}><span style={forms.label}>Company</span>
                  <select className="form-select" style={forms.select} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                    <option value="">None</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></label>
              </div>
              <div style={forms.row}>
                <label style={forms.group}><span style={forms.label}>Email</span>
                  <input className="form-input" style={forms.input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                <label style={forms.group}><span style={forms.label}>Phone</span>
                  <input className="form-input" style={forms.input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              </div>
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

export default function ContactsPage() {
  return <ProtectedLayout><ContactsContent /></ProtectedLayout>
}