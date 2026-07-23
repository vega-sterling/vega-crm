'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { apiFetch } from '../lib/api'
import type { User } from '../lib/types'

const navSections = [
  { title: 'Overview', items: [{ label: 'Dashboard', href: '/dashboard', icon: '◈' }] },
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
    title: 'Administration',
    adminOnly: true,
    items: [
      { label: 'Users', href: '/admin/users', icon: '⚙' },
      { label: 'Tenants', href: '/admin/tenants', icon: '▦' },
    ],
  },
]

export default function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

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
      <aside
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 260,
          backgroundColor: 'var(--bg-soft)',
          borderRight: '1px solid var(--panel-border)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, padding: '0 8px' }}>
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

        {navSections.map((section) => {
          if (section.adminOnly && !canAdmin) return null
          const isOpen = collapsed[section.title] !== false
          return (
            <div key={section.title}>
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
      </aside>

      <div style={{ marginLeft: 260, flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            position: 'fixed',
            top: 0,
            left: 260,
            right: 0,
            height: 64,
            backgroundColor: 'var(--panel)',
            borderBottom: '1px solid var(--panel-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 16,
            padding: '0 24px',
            zIndex: 40,
          }}
        >
          <span style={{ color: 'var(--fg-dim)', fontSize: 14 }}>
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
            }}
          >
            Log out
          </button>
        </header>

        <main style={{ padding: '88px 24px 24px', flex: 1 }}>{children}</main>
      </div>
    </div>
  )
}
