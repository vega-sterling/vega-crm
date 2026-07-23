'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from './AppShell'
import Spinner from './Spinner'
import { apiFetch } from '../lib/api'
import type { User } from '../lib/types'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    apiFetch<{ user?: User }>('/api/auth/me')
      .then((res) => {
        if (mounted && res.user) setUser(res.user)
      })
      .catch(() => {
        if (mounted) setUser(null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [loading, user, router])

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg)',
        }}
      >
        <Spinner size={40} />
      </div>
    )
  }

  if (!user) return null

  return <AppShell user={user}>{children}</AppShell>
}