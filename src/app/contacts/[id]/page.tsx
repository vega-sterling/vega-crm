'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge } from '../../lib/styles'
import type { Contact, Activity, Company } from '../../lib/types'

type ActivityType = Activity['type']

interface ContactDetail extends Contact {
  company?: { id: string; name: string; tenantId: string }
}

interface ActivityListResponse {
  data: Activity[]
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

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * ContactDetailPage — view contact info, activity history, edit, and log activity.
 */
function ContactDetailContent() {
  const { id } = useParams()
  const contactId = Array.isArray(id) ? id[0] : id

  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    title: '',
    department: '',
    notes: '',
  })

  const [activityForm, setActivityForm] = useState<{
    type: ActivityType
    subject: string
    description: string
    scheduledAt: string
  }>({
    type: 'NOTE',
    subject: '',
    description: '',
    scheduledAt: '',
  })

  const load = useCallback(async () => {
    try {
      const [contactRes, activitiesRes, companiesRes] = await Promise.all([
        apiFetch<ContactDetail>(`/api/contacts/${contactId}`),
        apiFetch<ActivityListResponse>(`/api/activities?contactId=${contactId}`),
        apiFetch<{ data: Company[] }>('/api/companies'),
      ])
      setContact(contactRes)
      setActivities(activitiesRes.data || [])
      setCompanies(companiesRes.data || [])
      setEditForm({
        firstName: contactRes.firstName,
        lastName: contactRes.lastName,
        email: contactRes.email || '',
        phone: contactRes.phone || '',
        title: contactRes.title || '',
        department: contactRes.department || '',
        notes: contactRes.notes || '',
      })
    } catch (err: any) {
      setError(err.message || 'Failed to load contact')
    } finally {
      setLoading(false)
    }
  }, [contactId])

  useEffect(() => {
    load()
  }, [load])

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contact) return
    setSubmitting(true)
    try {
      const updated = await apiFetch<ContactDetail>(`/api/contacts/${contactId}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      })
      setContact(updated)
      setEditOpen(false)
    } catch (err: any) {
      setError(err.message || 'Failed to update contact')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contact) return
    setSubmitting(true)
    try {
      const body: any = {
        type: activityForm.type,
        subject: activityForm.subject,
        description: activityForm.description,
        companyId: contact.companyId,
        tenantId: contact.tenantId,
        contactId,
      }
      if (activityForm.scheduledAt) body.scheduledAt = activityForm.scheduledAt
      const created = await apiFetch<Activity>('/api/activities', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setActivities((prev) => [created, ...prev])
      setActivityOpen(false)
      setActivityForm({ type: 'NOTE', subject: '', description: '', scheduledAt: '' })
    } catch (err: any) {
      setError(err.message || 'Failed to log activity')
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

  if (!contact) {
    return (
      <div style={layout.page}>
        <p style={{ color: 'var(--fg-dim)' }}>Contact not found.</p>
      </div>
    )
  }

  const company = companies.find((c) => c.id === contact.companyId)

  return (
    <div style={layout.page}>
      <div style={layout.header}>
        <div>
          <Link href="/contacts" style={{ color: 'var(--fg-dim)', fontSize: 13 }}>← Contacts</Link>
          <h1 style={{ ...typeography.title, marginBottom: 4, marginTop: 8 }}>
            {contact.firstName} {contact.lastName}
          </h1>
          <div style={{ color: 'var(--fg-dim)', fontSize: 14 }}>
            {contact.title || 'No title'} · {contact.company?.name || company?.name || 'No company'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={buttons.secondary} onClick={() => setEditOpen(true)}>Edit</button>
          <button style={buttons.primary} onClick={() => setActivityOpen(true)}>Log Activity</button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div style={panel.container}>
        <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Contact details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div>
            <div style={typeography.small}>Email</div>
            <div>{contact.email || '—'}</div>
          </div>
          <div>
            <div style={typeography.small}>Phone</div>
            <div>{contact.phone || '—'}</div>
          </div>
          <div>
            <div style={typeography.small}>Mobile</div>
            <div>{contact.mobile || '—'}</div>
          </div>
          <div>
            <div style={typeography.small}>Department</div>
            <div>{contact.department || '—'}</div>
          </div>
          <div>
            <div style={typeography.small}>Company</div>
            <div>
              {contact.company ? (
                <Link href={`/companies/${contact.company.id}`} style={{ color: 'var(--gold)' }}>
                  {contact.company.name}
                </Link>
              ) : (
                company?.name || '—'
              )}
            </div>
          </div>
        </div>
        {contact.notes && (
          <p style={{ marginTop: 16, color: 'var(--fg-dim)', lineHeight: 1.5 }}>{contact.notes}</p>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <h2 style={{ ...typeography.subtitle, marginBottom: 16 }}>Activity history</h2>
        {activities.length === 0 ? (
          <div style={panel.container}>
            <p style={{ color: 'var(--fg-dim)' }}>No activity yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activities.map((a) => (
              <div key={a.id} style={panel.compact}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 18 }}>{activityEmoji[a.type]}</span>
                  <span style={{ fontWeight: 600 }}>{a.subject}</span>
                  <span style={statusBadge(activityColor[a.type])}>{a.type}</span>
                </div>
                <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginTop: 8 }}>
                  {a.company?.name} · {a.user?.name} · {formatDate(a.createdAt)}
                </div>
                {a.description && <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.4 }}>{a.description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {editOpen && (
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
          onClick={() => setEditOpen(false)}
        >
          <div style={{ ...panel.container, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Edit Contact</h2>
            <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>First name</span>
                  <input style={forms.input} required value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Last name</span>
                  <input style={forms.input} required value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
                </label>
              </div>
              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Email</span>
                  <input style={forms.input} type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Phone</span>
                  <input style={forms.input} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </label>
              </div>
              <label style={forms.group}>
                <span style={forms.label}>Title</span>
                <input style={forms.input} value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Department</span>
                <input style={forms.input} value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Notes</span>
                <textarea style={forms.textarea} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </label>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => setEditOpen(false)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activityOpen && (
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
          onClick={() => setActivityOpen(false)}
        >
          <div style={{ ...panel.container, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Log Activity</h2>
            <form onSubmit={handleLogActivity} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Type</span>
                <select
                  style={forms.select}
                  value={activityForm.type}
                  onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value as ActivityType })}
                >
                  <option value="CALL">Call</option>
                  <option value="EMAIL">Email</option>
                  <option value="NOTE">Note</option>
                  <option value="MEETING">Meeting</option>
                  <option value="TASK">Task</option>
                </select>
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Subject</span>
                <input style={forms.input} required value={activityForm.subject} onChange={(e) => setActivityForm({ ...activityForm, subject: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Scheduled at (optional)</span>
                <input
                  style={forms.input}
                  type="datetime-local"
                  value={activityForm.scheduledAt}
                  onChange={(e) => setActivityForm({ ...activityForm, scheduledAt: e.target.value })}
                />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Description</span>
                <textarea style={forms.textarea} value={activityForm.description} onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })} />
              </label>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => setActivityOpen(false)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Save Activity'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ContactDetailPage() {
  return (
    <ProtectedLayout>
      <ContactDetailContent />
    </ProtectedLayout>
  )
}
