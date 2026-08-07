'use client'

// ============================================================================
// File: src/app/deals/page.tsx
// Description: Deal Pipeline — Kanban board + List view with bulk actions.
//
//              Kanban view: drag-and-drop between pipeline stages.
//              Each deal card shows company name, deal value, contact name,
//              probability badge. Inline "Add Deal" form.
//              Column totals at top of each stage, SVG icons,
//              refined color palette, depth shadows, empty state CTA.
//
//              List view (Phase 6): sortable, filterable table with
//              checkboxes for bulk operations — Move Stage, Reassign,
//              Export CSV, Delete. Follows HubSpot/Pipedrive bulk action
//              patterns: select-all checkbox, contextual action bar,
//              clear feedback. Responsive: table → cards on mobile.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import ConfirmDialog from '../components/ConfirmDialog'
import { IconPlus, IconDiamond, IconKanban, IconClipboard, IconTrash, IconArrowLeft } from '../components/Icons'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge, statusDot, table } from '../lib/styles'
import type { Deal, PipelineStage, Company, Contact, User, Tenant } from '../lib/types'

const currencyFmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

interface DealsResponse {
  stages?: PipelineStage[]
  deals?: (Deal & {
    company?: { id: string; name: string } | null
    contact?: { id: string; firstName: string; lastName: string } | null
    stage?: { id: string; name: string; color: string } | null
    assignee?: { id: string; name: string } | null
  })[]
}

type SortField = 'title' | 'value' | 'probability' | 'company' | 'stage' | 'assignee' | 'updatedAt'
type SortDir = 'asc' | 'desc'

