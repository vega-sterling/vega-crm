'use client'

// ============================================================================
// File: src/app/contacts/page.tsx
// Description: Enhanced contacts list with search bar, company filter, sort,
//              table/card grid toggle, pagination, and hover row actions.
//              Phase 23: Inline create/edit form (no modal), matching Bryan's
//              "inline actions over modals" design principle.
//              Phase 38: HubSpot-style bulk actions — checkboxes in table and
//              card views, contextual bulk action bar (Set Company, Archive,
//              Activate, Export CSV, Delete), mirroring the deals pattern.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import Avatar from '../components/Avatar'
import RowActions from '../components/RowActions'
import Pagination from '../components/Pagination'
import ConfirmDialog from '../components/ConfirmDialog'
import { IconSearch, IconMail, IconPhone, IconPlus, IconTrash } from '../components/Icons'
import { useToast } from '../components/Toast'
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

const emptyForm = {
  tenantId: '', companyId: '', firstName: '', lastName: '', title: '',
  email: '', phone: '', mobile: '', linkedin: '', description: '',
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

  // ── Inline form state (replaces modal) ──
  const [showForm, setShowForm] = useState(false)
  const [editingContact, setEditingContact] = useState<ContactListItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(emptyForm)

  // ── Pending delete (ConfirmDialog state) ──
  const [pendingDelete, setPendingDelete] = useState<ContactListItem | null>(null)
  const [exportError, setExportError] = useState('')

  // ── Phase 38: Bulk action state (mirrors deals list) ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'setCompany' | null>(null)
  const [bulkCompanyId, setBulkCompanyId] = useState('')
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const showToast = useToast()

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

  // ── Phase 38: selection helpers (mirrors deals list) ──
  // Select-all applies to the current filtered page only
  const pageIds = useMemo(() => paginated.map((c) => c.id), [paginated])
  const selectedCount = pageIds.filter((id) => selectedIds.has(id)).length
  const allSelected = pageIds.length > 0 && selectedCount === pageIds.length
  const someSelected = selectedCount > 0 && selectedCount < pageIds.length

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setBulkAction(null)
    setBulkCompanyId('')
  }

  // Prune selection to visible (filtered) IDs when filters change — keeps the
  // count honest for both table view (paginated) and card view (all filtered)
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const visible = new Set(filtered.map((c) => c.id))
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [filtered])

  const openNew = () => {
    setEditingContact(null)
    setForm({ ...emptyForm, tenantId: tenants[0]?.id || '' })
    setShowForm(true)
  }

  const openEdit = (c: ContactListItem) => {
    setEditingContact(c)
    setForm({
      tenantId: c.tenantId, companyId: c.companyId || '', firstName: c.firstName,
      lastName: c.lastName, title: c.title || '', email: c.email || '',
      phone: c.phone || '', mobile: c.mobile || '', linkedin: c.linkedin || '',
      description: c.description || '',
    })
    setShowForm(true)
    // Scroll to form
    setTimeout(() => {
      document.getElementById('inline-contact-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  const handleDelete = async (c: ContactListItem) => {
    setPendingDelete(c)
  }

  const performDelete = async () => {
    const c = pendingDelete
    if (!c) return
    setPendingDelete(null)
    try {
      await apiFetch(`/api/contacts/${c.id}`, { method: 'DELETE' })
      setContacts((prev) => prev.filter((x) => x.id !== c.id))
    } catch (err: any) { setError(err.message || 'Failed to delete contact') }
  }

  // ── Phase 38: Bulk action handlers (mirrors deals list) ──
  const runBulk = async (body: Record<string, unknown>, successVerb: string) => {
    setBulkSubmitting(true)
    try {
      const result = await apiFetch<{ updated: number }>('/api/contacts/bulk', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      showToast(`✓ ${successVerb} ${result.updated} contact${result.updated !== 1 ? 's' : ''}`, { type: 'success' })
      await load()
      clearSelection()
    } catch (err: any) {
      showToast(`✗ ${err.message || 'Bulk action failed'}`, { type: 'error' })
    } finally {
      setBulkSubmitting(false)
    }
  }

  const handleBulkSetCompany = () => {
    if (!bulkCompanyId || selectedIds.size === 0) return
    runBulk({ action: 'setCompany', contactIds: [...selectedIds], companyId: bulkCompanyId }, 'Moved')
  }

  const handleBulkArchive = () => runBulk({ action: 'archive', contactIds: [...selectedIds] }, 'Archived')

  const handleBulkActivate = () => runBulk({ action: 'activate', contactIds: [...selectedIds] }, 'Activated')

  const handleBulkDelete = () => {
    setConfirmBulkDelete(false)
    runBulk({ action: 'delete', contactIds: [...selectedIds] }, 'Deleted')
  }

  // Client-side CSV export of selected rows (not the admin-only /api/export)
  const handleBulkExport = () => {
    const selected = contacts.filter((c) => selectedIds.has(c.id))
    if (selected.length === 0) return
    const esc = (s?: string) => `"${(s || '').replace(/"/g, '""')}"`
    const headers = ['Name', 'Title', 'Email', 'Phone', 'Mobile', 'Company', 'Created']
    const rows = selected.map((c) => [
      esc(`${c.firstName} ${c.lastName}`),
      esc(c.title),
      esc(c.email),
      esc(c.phone),
      esc(c.mobile),
      esc(c.company?.name),
      c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : '',
    ].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vega-contacts-export-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast(`✓ Exported ${selected.length} contact${selected.length !== 1 ? 's' : ''} to CSV`, { type: 'success' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const body = { ...form, tenantId: form.tenantId || tenants[0]?.id }
      if (editingContact) {
        const updated = await apiFetch<Contact>(`/api/contacts/${editingContact.id}`, { method: 'PUT', body: JSON.stringify(body) })
        setContacts((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } as ContactListItem : c)))
      } else {
        const created = await apiFetch<Contact>('/api/contacts', { method: 'POST', body: JSON.stringify(body) })
        setContacts((prev) => [{ ...created, company: companies.find((co) => co.id === created.companyId) || null, _count: { activities: 0 } } as ContactListItem, ...prev])
      }
      setShowForm(false)
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
              setExportError('')
              try {
                const res = await fetch('/api/export?entity=contacts', { credentials: 'include' })
                if (!res.ok) throw new Error('Export failed')
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `contacts-export-${new Date().toISOString().slice(0,10)}.csv`
                document.body.appendChild(a); a.click(); document.body.removeChild(a)
                URL.revokeObjectURL(url)
              } catch (err) { setExportError('Export failed: ' + (err as Error).message) }
            }}>
            ⬇ Export
          </button>
          <Link href="/contacts/duplicates" className="btn-touch" style={{ ...buttons.secondary, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            ⧉ Duplicates
          </Link>
          <button className="btn-touch" style={{ ...buttons.primary, display: 'flex', alignItems: 'center', gap: 6 }} onClick={openNew}>
            <IconPlus size={16} /> New Contact
          </button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(184,80,74,0.12)', color: 'var(--rust)', border: '1px solid rgba(184,80,74,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>{error}</div>
      )}

      {exportError && (
        <div style={{ backgroundColor: 'rgba(184,80,74,0.12)', color: 'var(--rust)', border: '1px solid rgba(184,80,74,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>{exportError}</div>
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

      {/* ── Phase 38: BULK ACTION BAR — appears when contacts are selected ── */}
      {selectedIds.size > 0 && (
        <div
          className="panel-container bulk-action-bar"
          style={{
            ...panel.compact,
            position: 'sticky',
            top: 72,
            zIndex: 30,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            backgroundColor: 'var(--panel-elevated)',
            borderColor: 'var(--gold)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
            {selectedIds.size} selected
          </span>

          {/* Inline bulk action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn-touch"
              style={{ ...buttons.small, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => { setBulkAction(bulkAction === 'setCompany' ? null : 'setCompany') }}
            >
              Set Company
            </button>
            <button
              className="btn-touch"
              style={{ ...buttons.small, display: 'flex', alignItems: 'center', gap: 4, opacity: bulkSubmitting ? 0.5 : 1 }}
              disabled={bulkSubmitting}
              onClick={handleBulkArchive}
            >
              Archive
            </button>
            <button
              className="btn-touch"
              style={{ ...buttons.small, display: 'flex', alignItems: 'center', gap: 4, opacity: bulkSubmitting ? 0.5 : 1 }}
              disabled={bulkSubmitting}
              onClick={handleBulkActivate}
            >
              Activate
            </button>
            <button
              className="btn-touch"
              style={{ ...buttons.small, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={handleBulkExport}
            >
              Export Selected CSV
            </button>
            <button
              className="btn-touch"
              style={{ ...buttons.danger, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setConfirmBulkDelete(true)}
            >
              <IconTrash size={14} /> Delete
            </button>
          </div>

          {/* Inline Set Company controls */}
          {bulkAction === 'setCompany' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="form-select"
                style={{ ...forms.select, width: 'auto', minWidth: 180, padding: '6px 10px', fontSize: 13 }}
                value={bulkCompanyId}
                onChange={(e) => setBulkCompanyId(e.target.value)}
              >
                <option value="">Select company…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button
                className="btn-touch"
                style={{ ...buttons.primary, padding: '6px 14px', fontSize: 13, opacity: (!bulkCompanyId || bulkSubmitting) ? 0.5 : 1 }}
                disabled={!bulkCompanyId || bulkSubmitting}
                onClick={handleBulkSetCompany}
              >
                {bulkSubmitting ? 'Moving…' : 'Apply'}
              </button>
              <button className="btn-touch" style={buttons.secondary} onClick={() => { setBulkAction(null); setBulkCompanyId('') }}>
                Cancel
              </button>
            </div>
          )}

          {/* Clear selection */}
          <button
            onClick={clearSelection}
            style={{
              background: 'transparent', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer',
              fontSize: 13, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 6,
            }}
            className="btn-touch"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Inline Create/Edit Form ── */}
      {showForm && (
        <div id="inline-contact-form" className="panel-container" style={{ ...panel.container, marginBottom: 24, animation: 'slideUp 0.25s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ ...typeography.subtitle, margin: 0 }}>{editingContact ? 'Edit Contact' : 'New Contact'}</h2>
            <button className="btn-touch" style={{ ...buttons.secondary, padding: '6px 12px', fontSize: 13 }} onClick={() => setShowForm(false)}>✕ Close</button>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Tenant</span>
                <select className="form-select" style={forms.select} required value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })}>
                  <option value="">Select tenant</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Company</span>
                <select className="form-select" style={forms.select} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                  <option value="">No company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </div>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}><span style={forms.label}>First Name</span>
                <input className="form-input" style={forms.input} required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
              <label style={forms.group}><span style={forms.label}>Last Name</span>
                <input className="form-input" style={forms.input} required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
            </div>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}><span style={forms.label}>Title</span>
                <input className="form-input" style={forms.input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
              <label style={forms.group}><span style={forms.label}>Email</span>
                <input className="form-input" style={forms.input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            </div>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}><span style={forms.label}>Phone</span>
                <input className="form-input" style={forms.input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              <label style={forms.group}><span style={forms.label}>Mobile</span>
                <input className="form-input" style={forms.input} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></label>
            </div>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}><span style={forms.label}>LinkedIn</span>
                <input className="form-input" style={forms.input} value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} /></label>
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
                <th style={{ ...table.th, width: 44, paddingLeft: 16 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleSelectAll}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--gold)' }}
                    aria-label="Select all contacts on this page"
                  />
                </th>
                <th style={table.th}>Name</th>
                <th style={table.th}>Title</th>
                <th style={table.th}>Email</th>
                <th style={table.th}>Phone</th>
                <th style={table.th}>Company</th>
                <th style={table.th}>Created</th>
                <th style={{ ...table.th, width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={8} style={{ ...table.td, color: 'var(--fg-dim)', textAlign: 'center', padding: 32 }}>No contacts found.</td></tr>
              ) : (
                paginated.map((c) => {
                  const isSelected = selectedIds.has(c.id)
                  return (
                  <tr key={c.id} className="vega-table-row" style={{ ...table.tr, backgroundColor: isSelected ? 'rgba(184,146,74,0.08)' : 'transparent' }}>
                    <td style={{ ...table.td, paddingLeft: 16 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(c.id)}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--gold)' }}
                        aria-label={`Select ${c.firstName} ${c.lastName}`}
                      />
                    </td>
                    <td style={table.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={`${c.firstName} ${c.lastName}`} size={32} />
                        <Link href={`/contacts/${c.id}`} style={{ fontWeight: 600, color: 'var(--fg)' }}>{c.firstName} {c.lastName}</Link>
                        <LeadScoreMini contactId={c.id} />
                      </div>
                    </td>
                    <td style={table.td}>{c.title || '—'}</td>
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
                    <td style={table.td}>
                      {c.company ? (
                        <Link href={`/companies/${c.company.id}`} style={{ color: 'var(--fg-dim)' }}>{c.company.name}</Link>
                      ) : '—'}
                    </td>
                    <td style={{ ...table.td, color: 'var(--fg-dim)', fontSize: 12 }}>{formatDate(c.createdAt)}</td>
                    <td style={table.td}>
                      <RowActions onEdit={() => openEdit(c)} onDelete={() => handleDelete(c)} />
                    </td>
                  </tr>
                  )
                })
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
          <div className="panel-container" style={{ ...panel.container, gridColumn: '1 / -1', textAlign: 'center', color: 'var(--fg-dim)' }}>No contacts found.</div>
        ) : (
          filtered.map((c) => {
            const isSelected = selectedIds.has(c.id)
            return (
            <Link key={c.id} href={`/contacts/${c.id}`} style={{ textDecoration: 'none' }}>
              <div className="panel-container" style={{ ...panel.container, height: '100%', cursor: 'pointer', backgroundColor: isSelected ? 'rgba(184,146,74,0.08)' : undefined, borderColor: isSelected ? 'var(--gold)' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(c.id) }} style={{ display: 'flex', alignItems: 'center', minWidth: 44, minHeight: 44 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--gold)' }}
                        aria-label={`Select ${c.firstName} ${c.lastName}`}
                      />
                    </span>
                    <Avatar name={`${c.firstName} ${c.lastName}`} size={36} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--fg)' }}>{c.firstName} {c.lastName}</div>
                      <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{c.title || 'No title'}</div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 8 }}>
                  {c.company ? <Link href={`/companies/${c.company.id}`} style={{ color: 'var(--fg-dim)' }}>{c.company.name}</Link> : 'No company'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 'auto' }}>
                  {c.email && <div style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 6 }}><IconMail size={12} /> {c.email}</div>}
                  {c.phone && <div style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 6 }}><IconPhone size={12} /> {c.phone}</div>}
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fg-dimmer)', borderTop: '1px solid var(--panel-border)', paddingTop: 8 }}>
                  Created {formatDate(c.createdAt)}
                </div>
              </div>
            </Link>
            )
          })
        )}
      </div>

      {/* ── Phase 38: Bulk delete confirmation ── */}
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selectedIds.size} contact${selectedIds.size !== 1 ? 's' : ''} permanently?`}
        message={`Delete ${selectedIds.size} contact${selectedIds.size !== 1 ? 's' : ''} permanently? Their activities and tasks will also be deleted. This action cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmBulkDelete(false)}
        onConfirm={handleBulkDelete}
      />

      {/* ── Delete contact confirmation ── */}
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete Contact?"
        itemName={pendingDelete ? `${pendingDelete.firstName} ${pendingDelete.lastName}` : undefined}
        onCancel={() => setPendingDelete(null)}
        onConfirm={performDelete}
      />
    </div>
  )
}

export default function ContactsPage() {
  return <ProtectedLayout><ContactsContent /></ProtectedLayout>
}