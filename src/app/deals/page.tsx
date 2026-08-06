'use client'

// ============================================================================
// File: src/app/deals/page.tsx
// Description: Kanban board with drag-and-drop between pipeline stages.
//              Each deal card shows company name, deal value, contact name,
//              probability badge. Inline "Add Deal" form.
//              Phase 3 UI/UX: column totals at top of each stage, SVG icons,
//              refined color palette, depth shadows, empty state CTA.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import { IconPlus, IconDiamond } from '../components/Icons'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge, statusDot } from '../lib/styles'
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
        <button className="btn-touch" style={{ ...buttons.primary, display: 'flex', alignItems: 'center', gap: 6 }} onClick={openNew}>
          <IconPlus size={16} /> Add Deal
        </button>
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

      {/* ── Kanban Board ── */}
      {stages.length > 0 ? (
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
      ) : (
        <div className="panel-container vega-empty-state" style={{ ...panel.container, textAlign: 'center' }}>
          <IconDiamond size={32} strokeWidth={1.5} />
          <p className="vega-empty-state-text" style={{ marginTop: 12 }}>No pipeline stages configured.</p>
          <Link href="/settings" style={{ ...buttons.small, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            Configure pipeline
          </Link>
        </div>
      )}

      {/* Empty state when stages exist but no deals */}
      {stages.length > 0 && (deals || []).length === 0 && (
        <div className="panel-container vega-empty-state" style={{ ...panel.container, textAlign: 'center', marginTop: 24 }}>
          <IconDiamond size={32} strokeWidth={1.5} />
          <p className="vega-empty-state-text" style={{ marginTop: 12 }}>No deals yet — create your first deal to start tracking.</p>
          <button className="btn-touch" style={{ ...buttons.small, display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }} onClick={openNew}>
            <IconPlus size={14} /> Create your first deal
          </button>
        </div>
      )}
    </div>
  )
}

export default function DealsPage() {
  return <ProtectedLayout><DealsContent /></ProtectedLayout>
}