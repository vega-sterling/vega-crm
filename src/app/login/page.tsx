'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '../lib/api'
import Spinner from '../components/Spinner'
import type { User } from '../lib/types'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [needsTotp, setNeedsTotp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    apiFetch<{ user?: User }>('/api/auth/me')
      .then((res) => {
        if (res.user) router.replace('/dashboard')
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload: Record<string, string> = { email, password }
      if (needsTotp) payload.totpCode = totpCode
      const result = await apiFetch<{
        success?: boolean
        user?: User
        requires2FA?: boolean
        totpRequired?: boolean
      }>('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) })

      if (result.requires2FA || result.totpRequired) {
        setNeedsTotp(true)
        setLoading(false)
        return
      }

      router.replace('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Login failed')
      setLoading(false)
    }
  }

  if (checking) {
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
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          backgroundColor: 'var(--panel)',
          border: '1px solid var(--panel-border)',
          borderRadius: 16,
          padding: 32,
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              backgroundColor: 'var(--gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--bg)',
              fontWeight: 800,
              fontSize: 18,
            }}
          >
            V
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>
          {needsTotp ? 'Two-factor authentication' : 'Sign in'}
        </h1>
        <p style={{ color: 'var(--fg-dim)', margin: '0 0 24px', fontSize: 14 }}>
          {needsTotp
            ? 'Enter the 6-digit code from your authenticator app.'
            : 'Enter your credentials to continue.'}
        </p>

        {error && (
          <div
            style={{
              backgroundColor: 'rgba(239,68,68,0.12)',
              color: 'var(--error)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!needsTotp && (
            <>
              <div>
                <label
                  style={{
                    display: 'block',
                    color: 'var(--fg-dim)',
                    fontSize: 12,
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg)',
                    color: 'var(--fg)',
                    border: '1px solid var(--panel-border)',
                    borderRadius: 8,
                    padding: '12px 14px',
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    color: 'var(--fg-dim)',
                    fontSize: 12,
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg)',
                    color: 'var(--fg)',
                    border: '1px solid var(--panel-border)',
                    borderRadius: 8,
                    padding: '12px 14px',
                  }}
                />
              </div>
            </>
          )}
          {needsTotp && (
            <div>
              <label
                style={{
                  display: 'block',
                  color: 'var(--fg-dim)',
                  fontSize: 12,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Authenticator code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\\D/g, ''))}
                placeholder="000000"
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg)',
                  color: 'var(--fg)',
                  border: '1px solid var(--panel-border)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  letterSpacing: 4,
                  fontSize: 20,
                  textAlign: 'center',
                }}
              />
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: 'var(--gold)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 8,
              padding: '12px',
              fontWeight: 700,
              fontSize: 15,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Spinner size={16} /> Please wait
              </span>
            ) : needsTotp ? (
              'Verify code'
            ) : (
              'Sign in'
            )}
          </button>
          {needsTotp && (
            <button
              type="button"
              onClick={() => setNeedsTotp(false)}
              style={{
                width: '100%',
                backgroundColor: 'transparent',
                color: 'var(--fg-dim)',
                border: 'none',
                fontSize: 13,
                marginTop: 4,
              }}
            >
              ← Back to credentials
            </button>
          )}
        </form>
        <p style={{ color: 'var(--fg-dim)', fontSize: 12, marginTop: 24, textAlign: 'center' }}>
          &nbsp;
        </p>
      </div>
    </div>
  )
}
