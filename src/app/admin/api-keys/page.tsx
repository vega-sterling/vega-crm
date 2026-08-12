'use client'

// ============================================================================
// File: src/app/admin/api-keys/page.tsx
// Description: API Key Management page — admin-only. Stripe/HubSpot-style
//   interface for creating, viewing, revoking, and deleting API keys.
//   Keys are shown once at creation, then masked permanently.
// ============================================================================

import { useEffect, useState, useCallback } from 'react'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import ConfirmDialog from '../../components/ConfirmDialog'
import { apiFetch, ApiError } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge, statusDot } from '../../lib/styles'
import { SCOPE_GROUPS } from '@/lib/apiKeys'

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  tenantId: string | null
  tenantName: string | null
  tenantSlug: string | null
  createdBy: string
  createdByName: string
  createdByEmail: string
  lastUsedAt: string | null
  lastUsedIp: string | null
  expiresAt: string | null
  isActive: boolean
  createdAt: string
}

interface CreatedKey {
  id: string
  name: string
  key: string
  keyPrefix: string
  scopes: string[]
  tenantId: string | null
  expiresAt: string | null
  createdAt: string
}

interface Tenant {
  id: string
  name: string
  slug: string
}

const SCOPE_LABELS: Record<string, string> = {}
SCOPE_GROUPS.forEach((g) => g.scopes.forEach((s) => { SCOPE_LABELS[s.value] = s.label }))

