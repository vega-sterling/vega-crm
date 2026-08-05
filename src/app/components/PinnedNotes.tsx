'use client'

// ============================================================================
// PinnedNotes — Section at the top of the timeline showing pinned notes.
// Uses localStorage to track pinned activity IDs per entity.
// Only one note can be pinned at a time (HubSpot-style).
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { panel, typeography, statusBadge } from '../lib/styles'
import type { Activity, User } from '../lib/types'
import ActivityCard from './ActivityCard'

interface PinnedNotesProps {
  entityId: string  // companyId or contactId
  entityKey: string // 'company' or 'contact'
  activities: Activity[]
  users: User[]
  onUnpin: () => void
}

export function usePinnedNote(entityKey: string, entityId: string) {
  const storageKey = `vega-crm-pinned-${entityKey}-${entityId}`

  const [pinnedId, setPinnedId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      setPinnedId(stored)
    } catch {
      setPinnedId(null)
    }
  }, [storageKey])

  const pin = useCallback((id: string) => {
    try {
      // Only one note pinned at a time — pinning a new one unpins the previous
      localStorage.setItem(storageKey, id)
      setPinnedId(id)
    } catch {
      // localStorage might be unavailable
    }
  }, [storageKey])

  const unpin = useCallback(() => {
    try {
      localStorage.removeItem(storageKey)
    } catch {}
    setPinnedId(null)
  }, [storageKey])

  return { pinnedId, pin, unpin }
}

export default function PinnedNotes({
  entityId, entityKey, activities, users, onUnpin,
}: PinnedNotesProps) {
  const { pinnedId, pin, unpin } = usePinnedNote(entityKey, entityId)

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
        <span style={{ fontSize: 16 }}>📌</span>
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
