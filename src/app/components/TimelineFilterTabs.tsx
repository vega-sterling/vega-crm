'use client'

// ============================================================================
// TimelineFilterTabs — Filter tabs above the timeline.
// All, Notes, Calls, Emails, Tasks, Meetings.
// Clicking a tab filters the timeline to that type.
// ============================================================================

export type TimelineFilter = 'ALL' | 'NOTE' | 'CALL' | 'EMAIL' | 'TASK' | 'MEETING'

interface TimelineFilterTabsProps {
  active: TimelineFilter
  onChange: (filter: TimelineFilter) => void
  counts: Record<TimelineFilter, number>
}

const FILTER_LABELS: Record<TimelineFilter, { label: string; icon: string }> = {
  ALL: { label: 'All', icon: '📋' },
  NOTE: { label: 'Notes', icon: '📝' },
  CALL: { label: 'Calls', icon: '📞' },
  EMAIL: { label: 'Emails', icon: '✉️' },
  TASK: { label: 'Tasks', icon: '☑️' },
  MEETING: { label: 'Meetings', icon: '🤝' },
}

const FILTER_ORDER: TimelineFilter[] = ['ALL', 'NOTE', 'CALL', 'EMAIL', 'TASK', 'MEETING']

export default function TimelineFilterTabs({ active, onChange, counts }: TimelineFilterTabsProps) {
  return (
    <div
      className="timeline-filter-tabs"
      style={{
        display: 'flex',
        gap: 4,
        flexWrap: 'wrap',
        borderBottom: '1px solid var(--panel-border)',
        marginBottom: 16,
        paddingBottom: 0,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {FILTER_ORDER.map((filter) => {
        const { label, icon } = FILTER_LABELS[filter]
        const isActive = active === filter
        const count = counts[filter] || 0
        return (
          <button
            key={filter}
            className="btn-touch filter-tab"
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--gold)' : '2px solid transparent',
              color: isActive ? 'var(--fg)' : 'var(--fg-dim)',
              padding: '10px 14px',
              fontWeight: isActive ? 600 : 500,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onClick={() => onChange(filter)}
          >
            <span style={{ fontSize: 14 }}>{icon}</span>
            {label}
            {count > 0 && (
              <span
                style={{
                  backgroundColor: isActive ? 'var(--gold)22' : 'var(--panel-elevated)',
                  color: isActive ? 'var(--gold)' : 'var(--fg-dimmer)',
                  borderRadius: 10,
                  padding: '1px 7px',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}