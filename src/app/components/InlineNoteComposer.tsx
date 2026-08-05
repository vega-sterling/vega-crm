'use client'

// ============================================================================
// InlineNoteComposer — Big text area at the TOP of the activity timeline.
// Phase 2: Now uses MentionsInput for @mention support.
// Type a note, hit Enter or click "Add Note" button. No modal.
// ============================================================================

import { useState, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { forms, buttons, panel } from '../lib/styles'
import type { Activity, User } from '../lib/types'
import MentionsInput from './MentionsInput'

interface InlineNoteComposerProps {
  companyId: string
  tenantId: string
  contactId?: string
  dealId?: string
  onCreated: (activity: Activity) => void
  users?: User[]
}

export default function InlineNoteComposer({ companyId, tenantId, contactId, dealId, onCreated, users = [] }: InlineNoteComposerProps) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [focused, setFocused] = useState(false)

  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        type: 'NOTE',
        subject: trimmed.slice(0, 100),
        description: trimmed,
        companyId,
        tenantId,
      }
      if (contactId) body.contactId = contactId
      if (dealId) body.dealId = dealId
      const created = await apiFetch<Activity>('/api/activities', {
        method: 'POST', body: JSON.stringify(body),
      })
      onCreated(created)
      setText('')
      setFocused(false)
    } catch (err: any) {
      console.error('Failed to add note:', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter without Shift = submit. Shift+Enter = newline.
    // (MentionsInput handles @mention Enter internally before this fires)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      className="panel-container"
      style={{
        ...panel.container,
        padding: focused ? 20 : 16,
        transition: 'padding 0.15s',
      }}
    >
      <MentionsInput
        value={text}
        onChange={setText}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => { if (!text.trim()) setFocused(false) }}
        minHeight={focused ? 100 : 56}
        placeholder="Write a note…  Type @ to mention someone. (Enter to save · Shift+Enter for new line)"
        users={users}
      />
      {(focused || text.trim()) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button
            className="btn-touch"
            style={buttons.secondary}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setText(''); setFocused(false) }}
          >
            Cancel
          </button>
          <button
            className="btn-touch"
            style={{ ...buttons.primary, opacity: submitting || !text.trim() ? 0.5 : 1 }}
            disabled={submitting || !text.trim()}
            onClick={handleSubmit}
          >
            {submitting ? 'Saving…' : 'Add Note'}
          </button>
        </div>
      )}
    </div>
  )
}
