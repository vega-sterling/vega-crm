'use client'

// ============================================================================
// File: src/app/components/ConfirmDialog.tsx
// Description: Reusable confirmation dialog for delete and other destructive
//              actions. Replaces native window.confirm() with a styled modal
//              that matches the Vega CRM dark theme.
// ============================================================================

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
  if (!open) return null

  return (
    <div
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
        onClick={(e) => e.stopPropagation()}
        style={{
          ...panel.container,
          width: '100%',
          maxWidth: 420,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>{title}</h2>
        <p style={{ ...typeography.muted, marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
          {message || (itemName ? (
            <>Are you sure you want to delete <strong style={{ color: 'var(--fg)', fontWeight: 700 }}>{itemName}</strong>? This action cannot be undone.</>
          ) : (
            'Are you sure? This action cannot be undone.'
          ))}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
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