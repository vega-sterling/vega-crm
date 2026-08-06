'use client'

// ============================================================================
// File: src/app/components/RecentlyViewed.tsx
// Description: Recently viewed records tracking + display components.
//
//              Three parts:
//              1. RecentlyViewedTracker — invisible component in AppShell
//                 that watches pathname changes and records visits to detail
//                 pages (companies, contacts, deals, projects) in localStorage.
//              2. RecentlyViewedDropdown — header button + dropdown showing
//                 the last 8 visited records. Click to navigate.
//              3. RecentlyViewedSidebar — compact list in the sidebar bottom
//                 showing the last 5 visited records (desktop/tablet only).
//
//              Uses a custom-event store pattern so all components stay in
//              sync without prop drilling or context.
//
//              Responsive: dropdown works on all sizes, sidebar hidden on
//              phone. Items have 44px+ touch targets on mobile.
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { apiFetch } from '../lib/api'
import {
  IconClock, IconBuilding, IconUsers, IconDiamond,
  IconClipboard, IconChevronRight,
} from './Icons'

const STORAGE_KEY = 'vega-crm-recently-viewed'
const MAX_ITEMS = 8
const SIDEBAR_MAX = 5
const RECENT_EVENT = 'vega-recently-viewed-change'

export interface RecentItem {
  type: 'company' | 'contact' | 'deal' | 'project'
  id: string
  label: string
  href: string
  timestamp: number
}

// ── Store helpers (localStorage + custom event for cross-component sync) ──

function readRecent(): RecentItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function writeRecent(items: RecentItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    window.dispatchEvent(new CustomEvent(RECENT_EVENT))
  } catch { /* localStorage unavailable */ }
}

function addRecent(item: Omit<RecentItem, 'timestamp'>) {
  const current = readRecent()
  const filtered = current.filter(i => !(i.type === item.type && i.id === item.id))
  const updated = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, MAX_ITEMS)
  writeRecent(updated)
}

export function removeRecent(type: string, id: string) {
  const current = readRecent()
  const updated = current.filter(i => !(i.type === type && i.id === id))
  writeRecent(updated)
}

export function clearRecent() {
  writeRecent([])
}

