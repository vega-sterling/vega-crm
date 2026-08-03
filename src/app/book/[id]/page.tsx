'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '../../lib/api'
import { panel, typeography, forms, buttons } from '../../lib/styles'
import type { BookingSlot } from '../../lib/types'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function PublicBookingPage() {
  const params = useParams()
  const userId = params.id as string

  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')

  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null)
  const [selectedTime, setSelectedTime] = useState('')

  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    notes: '',
  })

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: BookingSlot[] }>(`/api/public/booking-slots?userId=${userId}`)
      setSlots(res.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load availability')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  const next30Days = useMemoDays()

  const availabilityByDate = useMemoAvailability(slots, next30Days)

  const availableTimesForDate = (dateStr: string) => {
    if (!dateStr) return []
    const date = new Date(dateStr)
    const weekday = date.getDay()
    const daySlots = slots.filter((s) => s.weekday === weekday)
    const times: { slot: BookingSlot; time: string }[] = []
    daySlots.forEach((slot) => {
      let current = parseTime(slot.startTime)
      const end = parseTime(slot.endTime)
      while (current + slot.durationMinutes * 60000 <= end) {
        times.push({ slot, time: formatTime(new Date(current)) })
        current += slot.durationMinutes * 60000
      }
    })
    return times
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSlot || !selectedTime || !selectedDate) return
    setSubmitting(true)
    setSuccess('')
    try {
      const start = new Date(`${selectedDate}T${selectedTime}`)
      const end = new Date(start.getTime() + selectedSlot.durationMinutes * 60000)
      await apiFetch('/api/public/bookings', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          bookingSlotId: selectedSlot.id,
          scheduledAt: start.toISOString(),
          name: form.name,
          email: form.email,
          company: form.company,
          notes: form.notes,
        }),
      })
      setSuccess('Booking confirmed. You will receive a calendar invitation via email.')
      setForm({ name: '', email: '', company: '', notes: '' })
      setSelectedTime('')
      setSelectedSlot(null)
    } catch (err: any) {
      setError(err.message || 'Booking failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
        <div style={{ color: 'var(--fg-dim)' }}>Loading availability...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--fg)', padding: '48px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: 'var(--gold)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
            V
          </div>
          <h1 style={{ ...typeography.title, marginBottom: 8 }}>Book a meeting</h1>
          <p style={{ color: 'var(--fg-dim)' }}>Select a date and time that works for you.</p>
        </div>

        {error && (
          <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ backgroundColor: 'rgba(74,222,128,0.12)', color: 'var(--emerald)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
            {success}
          </div>
        )}

        <div className="panel-container" style={panel.container}>
          <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Select a date</h2>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
            {next30Days.map((d) => {
              const hasSlots = availabilityByDate[d.iso]
              const isSelected = selectedDate === d.iso
              return (
                <button
                  key={d.iso}
                  disabled={!hasSlots}
                  onClick={() => {
                    setSelectedDate(d.iso)
                    setSelectedTime('')
                    setSelectedSlot(null)
                  }}
                  style={{
                    flex: '0 0 80px',
                    padding: 12,
                    borderRadius: 10,
                    border: isSelected ? '2px solid var(--gold)' : '1px solid var(--panel-border)',
                    backgroundColor: isSelected ? 'var(--panel-elevated)' : 'var(--bg-soft)',
                    color: hasSlots ? 'var(--fg)' : 'var(--fg-dimmer)',
                    opacity: hasSlots ? 1 : 0.6,
                    cursor: hasSlots ? 'pointer' : 'not-allowed',
                  }}
                >
                  <div style={{ fontSize: 12, textTransform: 'uppercase' }}>{d.weekdayShort}</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{d.day}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{d.month}</div>
                </button>
              )
            })}
          </div>
        </div>

        {selectedDate && (
          <div className="panel-container" style={{ ...panel.container, marginTop: 16 }}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Available times for {new Date(selectedDate).toLocaleDateString()}</h2>
            {(() => {
              const times = availableTimesForDate(selectedDate)
              if (times.length === 0) return <p style={{ color: 'var(--fg-dim)' }}>No availability on this day.</p>
              return (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {times.map(({ slot, time }) => {
                    const isSelected = selectedTime === time && selectedSlot?.id === slot.id
                    return (
                      <button
                        key={`${slot.id}-${time}`}
                        onClick={() => {
                          setSelectedSlot(slot)
                          setSelectedTime(time)
                        }}
                        style={{
                          padding: '10px 16px',
                          borderRadius: 8,
                          border: isSelected ? '2px solid var(--gold)' : '1px solid var(--panel-border)',
                          backgroundColor: isSelected ? 'var(--panel-elevated)' : 'var(--bg-soft)',
                          color: 'var(--fg)',
                          fontWeight: 600,
                        }}
                      >
                        {time}
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}

        {selectedSlot && selectedTime && (
          <div className="panel-container" style={{ ...panel.container, marginTop: 16 }}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Your details</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Name *</span>
                  <input style={forms.input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Email *</span>
                  <input style={forms.input} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </label>
              </div>
              <label style={forms.group}>
                <span style={forms.label}>Company</span>
                <input style={forms.input} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Notes</span>
                <textarea style={forms.textarea} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--fg-dim)', fontSize: 14 }}>
                Booking: {selectedSlot.durationMinutes} minutes at {selectedTime}
              </div>
              <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Booking...' : 'Confirm booking'}</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

function useMemoDays() {
  return useMemoBuildDays()
}

function useMemoAvailability(slots: BookingSlot[], days: { iso: string; weekday: number }[]) {
  const map: Record<string, boolean> = {}
  days.forEach((d) => {
    map[d.iso] = slots.some((s) => s.weekday === d.weekday)
  })
  return map
}

function useMemoBuildDays() {
  const [days, setDays] = useState<{ iso: string; weekday: number; weekdayShort: string; day: number; month: string }[]>([])

  useEffect(() => {
    const arr = []
    const today = new Date()
    for (let i = 0; i < 30; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const iso = d.toISOString().slice(0, 10)
      arr.push({
        iso,
        weekday: d.getDay(),
        weekdayShort: d.toLocaleDateString('en-US', { weekday: 'short' }),
        day: d.getDate(),
        month: d.toLocaleDateString('en-US', { month: 'short' }),
      })
    }
    setDays(arr)
  }, [])

  return days
}

function parseTime(timeStr: string) {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const d = new Date()
  d.setHours(hours || 0, minutes || 0, 0, 0)
  return d.getTime()
}

function formatTime(d: Date) {
  return d.toTimeString().slice(0, 5)
}
