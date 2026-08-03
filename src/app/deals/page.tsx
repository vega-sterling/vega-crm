'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge } from '../lib/styles'
import type { Deal, PipelineStage, Company, Contact, User, Tenant, Activity } from '../lib/types'

const currencyFmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const formatDate = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const stageColor = (stage?: PipelineStage | null) => stage?.color || 'var(--gold)'

interface DealsResponse {
  stages?: PipelineStage[]
  deals?: Deal[]
}

function avatarInitials(name?: string | null) {
  if (!name) return '?'
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
}

function DealsContent() {
  const router = useRouter()
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [tenantFilter, setTenantFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [drawerDeal, setDrawerDeal] = useState<Deal | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newStageId, setNewStageId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    companyId: '',
    contactId: '',
    tenantId: '',
    value: '',
    currency: 'USD',
    probability: '',
    stageId: '',
    assignedToId: '',
    expectedCloseDate: '',
    description: '',
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
      const stageList = dealsRes.stages || []
      const dealList = dealsRes.deals || []
      setStages(stageList)
      setDeals(dealList)
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

  useEffect(() => {
    load()
  }, [load])

  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      if (assigneeFilter && d.assignedToId !== assigneeFilter) return false
      if (tenantFilter && d.tenantId !== tenantFilter) return false
      if (dateFrom && d.expectedCloseDate && new Date(d.expectedCloseDate) < new Date(dateFrom)) return false
      if (dateTo && d.expectedCloseDate && new Date(d.expectedCloseDate) > new Date(dateTo)) return false
      return true
    })
  }, [deals, assigneeFilter, tenantFilter, dateFrom, dateTo])

  const totalValue = useMemo(
    () => filteredDeals.reduce((sum, d) => sum + (d.value || 0), 0),
    [filteredDeals]
  )
  const weightedValue = useMemo(
    () => filteredDeals.reduce((sum, d) => sum + (d.value || 0) * (d.probability || 0) / 100, 0),
    [filteredDeals]
  )

  const openNew = (stageId?: string) => {
    const tenantId = tenants[0]?.id || ''
    setForm({
      title: '',
      companyId: '',
      contactId: '',
      tenantId,
      value: '',
      currency: 'USD',
      probability: String(stages.find((s) => s.id === stageId)?.probability ?? 20),
      stageId: stageId || stages[0]?.id || '',
      assignedToId: '',
      expectedCloseDate: '',
      description: '',
    })
    setNewStageId(stageId || stages[0]?.id || '')
    setShowNew(true)
  }

  const openDrawer = async (deal: Deal) => {
    try {
      const res = await apiFetch<{ activities: Activity[] }>(`/api/deals/${deal.id}/activities`)
      setActivities(res.activities || [])
    } catch {
      setActivities([])
    }
    setDrawerDeal(deal)
  }

  const handleSaveDeal = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const body = {
        ...form,
        value: Number(form.value) || 0,
        probability: Number(form.probability) || 0,
      }
      if (drawerDeal) {
        const updated = await apiFetch<Deal>(`/api/deals/${drawerDeal.id}`, { method: 'PUT', body: JSON.stringify(body) })
        setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
        setDrawerDeal(updated)
      } else {
        const created = await apiFetch<Deal>('/api/deals', { method: 'POST', body: JSON.stringify(body) })
        setDeals((prev) => [created, ...prev])
        setShowNew(false)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save deal')
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
      setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
      if (drawerDeal?.id === updated.id) setDrawerDeal(updated)
    } catch (err: any) {
      setError(err.message || 'Failed to move deal')
    }
  }

  const handleDragStart = (dealId: string) => setDraggingId(dealId)
  const handleDrop = async (stageId: string) => {
    if (!draggingId) return
    await handleStageMove(draggingId, stageId)
    setDraggingId(null)
  }

  const contactsForCompany = (companyId: string) => contacts.filter((c) => c.companyId === companyId)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div style={layout.page}>
      <div style={layout.header}>
        <div>
          <h1 style={{ ...typeography.title, marginBottom: 4 }}>Deals</h1>
          <div style={{ color: 'var(--fg-dim)', fontSize: 14 }}>
            Pipeline value {currencyFmt(totalValue)} · Weighted {currencyFmt(weightedValue)}
          </div>
        </div>
        <button style={buttons.primary} onClick={() => openNew()}>+ New Deal</button>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div style={{ ...panel.compact, marginBottom: 24 }}>
        <div style={{ ...forms.row, alignItems: 'end' }}>
          <label style={forms.group}>
            <span style={forms.label}>Assignee</span>
            <select style={forms.select} value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
              <option value="">All</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
          <label style={forms.group}>
            <span style={forms.label}>Tenant</span>
            <select style={forms.select} value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)}>
              <option value="">All</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label style={forms.group}>
            <span style={forms.label}>From</span>
            <input style={forms.input} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label style={forms.group}>
            <span style={forms.label}>To</span>
            <input style={forms.input} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="kanban-board-scroll" style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div className="kanban-board" style={{ ...layout.board, minWidth: stages.length * 280 }}>
          {stages.map((stage) => {
            const stageDeals = filteredDeals.filter((d) => d.stageId === stage.id)
            const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
            return (
              <div
                key={stage.id}
                className="kanban-column"
                style={{
                  ...panel.compact,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  minHeight: 400,
                  backgroundColor: draggingId ? 'var(--bg-soft)' : 'var(--panel)',
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(stage.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: stage.color }} />
                    <span style={{ fontWeight: 700 }}>{stage.name}</span>
                    <span style={statusBadge('var(--fg-dim)')}>{stageDeals.length}</span>
                  </div>
                </div>
                <div style={{ color: 'var(--fg-dim)', fontSize: 12, marginBottom: 4 }}>{currencyFmt(stageValue)}</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  {stageDeals.map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={() => handleDragStart(deal.id)}
                      onClick={() => openDrawer(deal)}
                      style={{
                        ...panel.compact,
                        cursor: 'pointer',
                        borderLeft: `3px solid ${stageColor(deal.stage)}`,
                        opacity: draggingId === deal.id ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{deal.title}</div>
                      <div style={{ ...typeography.small, marginBottom: 8 }}>{deal.company?.name || '—'}</div>
                      <div style={{ fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>{currencyFmt(deal.value || 0, deal.currency)}</div>
                      <div style={{ height: 4, backgroundColor: 'var(--bg)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                        <div style={{ width: `${deal.probability}%`, height: '100%', backgroundColor: stageColor(deal.stage) }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: 'var(--panel-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                            {avatarInitials(deal.assignee?.name)}
                          </div>
                          <span style={typeography.small}>{deal.assignee?.name || 'Unassigned'}</span>
                        </div>
                        <span style={typeography.small}>{formatDate(deal.expectedCloseDate)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <button style={{ ...buttons.secondary, width: '100%' }} onClick={() => openNew(stage.id)}>+ Add deal</button>
              </div>
            )
          })}
        </div>
      </div>

      {(showNew || drawerDeal) && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => { setShowNew(false); setDrawerDeal(null) }}
        >
          <div className="task-drawer" style={{ ...panel.container, width: '100%', maxWidth: 520, maxHeight: '100vh', overflow: 'auto', borderRadius: 0 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...layout.header, marginBottom: 16 }}>
              <h2 style={{ ...typeography.subtitle, margin: 0 }}>{drawerDeal ? 'Edit Deal' : 'New Deal'}</h2>
              <button style={{ ...buttons.small, fontSize: 16 }} onClick={() => { setShowNew(false); setDrawerDeal(null) }}>✕</button>
            </div>

            <form onSubmit={handleSaveDeal} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Title</span>
                <input style={forms.input} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </label>

              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Value</span>
                  <input style={forms.input} type="number" min={0} step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Currency</span>
                  <select style={forms.select} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </label>
              </div>

              <label style={forms.group}>
                <span style={forms.label}>Probability {form.probability}%</span>
                <input style={forms.input} type="range" min={0} max={100} value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} />
              </label>

              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Stage</span>
                  <select style={forms.select} value={form.stageId} onChange={(e) => setForm({ ...form, stageId: e.target.value })}>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Assignee</span>
                  <select style={forms.select} value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Company</span>
                  <select style={forms.select} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value, contactId: '' })}>
                    <option value="">Select company</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Contact</span>
                  <select style={forms.select} value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
                    <option value="">Select contact</option>
                    {contactsForCompany(form.companyId).map((c) => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label style={forms.group}>
                <span style={forms.label}>Expected close date</span>
                <input style={forms.input} type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} />
              </label>

              <label style={forms.group}>
                <span style={forms.label}>Description</span>
                <textarea style={forms.textarea} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>

              {drawerDeal && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ ...layout.header, marginBottom: 8 }}>
                    <h3 style={{ ...typeography.subtitle, margin: 0, fontSize: 16 }}>Activity timeline</h3>
                    <Link href={`/deals/${drawerDeal.id}`} style={{ color: 'var(--gold)', fontSize: 13 }}>Full details →</Link>
                  </div>
                  {activities.length === 0 ? (
                    <p style={typeography.muted}>No activity yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {activities.map((a) => (
                        <div key={a.id} style={{ ...panel.compact, padding: 12 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{a.subject}</div>
                          <div style={{ ...typeography.small, marginTop: 4 }}>{a.type} · {a.user?.name} · {formatDate(a.createdAt)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => { setShowNew(false); setDrawerDeal(null) }}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Save Deal'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DealsPage() {
  return (
    <ProtectedLayout>
      <DealsContent />
    </ProtectedLayout>
  )
}
