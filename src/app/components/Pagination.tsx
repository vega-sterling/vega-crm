'use client'

// ============================================================================
// File: src/app/components/Pagination.tsx
// Description: Reusable pagination control for table-based list views.
//              Shows page numbers with prev/next buttons and item count.
//              Phase 3: Add pagination to Companies and Contacts tables.
// ============================================================================

import { IconChevronLeft, IconChevronRight } from './Icons'

interface PaginationProps {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

/**
 * Pagination — page navigation with numbered buttons.
 * Renders prev/next chevrons and up to 7 page number buttons.
 * Shows item range (e.g. "1–10 of 45") on the left side.
 */
export default function Pagination({ page, totalPages, totalItems, pageSize, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, totalItems)

  // Build page numbers — show up to 7 visible pages with ellipsis
  const pages: (number | string)[] = []
  const maxVisible = 7
  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('…')
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (page < totalPages - 2) pages.push('…')
    pages.push(totalPages)
  }

  return (
    <div className="vega-pagination">
      <span style={{ color: 'var(--fg-dim)', fontSize: 13 }}>
        {startItem}–{endItem} of {totalItems}
      </span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button
          className="vega-page-btn"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <IconChevronLeft size={16} strokeWidth={1.5} />
        </button>
        {pages.map((p, i) =>
          typeof p === 'number' ? (
            <button
              key={i}
              className={`vega-page-btn${p === page ? ' active' : ''}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ) : (
            <span key={i} style={{ color: 'var(--fg-dim)', padding: '0 4px', fontSize: 13 }}>{p}</span>
          )
        )}
        <button
          className="vega-page-btn"
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <IconChevronRight size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}