'use client'

// ============================================================================
// File: src/app/components/Breadcrumbs.tsx
// Description: Context-aware breadcrumb navigation. Parses the current URL
//              path and generates a breadcrumb trail. For detail pages
//              (companies/[id], contacts/[id], etc.), fetches the record
//              name from the API to display as the final crumb.
//
//              Pattern: Dashboard › Section › Record Name
//              Responsive: on mobile, shows only Section › Record (truncates
//              the Dashboard home crumb to save space).
// ============================================================================

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { IconChevronRight } from './Icons'
import { apiFetch } from '../lib/api'

/** Top-level route labels for non-detail pages */
const SECTION_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  companies: 'Companies',
  contacts: 'Contacts',
  activities: 'Activities',
  tasks: 'Tasks',
  deals: 'Deals',
  quotes: 'Quotes',
  projects: 'Projects',
  inbox: 'Inbox',
  campaigns: 'Campaigns',
  templates: 'Templates',
  calendar: 'Calendar',
  reports: 'Reports',
  settings: 'Settings',
}

/** Admin section labels */
const ADMIN_LABELS: Record<string, string> = {
  users: 'Users',
  tenants: 'Tenants',
  'lead-forms': 'Lead Forms',
  'lead-scoring': 'Lead Scoring',
  integrations: 'Integrations',
}

/** Detail page patterns — maps URL prefix to API endpoint + name extraction */
const DETAIL_PATTERNS = [
  { pattern: '/companies/', apiPath: '/api/companies/', listHref: '/companies', label: 'Companies', nameField: 'name' },
  { pattern: '/contacts/', apiPath: '/api/contacts/', listHref: '/contacts', label: 'Contacts', nameField: 'contactName' },
  { pattern: '/deals/', apiPath: '/api/deals/', listHref: '/deals', label: 'Deals', nameField: 'title' },
  { pattern: '/projects/', apiPath: '/api/projects/', listHref: '/projects', label: 'Projects', nameField: 'name' },
] as const

interface Crumb {
  label: string
  href?: string
}

export default function Breadcrumbs() {
  const pathname = usePathname()
  const [crumbs, setCrumbs] = useState<Crumb[]>([])

  useEffect(() => {
    // Skip on login, root, and setup pages
    if (pathname === '/login' || pathname === '/' || pathname === '/setup-2fa') {
      setCrumbs([])
      return
    }

    // Always start with Dashboard (home crumb)
    const trail: Crumb[] = [{ label: 'Dashboard', href: '/dashboard' }]

    // Check if this is a detail page with an ID
    const detailMatch = DETAIL_PATTERNS.find(
      d => pathname.startsWith(d.pattern) && pathname.split(d.pattern)[1]?.length > 0
    )

    if (detailMatch) {
      const id = pathname.split(detailMatch.pattern)[1]?.split('/')[0]
      if (id) {
        // Add the section crumb (e.g., "Companies" linking to /companies)
        trail.push({ label: detailMatch.label, href: detailMatch.listHref })

        // Fetch the record name for the final crumb
        apiFetch<Record<string, any>>(`${detailMatch.apiPath}${id}`)
          .then(record => {
            let name = ''
            if (detailMatch.nameField === 'contactName') {
              name = `${record.firstName || ''} ${record.lastName || ''}`.trim()
            } else {
              name = record[detailMatch.nameField] || 'Unknown'
            }
            trail.push({ label: name })
            setCrumbs([...trail])
          })
          .catch(() => {
            trail.push({ label: 'Unknown' })
            setCrumbs([...trail])
          })
        return // Don't setCrumbs yet — will be set in the promise
      }
    }

    // Non-detail page — determine label from path
    const segments = pathname.split('/').filter(Boolean)

    if (segments.length === 0) {
      setCrumbs([])
      return
    }

    // Handle admin routes specially
    if (segments[0] === 'admin' && segments[1]) {
      trail.push({ label: ADMIN_LABELS[segments[1]] || segments[1], href: pathname })
      setCrumbs(trail)
      return
    }

    // Handle public/form routes
    if (segments[0] === 'forms' || segments[0] === 'book') {
      trail.push({ label: segments[0] === 'forms' ? 'Lead Forms' : 'Bookings', href: pathname })
      setCrumbs(trail)
      return
    }

    // Standard section pages
    const label = SECTION_LABELS[segments[0]] || segments[0]
    if (label !== 'Dashboard') {
      trail.push({ label, href: pathname })
    }
    setCrumbs(trail)
  }, [pathname])

  // Don't render if only the home crumb (or empty)
  if (crumbs.length <= 1) return null

  return (
    <nav
      className="breadcrumbs"
      aria-label="Breadcrumb"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 0 12px',
        fontSize: 13,
        color: 'var(--fg-dim)',
        flexWrap: 'wrap',
        lineHeight: 1.4,
      }}
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && (
              <IconChevronRight size={13} style={{ color: 'var(--fg-dimmer)', flexShrink: 0 }} />
            )}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                style={{
                  color: 'var(--fg-dim)',
                  textDecoration: 'none',
                  transition: 'color .2s',
                  whiteSpace: 'nowrap',
                }}
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                style={{
                  color: isLast ? 'var(--fg)' : 'var(--fg-dim)',
                  fontWeight: isLast ? 600 : 400,
                  maxWidth: 240,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {crumb.label}
              </span>
            )}
          </div>
        )
      })}
    </nav>
  )
}