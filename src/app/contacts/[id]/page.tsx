'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge } from '../../lib/styles'
import type { Contact, Activity, Company, Task, ProjectTask, EmailMessage, Deal, CustomProperty, CustomValue } from '../../lib/types'

type ActivityType = Activity['type']

interface ContactDetail extends Contact {
  company?: { id: string; name: string; tenantId: string }
}

interface TimelineItem {
  id: string
  type: 'activity' | 'deal' | 'task' | 'project_task' | 'email'
  label: string
  subject: string
  date: string
  user?: string
  meta?: string
  color: string
  icon: string
  href?: string
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

const formatDate = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * ContactDetailPage — view contact info, unified timeline, send email, and edit custom properties.
 */
function ContactDetailContent() {
  const { id } = useParams()
  const contactId = Array.isArray(id) ? id[0] : id

  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([])
  const [emails, setEmails] = useState<EmailMessage[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [properties, setProperties] = useState<CustomProperty[]>([])
  const [customValues, setCustomValues] = useState<Record<string, CustomValue>>({})
  const [google, setGoogle] = useState<{ connected: boolean; email?: string | null }>({ connected: false })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
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

  const [emailForm, setEmailForm] = useState({
    to: '',
    subject: '',
    body: '',
  })

  const load = useCallback(async () => {
    try {
      const [
        contactRes,
        activitiesRes,
        companiesRes,
        dealsRes,
        tasksRes,
        projectTasksRes,
        emailsRes,
        propsRes,
        valuesRes,
        googleRes,
      ] = await Promise.all([
        apiFetch<ContactDetail>(`/api/contacts/${contactId}`),
        apiFetch<{ data: Activity[] }>(`/api/activities?contactId=${contactId}`),
        apiFetch<{ data: Company[] }>('/api/companies'),
        apiFetch<{ data: Deal[] }>(`/api/deals?contactId=${contactId}`),
        apiFetch<{ data: Task[] }>(`/api/tasks?contactId=${contactId}`),
        apiFetch<{ data: ProjectTask[] }>(`/api/projects/tasks?contactId=${contactId}`),
        apiFetch<{ data: EmailMessage[] }>(`/api/email/messages?contactId=${contactId}`),
        apiFetch<{ data: CustomProperty[] }>(`/api/custom-properties?entityType=CONTACT`),
        apiFetch<{ data: CustomValue[] }>(`/api/custom-values?entityType=CONTACT&entityId=${contactId}`),
        apiFetch<{ connected: boolean; email?: string | null }>('/api/integrations/google/status'),
      ])
      setContact(contactRes)
      setActivities(activitiesRes.data || [])
      setDeals(dealsRes.data || [])
      setTasks(tasksRes.data || [])
      setProjectTasks(projectTasksRes.data || [])
      setEmails(emailsRes.data || [])
      setCompanies(companiesRes.data || [])
      setProperties(propsRes.data || [])
      setGoogle(googleRes || { connected: false })

      const valueMap: Record<string, CustomValue> = {}
      ;(valuesRes.data || []).forEach((v) => {
        valueMap[v.propertyId] = v
      })
      setCustomValues(valueMap)

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

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = []
    activities.forEach((a) => {
      items.push({
        id: `activity-${a.id}`,
        type: 'activity',
        label: a.type,
        subject: a.subject,
        date: a.createdAt,
        user: a.user?.name,
        color: activityColor[a.type],
        icon: activityEmoji[a.type],
      })
    })
    deals.forEach((d) => {
      items.push({
        id: `deal-${d.id}`,
        type: 'deal',
        label: 'DEAL',
        subject: d.title,
        date: d.createdAt,
        user: d.assignee?.name,
        meta: `$${d.value?.toLocaleString()} · ${d.status}`,
        color: d.stage?.color || 'var(--gold)',
        icon: '💰',
        href: `/deals/${d.id}`,
      })
    })
    tasks.forEach((t) => {
      items.push({
        id: `task-${t.id}`,
        type: 'task',
        label: 'TASK',
        subject: t.title,
        date: t.createdAt || new Date().toISOString(),
        user: t.assignee?.name,
        meta: `${t.status} · ${t.priority}`,
        color: t.status === 'COMPLETED' ? 'var(--emerald)' : 'var(--cyan)',
        icon: '☑️',
      })
    })
    projectTasks.forEach((t) => {
      items.push({
        id: `project-${t.id}`,
        type: 'project_task',
        label: 'PROJECT TASK',
        subject: t.title,
        date: t.createdAt,
        user: t.assignee?.name || undefined,
        meta: t.priority,
        color: t.color || 'var(--violet)',
        icon: '📂',
      })
    })
    emails.forEach((e) => {
      items.push({
        id: `email-${e.id}`,
        type: 'email',
        label: e.direction,
        subject: e.subject,
        date: e.createdAt,
        user: e.fromEmail,
        meta: e.toEmail,
        color: e.direction === 'OUTBOUND' ? 'var(--blue)' : 'var(--emerald)',
        icon: '📧',
      })
    })
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [activities, deals, tasks, projectTasks, emails])

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

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contact || !google.connected) return
    setSubmitting(true)
    try {
      await apiFetch('/api/email/send', {
        method: 'POST',
        body: JSON.stringify({
          to: emailForm.to,
          subject: emailForm.subject,
          body: emailForm.body,
          contactId,
          companyId: contact.companyId,
        }),
      })
      setEmailOpen(false)
      setEmailForm({ to: '', subject: '', body: '' })
      await load()
    } catch (err: any) {
      setError(err.message || 'Failed to send email')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCustomValue = async (propertyId: string, value: string) => {
    try {
      const saved = await apiFetch<CustomValue>('/api/custom-values', {
        method: 'POST',
        body: JSON.stringify({ entityType: 'CONTACT', entityId: contactId, propertyId, value }),
      })
      setCustomValues((prev: Record<string, CustomValue>) => ({ ...prev, [propertyId]: saved }))
    } catch (err: any) {
      setError(err.message || 'Failed to save custom value')
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
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button style={buttons.secondary} onClick={() => setEditOpen(true)}>Edit</button>
          <button style={buttons.primary} onClick={() => setEmailOpen(true)}>Send Email</button>
          <button style={buttons.primary} onClick={() => setActivityOpen(true)}>Log Activity</button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div className="project-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="panel-container" style={panel.container}>
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

        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Custom properties</h2>
          {properties.length === 0 ? (
            <p style={typeography.muted}>No custom fields configured.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {properties.map((p) => {
                const value = customValues[p.id]?.value || ''
                return (
                  <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={forms.label}>{p.label}{p.isRequired && ' *'}</span>
                    {p.fieldType === 'DROPDOWN' ? (
                      <select
                        style={forms.select}
                        value={value}
                        onChange={(e) => handleCustomValue(p.id, e.target.value)}
                      >
                        <option value="">Select...</option>
                        {(p.options || []).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : p.fieldType === 'BOOLEAN' ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                        <input
                          type="checkbox"
                          checked={value === 'true'}
                          onChange={(e) => handleCustomValue(p.id, String(e.target.checked))}
                        />
                        Yes
                      </label>
                    ) : p.fieldType === 'DATE' ? (
                      <input
                        style={forms.input}
                        type="date"
                        value={value}
                        onChange={(e) => handleCustomValue(p.id, e.target.value)}
                      />
                    ) : (
                      <input
                        style={forms.input}
                        type={p.fieldType === 'NUMBER' ? 'number' : 'text'}
                        value={value}
                        onChange={(e) => handleCustomValue(p.id, e.target.value)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ ...layout.header, marginBottom: 16 }}>
          <h2 style={{ ...typeography.subtitle, margin: 0 }}>Unified timeline</h2>
          <span style={{ color: 'var(--fg-dim)', fontSize: 14 }}>{timeline.length} events</span>
        </div>
        {timeline.length === 0 ? (
          <div className="panel-container" style={panel.container}>
            <p style={{ color: 'var(--fg-dim)' }}>No timeline events yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {timeline.map((item) => {
              const Wrapper = item.href ? Link : 'div'
              return (
                <Wrapper
                  key={item.id}
                  href={item.href || ''}
                  style={{
                    ...panel.compact,
                    display: 'flex',
                    gap: 14,
                    textDecoration: 'none',
                    cursor: item.href ? 'pointer' : 'default',
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      backgroundColor: `${item.color}22`,
                      color: item.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ ...statusBadge(item.color), textTransform: 'uppercase' }}>{item.label}</span>
                      <span style={{ fontWeight: 600 }}>{item.subject}</span>
                    </div>
                    <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginTop: 6 }}>
                      {item.user && <span>{item.user} · </span>}
                      {formatDate(item.date)}
                      {item.meta && <span> · {item.meta}</span>}
                    </div>
                  </div>
                </Wrapper>
              )
            })}
          </div>
        )}
      </div>

      {editOpen && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}
          onClick={() => setEditOpen(false)}
        >
          <div className="modal-content" style={{ ...panel.container, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
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
                <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Save changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activityOpen && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}
          onClick={() => setActivityOpen(false)}
        >
          <div className="modal-content" style={{ ...panel.container, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Log Activity</h2>
            <form onSubmit={handleLogActivity} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Type</span>
                <select style={forms.select} value={activityForm.type} onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value as ActivityType })}>
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
                <input style={forms.input} type="datetime-local" value={activityForm.scheduledAt} onChange={(e) => setActivityForm({ ...activityForm, scheduledAt: e.target.value })} />
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

      {emailOpen && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}
          onClick={() => setEmailOpen(false)}
        >
          <div className="modal-content" style={{ ...panel.container, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Send Email</h2>
            {!google.connected && (
              <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                Google account not connected. Connect in <Link href="/settings" style={{ color: 'var(--gold)' }}>Settings</Link> to send email.
              </div>
            )}
            <form onSubmit={handleSendEmail} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>To</span>
                <input style={forms.input} type="email" required value={emailForm.to} onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Subject</span>
                <input style={forms.input} required value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Body</span>
                <textarea style={forms.textarea} rows={8} value={emailForm.body} onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })} />
              </label>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => setEmailOpen(false)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={!google.connected || submitting}>{submitting ? 'Sending...' : 'Send'}</button>
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
