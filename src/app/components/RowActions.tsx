'use client'

// ============================================================================
// File: src/app/components/RowActions.tsx
// Description: Reusable table row action component with hover-reveal.
//              Shows an Edit button and a three-dot (⋯) menu that opens
//              a dropdown with destructive actions (Delete).
//              Phase 1: Hide destructive Delete behind hover-only ⋯ menu.
// ============================================================================

import { useState, useRef, useEffect } from 'react'
import { IconEdit, IconMoreVertical, IconTrash } from './Icons'

interface RowActionsProps {
  onEdit: () => void
  onDelete?: () => void
  editLabel?: string
}

/**
 * RowActions — hover-revealed action buttons for table rows.
 * Edit is always visible on hover; Delete is inside a ⋯ dropdown menu.
 * The dropdown closes on outside click.
 */
export default function RowActions({ onEdit, onDelete, editLabel = 'Edit' }: RowActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div className="vega-row-actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit() }}
        style={{
          background: 'transparent',
          border: '1px solid var(--panel-border)',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--fg-dim)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          transition: 'color .15s, border-color .15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--fg)'
          e.currentTarget.style.borderColor = 'var(--gold)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--fg-dim)'
          e.currentTarget.style.borderColor = 'var(--panel-border)'
        }}
      >
        <IconEdit size={14} strokeWidth={1.5} />
        {editLabel}
      </button>

      {onDelete && (
        <div className="vega-dropdown" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            style={{
              background: 'transparent',
              border: '1px solid var(--panel-border)',
              borderRadius: 6,
              padding: '6px',
              cursor: 'pointer',
              color: 'var(--fg-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color .15s, border-color .15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--fg)'
              e.currentTarget.style.borderColor = 'var(--panel-border-hot)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--fg-dim)'
              e.currentTarget.style.borderColor = 'var(--panel-border)'
            }}
            aria-label="More actions"
          >
            <IconMoreVertical size={16} strokeWidth={1.5} />
          </button>
          {menuOpen && (
            <div className="vega-dropdown-menu" onClick={(e) => e.stopPropagation()}>
              <button
                className="vega-dropdown-item danger"
                onClick={() => { setMenuOpen(false); onDelete() }}
              >
                <IconTrash size={14} strokeWidth={1.5} />
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}