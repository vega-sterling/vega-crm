'use client'

// ============================================================================
// File: src/app/components/ConfirmDialog.tsx
// Description: Reusable confirmation dialog for delete and other destructive
//              actions. Replaces native window.confirm() with a styled modal
//              that matches the Vega CRM dark theme.
//
// Phase 37: Responsive — centered modal on tablet/desktop (>=768px); on phone
// (<768px) it docks to the bottom as a bottom sheet (full width, top-corner
// radius, drag handle, stacked full-width buttons — destructive on top per
// iOS action-sheet convention). The responsive switch is pure CSS in
// globals.css (.confirm-dialog-overlay / .confirm-dialog-panel), so no JS
// matchMedia is needed. Escape key cancels; backdrop click cancels.
// ============================================================================

import { useEffect } from 'react'
import { panel, typeography, buttons } from '../lib/styles'

interface ConfirmDialogProps {
  open: boolean
  title: string
  itemName?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  onCancel: () => void
  onConfirm: () => void
}

/**
 * ConfirmDialog — modal confirmation for destructive actions.
 *
 * @param open    — whether the dialog is visible
 * @param title   — dialog heading (e.g. "Delete Project?")
 * @param itemName — name of the item being deleted (shown in bold)
 * @param message — optional custom body text
 * @param confirmLabel — confirm button text (default: "Delete")
 * @param cancelLabel  — cancel button text (default: "Cancel")
 * @param onCancel — callback when user cancels
 * @param onConfirm — callback when user confirms
 */
export default function ConfirmDialog({
  open,
  title,
  itemName,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  // Escape key cancels — keyboard users get the same out as a backdrop click.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="confirm-dialog-overlay"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 24,
      }}
    >
      <div
        className="confirm-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...panel.container,
          width: '100%',
          maxWidth: 420,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Drag handle — phone bottom-sheet affordance (hidden on desktop via CSS) */}
        <div className="confirm-dialog-handle" aria-hidden="true" />
        <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>{title}</h2>
        <p style={{ ...typeography.muted, marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
          {message || (itemName ? (
            <>Are you sure you want to delete <strong style={{ color: 'var(--fg)', fontWeight: 700 }}>{itemName}</strong>? This action cannot be undone.</>
          ) : (
            'Are you sure? This action cannot be undone.'
          ))}
        </p>
        <div className="confirm-dialog-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button className="btn-touch" style={buttons.secondary} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn-touch" style={buttons.danger} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}