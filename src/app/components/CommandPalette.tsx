'use client'

// ============================================================================
// File: src/app/components/CommandPalette.tsx
// Description: Command Palette (Cmd+K) — keyboard-first interface combining
//              navigation, search, and quick actions into a single modal-like
//              overlay. Opens via Cmd/Ctrl+K or header ⌘K button.
//              Phase 28: Command Palette (Cmd+K) Responsive.
// ============================================================================

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '../lib/api'

// ── Types ──────────────────────────────────────────────────────────────────

interface BaseCommand {
  id: string
  label: string
  href: string
  icon: string
  group: string
  sublabel?: string
}

interface SearchResult {
  id: string
  label: string
  sublabel?: string
  href: string
}

interface SearchResponse {
  companies: SearchResult[]
  contacts: SearchResult[]
  deals: SearchResult[]
  tasks: SearchResult[]
  counts?: { total: number }
}

// ── Static command lists ────────────────────────────────────────────────────

const navCommands: BaseCommand[] = [
  { id: 'nav-dashboard', label: 'Go to Dashboard', href: '/dashboard', icon: '📊', group: 'Navigation' },
  { id: 'nav-reports', label: 'Go to Reports', href: '/reports', icon: '📈', group: 'Navigation' },
  { id: 'nav-companies', label: 'Go to Companies', href: '/companies', icon: '🏢', group: 'Navigation' },
  { id: 'nav-contacts', label: 'Go to Contacts', href: '/contacts', icon: '👤', group: 'Navigation' },
  { id: 'nav-activities', label: 'Go to Activities', href: '/activities', icon: '📋', group: 'Navigation' },
  { id: 'nav-tasks', label: 'Go to Tasks', href: '/tasks', icon: '☑️', group: 'Navigation' },
  { id: 'nav-deals', label: 'Go to Deals', href: '/deals', icon: '💠', group: 'Navigation' },
  { id: 'nav-quotes', label: 'Go to Quotes', href: '/quotes', icon: '📄', group: 'Navigation' },
  { id: 'nav-inbox', label: 'Go to Inbox', href: '/inbox', icon: '📨', group: 'Navigation' },
  { id: 'nav-calendar', label: 'Go to Calendar', href: '/calendar', icon: '📅', group: 'Navigation' },
  { id: 'nav-projects', label: 'Go to Projects', href: '/projects', icon: '🗂️', group: 'Navigation' },
  { id: 'nav-campaigns', label: 'Go to Campaigns', href: '/campaigns', icon: '📣', group: 'Navigation' },
  { id: 'nav-templates', label: 'Go to Templates', href: '/templates', icon: '✉️', group: 'Navigation' },
  { id: 'nav-settings', label: 'Go to Settings', href: '/settings', icon: '⚙️', group: 'Navigation' },
]

const actionCommands: BaseCommand[] = [
  { id: 'act-new-contact', label: 'Create New Contact', href: '/contacts?action=new', icon: '➕', group: 'Quick Actions' },
  { id: 'act-new-company', label: 'Create New Company', href: '/companies?action=new', icon: '➕', group: 'Quick Actions' },
  { id: 'act-new-deal', label: 'Create New Deal', href: '/deals?action=new', icon: '➕', group: 'Quick Actions' },
  { id: 'act-new-task', label: 'Create New Task', href: '/tasks?action=new', icon: '➕', group: 'Quick Actions' },
  { id: 'act-log-activity', label: 'Log Activity', href: '/activities?action=new', icon: '📝', group: 'Quick Actions' },
  { id: 'act-send-email', label: 'Send Email', href: '/inbox', icon: '✉️', group: 'Quick Actions' },
  { id: 'act-schedule-meeting', label: 'Schedule Meeting', href: '/calendar', icon: '📅', group: 'Quick Actions' },
]

const GROUP_META: { key: 'companies' | 'contacts' | 'deals' | 'tasks'; label: string; icon: string }[] = [
  { key: 'companies', label: 'Companies', icon: '🏢' },
  { key: 'contacts', label: 'Contacts', icon: '👤' },
  { key: 'deals', label: 'Deals', icon: '💠' },
  { key: 'tasks', label: 'Tasks', icon: '☑️' },
]

// ── Component ──────────────────────────────────────────────────────────────