function DealsContent() {
  const router = useRouter()
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [deals, setDeals] = useState<DealsResponse['deals']>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showNew, setShowNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  // ── View mode: Kanban | List ──
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')

  // ── List view: selection, sorting, filtering ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<SortField>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStageId, setFilterStageId] = useState('')
  const [filterAssigneeId, setFilterAssigneeId] = useState('')

  // ── Bulk action UI state ──
  const [bulkAction, setBulkAction] = useState<'moveStage' | 'reassign' | 'delete' | null>(null)
  const [bulkStageId, setBulkStageId] = useState('')
  const [bulkAssigneeId, setBulkAssigneeId] = useState('')
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkResult, setBulkResult] = useState('')
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const [form, setForm] = useState({
    title: '', companyId: '', contactId: '', tenantId: '',
    value: '', currency: 'USD', probability: '', stageId: '', assignedToId: '',
    expectedCloseDate: '', description: '',
  })

  const load = useCallback(async () => {
    try {
      const [dealsRes, companiesRes, contactsRes, usersRes, tenantsRes] = await Promise.all([
        apiFetch<DealsResponse>('/api/deals'),
        apiFetch<{ data: Company[] }>('/api/companies'),
        apiFetch<{ data: Contact[] }>('/api/contacts'),
        apiFetch<{ data: User[] }>('/api/admin/users'),
        apiFetch<{ data: Tenant[] }>('/api/admin/tenants'),
      ])
      setStages(dealsRes.stages || [])
      setDeals(dealsRes.deals || [])
      setCompanies(companiesRes.data || [])
      setContacts(contactsRes.data || [])
      setUsers(usersRes.data || [])
      setTenants(tenantsRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load pipeline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const totalValue = useMemo(() =>
    (deals || []).reduce((sum, d) => sum + (d.value || 0), 0), [deals]
  )

  // ── Filtered + sorted deals for list view ──
  const filteredDeals = useMemo(() => {
    let result = deals || []
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(d =>
        d.title?.toLowerCase().includes(q) ||
        d.company?.name?.toLowerCase().includes(q) ||
        d.contact?.firstName?.toLowerCase().includes(q) ||
        d.contact?.lastName?.toLowerCase().includes(q) ||
        d.assignee?.name?.toLowerCase().includes(q)
      )
    }
    if (filterStageId) result = result.filter(d => d.stageId === filterStageId)
    if (filterAssigneeId) result = result.filter(d => d.assignedToId === filterAssigneeId)

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'title': cmp = (a.title || '').localeCompare(b.title || ''); break
        case 'value': cmp = (a.value || 0) - (b.value || 0); break
        case 'probability': cmp = (a.probability || 0) - (b.probability || 0); break
        case 'company': cmp = (a.company?.name || '').localeCompare(b.company?.name || ''); break
        case 'stage': cmp = (a.stage?.name || '').localeCompare(b.stage?.name || ''); break
        case 'assignee': cmp = (a.assignee?.name || '').localeCompare(b.assignee?.name || ''); break
        case 'updatedAt': cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [deals, searchQuery, filterStageId, filterAssigneeId, sortField, sortDir])

  const allVisibleIds = filteredDeals.map(d => d.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id))
  const someSelected = allVisibleIds.some(id => selectedIds.has(id)) && !allSelected
  const selectedCount = selectedIds.size

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        allVisibleIds.forEach(id => next.delete(id))
      } else {
        allVisibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setBulkAction(null)
    setBulkResult('')
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // ── Bulk action handlers ──
  const handleBulkMoveStage = async () => {
    if (!bulkStageId || selectedCount === 0) return
    setBulkSubmitting(true)
    setBulkResult('')
    try {
      const result = await apiFetch<{ updated: number }>('/api/deals/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'moveStage', dealIds: [...selectedIds], stageId: bulkStageId }),
      })
      setBulkResult(`✓ Moved ${result.updated} deal${result.updated !== 1 ? 's' : ''} to new stage`)
      // Refresh deals
      await load()
      setBulkAction(null)
      setBulkStageId('')
      setTimeout(() => clearSelection(), 2000)
    } catch (err: any) {
      setBulkResult(`✗ ${err.message || 'Failed to move deals'}`)
    } finally {
      setBulkSubmitting(false)
    }
  }

  const handleBulkReassign = async () => {
    if (!bulkAssigneeId || selectedCount === 0) return
    setBulkSubmitting(true)
    setBulkResult('')
    try {
      const result = await apiFetch<{ updated: number }>('/api/deals/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'reassign', dealIds: [...selectedIds], assignedToId: bulkAssigneeId }),
      })
      setBulkResult(`✓ Reassigned ${result.updated} deal${result.updated !== 1 ? 's' : ''}`)
      await load()
      setBulkAction(null)
      setBulkAssigneeId('')
      setTimeout(() => clearSelection(), 2000)
    } catch (err: any) {
      setBulkResult(`✗ ${err.message || 'Failed to reassign deals'}`)
    } finally {
      setBulkSubmitting(false)
    }
  }

  const handleBulkDelete = async () => {
    setConfirmBulkDelete(false)
    setBulkSubmitting(true)
    setBulkResult('')
    try {
      const result = await apiFetch<{ updated: number }>('/api/deals/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', dealIds: [...selectedIds] }),
      })
      setBulkResult(`✓ Deleted ${result.updated} deal${result.updated !== 1 ? 's' : ''}`)
      await load()
      setBulkAction(null)
      setTimeout(() => clearSelection(), 2000)
    } catch (err: any) {
      setBulkResult(`✗ ${err.message || 'Failed to delete deals'}`)
    } finally {
      setBulkSubmitting(false)
    }
  }

  const handleBulkExport = () => {
    const selected = (deals || []).filter(d => selectedIds.has(d.id))
    if (selected.length === 0) return

    const headers = ['Title', 'Company', 'Contact', 'Stage', 'Value', 'Currency', 'Probability', 'Status', 'Assignee', 'Expected Close', 'Created']
    const rows = selected.map(d => [
      `"${(d.title || '').replace(/"/g, '""')}"`,
      `"${(d.company?.name || '').replace(/"/g, '""')}"`,
      `"${d.contact ? `${d.contact.firstName} ${d.contact.lastName}` : ''}"`,
      `"${(d.stage?.name || '').replace(/"/g, '""')}"`,
      d.value || 0,
      d.currency || 'USD',
      `${d.probability || 0}%`,
      d.status || 'OPEN',
      `"${(d.assignee?.name || '').replace(/"/g, '""')}"`,
      d.expectedCloseDate ? new Date(d.expectedCloseDate).toISOString().split('T')[0] : '',
      new Date(d.createdAt).toISOString().split('T')[0],
    ].join(','))

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vega-deals-export-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setBulkResult(`✓ Exported ${selected.length} deal${selected.length !== 1 ? 's' : ''} to CSV`)
    setTimeout(() => { setBulkResult(''); setBulkAction(null) }, 3000)
  }

  const openNew = () => {
    const tenantId = tenants[0]?.id || ''
    setForm({
      title: '', companyId: '', contactId: '', tenantId,
      value: '', currency: 'USD', probability: '20',
      stageId: stages[0]?.id || '', assignedToId: '',
      expectedCloseDate: '', description: '',
    })
    setShowNew(true)
  }

  const handleSaveDeal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.companyId || !form.tenantId || !form.stageId || !form.assignedToId) {
      setError('Please fill in title, company, tenant, stage, and assignee.')
      return
    }
    setSubmitting(true)
    try {
      const body = { ...form, value: Number(form.value) || 0, probability: Number(form.probability) || 0 }
      const created = await apiFetch<Deal>('/api/deals', { method: 'POST', body: JSON.stringify(body) })
      setDeals((prev) => [created as any, ...(prev || [])])
      setShowNew(false)
      setError('')
    } catch (err: any) {
      setError(err.message || 'Failed to create deal')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStageMove = async (dealId: string, stageId: string) => {
    const stage = stages.find((s) => s.id === stageId)
    try {
      const updated = await apiFetch<Deal>(`/api/deals/${dealId}`, {
        method: 'PUT',
        body: JSON.stringify({ stageId, probability: stage?.probability ?? undefined }),
      })
      setDeals((prev) => (prev || []).map((d) => (d.id === updated.id ? updated as any : d)))
    } catch (err: any) {
      setError(err.message || 'Failed to move deal')
    }
  }

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    setDraggingId(dealId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', dealId)
  }
  const handleDragEnd = () => { setDraggingId(null); setDragOverStage(null) }
  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverStage(stageId)
  }
  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    const dealId = e.dataTransfer.getData('text/plain') || draggingId
    if (dealId) handleStageMove(dealId, stageId)
    setDraggingId(null); setDragOverStage(null)
  }

  const contactsForCompany = (companyId: string) => contacts.filter((c) => c.companyId === companyId)

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>
  }

  return (
    <div style={layout.page}>
      <div style={layout.header}>
        <div>
          <h1 style={{ ...typeography.title, marginBottom: 4 }}>Deals</h1>
          <div style={{ color: 'var(--fg-dim)', fontSize: 14 }}>
            Pipeline value {currencyFmt(totalValue)} · {(deals || []).length} deals · {stages.length} stages
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--panel-border)', borderRadius: 8, overflow: 'hidden' }}>
            <button
              className="btn-touch"
              onClick={() => setViewMode('kanban')}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: viewMode === 'kanban' ? 'var(--gold)' : 'var(--panel)',
                color: viewMode === 'kanban' ? 'var(--bg)' : 'var(--fg-dim)',
                transition: 'all .2s',
              }}
            >
              <IconKanban size={16} /> Board
            </button>
            <button
              className="btn-touch"
              onClick={() => setViewMode('list')}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: viewMode === 'list' ? 'var(--gold)' : 'var(--panel)',
                color: viewMode === 'list' ? 'var(--bg)' : 'var(--fg-dim)',
                transition: 'all .2s',
              }}
            >
              <IconClipboard size={16} /> List
            </button>
          </div>
          <button className="btn-touch" style={{ ...buttons.primary, display: 'flex', alignItems: 'center', gap: 6 }} onClick={openNew}>
            <IconPlus size={16} /> Add Deal
          </button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(184,80,74,0.12)', color: 'var(--rust)', border: '1px solid rgba(184,80,74,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* ── Inline Add Deal Form ── */}
      {showNew && (
        <div className="panel-container" style={{ ...panel.container, marginBottom: 24 }}>
          <h2 style={{ ...typeography.subtitle, margin: '0 0 16px' }}>New Deal</h2>
          <form onSubmit={handleSaveDeal} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Deal Title</span>
                <input className="form-input" style={forms.input} required value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. MDU fiber contract" />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Company</span>
                <select className="form-select" style={forms.select} required value={form.companyId}
                  onChange={(e) => {
                    const co = companies.find((c) => c.id === e.target.value)
                    setForm({ ...form, companyId: e.target.value, tenantId: co?.tenantId || form.tenantId })
                  }}>
                  <option value="">Select company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </div>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Contact (optional)</span>
                <select className="form-select" style={forms.select} value={form.contactId}
                  onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
                  <option value="">None</option>
                  {contactsForCompany(form.companyId).map((c) => (
                    <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                  ))}
                </select>
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Stage</span>
                <select className="form-select" style={forms.select} required value={form.stageId}
                  onChange={(e) => setForm({ ...form, stageId: e.target.value })}>
                  <option value="">Select stage</option>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Value ($)</span>
                <input className="form-input" style={forms.input} type="number" value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0" />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Probability (%)</span>
                <input className="form-input" style={forms.input} type="number" min={0} max={100} value={form.probability}
                  onChange={(e) => setForm({ ...form, probability: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Assignee</span>
                <select className="form-select" style={forms.select} required value={form.assignedToId}
                  onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
                  <option value="">Select user</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Expected Close</span>
                <input className="form-input" style={forms.input} type="date" value={form.expectedCloseDate}
                  onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} />
              </label>
            </div>
            <label style={forms.group}>
              <span style={forms.label}>Description (optional)</span>
              <textarea className="form-textarea" style={forms.textarea} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-touch" style={buttons.secondary} onClick={() => setShowNew(false)}>Cancel</button>
              <button type="submit" className="btn-touch" style={{ ...buttons.primary, opacity: submitting ? 0.6 : 1 }} disabled={submitting}>
                {submitting ? 'Saving…' : 'Create Deal'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── BULK ACTION BAR — appears when deals are selected ── */}
      {viewMode === 'list' && selectedCount > 0 && (
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
            {selectedCount} selected
          </span>

          {/* Inline bulk action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn-touch"
              style={{ ...buttons.small, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => { setBulkAction('moveStage'); setBulkResult('') }}
            >
              Move Stage
            </button>
            <button
              className="btn-touch"
              style={{ ...buttons.small, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => { setBulkAction('reassign'); setBulkResult('') }}
            >
              Reassign
            </button>
            <button
              className="btn-touch"
              style={{ ...buttons.small, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={handleBulkExport}
            >
              Export CSV
            </button>
            <button
              className="btn-touch"
              style={{ ...buttons.danger, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setConfirmBulkDelete(true)}
            >
              <IconTrash size={14} /> Delete
            </button>
          </div>

          {/* Inline Move Stage controls */}
          {bulkAction === 'moveStage' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="form-select"
                style={{ ...forms.select, width: 'auto', minWidth: 180, padding: '6px 10px', fontSize: 13 }}
                value={bulkStageId}
                onChange={(e) => setBulkStageId(e.target.value)}
              >
                <option value="">Select target stage…</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button
                className="btn-touch"
                style={{ ...buttons.primary, padding: '6px 14px', fontSize: 13, opacity: (!bulkStageId || bulkSubmitting) ? 0.5 : 1 }}
                disabled={!bulkStageId || bulkSubmitting}
                onClick={handleBulkMoveStage}
              >
                {bulkSubmitting ? 'Moving…' : 'Apply'}
              </button>
              <button className="btn-touch" style={buttons.secondary} onClick={() => { setBulkAction(null); setBulkStageId('') }}>
                Cancel
              </button>
            </div>
          )}

          {/* Inline Reassign controls */}
          {bulkAction === 'reassign' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="form-select"
                style={{ ...forms.select, width: 'auto', minWidth: 180, padding: '6px 10px', fontSize: 13 }}
                value={bulkAssigneeId}
                onChange={(e) => setBulkAssigneeId(e.target.value)}
              >
                <option value="">Select new owner…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button
                className="btn-touch"
                style={{ ...buttons.primary, padding: '6px 14px', fontSize: 13, opacity: (!bulkAssigneeId || bulkSubmitting) ? 0.5 : 1 }}
                disabled={!bulkAssigneeId || bulkSubmitting}
                onClick={handleBulkReassign}
              >
                {bulkSubmitting ? 'Assigning…' : 'Apply'}
              </button>
              <button className="btn-touch" style={buttons.secondary} onClick={() => { setBulkAction(null); setBulkAssigneeId('') }}>
                Cancel
              </button>
            </div>
          )}

          {/* Clear selection + result feedback */}
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

          {bulkResult && (
            <div style={{
              width: '100%',
              fontSize: 13,
              fontWeight: 600,
              color: bulkResult.startsWith('✓') ? 'var(--emerald)' : 'var(--rust)',
              padding: '8px 0 0',
            }}>
              {bulkResult}
            </div>
          )}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode === 'list' && (
        <>
          {/* Filter bar */}
          <div className="list-toolbar" style={{
            ...panel.compact,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
          }}>
            <input
              className="form-input"
              style={{ ...forms.input, width: 'auto', minWidth: 220, flex: 1 }}
              placeholder="Search deals…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="form-select"
              style={{ ...forms.select, width: 'auto', minWidth: 140 }}
              value={filterStageId}
              onChange={(e) => setFilterStageId(e.target.value)}
            >
              <option value="">All stages</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select
              className="form-select"
              style={{ ...forms.select, width: 'auto', minWidth: 140 }}
              value={filterAssigneeId}
              onChange={(e) => setFilterAssigneeId(e.target.value)}
            >
              <option value="">All assignees</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <span style={{ color: 'var(--fg-dim)', fontSize: 13, whiteSpace: 'nowrap' }}>
              {filteredDeals.length} deal{filteredDeals.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Desktop table view */}
          <div className="panel-container list-table-view" style={{ ...panel.container, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={table.table}>
                <thead>
                  <tr>
                    <th style={{ ...table.th, width: 40, paddingLeft: 16 }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected }}
                        onChange={toggleSelectAll}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--gold)' }}
                        aria-label="Select all deals"
                      />
                    </th>
                    <SortableTh field="title" sortField={sortField} sortDir={sortDir} onSort={handleSort} style={{ paddingLeft: 0 }}>
                      Deal
                    </SortableTh>
                    <SortableTh field="company" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                      Company
                    </SortableTh>
                    <SortableTh field="value" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                      Value
                    </SortableTh>
                    <SortableTh field="probability" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                      Prob
                    </SortableTh>
                    <SortableTh field="stage" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                      Stage
                    </SortableTh>
                    <SortableTh field="assignee" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                      Owner
                    </SortableTh>
                    <SortableTh field="updatedAt" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                      Updated
                    </SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeals.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ ...table.td, textAlign: 'center', padding: 40, color: 'var(--fg-dimmer)' }}>
                        No deals match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredDeals.map((deal) => {
                      const stageColor = deal.stage?.color || 'var(--gold)'
                      const isSelected = selectedIds.has(deal.id)
                      return (
                        <tr
                          key={deal.id}
                          style={{
                            ...table.tr,
                            cursor: 'pointer',
                            backgroundColor: isSelected ? 'rgba(184,146,74,0.08)' : 'transparent',
                          }}
                          onClick={(e) => {
                            // Only navigate if clicking the row, not the checkbox
                            if ((e.target as HTMLElement).tagName !== 'INPUT') {
                              router.push(`/deals/${deal.id}`)
                            }
                          }}
                        >
                          <td style={{ ...table.td, paddingLeft: 16 }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(deal.id)}
                              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--gold)' }}
                              aria-label={`Select ${deal.title}`}
                            />
                          </td>
                          <td style={{ ...table.td, paddingLeft: 0, fontWeight: 600 }}>
                            {deal.title}
                            {deal.contact && (
                              <div style={{ fontSize: 12, color: 'var(--fg-dim)', fontWeight: 400, marginTop: 2 }}>
                                {deal.contact.firstName} {deal.contact.lastName}
                              </div>
                            )}
                          </td>
                          <td style={table.td}>{deal.company?.name || '—'}</td>
                          <td style={{ ...table.td, fontWeight: 700, color: 'var(--gold)' }}>
                            {currencyFmt(deal.value || 0, deal.currency)}
                          </td>
                          <td style={table.td}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{deal.probability || 0}%</span>
                          </td>
                          <td style={table.td}>
                            <span style={statusBadge(stageColor)}>
                              <span style={statusDot(stageColor)} />
                              {deal.stage?.name || '—'}
                            </span>
                          </td>
                          <td style={table.td}>{deal.assignee?.name || '—'}</td>
                          <td style={{ ...table.td, color: 'var(--fg-dim)', fontSize: 13 }}>
                            {new Date(deal.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile card view — same data, card layout */}
          <div className="list-card-view" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
            {filteredDeals.length === 0 ? (
              <div className="panel-container" style={{ ...panel.container, textAlign: 'center', color: 'var(--fg-dimmer)' }}>
                No deals match your filters.
              </div>
            ) : (
              filteredDeals.map((deal) => {
                const stageColor = deal.stage?.color || 'var(--gold)'
                const isSelected = selectedIds.has(deal.id)
                return (
                  <div
                    key={deal.id}
                    className="panel-container"
                    style={{
                      ...panel.compact,
                      borderLeft: `3px solid ${stageColor}`,
                      backgroundColor: isSelected ? 'rgba(184,146,74,0.08)' : 'var(--panel)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(deal.id)}
                        style={{ width: 20, height: 20, cursor: 'pointer', accentColor: 'var(--gold)', flexShrink: 0, marginTop: 2 }}
                        aria-label={`Select ${deal.title}`}
                      />
                      <div style={{ flex: 1, minWidth: 0 }} onClick={() => router.push(`/deals/${deal.id}`)}>
                        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{deal.title}</div>
                        <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 8 }}>
                          {deal.company?.name || '—'}
                          {deal.contact && ` · ${deal.contact.firstName} ${deal.contact.lastName}`}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--gold)' }}>
                            {currencyFmt(deal.value || 0, deal.currency)}
                          </span>
                          <span style={statusBadge(stageColor)}>
                            <span style={statusDot(stageColor)} />
                            {deal.stage?.name || '—'}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
                            {deal.probability || 0}% · {deal.assignee?.name || '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {/* ── KANBAN BOARD ── */}
      {viewMode === 'kanban' && stages.length > 0 && (
        <div className="kanban-board kanban-board-scroll" style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${stages.length}, minmax(280px, 1fr))`,
          gap: 16,
          overflowX: 'auto',
          paddingBottom: 8,
        }}>
          {stages.map((stage) => {
            const stageDeals = (deals || []).filter((d) => d.stageId === stage.id)
            const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
            const isDragOver = dragOverStage === stage.id
            const stageColor = stage.color || 'var(--gold)'
            return (
              <div
                key={stage.id}
                className="kanban-column"
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => handleDrop(e, stage.id)}
                style={{ minWidth: 280, display: 'flex', flexDirection: 'column' }}
              >
                {/* Column header — with total value at top */}
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '12px 12px 0 0',
                  backgroundColor: 'var(--bg-soft)',
                  border: `1px solid ${isDragOver ? stageColor : 'var(--panel-border)'}`,
                  borderBottom: 'none',
                  transition: 'border-color .2s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: stageColor, flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' }}>{stage.name}</span>
                    </div>
                    <span style={{ color: 'var(--fg-dim)', fontSize: 12, fontWeight: 600 }}>{stageDeals.length}</span>
                  </div>
                  {/* Column total — sum of deal values */}
                  <div style={{ fontSize: 13, fontWeight: 600, color: stageColor, letterSpacing: '-0.01em' }}>
                    {currencyFmt(stageValue)}
                  </div>
                </div>

                {/* Column body — droppable area */}
                <div style={{
                  flex: 1, minHeight: 120, padding: 12,
                  backgroundColor: isDragOver ? `${stageColor}11` : 'var(--bg-soft)',
                  border: `1px solid ${isDragOver ? stageColor : 'var(--panel-border)'}`,
                  borderTop: 'none', borderRadius: '0 0 12px 12px',
                  display: 'flex', flexDirection: 'column', gap: 10,
                  transition: 'background .2s, border-color .2s',
                }}>
                  {stageDeals.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--fg-dimmer)', fontSize: 13 }}>
                      Drop deals here
                    </div>
                  ) : (
                    stageDeals.map((deal) => (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, deal.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => router.push(`/deals/${deal.id}`)}
                        className="panel-container"
                        style={{
                          ...panel.compact,
                          cursor: 'grab',
                          opacity: draggingId === deal.id ? 0.4 : 1,
                          borderLeft: `3px solid ${stageColor}`,
                          transition: 'opacity .15s, box-shadow .15s, border-color .15s',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{deal.company?.name || '—'}</div>
                        <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 8 }}>{deal.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--gold)' }}>
                            {currencyFmt(deal.value || 0, deal.currency)}
                          </span>
                          {deal.contact && (
                            <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
                              {deal.contact.firstName} {deal.contact.lastName}
                            </span>
                          )}
                        </div>
                        {deal.probability != null && deal.probability > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <span style={statusBadge(stageColor)}>
                              <span style={statusDot(stageColor)} />
                              {deal.probability}% likely
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Kanban empty state */}
      {viewMode === 'kanban' && stages.length === 0 && (
        <div className="panel-container vega-empty-state" style={{ ...panel.container, textAlign: 'center' }}>
          <IconDiamond size={32} strokeWidth={1.5} />
          <p className="vega-empty-state-text" style={{ marginTop: 12 }}>No pipeline stages configured.</p>
          <Link href="/settings" style={{ ...buttons.small, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            Configure pipeline
          </Link>
        </div>
      )}

      {/* Kanban empty deals */}
      {viewMode === 'kanban' && stages.length > 0 && (deals || []).length === 0 && (
        <div className="panel-container vega-empty-state" style={{ ...panel.container, textAlign: 'center', marginTop: 24 }}>
          <IconDiamond size={32} strokeWidth={1.5} />
          <p className="vega-empty-state-text" style={{ marginTop: 12 }}>No deals yet — create your first deal to start tracking.</p>
          <button className="btn-touch" style={{ ...buttons.small, display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }} onClick={openNew}>
            <IconPlus size={14} /> Create your first deal
          </button>
        </div>
      )}

      {/* ── Bulk delete confirmation ── */}
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selectedCount} deal${selectedCount !== 1 ? 's' : ''}?`}
        message={`This will permanently delete ${selectedCount} deal${selectedCount !== 1 ? 's' : ''} and all their associated activities. This action cannot be undone.`}
        confirmLabel="Delete All"
        onCancel={() => setConfirmBulkDelete(false)}
        onConfirm={handleBulkDelete}
      />
    </div>
  )
}

// ── Sortable table header helper ──
function SortableTh({
  field,
  sortField,
  sortDir,
  onSort,
  children,
  style,
}: {
  field: SortField
  sortField: SortField
  sortDir: SortDir
  onSort: (f: SortField) => void
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const isActive = sortField === field
  return (
    <th
      style={{ ...table.th, cursor: 'pointer', userSelect: 'none', ...style }}
      onClick={() => onSort(field)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {children}
        <span style={{
          fontSize: 10,
          opacity: isActive ? 1 : 0.3,
          transition: 'opacity .15s',
        }}>
          {isActive ? (sortDir === 'asc' ? '▲' : '▼') : '▼'}
        </span>
      </span>
    </th>
  )
}

export default function DealsPage() {
  return <ProtectedLayout><DealsContent /></ProtectedLayout>
}