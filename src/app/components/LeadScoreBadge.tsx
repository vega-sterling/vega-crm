'use client'

// ============================================================================
// File: src/app/components/LeadScoreBadge.tsx
// Description: Compact lead score badge for contact list pages and contact
//              detail pages. Shows score number + tier color + label.
//              Fetches score on mount via /api/lead-score/calculate.
//              Phase 14: Lead score display on contacts.
// ============================================================================

import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'

interface ScoreData {
  score: number
  tier: string
  breakdown: Array<{ event: string; label: string; points: number }>
}

/** Tier colors and labels */
const TIER_STYLES: Record<string, { color: string; bg: string; border: string; label: string }> = {
  HOT: {
    color: 'var(--rust)',
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.3)',
    label: '🔥',
  },
  WARM: {
    color: 'var(--gold)',
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.3)',
    label: '⚡',
  },
  COLD: {
    color: 'var(--cyan)',
    bg: 'rgba(6,182,212,0.12)',
    border: 'rgba(6,182,212,0.3)',
    label: '❄️',
  },
}

/** Compact badge — for list rows (small) */
export function LeadScoreMini({ contactId }: { contactId: string }) {
  const [data, setData] = useState<ScoreData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    apiFetch<ScoreData>(`/api/lead-score/calculate?contactId=${contactId}`)
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [contactId])

  if (loading) {
    return <span style={{ fontSize: 12, color: 'var(--fg-dimmer)' }}>…</span>
  }
  if (!data) return null

  const style = TIER_STYLES[data.tier] || TIER_STYLES.COLD
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
      backgroundColor: style.bg, color: style.color, border: `1px solid ${style.border}`,
      whiteSpace: 'nowrap',
    }}>
      {style.label} {data.score}
    </span>
  )
}

/** Full badge with tier label — for contact detail pages */
export function LeadScoreBadge({ contactId }: { contactId: string }) {
  const [data, setData] = useState<ScoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiFetch<ScoreData>(`/api/lead-score/calculate?contactId=${contactId}`)
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [contactId])

  if (loading) {
    return (
      <div className="panel-container" style={{
        padding: '16px 20px', borderRadius: 12,
        border: '1px solid var(--panel-border)', backgroundColor: 'var(--bg-soft)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: 'var(--panel-border)' }} />
        <div>
          <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Calculating score…</div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const style = TIER_STYLES[data.tier] || TIER_STYLES.COLD

  return (
    <div className="panel-container" style={{
      padding: '16px 20px', borderRadius: 12,
      border: `1px solid ${style.border}`,
      backgroundColor: style.bg,
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
      >
        {/* Score circle */}
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 800,
          backgroundColor: style.color, color: 'white', flexShrink: 0,
        }}>
          {data.score}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: style.color }}>
            {style.label} {data.tier === 'HOT' ? 'Hot Lead' : data.tier === 'WARM' ? 'Warm Lead' : 'Cold Lead'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>
            Click to {expanded ? 'hide' : 'view'} breakdown
          </div>
        </div>
      </div>

      {/* Breakdown */}
      {expanded && data.breakdown.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${style.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Score Breakdown
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.breakdown.map((b, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 13,
              }}>
                <span style={{ color: 'var(--fg)' }}>{b.label}</span>
                <span style={{ fontWeight: 700, color: b.points > 0 ? 'var(--emerald)' : 'var(--rust)' }}>
                  {b.points > 0 ? '+' : ''}{b.points}
                </span>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              paddingTop: 8, marginTop: 4, borderTop: '1px solid var(--panel-border)',
              fontSize: 14, fontWeight: 700,
            }}>
              <span style={{ color: 'var(--fg)' }}>Total</span>
              <span style={{ color: style.color }}>{data.score}</span>
            </div>
          </div>
        </div>
      )}
      {expanded && data.breakdown.length === 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${style.border}`, fontSize: 13, color: 'var(--fg-dim)' }}>
          No scoring events triggered yet.
        </div>
      )}
    </div>
  )
}