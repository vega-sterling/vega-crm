'use client'

// ============================================================================
// PinnedNotes — Section at the top of the timeline showing pinned notes.
// Server-backed (Phase 41): pin state lives on the Activity row
// (isPinned/pinnedAt) and syncs across devices and users.
// Only one note can be pinned at a time (HubSpot-style) — the API clears
// other pins on the same record automatically.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { panel, typeography, statusBadge } from '../lib/styles'
import type { Activity, User } from '../lib/types'
import ActivityCard from './ActivityCard'
import { IconPin } from './Icons'
import { apiFetch } from '../lib/api'

interface PinnedNotesProps {
  entityId: string  // companyId, contactId, or dealId
  entityKey: string // 'company' | 'contact' | 'deal'
  activities: Activity[]
  users: User[]
  onUnpin: () => void
}

export function usePinnedNote(entityKey: string, entityId: string, activities?: Activity[]) {
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const pinnedIdRef = useRef<string | null>(null)
  const setPinned = useCallback((id: string | null) => {
    pinnedIdRef.current = id
    setPinnedId(id)
  }, [])

  // Hydrate from server data on first load (or when server state arrives
  // and we have no optimistic local state yet). A ref guards against
  // clobbering optimistic updates made before/while activities load.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    // Wait for a real (non-empty) activities load — the initial [] render
    // must not count as hydration.
    if (!activities || activities.length === 0) return
    const serverPinned = activities.find(a => a.isPinned)?.id ?? null
    hydratedRef.current = true
    if (!pinnedIdRef.current) setPinned(serverPinned)
  }, [activities, setPinned])

  const pin = useCallback((id: string) => {
    // Optimistic — server clears any other pin on the same record.
    setPinned(id)
    apiFetch(`/api/activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ isPinned: true }),
    }).catch(() => {})
  }, [setPinned])

  const unpin = useCallback(() => {
    // Capture the old id before clearing so we can clear it server-side.
    const prev = pinnedIdRef.current
    setPinned(null)
    if (prev) {
      apiFetch(`/api/activities/${prev}`, {
        method: 'PUT',
        body: JSON.stringify({ isPinned: false }),
      }).catch(() => {})
    }
  }, [setPinned])

  return { pinnedId, pin, unpin }
}

export default function PinnedNotes({
  entityId, entityKey, activities, users, onUnpin,
}: PinnedNotesProps) {
  const { pinnedId, pin, unpin } = usePinnedNote(entityKey, entityId, activities)

  // Find the pinned activity
  const pinnedActivity = pinnedId ? activities.find(a => a.id === pinnedId) : null

  const handlePinToggle = (id: string) => {
    if (pinnedId === id) {
      unpin()
      onUnpin()
    } else {
      pin(id)
    }
  }

  // If the pinned activity is not found (deleted or not in current filter), show nothing
  if (!pinnedActivity) {
    // Still need to expose pin handler — render a fragment with the pin capability
    return (
      <PinnedPinHandler pinnedId={pinnedId} onPinToggle={handlePinToggle} />
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
      }}>
        <IconPin size={16} strokeWidth={2} style={{ color: 'var(--gold)' }} />
        <span style={{ ...typeography.subtitle, margin: 0, fontSize: 15 }}>
          Pinned Note
        </span>
      </div>
      <div style={{
        border: '2px solid var(--gold)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <ActivityCard
          activity={pinnedActivity}
          users={users}
          pinned={true}
          onPin={handlePinToggle}
        />
      </div>
    </div>
  )
}

// Helper component to expose pin handler when no pinned note is visible
function PinnedPinHandler({ pinnedId, onPinToggle }: {
  pinnedId: string | null
  onPinToggle: (id: string) => void
}) {
  // This is a no-render component — the pin functionality is handled
  // by the parent timeline which uses the usePinnedNote hook directly.
  return null
}

export { usePinnedNote as usePinned }