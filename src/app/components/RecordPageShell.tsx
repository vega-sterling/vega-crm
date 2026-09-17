'use client'

// ============================================================================
// RecordPageShell — Reusable HubSpot-style 3-column record page layout.
//
// Used by company, contact (and future) detail pages:
//   LEFT   (.record-left):   properties, custom fields, AI summary, actions
//   MIDDLE (.record-middle):  tabbed content (timeline / contacts / tasks)
//   RIGHT  (.record-right):  association cards
//
// The shell owns: the 3-column grid, the tab bar, error banner, and the
// standardized pinned-note section. Pages keep ALL data logic and pass
// tab content in as nodes.
//
// Responsive behavior lives in globals.css (.record-3col / .record-left /
// .record-middle / .record-right): 3 columns on desktop, left sidebar
// becomes a horizontal 2-column wrapper at the top on tablet, single
// stacked column on phone.
// ============================================================================

import { useState, type ReactNode } from 'react'
import { layout, typeography } from '../lib/styles'
import ActivityCard from './ActivityCard'
import { IconPin } from './Icons'
import type { Activity, User } from '../lib/types'

/** One tab of the middle column. Count (when > 0) renders as "(N)" badge. */
export interface RecordTab {
  id: string
  label: string
  count?: number
  content: ReactNode
}

interface RecordPageShellProps {
  /** Page header (back link, title, header actions). */
  header: ReactNode
  /** Optional error banner text. */
  error?: string | null
  onDismissError?: () => void
  /** Left sidebar content (properties, custom fields, summary, actions). */
  left: ReactNode
  /** Middle column tabs. Tab bar is hidden when only one tab is provided. */
  tabs: RecordTab[]
  /** Controlled active tab id — omit to let the shell manage it. */
  activeTab?: string
  onTabChange?: (id: string) => void
  /** Initial tab when uncontrolled. Defaults to the first tab. */
  defaultTab?: string
  /** Right sidebar content (association cards). */
  right: ReactNode
  /** Content rendered below the grid (confirm dialogs, etc.). */
  footer?: ReactNode
}

export default function RecordPageShell({
  header,
  error,
  onDismissError,
  left,
  tabs,
  activeTab,
  onTabChange,
  defaultTab,
  right,
  footer,
}: RecordPageShellProps) {
  const [internalTab, setInternalTab] = useState(defaultTab ?? tabs[0]?.id ?? '')
  // Controlled when `activeTab` is provided; internal state otherwise.
  const currentTab = activeTab !== undefined ? activeTab : internalTab
  const active = tabs.find((t) => t.id === currentTab) ?? tabs[0]

  const handleTabClick = (id: string) => {
    setInternalTab(id)
    onTabChange?.(id)
  }

  return (
    <div style={layout.page}>
      {header}

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
          <button onClick={onDismissError} style={{ float: 'right', background: 'none', border: 'none', color: 'var(--rust)', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* ═══════════════ 3-Column Layout ═══════════════ */}
      <div className="record-3col" style={{
        display: 'grid',
        gridTemplateColumns: '280px 1fr 320px',
        gap: 20,
        alignItems: 'start',
      }}>
        {/* ════════════════ LEFT SIDEBAR ════════════════ */}
        <div className="record-left" style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 80, minWidth: 0 }}>
          {left}
        </div>

        {/* ════════════════ MIDDLE COLUMN ════════════════ */}
        <div className="record-middle" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Tab Bar — hidden when there is nothing to switch between */}
          {tabs.length > 1 && (
            <div className="tab-bar" style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--panel-border)', overflowX: 'auto' }}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className="btn-touch"
                  onClick={() => handleTabClick(tab.id)}
                  style={{
                    background: 'transparent', border: 'none',
                    borderBottom: currentTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent',
                    color: currentTab === tab.id ? 'var(--fg)' : 'var(--fg-dim)',
                    padding: '10px 16px', fontWeight: 600,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}{tab.count !== undefined && tab.count > 0 ? ` (${tab.count})` : ''}
                </button>
              ))}
            </div>
          )}

          {/* Active tab content — gap-standardized flex column
              (16px, same as the pinned-note section margin) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {active?.content}
          </div>
        </div>

        {/* ════════════════ RIGHT SIDEBAR ════════════════ */}
        <div className="record-right" style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 80, minWidth: 0 }}>
          {right}
        </div>
      </div>

      {footer}
    </div>
  )
}

// ============================================================================
// PinnedNoteSection — standardized pinned note rendering for the top of the
// timeline tab. Margin contract: the parent tab-content column provides the
// 16px gap, so this section adds NO extra bottom margin — consistent across
// company, contact, and deal pages.
// ============================================================================

interface PinnedNoteSectionProps {
  activity: Activity | null
  users: User[]
  onPinToggle: (id: string) => void
  onEditSave?: (activity: Activity, newDescription: string) => void
  onDelete?: (id: string) => void
}

export function PinnedNoteSection({ activity, users, onPinToggle, onEditSave, onDelete }: PinnedNoteSectionProps) {
  if (!activity) return null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <IconPin size={16} strokeWidth={2} style={{ color: 'var(--gold)' }} />
        <span style={{ ...typeography.subtitle, margin: 0, fontSize: 15 }}>Pinned Note</span>
      </div>
      <div style={{ border: '2px solid var(--gold)', borderRadius: 12, overflow: 'hidden' }}>
        <ActivityCard
          activity={activity}
          users={users}
          pinned={true}
          onPin={onPinToggle}
          onEditSave={onEditSave}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}