export default function CommandPalette() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResponse>({
    companies: [],
    contacts: [],
    deals: [],
    tasks: [],
  })
  const [highlightIdx, setHighlightIdx] = useState(0)
  const [loading, setLoading] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const resultsRef = useRef<HTMLDivElement>(null)

  // ── Mount (SSR guard) ─────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true)
  }, [])

  // ── Filter nav/action commands by query ──────────────────────────────────
  const filteredNavCommands = useMemo(() => {
    if (!query) return navCommands
    const q = query.toLowerCase()
    return navCommands.filter((c) => c.label.toLowerCase().includes(q))
  }, [query])

  const filteredActionCommands = useMemo(() => {
    if (!query) return actionCommands
    const q = query.toLowerCase()
    return actionCommands.filter((c) => c.label.toLowerCase().includes(q))
  }, [query])

  // ── Build flattened list of all visible items for keyboard nav ────────────
  const flattenedItems: BaseCommand[] = useMemo(() => {
    const searchItems: BaseCommand[] = []
    if (query.length >= 2) {
      for (const group of GROUP_META) {
        for (const item of searchResults[group.key] || []) {
          searchItems.push({
            id: `${group.key}-${item.id}`,
            label: item.label,
            sublabel: item.sublabel,
            href: item.href,
            icon: group.icon,
            group: group.label,
          })
        }
      }
    }
    return [...filteredNavCommands, ...filteredActionCommands, ...searchItems]
  }, [filteredNavCommands, filteredActionCommands, searchResults, query])

  // ── Open / close helpers ─────────────────────────────────────────────────
  const openPalette = useCallback(() => {
    setOpen(true)
    setQuery('')
    setHighlightIdx(0)
    setSearchResults({ companies: [], contacts: [], deals: [], tasks: [] })
  }, [])

  const closePalette = useCallback(() => {
    setOpen(false)
    setQuery('')
    setHighlightIdx(0)
    setSearchResults({ companies: [], contacts: [], deals: [], tasks: [] })
  }, [])

  // ── Select an item ───────────────────────────────────────────────────────
  const selectItem = useCallback(
    (item: BaseCommand) => {
      if (!item) return
      router.push(item.href)
      closePalette()
    },
    [router, closePalette]
  )

  // ── Global keyboard shortcut: Cmd/Ctrl+K toggles ────────────────────────
  useEffect(() => {
    if (!mounted) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => {
          if (prev) {
            setQuery('')
            setHighlightIdx(0)
            setSearchResults({ companies: [], contacts: [], deals: [], tasks: [] })
            return false
          }
          setQuery('')
          setHighlightIdx(0)
          setSearchResults({ companies: [], contacts: [], deals: [], tasks: [] })
          return true
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mounted])

  // ── Listen for custom "open" event from header button ────────────────────
  useEffect(() => {
    if (!mounted) return
    const handler = () => openPalette()
    window.addEventListener('vega-command-palette-open', handler)
    return () => window.removeEventListener('vega-command-palette-open', handler)
  }, [mounted, openPalette])

  // ── Body scroll lock when open ───────────────────────────────────────────
  useEffect(() => {
    if (!mounted) return
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open, mounted])

  // ── Auto-focus input when opened ─────────────────────────────────────────
  useEffect(() => {
    if (open && inputRef.current) {
      // Small delay to ensure the element is rendered
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // ── Reset highlight when flattened list changes ─────────────────────────
  useEffect(() => {
    setHighlightIdx(0)
  }, [query])

  // ── Debounced search ─────────────────────────────────────────────────────
  useEffect(() => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = undefined
    }

    if (query.length < 2) {
      setSearchResults({ companies: [], contacts: [], deals: [], tasks: [] })
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}`)
        setSearchResults({
          companies: data.companies || [],
          contacts: data.contacts || [],
          deals: data.deals || [],
          tasks: data.tasks || [],
        })
      } catch {
        // On error, just show nav/action commands — no search results
        setSearchResults({ companies: [], contacts: [], deals: [], tasks: [] })
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = undefined
      }
    }
  }, [query])

  // ── Keyboard navigation inside the palette ───────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((prev) => Math.min(prev + 1, flattenedItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flattenedItems[highlightIdx]
      if (item) selectItem(item)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closePalette()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      closePalette()
    }
  }

  // ── Scroll highlighted item into view ────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const container = resultsRef.current
    if (!container) return
    const highlighted = container.querySelector('[data-idx="' + highlightIdx + '"]') as HTMLElement | null
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightIdx, open])

  // ── SSR guard: render nothing on server ──────────────────────────────────
  if (!mounted) return null
  if (!open) return null

  // ── Build grouped sections for rendering ────────────────────────────────
  type Section = { label: string; items: BaseCommand[]; offset: number }
  const sections: { label: string; items: BaseCommand[] }[] = []

  if (filteredNavCommands.length > 0) {
    sections.push({ label: 'Navigation', items: filteredNavCommands })
  }
  if (filteredActionCommands.length > 0) {
    sections.push({ label: 'Quick Actions', items: filteredActionCommands })
  }
  if (query.length >= 2) {
    for (const group of GROUP_META) {
      const items = (searchResults[group.key] || []).map((item) => ({
        id: `${group.key}-${item.id}`,
        label: item.label,
        sublabel: item.sublabel,
        href: item.href,
        icon: group.icon,
        group: group.label,
      }))
      if (items.length > 0) {
        sections.push({ label: group.label, items })
      }
    }
  }

  // Pre-compute section offsets so each item gets a stable flat index
  // without mutating a counter during render (React Compiler safe).
  const sectionsWithOffsets: Section[] = sections.map((section, i) => ({
    ...section,
    offset: sections.slice(0, i).reduce((sum, s) => sum + s.items.length, 0),
  }))

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop / overlay */}
      <div
        className="cmdk-overlay"
        onMouseDown={(e) => {
          // Close on backdrop click (not on palette content)
          if (e.target === e.currentTarget) closePalette()
        }}
      >
        <div className="cmdk-palette" role="dialog" aria-modal="true" aria-label="Command Palette">
          {/* Search input area */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 16,
                fontSize: 18,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            >
              🔍
            </span>
            <input
              ref={inputRef}
              type="text"
              className="cmdk-input"
              placeholder="Type a command or search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              spellCheck={false}
              style={{ paddingLeft: 44 }}
            />
            {/* ⌘K badge at right edge */}
            {query.length === 0 && (
              <span
                style={{
                  position: 'absolute',
                  right: 14,
                  fontSize: 11,
                  color: 'var(--fg-dim)',
                  fontFamily: 'monospace',
                  background: 'var(--panel-elevated)',
                  border: '1px solid var(--panel-border)',
                  borderRadius: 4,
                  padding: '2px 6px',
                  pointerEvents: 'none',
                }}
              >
                ⌘K
              </span>
            )}
            {loading && (
              <span
                style={{
                  position: 'absolute',
                  right: 14,
                  fontSize: 13,
                  color: 'var(--fg-dim)',
                }}
              >
                ⏳
              </span>
            )}
          </div>

          {/* Results */}
          <div className="cmdk-results" ref={resultsRef}>
            {sections.length === 0 && (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: 'var(--fg-dim)',
                  fontSize: 14,
                }}
              >
                {query.length >= 2 ? 'No results found.' : 'Start typing to search…'}
              </div>
            )}
            {sectionsWithOffsets.map((section) => (
              <div key={section.label}>
                <div className="cmdk-section-header">{section.label}</div>
                {section.items.map((item, itemIdx) => {
                  const idx = section.offset + itemIdx
                  const highlighted = idx === highlightIdx
                  return (
                    <div
                      key={item.id}
                      data-idx={idx}
                      className={'cmdk-item' + (highlighted ? ' cmdk-item-highlighted' : '')}
                      onClick={() => selectItem(item)}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 16px',
                        paddingLeft: highlighted ? 13 : 16,
                        borderLeft: highlighted ? '3px solid var(--gold)' : '3px solid transparent',
                        background: highlighted ? 'var(--panel-elevated)' : 'transparent',
                      }}
                    >
                      <span style={{ fontSize: 18, flexShrink: 0, width: 24, textAlign: 'center' }}>
                        {item.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: 'var(--fg)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.label}
                        </div>
                        {item.sublabel && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--fg-dim)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                            }}
                          >
                            {item.sublabel}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="cmdk-footer">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> navigate
            </span>
            <span>
              <kbd>↵</kbd> select
            </span>
            <span>
              <kbd>esc</kbd> close
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
