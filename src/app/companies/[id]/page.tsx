'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import InlineNoteComposer from '../../components/InlineNoteComposer'
import QuickActionBar from '../../components/QuickActionBar'
import TimelineFilterTabs, { type TimelineFilter } from '../../components/TimelineFilterTabs'
import TasksTab from '../../components/TasksTab'
import ActivityCard from '../../components/ActivityCard'
import PropertyQuickEdit from '../../components/PropertyQuickEdit'
import CustomFieldsSection from '../../components/CustomFieldsSection'
import { ContactsCard, DealsCard, TasksCard } from '../../components/AssociationCards'
import { usePinnedNote } from '../../components/PinnedNotes'
import EmailThreadCard from '../../components/EmailThreadCard'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, table, statusBadge } from '../../lib/styles'
import type { Company, Contact, Activity, Task, Deal, Tenant, User, EmailMessage } from '../../lib/types'
import { groupEmailsByThread } from '../../lib/emailThreads'

interface CompanyDetail extends Company {
  _count?: { contacts: number }
  tenant?: { id: string; name: string; slug: string }
}

interface ContactListResponse { data: Contact[] }
interface ActivityListResponse { data: Activity[] }
interface TaskListResponse { data: Task[] }
interface DealListResponse { data: Deal[] }
interface TenantListResponse { data: Tenant[] }
interface UserListResponse { data: User[] }
interface EmailListResponse { data: EmailMessage[] }

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * CompanyDetailPage — 3-column layout (HubSpot/Close CRM style).
 * LEFT: Properties + actions. MIDDLE: Timeline. RIGHT: Associations.
 */
