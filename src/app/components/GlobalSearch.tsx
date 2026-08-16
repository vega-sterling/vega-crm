'use client'

// ============================================================================
// GlobalSearch — Header search bar that searches across companies, contacts,
// deals, and tasks using the server-side /api/search endpoint.
// Results appear in a dropdown grouped by type. Keyboard accessible
// (arrow keys, Enter, Escape). Works on all pages (rendered in AppShell header).
//
// Phase 15: Rewritten to use /api/search instead of fetching entire lists
//           and filtering client-side. Now includes tasks in search results.
// ============================================================================

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '../lib/api'

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
  counts?: {
    companies: number
    contacts: number
    deals: number
    tasks: number
    total: number
  }
}

const GROUP_META: { key: keyof Pick<SearchResponse, 'companies' | 'contacts' | 'deals' | 'tasks'> ; label: string; icon: string }[] = [
  { key: 'companies', label: 'Companies', icon: '🏢' },
  { key: 'contacts', label: 'Contacts', icon: '👤' },
  { key: 'deals', label: 'Deals', icon: '💠' },
  { key: 'tasks', label: 'Tasks', icon: '☑️' },
]

export default function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse>({
    companies: [],
    contacts: [],
    deals: [],
    tasks: [],
  })
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Flatten results for keyboard navigation
  const flatResults: SearchResult[] = [
    ...results.companies,
    ...results.contacts,
    ...results.deals,
    ...results.tasks,
  ]

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults({ companies: [], contacts: [], deals: [], tasks: [] })
      setLoading(false)
      return
    }
    try {
      const data = await apiFetch<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`)
      setResults(data)
    } catch {
      setResults({ companies: [], contacts: [], deals: [], tasks: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (val: string) => {
    setQuery(val)
    setHighlightIdx(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim().length < 2) {
      setResults({ companies: [], contacts: [], deals: [], tasks: [] })
      setLoading(false)
      setOpen(false)
      return
    }
    setLoading(true)
    setOpen(true)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || flatResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((prev) => Math.min(prev + 1, flatResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const idx = highlightIdx >= 0 ? highlightIdx : 0
      if (flatResults[idx]) {
        navigateTo(flatResults[idx])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const navigateTo = (r: SearchResult) => {
    router.push(r.href)
    setQuery('')
    setOpen(false)
    setResults({ companies: [], contacts: [], deals: [], tasks: [] })
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const hasResults = results.companies.length > 0 || results.contacts.length > 0 || results.deals.length > 0 || results.tasks.length > 0
  let runningIdx = -1

  const renderGroup = (groupKey: string, label: string, icon: string, items: SearchResult[]) => {
    if (items.length === 0) return null
    return (
      <div key={groupKey} style={{ padding: '4px 0' }}>
        <div style={{
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: 0.5, color: 'var(--fg-dim)',
          padding: '6px 12px',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 13 }}>{icon}</span>
          {label}
          <span style={{ color: 'var(--fg-dimmer)', fontWeight: 400 }}>{items.length}</span>
        </div>
        {items.map((r) => {
          runningIdx++
          const idx = runningIdx
          const isHighlighted = idx === highlightIdx
          return (
            <div
              key={`${groupKey}-${r.id}`}
              onClick={() => navigateTo(r)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: isHighlighted ? 'var(--panel-elevated)' : 'transparent',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                borderRadius: 6,
                margin: '0 4px',
                transition: 'background .1s',
              }}
              onMouseEnter={() => setHighlightIdx(idx)}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              {r.sublabel && (
                <span style={{ fontSize: 12, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sublabel}</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const totalCount = results.counts?.total ?? flatResults.length

  return (
    <div
      ref={containerRef}
      className="global-search"
      style={{ position: 'relative', flex: 1, maxWidth: 420 }}
    >
      <input
        type="text"
        placeholder="Search companies, contacts, deals, tasks…"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (query.trim().length >= 2) setOpen(true) }}
        aria-label="Global search"
        style={{
          width: '100%',
          backgroundColor: 'var(--bg)',
          color: 'var(--fg)',
          border: '1px solid var(--panel-border)',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 14,
          minHeight: 40,
        }}
      />
      {open && (
        <div
          className="global-search-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            backgroundColor: 'var(--panel)',
            border: '1px solid var(--panel-border)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            zIndex: 200,
            maxHeight: 480,
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {loading ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--fg-dim)', fontSize: 14 }}>
              Searching…
            </div>
          ) : !hasResults ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-dim)', fontSize: 14 }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>🔍</div>
              No results for &ldquo;{query}&rdquo;
              <div style={{ fontSize: 12, marginTop: 4, color: 'var(--fg-dimmer)' }}>
                Try searching by name, email, company, or deal title
              </div>
            </div>
          ) : (
            <>
              {GROUP_META.map((g) =>
                renderGroup(g.key, g.label, g.icon, results[g.key])
              )}
              {totalCount > 0 && (
                <div style={{
                  padding: '8px 12px',
                  borderTop: '1px solid var(--panel-border)',
                  fontSize: 12,
                  color: 'var(--fg-dimmer)',
                  textAlign: 'center',
                }}>
                  {totalCount} result{totalCount !== 1 ? 's' : ''} · Press Enter to open
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}