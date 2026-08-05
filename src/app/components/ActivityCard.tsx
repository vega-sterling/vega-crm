'use client'

// ============================================================================
// ActivityCard — Single activity/note in the timeline.
// Features: expand/collapse long descriptions, @mention highlighting,
// pin/edit/delete action buttons, type icon, timestamp, user name.
// ============================================================================

import { useState, useMemo } from 'react'
import { panel, typeography, statusBadge, buttons } from '../lib/styles'
import type { Activity, User } from '../lib/types'

type ActivityType = Activity['type']

const activityColor: Record<ActivityType, string> = {
  CALL: 'var(--blue)',
  EMAIL: 'var(--emerald)',
  NOTE: 'var(--gold)',
  MEETING: 'var(--violet)',
  TASK: 'var(--cyan)',
}

const activityEmoji: Record<ActivityType, string> = {
  CALL: '📞',
  EMAIL: '✉️',
  NOTE: '📝',
  MEETING: '🤝',
  TASK: '☑️',
}

const TRUNCATE_LIMIT = 200

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Highlight @mentions in text — bold, blue background
function renderWithMentions(text: string, users: User[]): React.ReactNode {
  if (!text) return null
  // Build a regex that matches any @UserName from the users list
  const userNames = users.map(u => u.name).filter(Boolean)
  if (userNames.length === 0) {
    // Generic @word highlighting if no users loaded
    const parts = text.split(/(@\w+)/g)
    return parts.map((part, i) => {
      if (part.startsWith('@') && part.length > 1) {
        return (
          <span key={i} style={{
            fontWeight: 700,
            color: 'var(--blue)',
            backgroundColor: 'rgba(96,165,250,0.15)',
            borderRadius: 4,
            padding: '1px 4px',
          }}>
            {part}
          </span>
        )
      }
      return <span key={i}>{part}</span>
    })
  }
  // Escape regex special chars in names
  const escaped = userNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`@(${escaped.join('|')})`, 'g')
  const parts = text.split(regex)
  return parts.map((part, i) => {
    // Odd indices are capture group matches (user names without @)
    if (i % 2 === 1) {
      return (
        <span key={i} style={{
          fontWeight: 700,
          color: 'var(--blue)',
          backgroundColor: 'rgba(96,165,250,0.15)',
          borderRadius: 4,
          padding: '1px 4px',
        }}>
          @{part}
        </span>
      )
    }
    // Also highlight generic @word that doesn't match a user
    const subParts = part.split(/(@\w+)/g)
    if (subParts.length === 1) return <span key={i}>{part}</span>
    return subParts.map((sub, j) => {
      if (sub.startsWith('@') && sub.length > 1) {
        return (
          <span key={`${i}-${j}`} style={{
            fontWeight: 700,
            color: 'var(--blue)',
            backgroundColor: 'rgba(96,165,250,0.15)',
            borderRadius: 4,
            padding: '1px 4px',
          }}>
            {sub}
          </span>
        )
      }
      return <span key={`${i}-${j}`}>{sub}</span>
    })
  })
}

interface ActivityCardProps {
  activity: Activity
  users?: User[]
  pinned?: boolean
  onPin?: (id: string) => void
  onEdit?: (activity: Activity) => void
  onDelete?: (id: string) => void
  compact?: boolean
}

export default function ActivityCard({
  activity, users = [], pinned = false, onPin, onEdit, onDelete, compact = false,
}: ActivityCardProps) {
  const [expanded, setExpanded] = useState(false)
  const a = activity
  const color = activityColor[a.type] || 'var(--fg-dim)'
  const icon = activityEmoji[a.type] || '📋'
  const desc = a.description || ''
  const shouldTruncate = desc.length > TRUNCATE_LIMIT
  const displayDesc = shouldTruncate && !expanded ? desc.slice(0, TRUNCATE_LIMIT) + '…' : desc

  const mentionNodes = useMemo(() => renderWithMentions(displayDesc, users), [displayDesc, users])

  const cardStyle: React.CSSProperties = {
    ...panel.compact,
    borderLeft: pinned ? '3px solid var(--gold)' : `1px solid var(--panel-border)`,
    backgroundColor: pinned ? 'rgba(201,169,110,0.06)' : 'var(--panel)',
  }

  return (
    <div className="panel-container" style={cardStyle}>
      {/* Header row: icon + type badge + subject */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          backgroundColor: `${color}22`, color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...statusBadge(color), textTransform: 'uppercase', fontSize: 11 }}>
              {a.type}
            </span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{a.subject}</span>
          </div>
          {/* Meta line: user · date · contact */}
          <div style={{ color: 'var(--fg-dim)', fontSize: 12, marginTop: 6 }}>
            {a.user?.name && <span>{a.user.name} · </span>}
            {formatDate(a.createdAt)}
            {a.contact && <span> · {a.contact.firstName} {a.contact.lastName}</span>}
            {a.callDirection && <span> · {a.callDirection}</span>}
            {a.callDuration ? <span> · {a.callDuration}min</span> : null}
          </div>
        </div>
      </div>

      {/* Description with expand/collapse + @mention highlighting */}
      {desc && (
        <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5, color: 'var(--fg)', paddingLeft: 48 }}>
          <p style={{ margin: 0, wordBreak: 'break-word' }}>{mentionNodes}</p>
          {shouldTruncate && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                ...buttons.small,
                marginTop: 6,
                background: 'transparent',
                border: 'none',
                color: 'var(--gold)',
                padding: 0,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 4, marginTop: 8, paddingLeft: 48 }}>
        {onPin && (
          <button
            onClick={() => onPin(a.id)}
            title={pinned ? 'Unpin' : 'Pin to top'}
            style={{
              ...buttons.small,
              background: 'transparent',
              border: 'none',
              padding: '4px 8px',
              color: pinned ? 'var(--gold)' : 'var(--fg-dimmer)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {pinned ? '📌 Pinned' : '📌 Pin'}
          </button>
        )}
        {onEdit && (
          <button
            onClick={() => onEdit(a)}
            title="Edit"
            style={{
              ...buttons.small,
              background: 'transparent',
              border: 'none',
              padding: '4px 8px',
              color: 'var(--fg-dimmer)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            ✏️ Edit
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(a.id)}
            title="Delete"
            style={{
              ...buttons.small,
              background: 'transparent',
              border: 'none',
              padding: '4px 8px',
              color: 'var(--fg-dimmer)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            🗑️ Delete
          </button>
        )}
      </div>
    </div>
  )
}