function CompanyDetailContent() {
  const { id } = useParams()
  const companyId = Array.isArray(id) ? id[0]! : id!

  const [company, setCompany] = useState<CompanyDetail | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [emails, setEmails] = useState<EmailMessage[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'timeline' | 'contacts' | 'tasks'>('timeline')
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('ALL')

  const [contactModal, setContactModal] = useState(false)
  const [emailModal, setEmailModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [following, setFollowing] = useState(false)

  const [contactForm, setContactForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', title: '',
  })
  const [emailForm, setEmailForm] = useState({ to: '', subject: '', body: '' })
  const [googleConnected, setGoogleConnected] = useState(false)

  // Pinned notes (localStorage)
  const { pinnedId, pin, unpin } = usePinnedNote('company', companyId)

  const load = useCallback(async () => {
    try {
      const [companyRes, contactsRes, activitiesRes, tasksRes, dealsRes, emailsRes, tenantsRes, usersRes, meRes, googleRes] = await Promise.all([
        apiFetch<CompanyDetail>(`/api/companies/${companyId}`),
        apiFetch<ContactListResponse>(`/api/contacts?companyId=${companyId}`),
        apiFetch<ActivityListResponse>(`/api/activities?companyId=${companyId}&limit=100`),
        apiFetch<TaskListResponse>(`/api/tasks?companyId=${companyId}&limit=100`),
        apiFetch<DealListResponse>(`/api/deals?companyId=${companyId}`).catch(() => ({ data: [] as Deal[] })),
        apiFetch<EmailListResponse>(`/api/email/messages?companyId=${companyId}&limit=100`).catch(() => ({ data: [] as EmailMessage[] })),
        apiFetch<TenantListResponse>('/api/admin/tenants'),
        apiFetch<UserListResponse>('/api/admin/users?limit=100').catch(() => ({ data: [] as User[] })),
        apiFetch<User>('/api/auth/me').catch(() => null),
        apiFetch<{ connected: boolean }>('/api/google/status').catch(() => ({ connected: false })),
      ])
      setCompany(companyRes)
      setContacts(contactsRes.data || [])
      setActivities(activitiesRes.data || [])
      setTasks(tasksRes.data || [])
      setDeals(dealsRes.data || [])
      setEmails(emailsRes.data || [])
      setTenants(tenantsRes.data || [])
      setUsers(usersRes.data || [])
      setCurrentUser(meRes)
      setGoogleConnected(googleRes?.connected || false)
    } catch (err: any) {
      setError(err.message || 'Failed to load company')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { load() }, [load])

  // Email threads grouped by threadId
  const emailThreads = useMemo(() => groupEmailsByThread(emails), [emails])

  // Unified timeline: activities + email threads
  type UnifiedItem =
    | { kind: 'activity'; type: Activity['type']; data: Activity; sortKey: string }
    | { kind: 'emailThread'; type: 'EMAIL'; data: { threadId: string; emails: EmailMessage[]; latestCreatedAt: string }; sortKey: string }

  const unifiedTimeline = useMemo(() => {
    const items: UnifiedItem[] = []
    activities.forEach(a => items.push({ kind: 'activity', type: a.type, data: a, sortKey: a.createdAt }))
    emailThreads.forEach(thread => items.push({ kind: 'emailThread', type: 'EMAIL', data: thread, sortKey: thread.latestCreatedAt }))
    items.sort((a, b) => new Date(b.sortKey).getTime() - new Date(a.sortKey).getTime())
    return items
  }, [activities, emailThreads])

  // Timeline filter counts
  const filterCounts = useMemo(() => {
    const counts: Record<TimelineFilter, number> = { ALL: 0, NOTE: 0, CALL: 0, EMAIL: 0, TASK: 0, MEETING: 0 }
    unifiedTimeline.forEach((item) => {
      counts.ALL++
      if (item.type in counts) counts[item.type as TimelineFilter]++
    })
    return counts
  }, [unifiedTimeline])

  const filteredTimeline = useMemo(() => {
    if (timelineFilter === 'ALL') return unifiedTimeline
    return unifiedTimeline.filter(item => item.type === timelineFilter)
  }, [unifiedTimeline, timelineFilter])

  // Pinned activity (if it exists in the current list)
  const pinnedActivity = pinnedId ? activities.find(a => a.id === pinnedId) : null
  // Non-pinned activities for the main timeline
  const timelineItems = filteredTimeline.filter(item => !(item.kind === 'activity' && item.data.id === pinnedId))

  const handlePinToggle = (id: string) => {
    if (pinnedId === id) {
      unpin()
    } else {
      pin(id)
    }
  }

  const handleDeleteActivity = async (id: string) => {
    if (!confirm('Delete this activity?')) return
    try {
      await apiFetch(`/api/activities/${id}`, { method: 'DELETE' })
      setActivities((prev) => prev.filter(a => a.id !== id))
      if (pinnedId === id) unpin()
    } catch (err: any) {
      setError(err.message || 'Failed to delete activity')
    }
  }

  const handleEditActivity = (activity: Activity) => {
    // Simple prompt-based edit for now (could be expanded to inline editor)
    const newDesc = prompt('Edit note:', activity.description || '')
    if (newDesc === null) return
    apiFetch<Activity>(`/api/activities/${activity.id}`, {
      method: 'PUT',
      body: JSON.stringify({ description: newDesc, subject: activity.subject }),
    }).then(updated => {
      setActivities(prev => prev.map(a => a.id === updated.id ? updated : a))
    }).catch(err => setError(err.message || 'Failed to update activity'))
  }

  // Property quick-edit save
  const handlePropertySave = async (field: string, value: string) => {
    const updated = await apiFetch<CompanyDetail>(`/api/companies/${companyId}`, {
      method: 'PUT',
      body: JSON.stringify({ [field]: value || null }),
    })
    setCompany(updated)
  }

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company) return
    setSubmitting(true)
    try {
      const created = await apiFetch<Contact>('/api/contacts', {
        method: 'POST', body: JSON.stringify({ ...contactForm, companyId, tenantId: company.tenantId }),
      })
      setContacts((prev) => [created, ...prev])
      setContactModal(false)
      setContactForm({ firstName: '', lastName: '', email: '', phone: '', title: '' })
    } catch (err: any) { setError(err.message || 'Failed to add contact') }
    finally { setSubmitting(false) }
  }

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company) return
    setSubmitting(true)
    try {
      await apiFetch('/api/email/send', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: company.tenantId,
          to: [emailForm.to],
          subject: emailForm.subject,
          body: emailForm.body,
          companyId,
        }),
      })
      setEmailModal(false)
      setEmailForm({ to: '', subject: '', body: '' })
      await load()
    } catch (err: any) { setError(err.message || 'Failed to send email') }
    finally { setSubmitting(false) }
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>
  }
  if (!company) {
    return <div style={layout.page}><p style={{ color: 'var(--fg-dim)' }}>Company not found.</p></div>
  }

  return (
    <div style={layout.page}>
      {/* Header */}
      <div className="page-header" style={layout.header}>
        <div>
          <Link href="/companies" style={{ color: 'var(--fg-dim)', fontSize: 13 }}>← Companies</Link>
          <h1 style={{ ...typeography.title, marginBottom: 4, marginTop: 8 }}>{company.name}</h1>
          <div style={{ color: 'var(--fg-dim)', fontSize: 14 }}>
            {company.industry || 'No industry'} · {company.tenant?.name || 'No tenant'} · {company._count?.contacts ?? contacts.length} contacts
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn-touch" style={buttons.secondary} onClick={() => setContactModal(true)}>Add Contact</button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: 'var(--rust)', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* 3-Column Layout */}
      <div className="record-3col" style={{
        display: 'grid',
        gridTemplateColumns: '280px 1fr 320px',
        gap: 20,
        alignItems: 'start',
      }}>
        {/* ════════════════ LEFT SIDEBAR ════════════════ */}
        <div className="record-left" style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 80 }}>
          {/* Key Properties Card */}
          <div className="panel-container" style={panel.container}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0, marginBottom: 16 }}>Properties</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <PropertyQuickEdit label="Phone" value={company.phone} type="tel" onSave={(v) => handlePropertySave('phone', v)} />
              <PropertyQuickEdit label="Email" value={company.email} type="email" onSave={(v) => handlePropertySave('email', v)} />
              <PropertyQuickEdit label="Website" value={company.website} type="url" onSave={(v) => handlePropertySave('website', v)} />
              <PropertyQuickEdit label="Industry" value={company.industry} onSave={(v) => handlePropertySave('industry', v)} />
              <PropertyQuickEdit label="Address" value={company.address} onSave={(v) => handlePropertySave('address', v)} />
            </div>
          </div>

          {/* About section */}
          {company.description && (
            <div className="panel-container" style={panel.container}>
              <h2 style={{ ...typeography.subtitle, marginTop: 0, marginBottom: 12 }}>About</h2>
              <p style={{ color: 'var(--fg-dim)', fontSize: 14, lineHeight: 1.5 }}>{company.description}</p>
            </div>
          )}

          {/* Custom Fields section */}
          <CustomFieldsSection
            entityId={companyId}
            entityType="COMPANY"
            tenantId={company.tenantId}
          />

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              className="btn-touch"
              style={{ ...buttons.secondary, width: '100%' }}
              onClick={() => setFollowing(!following)}
            >
              {following ? '✓ Following' : '+ Follow'}
            </button>
            <button
              className="btn-touch"
              style={{ ...buttons.secondary, width: '100%' }}
              onClick={() => setContactModal(true)}
            >Edit Details</button>
            <button
              className="btn-touch"
              style={{ ...buttons.danger, width: '100%' }}
              onClick={() => { if (confirm('Delete this company?')) { apiFetch(`/api/companies/${companyId}`, { method: 'DELETE' }).then(() => window.location.href = '/companies') } }}
            >Delete</button>
          </div>
        </div>

        {/* ════════════════ MIDDLE COLUMN ════════════════ */}
        <div className="record-middle" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Tab Bar */}
          <div className="tab-bar" style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--panel-border)', overflowX: 'auto' }}>
            {(['timeline', 'contacts', 'tasks'] as const).map((tab) => (
              <button
                key={tab}
                className="btn-touch"
                onClick={() => setActiveTab(tab)}
                style={{
                  background: 'transparent', border: 'none',
                  borderBottom: activeTab === tab ? '2px solid var(--gold)' : '2px solid transparent',
                  color: activeTab === tab ? 'var(--fg)' : 'var(--fg-dim)',
                  padding: '10px 16px', fontWeight: 600, textTransform: 'capitalize',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {tab}{tab === 'tasks' && tasks.length > 0 ? ` (${tasks.length})` : ''}
              </button>
            ))}
          </div>

          {/* Timeline Tab */}
          {activeTab === 'timeline' && (
            <div>
              {/* Pinned Notes Section */}
              {pinnedActivity && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 16 }}>📌</span>
                    <span style={{ ...typeography.subtitle, margin: 0, fontSize: 15 }}>Pinned Note</span>
                  </div>
                  <div style={{ border: '2px solid var(--gold)', borderRadius: 12, overflow: 'hidden' }}>
                    <ActivityCard
                      activity={pinnedActivity}
                      users={users}
                      pinned={true}
                      onPin={handlePinToggle}
                      onEdit={handleEditActivity}
                      onDelete={handleDeleteActivity}
                    />
                  </div>
                </div>
              )}

              {/* Quick Action Bar */}
              <QuickActionBar
                companyId={companyId}
                tenantId={company.tenantId}
                users={users}
                onActivityCreated={(a) => setActivities((prev) => [a, ...prev])}
                onTaskCreated={() => load()}
                onSendEmail={() => setEmailModal(true)}
              />

              {/* Inline Note Composer */}
              <div style={{ marginTop: 16, marginBottom: 16 }}>
                <InlineNoteComposer
                  companyId={companyId}
                  tenantId={company.tenantId}
                  onCreated={(a) => setActivities((prev) => [a, ...prev])}
                  users={users}
                />
              </div>

              {/* Timeline Filter Tabs */}
              <TimelineFilterTabs active={timelineFilter} onChange={setTimelineFilter} counts={filterCounts} />

              {/* Activity Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {timelineItems.length === 0 ? (
                  <div className="panel-container" style={panel.container}>
                    <p style={{ color: 'var(--fg-dim)' }}>
                      {timelineFilter === 'ALL' ? 'No activity logged yet.' : `No ${timelineFilter.toLowerCase()}s to show.`}
                    </p>
                  </div>
                ) : (
                  timelineItems.map((item) => {
                    if (item.kind === 'activity') {
                      return (
                        <ActivityCard
                          key={item.data.id}
                          activity={item.data}
                          users={users}
                          onPin={handlePinToggle}
                          onEdit={handleEditActivity}
                          onDelete={handleDeleteActivity}
                        />
                      )
                    }
                    // Email thread
                    return (
                      <EmailThreadCard
                        key={`thread-${item.data.threadId}`}
                        emails={item.data.emails}
                        companyId={companyId}
                        tenantId={company.tenantId}
                        onReplied={load}
                      />
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* Contacts Tab */}
          {activeTab === 'contacts' && (
            <div className="panel-container" style={panel.container}>
              {contacts.length === 0 ? (
                <p style={{ color: 'var(--fg-dim)' }}>No contacts yet.</p>
              ) : (
                <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                  <table style={table.table}>
                    <thead><tr><th style={table.th}>Name</th><th style={table.th}>Email</th><th style={table.th}>Phone</th><th style={table.th}>Title</th></tr></thead>
                    <tbody>
                      {contacts.map((c) => (
                        <tr key={c.id} style={table.tr}>
                          <td style={table.td}><Link href={`/contacts/${c.id}`} style={{ fontWeight: 600, color: 'var(--fg)' }}>{c.firstName} {c.lastName}</Link></td>
                          <td style={table.td}>{c.email || '—'}</td>
                          <td style={table.td}>{c.phone || '—'}</td>
                          <td style={table.td}>{c.title || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tasks Tab */}
          {activeTab === 'tasks' && (
            <TasksTab
              companyId={companyId}
              tenantId={company.tenantId}
              users={users}
              currentUserId={currentUser?.id}
              tasks={tasks}
              onTasksChanged={load}
            />
          )}
        </div>

        {/* ════════════════ RIGHT SIDEBAR ════════════════ */}
        <div className="record-right" style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 80 }}>
          <ContactsCard contacts={contacts} companyId={companyId} />
          <DealsCard deals={deals} />
          <TasksCard tasks={tasks} />
        </div>
      </div>

      {/* Add Contact Modal */}
      {contactModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }} onClick={() => setContactModal(false)}>
          <div className="modal-content" style={{ ...panel.container, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Add Contact</h2>
            <form onSubmit={handleAddContact} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={forms.row}>
                <label style={forms.group}><span style={forms.label}>First name</span><input className="form-input" style={forms.input} required value={contactForm.firstName} onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })} /></label>
                <label style={forms.group}><span style={forms.label}>Last name</span><input className="form-input" style={forms.input} required value={contactForm.lastName} onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })} /></label>
              </div>
              <div style={forms.row}>
                <label style={forms.group}><span style={forms.label}>Email</span><input className="form-input" style={forms.input} type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} /></label>
                <label style={forms.group}><span style={forms.label}>Phone</span><input className="form-input" style={forms.input} value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} /></label>
              </div>
              <label style={forms.group}><span style={forms.label}>Title</span><input className="form-input" style={forms.input} value={contactForm.title} onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })} /></label>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn-touch" style={buttons.secondary} onClick={() => setContactModal(false)}>Cancel</button>
                <button type="submit" className="btn-touch" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Save Contact'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {emailModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }} onClick={() => setEmailModal(false)}>
          <div className="modal-content" style={{ ...panel.container, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Send Email</h2>
            {!googleConnected && (
              <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                Google account not connected. Connect in <Link href="/settings" style={{ color: 'var(--gold)' }}>Settings</Link> to send email.
              </div>
            )}
            <form onSubmit={handleSendEmail} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}><span style={forms.label}>To</span><input className="form-input" style={forms.input} type="email" required value={emailForm.to} onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })} /></label>
              <label style={forms.group}><span style={forms.label}>Subject</span><input className="form-input" style={forms.input} required value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} /></label>
              <label style={forms.group}><span style={forms.label}>Body</span><textarea className="form-textarea" style={forms.textarea} rows={8} value={emailForm.body} onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })} /></label>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn-touch" style={buttons.secondary} onClick={() => setEmailModal(false)}>Cancel</button>
                <button type="submit" className="btn-touch" style={buttons.primary} disabled={!googleConnected || submitting}>{submitting ? 'Sending...' : 'Send'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CompanyDetailPage() {
  return <ProtectedLayout><CompanyDetailContent /></ProtectedLayout>
}
