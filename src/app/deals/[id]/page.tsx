'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge } from '../../lib/styles'
import type { Deal, PipelineStage, Company, Contact, User, Activity, Task, EmailMessage } from '../../lib/types'

const currencyFmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const formatDate = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatDateTime = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function DealDetailContent() {
  const params = useParams()
  const dealId = params.id as string

  const [deal, setDeal] = useState<Deal | null>(null)
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [emails, setEmails] = useState<EmailMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState(false)

  const [form, setForm] = useState<{
    title: string
    value: number
    currency: string
    probability: number
    stageId: string
    assignedToId: string
    companyId: string
    contactId: string
    expectedCloseDate: string
    description: string
    status: 'OPEN' | 'WON' | 'LOST'
  }>({
    title: '',
    value: 0,
    currency: 'USD',
    probability: 0,
    stageId: '',
    assignedToId: '',
    companyId: '',
    contactId: '',
    expectedCloseDate: '',
    description: '',
    status: 'OPEN',
  })

  const load = useCallback(async () => {
    try {
      const [dealRes, stagesRes, companiesRes, contactsRes, usersRes, activitiesRes, tasksRes, emailsRes] = await Promise.all([
        apiFetch<Deal>(`/api/deals/${dealId}`),
        apiFetch<{ data: PipelineStage[] }>('/api/deals/stages'),
        apiFetch<{ data: Company[] }>('/api/companies'),
        apiFetch<{ data: Contact[] }>('/api/contacts'),
        apiFetch<{ data: User[] }>('/api/admin/users'),
        apiFetch<{ activities: Activity[] }>(`/api/deals/${dealId}/activities`),
        apiFetch<{ data: Task[] }>(`/api/tasks?dealId=${dealId}`),
        apiFetch<{ data: EmailMessage[] }>(`/api/email/messages?dealId=${dealId}`),
      ])
      setDeal(dealRes)
      setForm({
        title: dealRes.title,
        value: dealRes.value || 0,
        currency: dealRes.currency || 'USD',
        probability: dealRes.probability || 0,
        stageId: dealRes.stageId,
        assignedToId: dealRes.assignedToId || '',
        companyId: dealRes.companyId,
        contactId: dealRes.contactId || '',
        expectedCloseDate: dealRes.expectedCloseDate ? dealRes.expectedCloseDate.slice(0, 10) : '',
        description: dealRes.description || '',
        status: dealRes.status,
      })
      setStages(stagesRes.data || [])
      setCompanies(companiesRes.data || [])
      setContacts(contactsRes.data || [])
      setUsers(usersRes.data || [])
      setActivities(activitiesRes.activities || [])
      setTasks(tasksRes.data || [])
      setEmails(emailsRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load deal')
    } finally {
      setLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const updated = await apiFetch<Deal>(`/api/deals/${dealId}`, { method: 'PUT', body: JSON.stringify(form) })
      setDeal(updated)
      setEditing(false)
    } catch (err: any) {
      setError(err.message || 'Failed to save deal')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatus = async (status: 'WON' | 'LOST') => {
    setSubmitting(true)
    try {
      const updated = await apiFetch<Deal>(`/api/deals/${dealId}`, { method: 'PUT', body: JSON.stringify({ status }) })
      setDeal(updated)
      setForm((prev) => ({ ...prev, status }))
    } catch (err: any) {
      setError(err.message || 'Failed to update status')
    } finally {
      setSubmitting(false)
    }
  }

  const contactsForCompany = (companyId: string) => contacts.filter((c) => c.companyId === companyId)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <Spinner size={32} />
      </div>
    )
  }

  if (!deal) {
    return (
      <div style={layout.page}>
        <p style={typeography.muted}>Deal not found.</p>
      </div>
    )
  }

  const stage = stages.find((s) => s.id === deal.stageId)

  return (
    <div style={layout.page}>
      <div style={layout.header}>
        <div>
          <Link href="/deals" style={{ color: 'var(--fg-dim)', fontSize: 14 }}>← Back to deals</Link>
          <h1 style={{ ...typeography.title, marginBottom: 4, marginTop: 8 }}>{deal.title}</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={statusBadge(stage?.color || 'var(--gold)')}>{stage?.name || '—'}</span>
            <span style={statusBadge(deal.status === 'WON' ? 'var(--emerald)' : deal.status === 'LOST' ? 'var(--rust)' : 'var(--blue)')}>{deal.status}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {!editing && <button style={buttons.secondary} onClick={() => setEditing(true)}>Edit</button>}
          {deal.status !== 'WON' && <button style={{ ...buttons.primary, backgroundColor: 'var(--emerald)' }} onClick={() => handleStatus('WON')} disabled={submitting}>Mark Won</button>}
          {deal.status !== 'LOST' && <button style={buttons.danger} onClick={() => handleStatus('LOST')} disabled={submitting}>Mark Lost</button>}
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div className="project-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel-container" style={panel.container}>
            {editing ? (
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label style={forms.group}>
                  <span style={forms.label}>Title</span>
                  <input style={forms.input} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </label>

                <div style={forms.row}>
                  <label style={forms.group}>
                    <span style={forms.label}>Value</span>
                    <input style={forms.input} type="number" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
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
                  <input style={forms.input} type="range" min={0} max={100} value={form.probability} onChange={(e) => setForm({ ...form, probability: Number(e.target.value) })} />
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

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button type="button" style={buttons.secondary} onClick={() => setEditing(false)}>Cancel</button>
                  <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Save changes'}</button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={forms.row}>
                  <div style={forms.group}>
                    <span style={forms.label}>Value</span>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--gold)' }}>{currencyFmt(deal.value || 0, deal.currency)}</div>
                  </div>
                  <div style={forms.group}>
                    <span style={forms.label}>Probability</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, height: 8, backgroundColor: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${deal.probability}%`, height: '100%', backgroundColor: stage?.color || 'var(--gold)' }} />
                      </div>
                      <span style={{ fontWeight: 700 }}>{deal.probability}%</span>
                    </div>
                  </div>
                </div>

                <div style={forms.row}>
                  <div style={forms.group}>
                    <span style={forms.label}>Stage</span>
                    <div>{stage?.name || '—'}</div>
                  </div>
                  <div style={forms.group}>
                    <span style={forms.label}>Assignee</span>
                    <div>{deal.assignee?.name || 'Unassigned'}</div>
                  </div>
                </div>

                <div style={forms.row}>
                  <div style={forms.group}>
                    <span style={forms.label}>Company</span>
                    <div>{deal.company ? <Link href={`/companies/${deal.company.id}`} style={{ color: 'var(--gold)' }}>{deal.company.name}</Link> : '—'}</div>
                  </div>
                  <div style={forms.group}>
                    <span style={forms.label}>Contact</span>
                    <div>{deal.contact ? <Link href={`/contacts/${deal.contact.id}`} style={{ color: 'var(--gold)' }}>{deal.contact.firstName} {deal.contact.lastName}</Link> : '—'}</div>
                  </div>
                </div>

                <div style={forms.row}>
                  <div style={forms.group}>
                    <span style={forms.label}>Expected close date</span>
                    <div>{formatDate(deal.expectedCloseDate)}</div>
                  </div>
                  <div style={forms.group}>
                    <span style={forms.label}>Created</span>
                    <div style={{ color: 'var(--fg-dim)' }}>{formatDateTime(deal.createdAt)}</div>
                  </div>
                </div>

                <div style={forms.group}>
                  <span style={forms.label}>Description</span>
                  <div style={{ color: 'var(--fg-dim)', lineHeight: 1.5 }}>{deal.description || 'No description.'}</div>
                </div>
              </div>
            )}
          </div>

          <div className="panel-container" style={panel.container}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Activity timeline</h2>
            {activities.length === 0 ? (
              <p style={typeography.muted}>No activity yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activities.map((a) => (
                  <div key={a.id} style={{ ...panel.compact, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={statusBadge(activityColor(a.type))}>{a.type}</span>
                      <span style={{ fontWeight: 600 }}>{a.subject}</span>
                    </div>
                    <div style={{ ...typeography.small, marginTop: 4 }}>{a.user?.name} · {formatDateTime(a.createdAt)}</div>
                    {a.description && <p style={{ marginTop: 6, color: 'var(--fg-dim)' }}>{a.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel-container" style={panel.container}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Tasks</h2>
            {tasks.length === 0 ? <p style={typeography.muted}>No tasks.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.map((task) => (
                  <div key={task.id} style={{ ...panel.compact, padding: 12 }}>
                    <div style={{ fontWeight: 600 }}>{task.title}</div>
                    <div style={typeography.small}>{task.status} · {task.assignee?.name} · {formatDate(task.dueDate)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel-container" style={panel.container}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Emails</h2>
            {emails.length === 0 ? <p style={typeography.muted}>No emails.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {emails.map((email) => (
                  <div key={email.id} style={{ ...panel.compact, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={statusBadge(email.direction === 'OUTBOUND' ? 'var(--blue)' : 'var(--emerald)')}>{email.direction}</span>
                      <span style={{ fontWeight: 600 }}>{email.subject}</span>
                    </div>
                    <div style={typeography.small}>{email.fromEmail} → {email.toEmail} · {formatDateTime(email.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function activityColor(type: string) {
  switch (type) {
    case 'CALL': return 'var(--blue)'
    case 'EMAIL': return 'var(--emerald)'
    case 'MEETING': return 'var(--violet)'
    case 'TASK': return 'var(--cyan)'
    default: return 'var(--gold)'
  }
}

export default function DealDetailPage() {
  return (
    <ProtectedLayout>
      <DealDetailContent />
    </ProtectedLayout>
  )
}
