'use client'

// ============================================================================
// PropertyQuickEdit — Property row with hover edit icon, inline edit,
// Enter to save, Escape to cancel. No modal.
// ============================================================================

import { useState, useRef, useEffect } from 'react'
import { forms, typeography } from '../lib/styles'

interface PropertyQuickEditProps {
  label: string
  value?: string | null
  onSave: (value: string) => Promise<void>
  type?: 'text' | 'email' | 'tel' | 'url' | 'date' | 'number'
  placeholder?: string
}

export default function PropertyQuickEdit({
  label, value, onSave, type = 'text', placeholder = '—',
}: PropertyQuickEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const startEdit = () => {
    setDraft(value || '')
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setDraft(value || '')
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
    } catch (err) {
      console.error('PropertyQuickEdit save failed:', err)
      // Stay in edit mode so user can retry
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={typeography.small}>{label}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            ref={inputRef}
            className="form-input"
            type={type}
            style={{ ...forms.input, flex: 1, fontSize: 14 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={saving}
            placeholder={placeholder}
          />
          <button
            onClick={save}
            disabled={saving}
            title="Save"
            style={{
              background: 'transparent',
              border: '1px solid var(--emerald)',
              borderRadius: 6,
              color: 'var(--emerald)',
              padding: '6px 8px',
              cursor: saving ? 'wait' : 'pointer',
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {saving ? '…' : '✓'}
          </button>
          <button
            onClick={cancel}
            disabled={saving}
            title="Cancel"
            style={{
              background: 'transparent',
              border: '1px solid var(--panel-border)',
              borderRadius: 6,
              color: 'var(--fg-dim)',
              padding: '6px 8px',
              cursor: 'pointer',
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  // Display mode with hover edit icon
  return (
    <div
      className="property-quickedit"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        position: 'relative',
        padding: '6px 0',
        borderRadius: 6,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-soft)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <span style={typeography.small}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, wordBreak: 'break-word', flex: 1 }}>
          {value || <span style={{ color: 'var(--fg-dimmer)' }}>{placeholder}</span>}
        </span>
        <button
          onClick={startEdit}
          title={`Edit ${label}`}
          className="prop-edit-btn"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--fg-dimmer)',
            cursor: 'pointer',
            fontSize: 13,
            padding: '2px 4px',
            opacity: 0,
            transition: 'opacity 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0' }}
        >
          ✏️
        </button>
      </div>
      {/* Show edit icon on hover of parent via CSS */}
      <style>{`
        .property-quickedit:hover .prop-edit-btn { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
