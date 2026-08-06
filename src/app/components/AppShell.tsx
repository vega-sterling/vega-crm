'use client'

// ============================================================================
// File: src/app/components/AppShell.tsx
// Description: Main application shell — fixed sidebar with collapsible nav
//              sections, header bar with global search, notifications, and
//              user menu. Phase 1-3 UI/UX improvements: SVG icons, text logo,
//              auto-expand active section, localStorage persistence.
// ============================================================================

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { apiFetch } from '../lib/api'
import type { User } from '../lib/types'
import NotificationBell from './NotificationBell'
import GlobalSearch from './GlobalSearch'
import { navIconMap, IconX, IconMenu, IconChevronRight } from './Icons'

const navSections = [
  { title: 'Overview', items: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Reports', href: '/reports' },
  ]},
  {
    title: 'CRM',
    items: [
      { label: 'Companies', href: '/companies' },
      { label: 'Contacts', href: '/contacts' },
      { label: 'Activities', href: '/activities' },
      { label: 'Tasks', href: '/tasks' },
    ],
  },
  {
    title: 'Sales',
    items: [
      { label: 'Deals', href: '/deals' },
      { label: 'Quotes', href: '/quotes' },
    ],
  },
  {
    title: 'Projects',
    items: [
      { label: 'Projects', href: '/projects' },
    ],
  },
  {
    title: 'Communications',
    items: [
      { label: 'Inbox', href: '/inbox' },
      { label: 'Campaigns', href: '/campaigns' },
      { label: 'Templates', href: '/templates' },
      { label: 'Calendar', href: '/calendar' },
    ],
  },
  {
    title: 'Administration',
    adminOnly: true,
    items: [
      { label: 'Users', href: '/admin/users' },
      { label: 'Tenants', href: '/admin/tenants' },
      { label: 'Lead Forms', href: '/admin/lead-forms' },
      { label: 'Lead Scoring', href: '/admin/lead-scoring' },
      { label: 'Integrations', href: '/admin/integrations' },
      { label: 'Settings', href: '/settings' },
    ],
  },
]

const SIDEBAR_WIDTH = 260
const COLLAPSE_KEY = 'vega-crm-sidebar-collapsed'

export default function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Determine which section the active route belongs to
  const activeSection = useMemo(() => {
    for (const section of navSections) {
      for (const item of section.items) {
        if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
          return section.title
        }
      }
    }
    return null
  }, [pathname])

  // Load collapsed state from localStorage on mount, then auto-expand active section
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSE_KEY)
      const savedCollapsed: Record<string, boolean> = saved ? JSON.parse(saved) : {}
      // Auto-expand the active section (set collapsed=false for it)
      if (activeSection) {
        savedCollapsed[activeSection] = false
      }
      setCollapsed(savedCollapsed)
    } catch {
      // If localStorage is unavailable, just auto-expand active section
      if (activeSection) {
        setCollapsed({ [activeSection]: false })
      }
    }
  }, [activeSection])

  // Persist collapsed state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed))
    } catch {}
  }, [collapsed])

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  const toggleSection = (title: string) =>
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }))

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    router.replace('/login')
  }

  const canAdmin = user.globalRole === 'SUPER_ADMIN' || user.globalRole === 'ADMIN'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* ── Mobile overlay backdrop ── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 60,
            transition: 'opacity .2s',
          }}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className="sidebar"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: SIDEBAR_WIDTH,
          backgroundColor: 'var(--bg-soft)',
          borderRight: '1px solid var(--panel-border)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 70,
          transition: 'transform .25s ease',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        {/* Logo + close button — text logo, no box */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, padding: '0 8px' }}>
          <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--fg)' }}>
            VEGA<span style={{ color: 'var(--gold)' }}> CRM</span>
          </span>
          {/* Close button — mobile only */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="mobile-only"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--fg-dim)',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close menu"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Nav sections */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {navSections.map((section) => {
            if (section.adminOnly && !canAdmin) return null
            const isOpen = collapsed[section.title] !== true
            const isActiveSection = activeSection === section.title
            return (
              <div key={section.title} style={{ marginBottom: 4 }}>
                <button
                  onClick={() => toggleSection(section.title)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 8px',
                    background: 'transparent',
                    border: 'none',
                    color: isActiveSection ? 'var(--fg)' : 'var(--fg-dim)',
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    cursor: 'pointer',
                    transition: 'color .2s',
                  }}
                >
                  {section.title}
                  <span
                    style={{
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform .2s',
                      color: 'var(--fg-dim)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <IconChevronRight size={14} />
                  </span>
                </button>
                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {section.items.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                      const Icon = navIconMap[item.label]
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`vega-nav-link${active ? ' active' : ''}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 8px',
                            borderRadius: 8,
                            textDecoration: 'none',
                            color: active ? 'var(--fg)' : 'var(--fg-dim)',
                            backgroundColor: active ? 'var(--panel)' : 'transparent',
                            fontSize: 14,
                            fontWeight: active ? 600 : 500,
                            transition: 'background .2s, color .2s',
                          }}
                        >
                          {Icon && <Icon size={18} strokeWidth={1.5} />}
                          {item.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </aside>

      {/* ── Main content area ── */}
      <div
        className="main-content"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {/* ── Header bar ── */}
        <header
          className="app-header"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 64,
            backgroundColor: 'var(--panel)',
            borderBottom: '1px solid var(--panel-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 16px',
            zIndex: 40,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="mobile-only"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--fg)',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 6,
            }}
            aria-label="Open menu"
          >
            <IconMenu size={22} />
          </button>

          {/* Global Search — in header, works on all pages */}
          <GlobalSearch />

          <NotificationBell />
          {/* User info + logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
            <span
              className="user-name"
              style={{ color: 'var(--fg-dim)', fontSize: 14, whiteSpace: 'nowrap' }}
            >
              {user.name}{' '}
              <span style={{ color: 'var(--gold)', fontSize: 12, textTransform: 'uppercase' }}>
                • {user.globalRole.replace('_', ' ')}
              </span>
            </span>
            <button
              onClick={handleLogout}
              style={{
                backgroundColor: 'var(--panel-elevated)',
                color: 'var(--fg)',
                border: '1px solid var(--panel-border)',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              Log out
            </button>
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="page-content" style={{ padding: '88px 16px 24px', flex: 1 }}>
          {children}
        </main>
      </div>
    </div>
  )
}