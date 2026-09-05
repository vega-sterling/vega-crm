'use client'

// ============================================================================
// File: src/app/components/Toast.tsx
// Description: Lightweight toast notification system for Vega CRM.
//              Phase 36: replaces the last native alert() calls with styled,
//              auto-dismissing toasts. React context + fixed viewport stack,
//              themed via CSS variables (dark default, light works).
//
//              - showToast(message, { type, durationMs })
//              - auto-dismiss 4s (default), click to dismiss
//              - max 4 visible (oldest dropped)
//              - role="status" aria-live="polite" for a11y
//              - slide-up entrance (.toast-enter keyframes in globals.css)
//              - zIndex 300; bottom-right on desktop, full-width
//                bottom-anchored 16px insets on phone
// ============================================================================

import { createContext, useCallback, useContext, useRef, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastOptions {
  type?: ToastType
  durationMs?: number
}

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, opts?: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

const MAX_VISIBLE = 4
const DEFAULT_DURATION_MS = 4000

const ACCENT_BY_TYPE: Record<ToastType, string> = {
  error: '#e5484d',
  success: '#30a46c',
  info: 'var(--gold)',
}

/** useToast — returns { showToast(message, opts?) } from the nearest ToastProvider. */
export function useToast(): ToastContextValue['showToast'] {
  const { showToast } = useContext(ToastContext)
  return showToast
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const showToast = useCallback((message: string, opts?: ToastOptions) => {
    const id = ++idRef.current
    const type = opts?.type ?? 'info'
    const durationMs = opts?.durationMs ?? DEFAULT_DURATION_MS
    setToasts((prev) => {
      const next = [...prev, { id, message, type }]
      // Cap visible toasts — drop the oldest beyond MAX_VISIBLE
      return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next
    })
    const timer = setTimeout(() => dismiss(id), durationMs)
    timersRef.current.set(id, timer)
  }, [dismiss])

  const contextValue = { showToast }

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* ── Fixed toast viewport (bottom-right desktop / bottom full-width phone) ── */}
      <div
        className="toast-viewport"
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          zIndex: 300,
          // Phone: full-width, bottom-anchored 16px insets
          maxWidth: 'min(400px, calc(100vw - 32px))',
          width: 'calc(100vw - 32px)',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="toast-enter"
            role="status"
            aria-live="polite"
            onClick={() => dismiss(toast.id)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              backgroundColor: 'var(--panel-elevated)',
              border: `1px solid var(--panel-border)`,
              borderLeft: `4px solid ${ACCENT_BY_TYPE[toast.type]}`,
              borderRadius: 10,
              boxShadow: 'var(--shadow-lg)',
              padding: '12px 16px',
              minHeight: 44,
              cursor: 'pointer',
              pointerEvents: 'auto',
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--fg)',
              fontFamily: 'inherit',
            }}
          >
            {/* Accent icon — label + color, never color alone */}
            <span
              aria-hidden
              style={{
                fontSize: 15,
                lineHeight: 1.5,
                color: ACCENT_BY_TYPE[toast.type],
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {toast.type === 'error' ? '✕' : toast.type === 'success' ? '✓' : '•'}
            </span>
            <span style={{ color: 'var(--fg)' }}>{toast.message}</span>
            {/* Explicit dismiss affordance — 44px+ touch target */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                dismiss(toast.id)
              }}
              aria-label="Dismiss notification"
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                color: 'var(--fg-dim)',
                fontSize: 16,
                lineHeight: 1,
                padding: 0,
                // 44px touch target via padding around the glyph
                minWidth: 44,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                margin: '-12px -16px -12px -4px',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}