'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import ConfirmDialog from '../components/ConfirmDialog'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge } from '../lib/styles'
import type { CalendarEvent, Contact, Company } from '../lib/types'

const formatDate = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatTime = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface BookingSlot {
  id: string
  userId: string
  tenantId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  durationMin: number
  isActive: boolean
}

function CalendarContent() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)

  const [showEventForm, setShowEventForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)

  const [eventForm, setEventForm] = useState({
    title: '',
    date: '',
    time: '',
    duration: 60,
    attendees: '',
    location: '',
    contactId: '',
    companyId: '',
    description: '',
  })

  const [slotForm, setSlotForm] = useState<{
    dayOfWeek: number
    startTime: string
    endTime: string
    durationMin: number
    tenantId: string
  }>({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00', durationMin: 30, tenantId: '' })

  const load = useCallback(async () => {
    try {
      const [eventsRes, slotsRes, contactsRes, companiesRes, tenantsRes] = await Promise.all([
        apiFetch<{ data: CalendarEvent[] }>('/api/calendar/events'),
        apiFetch<{ data: BookingSlot[] }>('/api/bookings/slots?limit=100'),
        apiFetch<{ data: Contact[] }>('/api/contacts'),
        apiFetch<{ data: Company[] }>('/api/companies'),
        apiFetch<{ data: { id: string; name: string }[] }>('/api/admin/tenants').catch(() => ({ data: [] as { id: string; name: string }[] })),
      ])
      setEvents(eventsRes.data || [])
      setSlots(slotsRes.data || [])
      setContacts(contactsRes.data || [])
      setCompanies(companiesRes.data || [])
      setTenants(tenantsRes.data || [])
      if (tenantsRes.data?.[0] && !slotForm.tenantId) {
        setSlotForm((prev) => ({ ...prev, tenantId: tenantsRes.data[0].id }))
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load calendar')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
  }, [load])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    const cutoff = new Date()
    cutoff.setDate(now.getDate() + 30)
    return events
      .filter((e) => {
        const start = new Date(e.startTime)
        return start >= now && start <= cutoff
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }, [events])

  const groupedEvents = useMemo(() => {
    const groups: Record<string, CalendarEvent[]> = {}
    upcomingEvents.forEach((e) => {
      const key = new Date(e.startTime).toDateString()
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    })
    return groups
  }, [upcomingEvents])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await apiFetch('/api/calendar/sync', { method: 'POST' })
      await load()
    } catch (err: any) {
      setError(err.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const start = new Date(`${eventForm.date}T${eventForm.time}`)
      const end = new Date(start.getTime() + eventForm.duration * 60000)
      await apiFetch('/api/calendar/events', {
        method: 'POST',
        body: JSON.stringify({
          title: eventForm.title,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          location: eventForm.location,
          attendees: eventForm.attendees.split(',').map((s) => s.trim()).filter(Boolean),
          contactId: eventForm.contactId || null,
          companyId: eventForm.companyId || null,
          description: eventForm.description,
        }),
      })
      setShowEventForm(false)
      setEventForm({ title: '', date: '', time: '', duration: 60, attendees: '', location: '', contactId: '', companyId: '', description: '' })
      await load()
    } catch (err: any) {
      setError(err.message || 'Failed to create event')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await apiFetch('/api/bookings/slots', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: slotForm.tenantId,
          weekday: slotForm.dayOfWeek,
          startTime: slotForm.startTime,
          endTime: slotForm.endTime,
          durationMinutes: slotForm.durationMin,
        }),
      })
      await load()
    } catch (err: any) {
      setError(err.message || 'Failed to save slot')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSlot = (slot: BookingSlot) => {
    setConfirmDelete(slot)
  }

  const performDeleteSlot = async (slot: BookingSlot) => {
    try {
      await apiFetch(`/api/bookings/slots/${slot.id}`, { method: 'DELETE' })
      setSlots((prev) => prev.filter((s) => s.id !== slot.id))
    } catch (err: any) {
      setError(err.message || 'Failed to delete slot')
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
      <div className="calendar-header" style={layout.header}>
        <h1 style={{ ...typeography.title, marginBottom: 0 }}>Calendar</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={buttons.secondary} onClick={handleSync} disabled={syncing}>{syncing ? 'Syncing...' : 'Sync Calendar'}</button>
          <button style={buttons.primary} onClick={() => setShowEventForm(!showEventForm)}>{showEventForm ? '× Cancel' : '+ New Event'}</button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* ── Inline New Event Form (replaces modal) ── */}
      {showEventForm && (
        <div id="inline-event-form" className="panel-container" style={{ ...panel.container, marginBottom: 24, animation: 'slideUp 0.25s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ ...typeography.subtitle, margin: 0 }}>New event</h2>
            <button type="button" style={{ ...buttons.small, fontSize: 18, lineHeight: 1, padding: '4px 12px' }} onClick={() => setShowEventForm(false)}>×</button>
          </div>
          <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={forms.group}>
              <span style={forms.label}>Title</span>
              <input className="form-input" style={forms.input} required value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} placeholder="e.g., Discovery call with Acme Corp" autoFocus />
            </label>

            <div style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Date</span>
                <input className="form-input" style={forms.input} type="date" required value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Time</span>
                <input className="form-input" style={forms.input} type="time" required value={eventForm.time} onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Duration (min)</span>
                <input className="form-input" style={forms.input} type="number" min={5} value={eventForm.duration} onChange={(e) => setEventForm({ ...eventForm, duration: Number(e.target.value) })} />
              </label>
            </div>

            <label style={forms.group}>
              <span style={forms.label}>Attendees (comma-separated emails)</span>
              <input className="form-input" style={forms.input} value={eventForm.attendees} onChange={(e) => setEventForm({ ...eventForm, attendees: e.target.value })} placeholder="alice@example.com, bob@example.com" />
            </label>

            <label style={forms.group}>
              <span style={forms.label}>Location</span>
              <input className="form-input" style={forms.input} value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} placeholder="Zoom link, office address, etc." />
            </label>

            <div style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Linked contact</span>
                <select className="form-select" style={forms.select} value={eventForm.contactId} onChange={(e) => setEventForm({ ...eventForm, contactId: e.target.value })}>
                  <option value="">None</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                  ))}
                </select>
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Linked company</span>
                <select className="form-select" style={forms.select} value={eventForm.companyId} onChange={(e) => setEventForm({ ...eventForm, companyId: e.target.value })}>
                  <option value="">None</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label style={forms.group}>
              <span style={forms.label}>Description</span>
              <textarea className="form-textarea" style={forms.textarea} value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} placeholder="Agenda, notes, etc." />
            </label>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" style={buttons.secondary} onClick={() => setShowEventForm(false)}>Cancel</button>
              <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Create event'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="project-grid calendar-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Upcoming (next 30 days)</h2>
          {Object.keys(groupedEvents).length === 0 && <p style={typeography.muted}>No upcoming events.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {Object.entries(groupedEvents).map(([dateKey, dayEvents]) => (
              <div key={dateKey}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gold)', marginBottom: 8 }}>{formatDate(dayEvents[0].startTime)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {dayEvents.map((e) => {
                    const linked = e.contactId ? contacts.find((c) => c.id === e.contactId) : null
                    const company = e.companyId ? companies.find((c) => c.id === e.companyId) : null
                    return (
                      <div key={e.id} style={{ ...panel.compact, padding: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 600 }}>{formatTime(e.startTime)} · {e.title}</span>
                          <span style={statusBadge(e.status === 'CONFIRMED' ? 'var(--emerald)' : 'var(--gold)')}>{e.status}</span>
                        </div>
                        <div style={{ ...typeography.small, marginTop: 4 }}>
                          {e.location && <span>📍 {e.location} · </span>}
                          Attendees: {e.attendees?.join(', ') || 'None'}
                        </div>
                        <div style={{ ...typeography.small, marginTop: 4 }}>
                          {linked && <span>👤 {linked.firstName} {linked.lastName} · </span>}
                          {company && <Link href={`/companies/${company.id}`} style={{ color: 'var(--gold)' }}>🏢 {company.name}</Link>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Booking pages</h2>
          <p style={{ ...typeography.muted, marginBottom: 12 }}>Configure your availability and share your public link.</p>

          <form onSubmit={handleSaveSlot} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tenants.length > 1 && (
              <label style={forms.group}>
                <span style={forms.label}>Tenant</span>
                <select className="form-select" style={forms.select} value={slotForm.tenantId} onChange={(e) => setSlotForm({ ...slotForm, tenantId: e.target.value })}>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            )}
            <div style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Weekday</span>
                <select className="form-select" style={forms.select} value={slotForm.dayOfWeek} onChange={(e) => setSlotForm({ ...slotForm, dayOfWeek: Number(e.target.value) })}>
                  {WEEKDAYS.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Duration (min)</span>
                <select className="form-select" style={forms.select} value={slotForm.durationMin} onChange={(e) => setSlotForm({ ...slotForm, durationMin: Number(e.target.value) })}>
                  {[15, 30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>{m} min</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Start</span>
                <input className="form-input" style={forms.input} type="time" value={slotForm.startTime} onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>End</span>
                <input className="form-input" style={forms.input} type="time" value={slotForm.endTime} onChange={(e) => setSlotForm({ ...slotForm, endTime: e.target.value })} />
              </label>
            </div>
            <button type="submit" style={buttons.primary} disabled={submitting || !slotForm.tenantId}>{submitting ? 'Saving...' : 'Add availability'}</button>
          </form>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {slots.map((slot) => (
              <div key={slot.id} style={{ ...panel.compact, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{WEEKDAYS[slot.dayOfWeek]}</span>
                  {' '}<span style={{ color: 'var(--fg-dim)' }}>{slot.startTime.slice(0, 5)}–{slot.endTime.slice(0, 5)} · {slot.durationMin} min</span>
                </div>
                <button style={buttons.danger} onClick={() => handleDeleteSlot(slot)}>Delete</button>
              </div>
            ))}
            {slots.length === 0 && <p style={{ ...typeography.small, color: 'var(--fg-dim)' }}>No availability configured yet.</p>}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Booking Slot?"
        itemName={confirmDelete ? `${WEEKDAYS[confirmDelete.dayOfWeek]} ${confirmDelete.startTime}-${confirmDelete.endTime}` : undefined}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => { performDeleteSlot(confirmDelete); setConfirmDelete(null) }}
      />
    </div>
  )
}

export default function CalendarPage() {
  return (
    <ProtectedLayout>
      <CalendarContent />
    </ProtectedLayout>
  )
}