'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge } from '../lib/styles'
import type { Activity, Company, Contact } from '../lib/types'

type ActivityType = Activity['type']
type ActivityTypeFilter = ActivityType | 'ALL'

interface ActivityListItem extends Activity {
  company?: { id: string; name: string }
  contact?: { id: string; firstName: string; lastName: string }
  user?: { id: string; name: string }
}

interface ActivityListResponse {
  data: ActivityListItem[]
}

const activityColor: Record<ActivityType, string> = {
  CALL: 'var(--blue)',
  EMAIL: 'var(--emerald)',
  NOTE: 'var(--gold)',
  MEETING: 'var(--violet)',
  TASK: 'var(--cyan)',
}

const activityEmoji: Record<ActivityType, string> = {
  CALL: '📞',
  EMAIL: '✉️',
  NOTE: '📝',
  MEETING: '🤝',
  TASK: '☑️',
}

const filters: { label: string; value: ActivityTypeFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Calls', value: 'CALL' },
  { label: 'Emails', value: 'EMAIL' },
  { label: 'Notes', value: 'NOTE' },
  { label: 'Meetings', value: 'MEETING' },
]

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * ActivitiesPage — activity feed with type filters and a new activity modal.
 */
function ActivitiesContent() {
  const [activities, setActivities] = useState<ActivityListItem[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<ActivityTypeFilter>('ALL')
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState<{
    type: ActivityType
    subject: string
    description: string
    companyId: string
    contactId: string
    tenantId: string
    scheduledAt: string
  }>({
    type: 'NOTE',
    subject: '',
    description: '',
    companyId: '',
    contactId: '',
    tenantId: '',
    scheduledAt: '',
  })

  const load = useCallback(async () => {
    try {
      const [activitiesRes, companiesRes, contactsRes] = await Promise.all([
        apiFetch<ActivityListResponse>(`/api/activities${filter !== 'ALL' ? `?type=${filter}` : ''}`),
        apiFetch<{ data: Company[] }>('/api/companies'),
        apiFetch<{ data: Contact[] }>('/api/contacts'),
      ])
      setActivities(Array.isArray(activitiesRes) ? activitiesRes : activitiesRes.data || [])
      setCompanies(Array.isArray(companiesRes) ? companiesRes : companiesRes.data || [])
      setContacts(Array.isArray(contactsRes) ? contactsRes : contactsRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load activities')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  const companyMap = new Map(companies.map((c) => [c.id, c]))
  const filteredContacts = form.companyId ? contacts.filter((c) => c.companyId === form.companyId) : []

  const handleCompanyChange = (companyId: string) => {
    const company = companyMap.get(companyId)
    setForm((prev) => ({
      ...prev,
      companyId,
      contactId: '',
      tenantId: company?.tenantId || '',
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const body: any = {
        type: form.type,
        subject: form.subject,
        description: form.description,
        companyId: form.companyId,
        tenantId: form.tenantId,
      }
      if (form.contactId) body.contactId = form.contactId
      if (form.scheduledAt) body.scheduledAt = form.scheduledAt
      const created = await apiFetch<ActivityListItem>('/api/activities', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setActivities((prev) => [created, ...prev])
      setModalOpen(false)
      setForm({ type: 'NOTE', subject: '', description: '', companyId: '', contactId: '', tenantId: '', scheduledAt: '' })
    } catch (err: any) {
      setError(err.message || 'Failed to create activity')
    } finally {
      setSubmitting(false)
    }
  }

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
        <h1 style={typeography.title}>Activities</h1>
        <button style={buttons.primary} onClick={() => setModalOpen(true)}>New Activity</button>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            style={{
              ...buttons.small,
              backgroundColor: filter === f.value ? 'var(--gold)' : undefined,
              color: filter === f.value ? 'var(--bg)' : undefined,
              borderColor: filter === f.value ? 'var(--gold)' : undefined,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activities.length === 0 ? (
          <div style={panel.container}>
            <p style={{ color: 'var(--fg-dim)' }}>No activities found.</p>
          </div>
        ) : (
          activities.map((a) => (
            <div key={a.id} style={panel.compact}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: `${activityColor[a.type]}22`,
                    color: activityColor[a.type],
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    flexShrink: 0,
                  }}
                >
                  {activityEmoji[a.type]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{a.subject}</span>
                    <span style={statusBadge(activityColor[a.type])}>{a.type}</span>
                  </div>
                  <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginTop: 6 }}>
                    {a.company?.name || 'Unknown company'}
                    {a.contact && ` · ${a.contact.firstName} ${a.contact.lastName}`}
                    {' · '}
                    {a.user?.name || 'Unknown user'}
                    {' · '}
                    {formatDate(a.createdAt)}
                  </div>
                  {a.description && (
                    <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.4, color: 'var(--fg-dim)' }}>
                      {a.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 24,
          }}
          onClick={() => setModalOpen(false)}
        >
          <div style={{ ...panel.container, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>New Activity</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Type</span>
                <select
                  style={forms.select}
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as ActivityType })}
                >
                  <option value="CALL">Call</option>
                  <option value="EMAIL">Email</option>
                  <option value="NOTE">Note</option>
                  <option value="MEETING">Meeting</option>
                  <option value="TASK">Task</option>
                </select>
              </label>

              <label style={forms.group}>
                <span style={forms.label}>Company</span>
                <select
                  style={forms.select}
                  required
                  value={form.companyId}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                >
                  <option value="">Select company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={forms.group}>
                <span style={forms.label}>Contact (optional)</span>
                <select
                  style={forms.select}
                  value={form.contactId}
                  onChange={(e) => setForm({ ...form, contactId: e.target.value })}
                  disabled={!form.companyId}
                >
                  <option value="">—</option>
                  {filteredContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
              </label>

              <label style={forms.group}>
                <span style={forms.label}>Subject</span>
                <input style={forms.input} required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </label>

              <label style={forms.group}>
                <span style={forms.label}>Scheduled at (optional)</span>
                <input
                  style={forms.input}
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                />
              </label>

              <label style={forms.group}>
                <span style={forms.label}>Description</span>
                <textarea style={forms.textarea} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Save Activity'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ActivitiesPage() {
  return (
    <ProtectedLayout>
      <ActivitiesContent />
    </ProtectedLayout>
  )
}
