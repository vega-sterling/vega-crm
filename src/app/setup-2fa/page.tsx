'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '../lib/api'
import Spinner from '../components/Spinner'

export default function Setup2faPage() {
  const router = useRouter()
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const fetchSetup = useCallback(async () => {
    try {
      const data = await apiFetch<{ qrDataUrl: string; secret: string; backupCodes: string[] }>('/api/auth/2fa/setup', { method: 'POST' })
      setQr(data.qrDataUrl)
      setSecret(data.secret)
      setBackupCodes(data.backupCodes || [])
    } catch {
      setError('Unable to load 2FA setup')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSetup()
  }, [fetchSetup])

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await apiFetch('/api/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Invalid code')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, backgroundColor: 'var(--panel)', border: '1px solid var(--panel-border)', borderRadius: 16, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bg)', fontWeight: 800, fontSize: 18 }}>V</div>
          <span style={{ fontSize: 24, fontWeight: 700 }}>Set up 2FA</span>
        </div>

        <p style={{ color: 'var(--fg-dim)', fontSize: 14, marginBottom: 20 }}>
          Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.
        </p>

        {qr && (
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <img src={qr} alt="TOTP QR code" style={{ borderRadius: 12, backgroundColor: '#fff', padding: 10, maxWidth: 220, width: '100%' }} />
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', color: 'var(--fg-dim)', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Secret key (manual entry)</label>
          <div
            style={{
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--panel-border)',
              borderRadius: 8,
              padding: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13,
              wordBreak: 'break-all',
              color: 'var(--fg)',
            }}
          >
            {secret}
          </div>
        </div>

        {backupCodes.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: 'var(--fg-dim)', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Backup codes — save these safely</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, backgroundColor: 'var(--bg)', border: '1px solid var(--panel-border)', borderRadius: 8, padding: 12 }}>
              {backupCodes.map((c) => (
                <div key={c} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--fg)' }}>{c}</div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={verify} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', color: 'var(--fg-dim)', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\\D/g, ''))}
              placeholder="000000"
              style={{ width: '100%', backgroundColor: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--panel-border)', borderRadius: 8, padding: '12px 14px', letterSpacing: 4, fontSize: 20, textAlign: 'center' }}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            style={{ width: '100%', backgroundColor: 'var(--gold)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 700, fontSize: 15, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Spinner size={16} /> Verifying</span> : 'Enable 2FA'}
          </button>
        </form>
      </div>
    </div>
  )
}
