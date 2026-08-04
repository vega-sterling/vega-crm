'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import type { User } from '../lib/types'
import NotificationBell from './NotificationBell'

const navSections = [
  { title: 'Overview', items: [
    { label: 'Dashboard', href: '/dashboard', icon: '◈' },
    { label: 'Reports', href: '/reports', icon: '📊' },
  ]},
  {
    title: 'CRM',
    items: [
      { label: 'Companies', href: '/companies', icon: '⌂' },
      { label: 'Contacts', href: '/contacts', icon: '◎' },
      { label: 'Activities', href: '/activities', icon: '✎' },
      { label: 'Tasks', href: '/tasks', icon: '☑' },
    ],
  },
  {
    title: 'Sales',
    items: [
      { label: 'Deals', href: '/deals', icon: '💠' },
      { label: 'Quotes', href: '/quotes', icon: '📄' },
    ],
  },
  {
    title: 'Projects',
    items: [
      { label: 'Projects', href: '/projects', icon: '▤' },
    ],
  },
  {
    title: 'Communications',
    items: [
      { label: 'Inbox', href: '/inbox', icon: '📥' },
      { label: 'Campaigns', href: '/campaigns', icon: '📣' },
      { label: 'Templates', href: '/templates', icon: '✉' },
      { label: 'Calendar', href: '/calendar', icon: '📅' },
    ],
  },
  {
    title: 'Administration',
    adminOnly: true,
    items: [
      { label: 'Users', href: '/admin/users', icon: '⚙' },
      { label: 'Tenants', href: '/admin/tenants', icon: '▦' },
      { label: 'Lead Forms', href: '/admin/lead-forms', icon: '📋' },
      { label: 'Lead Scoring', href: '/admin/lead-scoring', icon: '🎯' },
      { label: 'Integrations', href: '/admin/integrations', icon: '🔗' },
      { label: 'Settings', href: '/settings', icon: '🔧' },
    ],
  },
]

const SIDEBAR_WIDTH = 260

export default function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
        {/* Logo + close button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, padding: '0 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: 'var(--gold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--bg)',
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              V
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>Vega CRM</span>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="mobile-only"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--fg-dim)',
              fontSize: 22,
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Nav sections */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {navSections.map((section) => {
            if (section.adminOnly && !canAdmin) return null
            const isOpen = collapsed[section.title] !== false
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
                    color: 'var(--fg-dim)',
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    cursor: 'pointer',
                  }}
                >
                  {section.title}
                  <span
                    style={{
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform .2s',
                      color: 'var(--fg-dim)',
                    }}
                  >
                    ›
                  </span>
                </button>
                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {section.items.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
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
                            fontWeight: 500,
                            transition: 'background .2s, color .2s',
                          }}
                        >
                          <span style={{ width: 20, textAlign: 'center', fontSize: 16 }}>{item.icon}</span>
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
            justifyContent: 'space-between',
            gap: 12,
            padding: '0 16px',
            zIndex: 40,
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
              fontSize: 22,
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 6,
            }}
            aria-label="Open menu"
          >
            ☰
          </button>

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