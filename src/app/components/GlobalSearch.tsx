'use client'

// ============================================================================
// GlobalSearch — Header search bar that searches across companies, contacts,
// and deals. Results appear in a dropdown grouped by type. Keyboard accessible
// (arrow keys, Enter, Escape). Works on all pages (rendered in AppShell header).
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
  companies?: { id: string; name: string; industry?: string | null }[]
  contacts?: { id: string; firstName: string; lastName: string; email?: string | null; company?: { name: string } | null }[]
  deals?: { id: string; title: string; value?: number; company?: { name: string } | null }[]
}

export default function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{
    companies: SearchResult[]
    contacts: SearchResult[]
    deals: SearchResult[]
  }>({ companies: [], contacts: [], deals: [] })
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
  ]

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults({ companies: [], contacts: [], deals: [] })
      setLoading(false)
      return
    }
    try {
      // Search all three endpoints in parallel
      const [companiesRes, contactsRes, dealsRes] = await Promise.all([
        apiFetch<{ data: SearchResponse['companies'] }>(`/api/companies?search=${encodeURIComponent(q)}&limit=5`),
        apiFetch<{ data: SearchResponse['contacts'] }>(`/api/contacts?limit=100`),
        apiFetch<{ deals: SearchResponse['deals'] }>(`/api/deals`),
      ])
      const companies = (companiesRes.data || []).filter((c) =>
        c.name.toLowerCase().includes(q.toLowerCase())
      ).slice(0, 5).map((c) => ({
        id: c.id,
        label: c.name,
        sublabel: c.industry || undefined,
        href: `/companies/${c.id}`,
      }))
      const contacts = (contactsRes.data || []).filter((c) => {
        const fullName = `${c.firstName} ${c.lastName}`.toLowerCase()
        return fullName.includes(q.toLowerCase()) ||
          (c.email || '').toLowerCase().includes(q.toLowerCase())
      }).slice(0, 5).map((c) => ({
        id: c.id,
        label: `${c.firstName} ${c.lastName}`,
        sublabel: c.company?.name || c.email || undefined,
        href: `/contacts/${c.id}`,
      }))
      const deals = (dealsRes.deals || []).filter((d) =>
        d.title.toLowerCase().includes(q.toLowerCase()) ||
        (d.company?.name || '').toLowerCase().includes(q.toLowerCase())
      ).slice(0, 5).map((d) => ({
        id: d.id,
        label: d.title,
        sublabel: d.company?.name || undefined,
        href: `/deals/${d.id}`,
      }))
      setResults({ companies, contacts, deals })
    } catch {
      setResults({ companies: [], contacts: [], deals: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (val: string) => {
    setQuery(val)
    setHighlightIdx(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim().length < 2) {
      setResults({ companies: [], contacts: [], deals: [] })
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
    setResults({ companies: [], contacts: [], deals: [] })
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

  const hasResults = results.companies.length > 0 || results.contacts.length > 0 || results.deals.length > 0
  let runningIdx = -1

  const renderGroup = (title: string, items: SearchResult[]) => {
    if (items.length === 0) return null
    return (
      <div key={title} style={{ padding: '4px 0' }}>
        <div style={{
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: 0.5, color: 'var(--fg-dim)',
          padding: '6px 12px',
        }}>
          {title}
        </div>
        {items.map((r) => {
          runningIdx++
          const idx = runningIdx
          const isHighlighted = idx === highlightIdx
          return (
            <div
              key={`${title}-${r.id}`}
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
              }}
              onMouseEnter={() => setHighlightIdx(idx)}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>{r.label}</span>
              {r.sublabel && (
                <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{r.sublabel}</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="global-search"
      style={{ position: 'relative', flex: 1, maxWidth: 420 }}
    >
      <input
        type="text"
        placeholder="Search companies, contacts, deals…"
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
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--fg-dim)', fontSize: 14 }}>
              No results for "{query}"
            </div>
          ) : (
            <>
              {renderGroup('Companies', results.companies)}
              {renderGroup('Contacts', results.contacts)}
              {renderGroup('Deals', results.deals)}
            </>
          )}
        </div>
      )}
    </div>
  )
}