const formatDate = (d?: string | null) => {
  if (!d) return 'Never'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatDateTime = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const isExpired = (expiresAt: string | null) => {
  if (!expiresAt) return false
  return new Date(expiresAt) <= new Date()
}

export default function ApiKeysPage() {
  const [loading, setLoading] = useState(true)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null)

  // Create form state
  const [formName, setFormName] = useState('')
  const [formScopes, setFormScopes] = useState<string[]>([])
  const [formTenantId, setFormTenantId] = useState('')
  const [formExpiry, setFormExpiry] = useState('')
  const [creating, setCreating] = useState(false)

  const loadKeys = useCallback(async () => {
    try {
      const data = await apiFetch<{ keys: ApiKey[] }>('/api/admin/api-keys')
      setKeys(data.keys || [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTenants = useCallback(async () => {
    try {
      const data = await apiFetch<{ tenants: Tenant[] }>('/api/admin/tenants')
      setTenants(data.tenants || [])
    } catch {
      // Non-super-admins may not have access
    }
  }, [])

  useEffect(() => {
    loadKeys()
    loadTenants()
  }, [loadKeys, loadTenants])

  const toggleScope = (scope: string) => {
    setFormScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  const handleCreate = async () => {
    setError('')
    if (!formName.trim()) { setError('Name is required'); return }
    if (formScopes.length === 0) { setError('Select at least one scope'); return }

    setCreating(true)
    try {
      const data = await apiFetch<CreatedKey>('/api/admin/api-keys', {
        method: 'POST',
        body: JSON.stringify({
          name: formName.trim(),
          scopes: formScopes,
          tenantId: formTenantId || null,
          expiresAt: formExpiry || null,
        }),
      })
      setCreatedKey(data)
      setSuccess('')
      // Reset form
      setFormName('')
      setFormScopes([])
      setFormTenantId('')
      setFormExpiry('')
      setShowCreate(false)
      // Reload keys
      loadKeys()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActive = async (key: ApiKey) => {
    try {
      await apiFetch('/api/admin/api-keys', {
        method: 'PATCH',
        body: JSON.stringify({ id: key.id, isActive: !key.isActive }),
      })
      setSuccess('Key "' + key.name + '" ' + (key.isActive ? 'revoked' : 'reactivated'))
      loadKeys()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update key')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await apiFetch('/api/admin/api-keys/' + deleteTarget.id, { method: 'DELETE' })
      setSuccess('Key "' + deleteTarget.name + '" permanently deleted')
      setDeleteTarget(null)
      loadKeys()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete key')
    }
  }

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea')
      ta.value = key
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <ProtectedLayout>
        <div style={{ ...layout.page, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <Spinner />
        </div>
      </ProtectedLayout>
    )
  }

  return (
    <ProtectedLayout>
      <div style={layout.page}>
        <div style={layout.header}>
          <div>
            <h1 style={typeography.title}>API Keys</h1>
            <p style={typeography.muted}>Manage API keys for external integrations and programmatic access</p>
          </div>
          {!showCreate && !createdKey && (
            <button
              style={buttons.primary}
              onClick={() => setShowCreate(true)}
            >
              + Create API Key
            </button>
          )}
        </div>

        {/* Error / Success messages */}
        {error && (
          <div style={{ ...panel.compact, borderColor: 'var(--rust, #c0392b)', marginBottom: 16, color: 'var(--rust, #c0392b)' }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ ...panel.compact, borderColor: 'var(--emerald, #10b981)', marginBottom: 16, color: 'var(--emerald, #10b981)' }}>
            ✓ {success}
          </div>
        )}

        {/* ── Newly created key — one-time display ── */}
        {createdKey && (
          <div style={{
            ...panel.container,
            marginBottom: 24,
            borderColor: 'var(--gold, #b8924a)',
            borderWidth: 2,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 20 }}>🔑</span>
              <h2 style={{ ...typeography.subtitle, margin: 0 }}>API Key Created</h2>
            </div>
            <div style={{ ...panel.compact, backgroundColor: 'var(--bg)', marginBottom: 16 }}>
              <p style={{ ...typeography.small, marginBottom: 8, fontWeight: 600 }}>
                ⚠️ Copy your API key now. For security, it will not be shown again.
              </p>
              <div style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}>
                <code style={{
                  fontFamily: 'monospace',
                  fontSize: 14,
                  backgroundColor: 'var(--bg-soft)',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--panel-border)',
                  wordBreak: 'break-all',
                  flex: 1,
                  minWidth: 250,
                }}>
                  {createdKey.key}
                </code>
                <button
                  style={{ ...buttons.secondary, minWidth: 100 }}
                  onClick={() => copyKey(createdKey.key)}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                style={buttons.primary}
                onClick={() => { setCreatedKey(null); setCopied(false) }}
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* ── Create form ── */}
        {showCreate && (
          <div style={{ ...panel.container, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ ...typeography.subtitle, margin: 0 }}>Create New API Key</h2>
              <button
                style={{ ...buttons.secondary, padding: '6px 12px' }}
                onClick={() => { setShowCreate(false); setFormName(''); setFormScopes([]); setFormExpiry(''); setError('') }}
              >
                Cancel
              </button>
            </div>

            {/* Name */}
            <div style={{ ...forms.group, marginBottom: 20 }}>
              <label style={forms.label}>Key Name</label>
              <input
                style={forms.input}
                type="text"
                placeholder="e.g., Zapier Integration, Custom Dashboard"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                maxLength={100}
              />
            </div>

            {/* Tenant (super admin only) */}
            {tenants.length > 0 && (
              <div style={{ ...forms.group, marginBottom: 20 }}>
                <label style={forms.label}>Tenant Scope (optional)</label>
                <select
                  style={forms.select}
                  value={formTenantId}
                  onChange={(e) => setFormTenantId(e.target.value)}
                >
                  <option value="">All accessible tenants</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
                  ))}
                </select>
                <p style={typeography.small}>Leave empty to allow access to all tenants you can manage</p>
              </div>
            )}

            {/* Expiry */}
            <div style={{ ...forms.group, marginBottom: 20 }}>
              <label style={forms.label}>Expiry Date (optional)</label>
              <input
                style={forms.input}
                type="date"
                value={formExpiry}
                onChange={(e) => setFormExpiry(e.target.value)}
              />
              <p style={typeography.small}>Leave empty for no expiry. Expired keys are automatically rejected.</p>
            </div>

            {/* Scopes */}
            <div style={{ marginBottom: 20 }}>
              <label style={forms.label}>Scopes &amp; Permissions</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 8,
              }}>
                {SCOPE_GROUPS.map((group) => (
                  <div key={group.label} style={{
                    ...panel.compact,
                    padding: 12,
                  }}>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--fg-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 8,
                    }}>
                      {group.label}
                    </div>
                    {group.scopes.map((scope) => (
                      <label
                        key={scope.value}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 0',
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={formScopes.includes(scope.value)}
                          onChange={() => toggleScope(scope.value)}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <span>{scope.label}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <button
              style={{ ...buttons.primary, opacity: creating ? 0.6 : 1 }}
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Generate API Key'}
            </button>
          </div>
        )}

        {/* ── Keys list ── */}
        {keys.length === 0 && !createdKey ? (
          <div style={{ ...panel.container, textAlign: 'center', padding: '60px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔑</div>
            <h2 style={typeography.subtitle}>No API Keys Yet</h2>
            <p style={typeography.muted}>Create an API key to enable programmatic access to your CRM data.</p>
          </div>
        ) : (
          <div className="api-keys-list">
            {keys.map((key) => {
              const expired = isExpired(key.expiresAt)
              const status = !key.isActive ? 'revoked' : expired ? 'expired' : 'active'
              const statusColor = status === 'active' ? 'var(--emerald, #10b981)' : status === 'expired' ? 'var(--gold, #b8924a)' : 'var(--rust, #c0392b)'

              return (
                <div key={key.id} style={{
                  ...panel.container,
                  marginBottom: 12,
                  padding: 20,
                  opacity: status === 'active' ? 1 : 0.7,
                }}>
                  <div className="api-key-row" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}>
                    {/* Left: key info */}
                    <div style={{ flex: 1, minWidth: 250 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 16, fontWeight: 600 }}>{key.name}</span>
                        <span style={statusBadge(statusColor)}>
                          <span style={statusDot(statusColor)} />
                          {status}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--fg-dim)' }}>
                        <span>Key: <code style={{ fontFamily: 'monospace' }}>{key.keyPrefix}...</code></span>
                        {key.tenantName && <span>Tenant: {key.tenantName}</span>}
                        <span>Created by: {key.createdByName}</span>
                        <span>Created: {formatDate(key.createdAt)}</span>
                        <span>Last used: {formatDateTime(key.lastUsedAt)}</span>
                        {key.expiresAt && <span>Expires: {formatDate(key.expiresAt)}</span>}
                      </div>
                      {/* Scopes */}
                      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {key.scopes.map((scope) => (
                          <span key={scope} style={{
                            ...statusBadge('var(--slate-blue, #64748b)'),
                            fontSize: 11,
                            padding: '3px 8px',
                          }}>
                            {SCOPE_LABELS[scope] || scope}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Right: actions */}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {key.isActive && (
                        <button
                          style={{ ...buttons.secondary, fontSize: 12, padding: '6px 12px' }}
                          onClick={() => handleToggleActive(key)}
                        >
                          Revoke
                        </button>
                      )}
                      {!key.isActive && (
                        <button
                          style={{ ...buttons.secondary, fontSize: 12, padding: '6px 12px' }}
                          onClick={() => handleToggleActive(key)}
                        >
                          Reactivate
                        </button>
                      )}
                      <button
                        style={{ ...buttons.danger, fontSize: 12, padding: '6px 12px' }}
                        onClick={() => setDeleteTarget(key)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Delete confirmation ── */}
        {deleteTarget && (
          <ConfirmDialog
            open={!!deleteTarget}
            title="Delete API Key"
            message={'Permanently delete "' + deleteTarget.name + '"? This cannot be undone. Any integrations using this key will immediately lose access.'}
            confirmLabel="Delete Permanently"
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
          />
        )}

        {/* ── Usage info panel ── */}
        <div style={{ ...panel.container, marginTop: 32, backgroundColor: 'var(--bg-soft)' }}>
          <h2 style={{ ...typeography.subtitle, marginBottom: 12 }}>How to Use API Keys</h2>
          <p style={{ ...typeography.muted, marginBottom: 12 }}>
            Include your API key in the <code style={{ fontFamily: 'monospace', backgroundColor: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>x-api-key</code> header of HTTP requests to authenticate API calls.
          </p>
          <div style={{
            ...panel.compact,
            backgroundColor: 'var(--bg)',
            fontFamily: 'monospace',
            fontSize: 13,
            overflowX: 'auto',
          }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{'curl -H "x-api-key: vga_your_key_here" \\\n  https://earth.servers.onl/api/companies'}</pre>
          </div>
          <p style={{ ...typeography.small, marginTop: 12 }}>
            Keys are scoped — they can only access the resources and actions specified in their scope list.
            Keys are hashed using SHA-256 and cannot be recovered if lost.
          </p>
        </div>
      </div>
    </ProtectedLayout>
  )
}