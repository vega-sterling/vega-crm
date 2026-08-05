'use client'

// ============================================================================
// AssociationCards — Collapsible cards for the right sidebar.
// Shows associated contacts, deals, tasks, company link.
// Each card: header with count badge + collapsible body.
// ============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { panel, typeography, statusBadge } from '../lib/styles'
import type { Contact, Deal, Task, Company } from '../lib/types'

const formatDate = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'var(--rust)',
  HIGH: 'var(--gold)',
  MEDIUM: 'var(--blue)',
  LOW: 'var(--fg-dim)',
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'var(--fg-dim)',
  IN_PROGRESS: 'var(--blue)',
  COMPLETED: 'var(--emerald)',
  CANCELLED: 'var(--rust)',
}

// ── Collapsible card wrapper ──
function CollapsibleCard({ title, count, children, defaultOpen = true }: {
  title: string
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      ...panel.compact,
      padding: 0,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          color: 'var(--fg)',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--fg-dimmer)', transition: 'transform 0.15s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            ▶
          </span>
          {title}
          {count !== undefined && count > 0 && (
            <span style={{
              backgroundColor: 'var(--panel-elevated)',
              color: 'var(--fg-dim)',
              borderRadius: 10,
              padding: '1px 7px',
              fontSize: 11,
              fontWeight: 600,
            }}>
              {count}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 12px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Contacts Card (for company page) ──
export function ContactsCard({ contacts, companyId }: { contacts: Contact[]; companyId: string }) {
  const top = contacts.slice(0, 5)
  return (
    <CollapsibleCard title="Contacts" count={contacts.length}>
      {top.length === 0 ? (
        <p style={{ ...typeography.muted, fontSize: 13 }}>No contacts yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {top.map((c) => (
            <Link
              key={c.id}
              href={`/contacts/${c.id}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '8px 10px',
                borderRadius: 8,
                textDecoration: 'none',
                color: 'var(--fg)',
                border: '1px solid var(--panel-border)',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.background = 'var(--bg-soft)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--panel-border)'; e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>{c.firstName} {c.lastName}</span>
              <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{c.title || c.email || '—'}</span>
            </Link>
          ))}
          {contacts.length > 5 && (
            <Link
              href={`/contacts?companyId=${companyId}`}
              style={{ fontSize: 12, color: 'var(--gold)', padding: '4px 10px', fontWeight: 500 }}
            >
              View all ({contacts.length}) →
            </Link>
          )}
        </div>
      )}
    </CollapsibleCard>
  )
}

// ── Deals Card ──
export function DealsCard({ deals }: { deals: Deal[] }) {
  const openDeals = deals.filter(d => d.status === 'OPEN')
  return (
    <CollapsibleCard title="Deals" count={openDeals.length}>
      {openDeals.length === 0 ? (
        <p style={{ ...typeography.muted, fontSize: 13 }}>No open deals.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {openDeals.slice(0, 5).map((d) => (
            <Link
              key={d.id}
              href={`/deals/${d.id}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '8px 10px',
                borderRadius: 8,
                textDecoration: 'none',
                color: 'var(--fg)',
                border: '1px solid var(--panel-border)',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.background = 'var(--bg-soft)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--panel-border)'; e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ ...statusBadge('var(--gold)'), fontSize: 11 }}>
                  ${d.value?.toLocaleString()}
                </span>
                {d.stage && (
                  <span style={{ ...statusBadge(d.stage.color || 'var(--blue)'), fontSize: 11 }}>
                    {d.stage.name}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </CollapsibleCard>
  )
}

// ── Tasks Card ──
export function TasksCard({ tasks }: { tasks: Task[] }) {
  const openTasks = tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
  return (
    <CollapsibleCard title="Open Tasks" count={openTasks.length}>
      {openTasks.length === 0 ? (
        <p style={{ ...typeography.muted, fontSize: 13 }}>No open tasks.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {openTasks.slice(0, 5).map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--panel-border)',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ ...statusBadge(PRIORITY_COLORS[t.priority] || 'var(--fg-dim)'), fontSize: 11 }}>
                  {t.priority}
                </span>
                <span style={{ ...statusBadge(STATUS_COLORS[t.status] || 'var(--fg-dim)'), fontSize: 11 }}>
                  {t.status.replace('_', ' ')}
                </span>
                <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                  Due {formatDate(t.dueDate)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  )
}

// ── Company Card (for contact page) ──
export function CompanyCard({ company }: { company?: { id: string; name: string } | null }) {
  return (
    <CollapsibleCard title="Company" count={company ? 1 : undefined}>
      {company ? (
        <Link
          href={`/companies/${company.id}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 8,
            textDecoration: 'none',
            color: 'var(--fg)',
            border: '1px solid var(--panel-border)',
            fontWeight: 600,
            fontSize: 14,
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.background = 'var(--bg-soft)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--panel-border)'; e.currentTarget.style.background = 'transparent' }}
        >
          🏢 {company.name}
        </Link>
      ) : (
        <p style={{ ...typeography.muted, fontSize: 13 }}>No company linked.</p>
      )}
    </CollapsibleCard>
  )
}
