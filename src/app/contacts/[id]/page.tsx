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
import { LeadScoreBadge } from '../../components/LeadScoreBadge'
import SummaryCard from '../../components/SummaryCard'
import { CompanyCard, DealsCard, TasksCard } from '../../components/AssociationCards'
import { usePinnedNote } from '../../components/PinnedNotes'
import EmailThreadCard from '../../components/EmailThreadCard'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge } from '../../lib/styles'
import type { Contact, Activity, Task, Deal, Company, EmailMessage, User } from '../../lib/types'
import { groupEmailsByThread } from '../../lib/emailThreads'

interface ContactDetail extends Contact {
  company?: { id: string; name: string } | null
}

interface ActivityListResponse { data: Activity[] }
interface TaskListResponse { data: Task[] }
interface DealListResponse { data: Deal[] }
interface EmailListResponse { data: EmailMessage[] }
interface UserListResponse { data: User[] }

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * ContactDetailPage — 3-column layout (HubSpot/Close CRM style).
 * LEFT: Properties + actions. MIDDLE: Timeline. RIGHT: Associations.
 */
function ContactDetailContent() {
  const { id } = useParams()
  const contactId = Array.isArray(id) ? id[0]! : id!

  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [emails, setEmails] = useState<EmailMessage[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('ALL')

  const [submitting, setSubmitting] = useState(false)
  const [following, setFollowing] = useState(false)
  const [googleConnected, setGoogleConnected] = useState(false)

  // Pinned notes (localStorage)
  const { pinnedId, pin, unpin } = usePinnedNote('contact', contactId)

  const load = useCallback(async () => {
    try {
      const [contactRes, activitiesRes, tasksRes, dealsRes, emailsRes, usersRes, meRes, googleRes] = await Promise.all([
        apiFetch<ContactDetail>(`/api/contacts/${contactId}`),
        apiFetch<ActivityListResponse>(`/api/activities?contactId=${contactId}&limit=100`).catch(() => ({ data: [] as Activity[] })),
        apiFetch<TaskListResponse>(`/api/tasks?contactId=${contactId}&limit=100`).catch(() => ({ data: [] as Task[] })),
        apiFetch<DealListResponse>(`/api/deals?contactId=${contactId}`).catch(() => ({ data: [] as Deal[] })),
        apiFetch<EmailListResponse>(`/api/email/messages?contactId=${contactId}&limit=100`).catch(() => ({ data: [] as EmailMessage[] })),
        apiFetch<UserListResponse>('/api/admin/users?limit=100').catch(() => ({ data: [] as User[] })),
        apiFetch<User>('/api/auth/me').catch(() => null),
        apiFetch<{ connected: boolean }>('/api/google/status').catch(() => ({ connected: false })),
      ])
      setContact(contactRes)
      setActivities(activitiesRes.data || [])
      setTasks(tasksRes.data || [])
      setDeals(dealsRes.data || [])
      setEmails(emailsRes.data || [])
      setUsers(usersRes.data || [])
      setCurrentUser(meRes)
      setGoogleConnected(googleRes?.connected || false)
    } catch (err: any) {
      setError(err.message || 'Failed to load contact')
    } finally {
      setLoading(false)
    }
  }, [contactId])

  useEffect(() => { load() }, [load])

  // Unified timeline: activities + email threads (grouped by threadId)
  type UnifiedItem =
    | { kind: 'activity'; type: Activity['type']; data: Activity; sortKey: string }
    | { kind: 'emailThread'; type: 'EMAIL'; data: { threadId: string; emails: EmailMessage[]; latestCreatedAt: string }; sortKey: string }

  const emailThreads = useMemo(() => groupEmailsByThread(emails), [emails])

  const unifiedTimeline = useMemo(() => {
    const items: UnifiedItem[] = []
    activities.forEach(a => items.push({
      kind: 'activity', type: a.type, data: a,
      sortKey: a.createdAt,
    }))
    emailThreads.forEach(thread => items.push({
      kind: 'emailThread', type: 'EMAIL', data: thread,
      sortKey: thread.latestCreatedAt,
    }))
    items.sort((a, b) => new Date(b.sortKey).getTime() - new Date(a.sortKey).getTime())
    return items
  }, [activities, emailThreads])

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

  // Pinned activity (must be from activities, not emails)
  const pinnedActivity = pinnedId ? activities.find(a => a.id === pinnedId) : null
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

  const handleEditActivitySave = async (activity: Activity, newDescription: string) => {
    try {
      const updated = await apiFetch<Activity>(`/api/activities/${activity.id}`, {
        method: 'PUT',
        body: JSON.stringify({ description: newDescription, subject: activity.subject }),
      })
      setActivities(prev => prev.map(a => a.id === updated.id ? updated : a))
    } catch (err: any) {
      setError(err.message || 'Failed to update activity')
    }
  }

  // Property quick-edit save
  const handlePropertySave = async (field: string, value: string) => {
    const updated = await apiFetch<ContactDetail>(`/api/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify({ [field]: value || null }),
    })
    setContact(updated)
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>
  }
  if (!contact) {
    return <div style={layout.page}><p style={{ color: 'var(--fg-dim)' }}>Contact not found.</p></div>
  }

  const fullName = `${contact.firstName} ${contact.lastName}`.trim()

  return (
    <div style={layout.page}>
      {/* Header */}
      <div className="page-header" style={layout.header}>
        <div>
          <Link href="/contacts" style={{ color: 'var(--fg-dim)', fontSize: 13 }}>← Contacts</Link>
          <h1 style={{ ...typeography.title, marginBottom: 4, marginTop: 8 }}>{fullName}</h1>
          <div style={{ color: 'var(--fg-dim)', fontSize: 14 }}>
            {contact.title || 'No title'} {contact.company ? <span> · <Link href={`/companies/${contact.company.id}`} style={{ color: 'var(--gold)' }}>{contact.company.name}</Link></span> : ' · No company'}
          </div>
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
              <PropertyQuickEdit label="Email" value={contact.email} type="email" onSave={(v) => handlePropertySave('email', v)} />
              <PropertyQuickEdit label="Phone" value={contact.phone} type="tel" onSave={(v) => handlePropertySave('phone', v)} />
              <PropertyQuickEdit label="Mobile" value={contact.mobile} type="tel" onSave={(v) => handlePropertySave('mobile', v)} />
              <PropertyQuickEdit label="Title" value={contact.title} onSave={(v) => handlePropertySave('title', v)} />
              <PropertyQuickEdit label="Department" value={contact.department} onSave={(v) => handlePropertySave('department', v)} />
            </div>
          </div>

          {/* About section */}
          {contact.notes && (
            <div className="panel-container" style={panel.container}>
              <h2 style={{ ...typeography.subtitle, marginTop: 0, marginBottom: 12 }}>About</h2>
              <p style={{ color: 'var(--fg-dim)', fontSize: 14, lineHeight: 1.5 }}>{contact.notes}</p>
            </div>
          )}

          {/* Custom Fields section */}
          <CustomFieldsSection
            entityId={contactId}
            entityType="CONTACT"
            tenantId={contact.tenantId}
          />

          {/* Lead Score */}
          <LeadScoreBadge contactId={contactId} />

          {/* AI Summary */}
          <SummaryCard endpoint={`/api/contacts/${contactId}/summary`} entityType="Contact" />

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
              style={{ ...buttons.danger, width: '100%' }}
              onClick={() => { if (confirm('Delete this contact?')) { apiFetch(`/api/contacts/${contactId}`, { method: 'DELETE' }).then(() => window.location.href = '/contacts') } }}
            >Delete</button>
          </div>
        </div>

        {/* ════════════════ MIDDLE COLUMN ════════════════ */}
        <div className="record-middle" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Pinned Notes Section */}
          {pinnedActivity && (
            <div style={{ marginBottom: 0 }}>
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
                  onEditSave={handleEditActivitySave}
                  onDelete={handleDeleteActivity}
                />
              </div>
            </div>
          )}

          {/* Quick Action Bar */}
          <QuickActionBar
            companyId={contact.companyId}
            tenantId={contact.tenantId}
            contactId={contactId}
            contactName={fullName}
            contactEmail={contact.email}
            users={users}
            onActivityCreated={(a) => setActivities((prev) => [a, ...prev])}
            onTaskCreated={() => load()}
            googleConnected={googleConnected}
            contact={contact}
            company={contact.company}
            onEmailSent={() => load()}
          />

          {/* Inline Note Composer */}
          <div style={{ marginBottom: 16 }}>
            <InlineNoteComposer
              companyId={contact.companyId}
              tenantId={contact.tenantId}
              contactId={contactId}
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
                      onEditSave={handleEditActivitySave}
                      onDelete={handleDeleteActivity}
                    />
                  )
                }
                // Email thread — render as EmailThreadCard
                return (
                  <EmailThreadCard
                    key={`thread-${item.data.threadId}`}
                    emails={item.data.emails}
                    contactId={contactId}
                    companyId={contact.companyId}
                    tenantId={contact.tenantId}
                    toEmail={contact.email || undefined}
                    onReplied={load}
                  />
                )
              })
            )}
          </div>
        </div>

        {/* ════════════════ RIGHT SIDEBAR ════════════════ */}
        <div className="record-right" style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 80 }}>
          <CompanyCard company={contact.company} />
          <DealsCard deals={deals} />
          <TasksCard tasks={tasks} />
        </div>
      </div>

    </div>
  )
}

export default function ContactDetailPage() {
  return <ProtectedLayout><ContactDetailContent /></ProtectedLayout>
}
