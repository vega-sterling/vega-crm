'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import ConfirmDialog from '../components/ConfirmDialog'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge } from '../lib/styles'
import type { CalendarEvent, BookingSlot, Contact, Company } from '../lib/types'

const formatDate = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatTime = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function CalendarContent() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)

  const [showEventModal, setShowEventModal] = useState(false)
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
    weekday: number
    startTime: string
    endTime: string
    durationMinutes: number
  }>({ weekday: 1, startTime: '09:00', endTime: '17:00', durationMinutes: 30 })

  const load = useCallback(async () => {
    try {
      const [eventsRes, slotsRes, contactsRes, companiesRes] = await Promise.all([
        apiFetch<{ data: CalendarEvent[] }>('/api/calendar/events'),
        apiFetch<{ data: BookingSlot[] }>('/api/calendar/booking-slots'),
        apiFetch<{ data: Contact[] }>('/api/contacts'),
        apiFetch<{ data: Company[] }>('/api/companies'),
      ])
      setEvents(eventsRes.data || [])
      setSlots(slotsRes.data || [])
      setContacts(contactsRes.data || [])
      setCompanies(companiesRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load calendar')
    } finally {
      setLoading(false)
    }
  }, [])

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
      setShowEventModal(false)
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
      await apiFetch('/api/calendar/booking-slots', {
        method: 'POST',
        body: JSON.stringify(slotForm),
      })
      await load()
    } catch (err: any) {
      setError(err.message || 'Failed to save slot')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSlot = (slot: any) => {
    setConfirmDelete(slot)
  }

  const performDeleteSlot = async (slot: any) => {
    try {
      await apiFetch(`/api/calendar/booking-slots/${slot.id}`, { method: 'DELETE' })
      setSlots((prev) => prev.filter((s) => s.id !== slot.id))
    } catch (err: any) {
      setError(err.message || 'Failed to delete slot')
    }
  }

  const publicBookingLink = typeof window !== 'undefined' ? `${window.location.origin}/book/me` : ''

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
        <h1 style={{ ...typeography.title, marginBottom: 0 }}>Calendar</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={buttons.secondary} onClick={handleSync} disabled={syncing}>{syncing ? 'Syncing...' : 'Sync Calendar'}</button>
          <button style={buttons.primary} onClick={() => setShowEventModal(true)}>+ New Event</button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div className="project-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
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

          {publicBookingLink && (
            <div style={{ ...panel.compact, marginBottom: 16, wordBreak: 'break-all' }}>
              <div style={{ ...typeography.small, marginBottom: 4 }}>Your public link</div>
              <Link href={publicBookingLink} target="_blank" style={{ color: 'var(--gold)', fontSize: 13 }}>{publicBookingLink}</Link>
            </div>
          )}

          <form onSubmit={handleSaveSlot} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Weekday</span>
                <select style={forms.select} value={slotForm.weekday} onChange={(e) => setSlotForm({ ...slotForm, weekday: Number(e.target.value) })}>
                  {WEEKDAYS.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Duration (min)</span>
                <select style={forms.select} value={slotForm.durationMinutes} onChange={(e) => setSlotForm({ ...slotForm, durationMinutes: Number(e.target.value) })}>
                  {[15, 30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>{m} min</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Start</span>
                <input style={forms.input} type="time" value={slotForm.startTime} onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>End</span>
                <input style={forms.input} type="time" value={slotForm.endTime} onChange={(e) => setSlotForm({ ...slotForm, endTime: e.target.value })} />
              </label>
            </div>
            <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Add availability'}</button>
          </form>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {slots.map((slot) => (
              <div key={slot.id} style={{ ...panel.compact, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{WEEKDAYS[slot.weekday]}</span>
                  {' '}<span style={{ color: 'var(--fg-dim)' }}>{slot.startTime.slice(0, 5)}–{slot.endTime.slice(0, 5)} · {slot.durationMinutes} min</span>
                </div>
                <button style={buttons.danger} onClick={() => handleDeleteSlot(slot)}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showEventModal && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setShowEventModal(false)}
        >
          <div className="modal-content" style={{ ...panel.container, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>New event</h2>
            <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Title</span>
                <input style={forms.input} required value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} />
              </label>

              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Date</span>
                  <input style={forms.input} type="date" required value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} />
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Time</span>
                  <input style={forms.input} type="time" required value={eventForm.time} onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })} />
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Duration (min)</span>
                  <input style={forms.input} type="number" min={5} value={eventForm.duration} onChange={(e) => setEventForm({ ...eventForm, duration: Number(e.target.value) })} />
                </label>
              </div>

              <label style={forms.group}>
                <span style={forms.label}>Attendees (comma-separated emails)</span>
                <input style={forms.input} value={eventForm.attendees} onChange={(e) => setEventForm({ ...eventForm, attendees: e.target.value })} />
              </label>

              <label style={forms.group}>
                <span style={forms.label}>Location</span>
                <input style={forms.input} value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} />
              </label>

              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Linked contact</span>
                  <select style={forms.select} value={eventForm.contactId} onChange={(e) => setEventForm({ ...eventForm, contactId: e.target.value })}>
                    <option value="">None</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                    ))}
                  </select>
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Linked company</span>
                  <select style={forms.select} value={eventForm.companyId} onChange={(e) => setEventForm({ ...eventForm, companyId: e.target.value })}>
                    <option value="">None</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label style={forms.group}>
                <span style={forms.label}>Description</span>
                <textarea style={forms.textarea} value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} />
              </label>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" style={buttons.secondary} onClick={() => setShowEventModal(false)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Create event'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Booking Slot?"
        itemName={confirmDelete ? `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][confirmDelete.weekday]} ${confirmDelete.startTime}-${confirmDelete.endTime}` : undefined}
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
