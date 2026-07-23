'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, table, statusBadge } from '../../lib/styles'
import type { Company, Contact, Activity, Tenant } from '../../lib/types'

type ActivityType = Activity['type']

interface CompanyDetail extends Company {
  _count?: { contacts: number }
  tenant?: { id: string; name: string; slug: string }
}

interface ContactListResponse {
  data: Contact[]
}

interface ActivityListResponse {
  data: Activity[]
}

interface TenantListResponse {
  data: Tenant[]
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
 * CompanyDetailPage — view a company, its contacts, and activity history.
 */
function CompanyDetailContent() {
  const { id } = useParams()
  const companyId = Array.isArray(id) ? id[0] : id

  const [company, setCompany] = useState<CompanyDetail | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'contacts' | 'activities'>('contacts')

  const [contactModal, setContactModal] = useState(false)
  const [activityModal, setActivityModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [contactForm, setContactForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    title: '',
  })

  const [activityForm, setActivityForm] = useState<{
    type: ActivityType
    subject: string
    description: string
    contactId: string
    scheduledAt: string
  }>({
    type: 'NOTE',
    subject: '',
    description: '',
    contactId: '',
    scheduledAt: '',
  })

  const load = useCallback(async () => {
    try {
      const [companyRes, contactsRes, activitiesRes, tenantsRes] = await Promise.all([
        apiFetch<CompanyDetail>(`/api/companies/${companyId}`),
        apiFetch<ContactListResponse>(`/api/contacts?companyId=${companyId}`),
        apiFetch<ActivityListResponse>(`/api/activities?companyId=${companyId}`),
        apiFetch<TenantListResponse>('/api/admin/tenants'),
      ])
      setCompany(companyRes)
      setContacts(contactsRes.data || [])
      setActivities(activitiesRes.data || [])
      setTenants(tenantsRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load company')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company) return
    setSubmitting(true)
    try {
      const created = await apiFetch<Contact>('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({
          ...contactForm,
          companyId,
          tenantId: company.tenantId,
        }),
      })
      setContacts((prev) => [created, ...prev])
      setContactModal(false)
      setContactForm({ firstName: '', lastName: '', email: '', phone: '', title: '' })
    } catch (err: any) {
      setError(err.message || 'Failed to add contact')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company) return
    setSubmitting(true)
    try {
      const body: any = {
        type: activityForm.type,
        subject: activityForm.subject,
        description: activityForm.description,
        companyId,
        tenantId: company.tenantId,
      }
      if (activityForm.contactId) body.contactId = activityForm.contactId
      if (activityForm.scheduledAt) body.scheduledAt = activityForm.scheduledAt
      const created = await apiFetch<Activity>('/api/activities', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setActivities((prev) => [created, ...prev])
      setActivityModal(false)
      setActivityForm({ type: 'NOTE', subject: '', description: '', contactId: '', scheduledAt: '' })
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

  if (!company) {
    return (
      <div style={layout.page}>
        <p style={{ color: 'var(--fg-dim)' }}>Company not found.</p>
      </div>
    )
  }

  return (
    <div style={layout.page}>
      <div style={layout.header}>
        <div>
          <Link href="/companies" style={{ color: 'var(--fg-dim)', fontSize: 13 }}>← Companies</Link>
          <h1 style={{ ...typeography.title, marginBottom: 4, marginTop: 8 }}>{company.name}</h1>
          <div style={{ color: 'var(--fg-dim)', fontSize: 14 }}>
            {company.industry || 'No industry'} · {company.tenant?.name || 'No tenant'} · {company._count?.contacts ?? 0} contacts
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={buttons.secondary} onClick={() => setContactModal(true)}>Add Contact</button>
          <button style={buttons.primary} onClick={() => setActivityModal(true)}>Log Activity</button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div style={panel.container}>
        <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Company details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div>
            <div style={typeography.small}>Phone</div>
            <div>{company.phone || '—'}</div>
          </div>
          <div>
            <div style={typeography.small}>Email</div>
            <div>{company.email || '—'}</div>
          </div>
          <div>
            <div style={typeography.small}>Website</div>
            <div>{company.website ? <a href={company.website} target="_blank" rel="noreferrer">{company.website}</a> : '—'}</div>
          </div>
          <div>
            <div style={typeography.small}>Address</div>
            <div>{company.address || '—'}</div>
          </div>
        </div>
        {company.description && (
          <p style={{ marginTop: 16, color: 'var(--fg-dim)', lineHeight: 1.5 }}>{company.description}</p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 24, marginBottom: 16, borderBottom: '1px solid var(--panel-border)' }}>
        {(['contacts', 'activities'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--gold)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--fg)' : 'var(--fg-dim)',
              padding: '10px 16px',
              fontWeight: 600,
              textTransform: 'capitalize',
              cursor: 'pointer',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'contacts' && (
        <div style={panel.container}>
          {contacts.length === 0 ? (
            <p style={{ color: 'var(--fg-dim)' }}>No contacts yet.</p>
          ) : (
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>Name</th>
                  <th style={table.th}>Email</th>
                  <th style={table.th}>Phone</th>
                  <th style={table.th}>Title</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} style={table.tr}>
                    <td style={table.td}>
                      <Link href={`/contacts/${c.id}`} style={{ fontWeight: 600, color: 'var(--fg)' }}>
                        {c.firstName} {c.lastName}
                      </Link>
                    </td>
                    <td style={table.td}>{c.email || '—'}</td>
                    <td style={table.td}>{c.phone || '—'}</td>
                    <td style={table.td}>{c.title || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'activities' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {activities.length === 0 ? (
            <div style={panel.container}>
              <p style={{ color: 'var(--fg-dim)' }}>No activity logged yet.</p>
            </div>
          ) : (
            activities.map((a) => (
              <div key={a.id} style={panel.compact}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 18 }}>{activityEmoji[a.type]}</span>
                  <span style={{ fontWeight: 600 }}>{a.subject}</span>
                  <span style={statusBadge(activityColor[a.type])}>{a.type}</span>
                </div>
                <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginTop: 8 }}>
                  {a.contact && `${a.contact.firstName} ${a.contact.lastName}`} · {a.user?.name} · {formatDate(a.createdAt)}
                </div>
                {a.description && <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.4 }}>{a.description}</p>}
              </div>
            ))
          )}
        </div>
      )}

      {contactModal && (
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
          onClick={() => setContactModal(false)}
        >
          <div style={{ ...panel.container, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Add Contact</h2>
            <form onSubmit={handleAddContact} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>First name</span>
                  <input style={forms.input} required value={contactForm.firstName} onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })} />
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Last name</span>
                  <input style={forms.input} required value={contactForm.lastName} onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })} />
                </label>
              </div>
              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Email</span>
                  <input style={forms.input} type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Phone</span>
                  <input style={forms.input} value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
                </label>
              </div>
              <label style={forms.group}>
                <span style={forms.label}>Title</span>
                <input style={forms.input} value={contactForm.title} onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })} />
              </label>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => setContactModal(false)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Save Contact'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activityModal && (
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
          onClick={() => setActivityModal(false)}
        >
          <div style={{ ...panel.container, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
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
                <span style={forms.label}>Contact (optional)</span>
                <select
                  style={forms.select}
                  value={activityForm.contactId}
                  onChange={(e) => setActivityForm({ ...activityForm, contactId: e.target.value })}
                >
                  <option value="">—</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
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
                <button type="button" style={buttons.secondary} onClick={() => setActivityModal(false)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Save Activity'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CompanyDetailPage() {
  return (
    <ProtectedLayout>
      <CompanyDetailContent />
    </ProtectedLayout>
  )
}
