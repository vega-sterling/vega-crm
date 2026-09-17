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
import { IconPin } from '../../components/Icons'
import ConfirmDialog from '../../components/ConfirmDialog'
import PropertyQuickEdit from '../../components/PropertyQuickEdit'
import CustomFieldsSection from '../../components/CustomFieldsSection'
import { LeadScoreBadge } from '../../components/LeadScoreBadge'
import SummaryCard from '../../components/SummaryCard'
import { CompanyCard, DealsCard, TasksCard } from '../../components/AssociationCards'
import { usePinnedNote } from '../../components/PinnedNotes'
import RecordPageShell, { PinnedNoteSection } from '../../components/RecordPageShell'
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
  const [activeTab, setActiveTab] = useState<'timeline' | 'tasks'>('timeline')

  const [submitting, setSubmitting] = useState(false)
  const [following, setFollowing] = useState(false)
  const [googleConnected, setGoogleConnected] = useState(false)

  // ── Pending deletes (ConfirmDialog state) ──
  const [confirmDeleteContact, setConfirmDeleteContact] = useState(false)

  // Pinned notes (server-backed — hydrates from activity isPinned)
  const { pinnedId, pin, unpin } = usePinnedNote('contact', contactId, activities)

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
  const pinnedActivity: Activity | null = pinnedId ? (activities.find(a => a.id === pinnedId) ?? null) : null
  const timelineItems = filteredTimeline.filter(item => !(item.kind === 'activity' && item.data.id === pinnedId))

  const handlePinToggle = (id: string) => {
    if (pinnedId === id) {
      unpin()
    } else {
      pin(id)
    }
  }

  const handleDeleteActivity = async (id: string) => {
    // Confirmation is handled by ConfirmDialog inside ActivityCard
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

  const timelineTabContent = (
    <>
      <PinnedNoteSection
        activity={pinnedActivity}
        users={users}
        onPinToggle={handlePinToggle}
        onEditSave={handleEditActivitySave}
        onDelete={handleDeleteActivity}
      />

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

      <InlineNoteComposer
        companyId={contact.companyId}
        tenantId={contact.tenantId}
        contactId={contactId}
        onCreated={(a) => setActivities((prev) => [a, ...prev])}
        users={users}
      />

      <TimelineFilterTabs active={timelineFilter} onChange={setTimelineFilter} counts={filterCounts} />

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
    </>
  )

  return (
    <RecordPageShell
      header={
        <div className="page-header" style={layout.header}>
          <div>
            <Link href="/contacts" style={{ color: 'var(--fg-dim)', fontSize: 13 }}>← Contacts</Link>
            <h1 style={{ ...typeography.title, marginBottom: 4, marginTop: 8 }}>{fullName}</h1>
            <div style={{ color: 'var(--fg-dim)', fontSize: 14 }}>
              {contact.title || 'No title'} {contact.company ? <span> · <Link href={`/companies/${contact.company.id}`} style={{ color: 'var(--gold)' }}>{contact.company.name}</Link></span> : ' · No company'}
            </div>
          </div>
        </div>
      }
      error={error}
      onDismissError={() => setError('')}
      left={<>
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

        {contact.notes && (
          <div className="panel-container" style={panel.container}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0, marginBottom: 12 }}>About</h2>
            <p style={{ color: 'var(--fg-dim)', fontSize: 14, lineHeight: 1.5 }}>{contact.notes}</p>
          </div>
        )}

        <CustomFieldsSection
          entityId={contactId}
          entityType="CONTACT"
          tenantId={contact.tenantId}
        />

        <LeadScoreBadge contactId={contactId} />

        <SummaryCard endpoint={`/api/contacts/${contactId}/summary`} entityType="Contact" />

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
            onClick={() => setConfirmDeleteContact(true)}
          >Delete</button>
        </div>
      </>}
      tabs={[
        { id: 'timeline', label: 'Timeline', content: timelineTabContent },
        {
          id: 'tasks',
          label: 'Tasks',
          count: tasks.length,
          content: (
            <TasksTab
              contactId={contactId}
              companyId={contact.companyId}
              tenantId={contact.tenantId}
              users={users}
              currentUserId={currentUser?.id}
              tasks={tasks}
              onTasksChanged={load}
            />
          ),
        },
      ]}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as 'timeline' | 'tasks')}
      right={<>
        <CompanyCard company={contact.company} />
        <DealsCard deals={deals} />
        <TasksCard tasks={tasks} />
      </>}
      footer={
        <ConfirmDialog
          open={confirmDeleteContact}
          title="Delete Contact?"
          itemName={fullName}
          message="This permanently deletes the record and cannot be undone."
          onCancel={() => setConfirmDeleteContact(false)}
          onConfirm={() => {
            setConfirmDeleteContact(false)
            apiFetch(`/api/contacts/${contactId}`, { method: 'DELETE' })
              .then(() => { window.location.href = '/contacts' })
              .catch((err: any) => setError(err.message || 'Failed to delete contact'))
          }}
        />
      }
    />
  )
}

export default function ContactDetailPage() {
  return <ProtectedLayout><ContactDetailContent /></ProtectedLayout>
}