// ── Hook: useRecentlyViewed ──
// Returns the current list, re-reading whenever the store changes.
export function useRecentlyViewed() {
  const [items, setItems] = useState<RecentItem[]>([])

  useEffect(() => {
    setItems(readRecent())
    const handler = () => setItems(readRecent())
    window.addEventListener(RECENT_EVENT, handler)
    // Also re-read on storage events (other tabs)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(RECENT_EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])

  return items
}

// ── Detail page patterns for the tracker ──
const DETAIL_PATTERNS = [
  { pattern: '/companies/', apiPath: '/api/companies/', type: 'company' as const, nameField: 'name' },
  { pattern: '/contacts/', apiPath: '/api/contacts/', type: 'contact' as const, nameField: 'contactName' },
  { pattern: '/deals/', apiPath: '/api/deals/', type: 'deal' as const, nameField: 'title' },
  { pattern: '/projects/', apiPath: '/api/projects/', type: 'project' as const, nameField: 'name' },
] as const

// ── 1. RecentlyViewedTracker (invisible) ──
// Watches pathname and records visits to detail pages.
export function RecentlyViewedTracker() {
  const pathname = usePathname()

  useEffect(() => {
    const match = DETAIL_PATTERNS.find(
      d => pathname.startsWith(d.pattern) && pathname.split(d.pattern)[1]?.length > 0
    )
    if (!match) return

    const id = pathname.split(match.pattern)[1]?.split('/')[0]
    if (!id) return

    // Fetch the record to get its display name
    apiFetch<Record<string, any>>(`${match.apiPath}${id}`)
      .then(record => {
        let label = ''
        if (match.nameField === 'contactName') {
          label = `${record.firstName || ''} ${record.lastName || ''}`.trim()
        } else {
          label = record[match.nameField] || 'Unknown'
        }
        if (!label) return
        addRecent({
          type: match.type,
          id,
          label,
          href: `${match.pattern}${id}`,
        })
      })
      .catch(() => { /* ignore — record may not be accessible */ })
  }, [pathname])

  return null
}

// ── Icon helper ──
function getRecentIcon(type: RecentItem['type']) {
  switch (type) {
    case 'company': return IconBuilding
    case 'contact': return IconUsers
    case 'deal': return IconDiamond
    case 'project': return IconClipboard
    default: return IconClock
  }
}

// ── Relative time formatter ──
function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── 2. RecentlyViewedDropdown (header) ──
// A button with a clock icon that opens a dropdown panel showing recent items.
export function RecentlyViewedDropdown() {
  const items = useRecentlyViewed()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (items.length === 0) return null

  return (
    <div className="recent-dropdown-wrapper" ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        className="btn-touch"
        onClick={() => setOpen(!open)}
        aria-label="Recently viewed records"
        style={{
          background: 'transparent',
          border: '1px solid var(--panel-border)',
          borderRadius: 8,
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--fg-dim)',
          cursor: 'pointer',
          transition: 'border-color .2s, color .2s',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--panel-border-hot)'
          e.currentTarget.style.color = 'var(--fg)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--panel-border)'
          e.currentTarget.style.color = 'var(--fg-dim)'
        }}
      >
        <IconClock size={18} />
        <span className="recent-btn-label" style={{ fontSize: 13, fontWeight: 500 }}>
          Recent
        </span>
      </button>

      {open && (
        <div
          className="recent-dropdown-menu vega-dropdown-menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            backgroundColor: 'var(--panel)',
            border: '1px solid var(--panel-border)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-lg)',
            minWidth: 280,
            maxWidth: 340,
            padding: 6,
            zIndex: 50,
          }}
        >
          {/* Header row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 10px',
            borderBottom: '1px solid var(--panel-border)',
            marginBottom: 4,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-dim)' }}>
              Recently Viewed
            </span>
            <button
              onClick={() => { clearRecent(); setOpen(false) }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--fg-dimmer)',
                fontSize: 12,
                cursor: 'pointer',
                padding: 2,
              }}
              aria-label="Clear recently viewed"
            >
              Clear
            </button>
          </div>

          {/* Items */}
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {items.map((item) => {
              const Icon = getRecentIcon(item.type)
              return (
                <Link
                  key={`${item.type}-${item.id}`}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="vega-dropdown-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '10px 10px',
                    borderRadius: 8,
                    textDecoration: 'none',
                    color: 'var(--fg)',
                    transition: 'background .15s',
                    minHeight: 44,
                  }}
                >
                  <Icon size={18} strokeWidth={1.5} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--fg-dimmer)' }}>
                      {item.type} · {relativeTime(item.timestamp)}
                    </div>
                  </div>
                  <IconChevronRight size={14} style={{ color: 'var(--fg-dimmer)', flexShrink: 0 }} />
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 3. RecentlyViewedSidebar (sidebar bottom) ──
// Compact list of recent items in the sidebar. Desktop/tablet only.
export function RecentlyViewedSidebar() {
  const items = useRecentlyViewed()
  const sidebarItems = items.slice(0, SIDEBAR_MAX)

  if (sidebarItems.length === 0) return null

  return (
    <div
      className="recent-sidebar"
      style={{
        borderTop: '1px solid var(--panel-border)',
        paddingTop: 16,
        marginTop: 8,
        flexShrink: 0,
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 8px 8px',
      }}>
        <IconClock size={14} style={{ color: 'var(--fg-dim)' }} />
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: 'var(--fg-dim)',
        }}>
          Recently Viewed
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sidebarItems.map((item) => {
          const Icon = getRecentIcon(item.type)
          return (
            <Link
              key={`${item.type}-${item.id}`}
              href={item.href}
              className="vega-nav-link recent-sidebar-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 8px',
                borderRadius: 8,
                textDecoration: 'none',
                color: 'var(--fg-dim)',
                fontSize: 13,
                fontWeight: 500,
                transition: 'background .2s, color .2s',
                minHeight: 36,
              }}
            >
              <Icon size={15} strokeWidth={1.5} style={{ flexShrink: 0, opacity: 0.7 }} />
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}