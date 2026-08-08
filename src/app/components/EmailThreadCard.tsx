'use client'

// ============================================================================
// EmailThreadCard — HubSpot-style email thread view for contact/company timelines.
// Groups emails by threadId, shows collapsed summary with expand to see all
// messages in the thread, plus inline reply composer.
// ============================================================================

import { useState, KeyboardEvent } from 'react'
import { panel, forms, buttons, statusBadge } from '../lib/styles'
import { apiFetch } from '../lib/api'
import type { EmailMessage } from '../lib/types'

interface EmailThreadCardProps {
  emails: EmailMessage[]
  onReplied?: () => void
  contactId?: string
  companyId?: string
  tenantId?: string
  toEmail?: string
}

const ICON_CIRCLE: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  fontSize: 16,
  backgroundColor: 'rgba(90,138,90,0.15)',
}

const UNREAD_DOT: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  backgroundColor: 'var(--blue)',
  display: 'inline-block',
  flexShrink: 0,
}

const SUBJECT_LINE: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  color: 'var(--fg)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const META_LINE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--fg-dim)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const EMAIL_ITEM: React.CSSProperties = {
  borderBottom: '1px solid var(--panel-border)',
  padding: '12px 0',
}

const EMAIL_BODY: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--fg)',
  margin: '8px 0 0 0',
}

function isOutbound(e: EmailMessage): boolean {
  return (e.direction || '').toUpperCase() === 'OUTBOUND'
}

function hasUnreadInbound(emails: EmailMessage[]): boolean {
  return emails.some((e) => !e.isRead && !isOutbound(e))
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  try {
    return new Date(d).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/** Extract plain-text body from an EmailMessage (prefers bodyText, falls back to bodyHtml stripped of tags). */
function getBody(e: EmailMessage): string {
  if (e.bodyText) return e.bodyText
  if (e.bodyHtml) {
    // Simple HTML-to-text: strip tags, decode common entities
    return e.bodyHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  }
  return ''
}

function emailsTo(toEmails?: string[]): string {
  if (!toEmails || toEmails.length === 0) return '—'
  return toEmails.join(', ')
}

export default function EmailThreadCard({
  emails,
  onReplied,
  contactId,
  companyId,
  tenantId,
  toEmail,
}: EmailThreadCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!emails || emails.length === 0) return null

  // Sort newest first for display logic
  const byNewest = [...emails].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  // Oldest first for expanded thread display
  const byOldest = [...emails].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  const latest = byNewest[0]!
  const count = emails.length
  const unread = hasUnreadInbound(emails)

  // Determine reply recipient: most recent inbound sender, fall back to toEmail prop
  const lastInbound = byNewest.find((e) => !isOutbound(e))
  const replyTo: string =
    (lastInbound && lastInbound.fromEmail) || toEmail || (latest && latest.fromEmail) || ''

  const replySubject =
    latest.subject && /^re:\s/i.test(latest.subject)
      ? latest.subject
      : `Re: ${latest.subject || ''}`

  async function sendReply() {
    const body = replyText.trim()
    if (!body || sending) return
    setError(null)
    setSending(true)
    try {
      await apiFetch('/api/email/send', {
        method: 'POST',
        body: JSON.stringify({
          tenantId,
          to: [replyTo],
          subject: replySubject,
          body,
          contactId,
          companyId,
        }),
      })
      setReplyText('')
      setExpanded(false)
      if (onReplied) onReplied()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reply'
      setError(msg)
    } finally {
      setSending(false)
    }
  }

  function handleReplyKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void sendReply()
    }
  }

  return (
    <div
      className="email-thread-card panel-container"
      style={{
        ...panel.compact,
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-reply-zone]')) return
        setExpanded((v) => !v)
      }}
    >
      {/* ── Collapsed header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', userSelect: 'none' }}>
        <div style={ICON_CIRCLE} aria-hidden>
          ✉️
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={statusBadge('var(--emerald)')}>EMAIL</span>
            <span style={SUBJECT_LINE}>{latest.subject || '(no subject)'}</span>
          </div>
          <div style={{ ...META_LINE, marginTop: 4 }}>
            {count > 1
              ? `${count} messages · ${fmtDate(latest.createdAt)}`
              : `1 message · ${fmtDate(latest.createdAt)}`}
          </div>
        </div>
        {unread && <span style={UNREAD_DOT} title="Unread" aria-label="Unread" />}
        <span style={{ color: 'var(--fg-dim)', fontSize: 12, flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* ── Expanded thread ── */}
      {expanded && (
        <div style={{ marginTop: 12, cursor: 'default' }} data-reply-zone="1">
          {byOldest.map((email) => {
            const outbound = isOutbound(email)
            const dirIcon = outbound ? '↗' : '↘'
            const dirColor = outbound ? 'var(--gold)' : 'var(--emerald)'
            return (
              <div key={email.id} style={EMAIL_ITEM}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    style={{ fontSize: 16, color: dirColor, fontWeight: 700, width: 20, textAlign: 'center', flexShrink: 0 }}
                    aria-hidden
                  >
                    {dirIcon}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--fg)' }}>
                    <strong>From:</strong> {email.fromEmail}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
                    → {emailsTo(email.toEmails)}
                  </span>
                  {!email.isRead && !outbound && (
                    <span style={UNREAD_DOT} title="Unread" aria-label="Unread" />
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
                    {fmtDate(email.sentAt || email.createdAt)}
                  </span>
                </div>
                {email.ccEmails && email.ccEmails.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 4 }}>
                    Cc: {email.ccEmails.join(', ')}
                  </div>
                )}
                <div style={EMAIL_BODY}>{getBody(email)}</div>
              </div>
            )
          })}

          {/* ── Reply composer ── */}
          <div style={{ marginTop: 12 }}>
            <textarea
              className="email-thread-reply form-textarea"
              style={{ ...forms.textarea, minHeight: 80 }}
              placeholder="Type a reply…  (Ctrl/Cmd + Enter to send)"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={handleReplyKey}
              disabled={sending}
              rows={4}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-touch"
                style={buttons.primary}
                onClick={(e) => { e.stopPropagation(); void sendReply() }}
                disabled={sending || !replyText.trim()}
              >
                {sending ? 'Sending…' : 'Reply'}
              </button>
              <button
                type="button"
                className="btn-touch"
                style={buttons.secondary}
                onClick={(e) => { e.stopPropagation(); setReplyText(''); setError(null) }}
                disabled={sending}
              >
                Clear
              </button>
            </div>
            {error && (
              <div style={{ color: 'var(--rust)', fontSize: 12, marginTop: 8 }}>
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}