'use client'

// ============================================================================
// File: src/app/components/SummaryCard.tsx
// Description: AI-powered record summary card — HubSpot "Summarize a record"
//              pattern. Renders in the left sidebar of contact/company detail
//              pages. One click generates an executive brief with engagement
//              stats, health score, and recommended next steps.
//
//              Deterministic intelligence engine (no external LLM) — privacy
//              safe, works offline, instant.
//
//              Phase 18: AI-Powered Contact Summaries (Priority 6)
// ============================================================================

import { useState, useCallback } from 'react'
import { IconSparkles } from './Icons'
import { apiFetch } from '../lib/api'
import { panel, typeography, buttons } from '../lib/styles'

// ── Types ────────────────────────────────────────────────────────────────────
interface SummaryResponse {
  brief: string[]
  nextSteps: string[]
  health: { score: number; label: string; color: string }
  stats: {
    // Common
    totalActivities: number
    calls: number
    emails: number
    notes: number
    meetings: number
    openTasks?: number
    overdueTasks?: number
    completedTasks?: number
    outboundEmails?: number
    inboundEmails?: number
    replyRate?: number | null
    lastActivityDays: number | null
    lastActivityType: string | null
    trend: 'up' | 'down' | 'flat'
    // Contact/Company
    openDeals?: number
    wonDeals?: number
    lostDeals?: number
    totalDealValue?: number
    wonValue?: number
    activeContacts?: number
    // Deal-specific
    dealValue?: number
    weightedValue?: number
    probability?: number
    stageProgress?: number
    currentStageName?: string | null
    nextStageName?: string | null
    daysInStage?: number
    closeDateStatus?: 'on_track' | 'approaching' | 'overdue' | 'no_date'
    daysToClose?: number | null
  }
  generatedAt: string
}

interface SummaryCardProps {
  /** API endpoint to fetch the summary from, e.g. `/api/contacts/${id}/summary` */
  endpoint: string
  /** Entity label for the header, e.g. "Contact", "Company", or "Deal" */
  entityType: 'Contact' | 'Company' | 'Deal'
}

// ── Trend icon ───────────────────────────────────────────────────────────────
function TrendBadge({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  const config = {
    up: { color: 'var(--emerald)', label: '↑ Trending up' },
    down: { color: 'var(--rust)', label: '↓ Trending down' },
    flat: { color: 'var(--fg-dim)', label: '→ Steady' },
  }
  const c = config[trend]
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      color: c.color,
      backgroundColor: `${c.color === 'var(--fg-dim)' ? 'var(--bg)' : c.color}11`,
      padding: '2px 8px',
      borderRadius: 6,
      whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  )
}

// ── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: '8px 10px',
      backgroundColor: 'var(--bg)',
      borderRadius: 8,
      border: '1px solid var(--panel-border)',
    }}>
      <span style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ fontSize: 15, fontWeight: 600, color: color || 'var(--fg)' }}>
        {value}
      </span>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function SummaryCard({ endpoint, entityType }: SummaryCardProps) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(true)

  const generate = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<SummaryResponse>(endpoint)
      setSummary(data)
      setExpanded(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary')
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  const regenerate = () => {
    setSummary(null)
    generate()
  }

  // ── Collapsed state: just the button ──
  if (!summary && !loading && !error) {
    return (
      <div className="panel-container" style={{ ...panel.container, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <IconSparkles size={18} />
          <h2 style={{ ...typeography.subtitle, margin: 0, fontSize: 15 }}>AI Summary</h2>
        </div>
        <p style={{ ...typeography.small, marginBottom: 12 }}>
          Generate an executive brief with engagement stats, health score, and recommended next steps.
        </p>
        <button
          className="btn-touch"
          style={{ ...buttons.secondary, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onClick={generate}
        >
          <IconSparkles size={16} />
          Summarize {entityType}
        </button>
      </div>
    )
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="panel-container" style={{ ...panel.container, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <IconSparkles size={18} />
          <h2 style={{ ...typeography.subtitle, margin: 0, fontSize: 15 }}>AI Summary</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: 12,
                borderRadius: 6,
                background: 'linear-gradient(90deg, var(--bg) 25%, var(--panel-border) 50%, var(--bg) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite',
                width: `${90 - i * 15}%`,
              }}
            />
          ))}
        </div>
        <p style={{ ...typeography.small, marginTop: 12, color: 'var(--fg-dim)' }}>Analyzing relationship data…</p>
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>
    )
  }

  // ── Error state ──
  if (error && !summary) {
    return (
      <div className="panel-container" style={{ ...panel.container, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <IconSparkles size={18} />
          <h2 style={{ ...typeography.subtitle, margin: 0, fontSize: 15 }}>AI Summary</h2>
        </div>
        <p style={{ color: 'var(--rust)', fontSize: 13, marginBottom: 12 }}>{error}</p>
        <button className="btn-touch" style={{ ...buttons.secondary, width: '100%' }} onClick={generate}>
          Try Again
        </button>
      </div>
    )
  }

  // ── Loaded state ──
  const s = summary!
  const fmt = (n: number) =>
    n > 0 ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '—'

  return (
    <div className="panel-container" style={{ ...panel.container, padding: 16 }}>
      {/* Header */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconSparkles size={18} />
          <h2 style={{ ...typeography.subtitle, margin: 0, fontSize: 15 }}>AI Summary</h2>
        </div>
        <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <>
          {/* Health score + trend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 8,
              backgroundColor: `${s.health.color}15`,
              border: `1px solid ${s.health.color}40`,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                backgroundColor: s.health.color,
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: s.health.color }}>
                {s.health.label} · {s.health.score}/100
              </span>
            </div>
            <TrendBadge trend={s.stats.trend} />
          </div>

          {/* Health bar */}
          <div style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: 'var(--bg)',
            overflow: 'hidden',
            marginBottom: 16,
          }}>
            <div style={{
              width: `${s.health.score}%`,
              height: '100%',
              backgroundColor: s.health.color,
              borderRadius: 2,
              transition: 'width .4s ease',
            }} />
          </div>

          {/* Brief paragraphs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {s.brief.map((para, i) => (
              <p key={i} style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--fg)', margin: 0 }}>
                {para}
              </p>
            ))}
          </div>

          {/* Stat grid — entity-specific */}
          {entityType === 'Deal' ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              marginBottom: 16,
            }}>
              <StatPill label="Activities" value={s.stats.totalActivities} />
              <StatPill label="Calls" value={s.stats.calls} />
              <StatPill label="Emails" value={s.stats.emails} />
              <StatPill label="Meetings" value={s.stats.meetings} />
              <StatPill label="Open Tasks" value={s.stats.openTasks ?? 0} color={s.stats.openTasks ? 'var(--gold)' : undefined} />
              <StatPill label="Overdue" value={s.stats.overdueTasks ?? 0} color={s.stats.overdueTasks ? 'var(--rust)' : undefined} />
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              marginBottom: 16,
            }}>
              <StatPill label="Activities" value={s.stats.totalActivities} />
              <StatPill label="Calls" value={s.stats.calls} />
              <StatPill label="Emails" value={s.stats.emails} />
              <StatPill label="Meetings" value={s.stats.meetings} />
              <StatPill label="Open Deals" value={s.stats.openDeals ?? 0} color={(s.stats.openDeals ?? 0) > 0 ? 'var(--blue)' : undefined} />
              <StatPill label="Won Deals" value={s.stats.wonDeals ?? 0} color={(s.stats.wonDeals ?? 0) > 0 ? 'var(--emerald)' : undefined} />
            </div>
          )}

          {/* Deal-specific metrics */}
          {entityType === 'Deal' && s.stats.stageProgress !== undefined && (
            <div style={{ marginBottom: 16 }}>
              {/* Stage progress bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                  Stage Progress
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>
                  {s.stats.stageProgress}%
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, backgroundColor: 'var(--bg)', overflow: 'hidden', marginBottom: 8 }}>
                <div style={{
                  width: `${s.stats.stageProgress}%`,
                  height: '100%',
                  backgroundColor: 'var(--gold)',
                  borderRadius: 3,
                  transition: 'width .4s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fg-dim)' }}>
                <span>{s.stats.currentStageName || '—'}</span>
                <span>{s.stats.nextStageName ? `Next: ${s.stats.nextStageName}` : 'Final stage'}</span>
              </div>

              {/* Deal value + weighted */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 10px',
                backgroundColor: 'var(--bg)',
                borderRadius: 8,
                border: '1px solid var(--panel-border)',
                marginTop: 8,
              }}>
                <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Weighted Value</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--blue)' }}>{fmt(s.stats.weightedValue || 0)}</span>
              </div>

              {/* Close date status */}
              {s.stats.closeDateStatus && s.stats.closeDateStatus !== 'no_date' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 8,
                  marginTop: 8,
                  backgroundColor:
                    s.stats.closeDateStatus === 'overdue' ? 'rgba(184,80,74,0.1)' :
                    s.stats.closeDateStatus === 'approaching' ? 'rgba(196,146,74,0.1)' :
                    'rgba(90,138,90,0.1)',
                  border: `1px solid ${
                    s.stats.closeDateStatus === 'overdue' ? 'rgba(184,80,74,0.3)' :
                    s.stats.closeDateStatus === 'approaching' ? 'rgba(196,146,74,0.3)' :
                    'rgba(90,138,90,0.3)'
                  }`,
                }}>
                  <span style={{ fontSize: 12 }}>
                    {s.stats.closeDateStatus === 'overdue' ? '⚠️' : s.stats.closeDateStatus === 'approaching' ? '⏰' : '✓'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
                    {s.stats.closeDateStatus === 'overdue' ? `Past due by ${Math.abs(s.stats.daysToClose || 0)} days` :
                     s.stats.closeDateStatus === 'approaching' ? `Closing in ${s.stats.daysToClose} days` :
                     'On track for close date'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Deal value (contact/company — if any) */}
          {entityType !== 'Deal' && (s.stats.totalDealValue ?? 0) > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 10px',
              backgroundColor: 'var(--bg)',
              borderRadius: 8,
              border: '1px solid var(--panel-border)',
              marginBottom: 16,
            }}>
              <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Open Pipeline</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)' }}>{fmt(s.stats.totalDealValue || 0)}</span>
            </div>
          )}

          {/* Recommended next steps */}
          <div style={{
            padding: 12,
            backgroundColor: 'rgba(184,146,74,0.06)',
            border: '1px solid rgba(184,146,74,0.2)',
            borderRadius: 8,
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <IconSparkles size={14} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Recommended Next Steps
              </span>
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {s.nextSteps.map((step, i) => (
                <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--fg)' }}>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Footer: timestamp + regenerate */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dimmer)' }}>
              Generated {new Date(s.generatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              className="btn-touch"
              style={{ ...buttons.small, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={(e) => { e.stopPropagation(); regenerate() }}
            >
              ↻ Refresh
            </button>
          </div>
        </>
      )}
    </div>
  )
}