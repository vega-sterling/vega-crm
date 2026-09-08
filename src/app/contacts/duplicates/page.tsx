'use client'

// ============================================================================
// File: src/app/contacts/duplicates/page.tsx
// Description: Phase 39 — Duplicate contact detection & merge UI
//              (HubSpot 'manage duplicates' standard). Loads grouped duplicate
//              pairs from GET /api/contacts/duplicates, shows each group as a
//              card with the two contacts side-by-side, and lets the user
//              pick which one to keep. ConfirmDialog guards the destructive
//              merge (duplicate is deleted, all children re-pointed).
//              Inline styles + CSS variables, responsive per the standard.
// ============================================================================

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import Avatar from '../../components/Avatar'
import ConfirmDialog from '../../components/ConfirmDialog'
import { IconMail, IconPhone, IconArrowLeft } from '../../components/Icons'
import { useToast } from '../../components/Toast'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, buttons } from '../../lib/styles'

interface DupContact {
  id: string
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  mobile?: string | null
  title?: string | null
  isActive: boolean
  createdAt: string
  company?: { id: string; name: string } | null
}

interface DupGroup {
  type: 'email' | 'name'
  contacts: DupContact[]
}

interface PendingMerge {
  group: DupGroup
  primary: DupContact
  duplicate: DupContact
}

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function DuplicatesContent() {
  const [groups, setGroups] = useState<DupGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<PendingMerge | null>(null)
  const [pendingMessage, setPendingMessage] = useState('')
  const [merging, setMerging] = useState(false)
  const showToast = useToast()

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: DupGroup[] }>('/api/contacts/duplicates')
      setGroups(res.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to scan for duplicates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const askMerge = (group: DupGroup, primary: DupContact) => {
    // With 2 contacts the other one is the duplicate; groups are pairs by construction
    const duplicate = group.contacts.find((c) => c.id !== primary.id)
    if (!duplicate) return
    setPending({ group, primary, duplicate })
    setPendingMessage(
      `Merge ${duplicate.firstName} ${duplicate.lastName} into ${primary.firstName} ${primary.lastName}? ` +
      `The duplicate will be deleted and all of its activities, emails, tasks, deals, enrollments, events and bookings will move to the kept contact. Missing details are copied over. This action cannot be undone.`
    )
  }

  const performMerge = async () => {
    if (!pending) return
    const { group, primary, duplicate } = pending
    setPending(null)
    setMerging(true)
    try {
      await apiFetch('/api/contacts/merge', {
        method: 'POST',
        body: JSON.stringify({ primaryId: primary.id, duplicateId: duplicate.id }),
      })
      showToast(`✓ Merged ${duplicate.firstName} ${duplicate.lastName} into ${primary.firstName} ${primary.lastName}`, { type: 'success' })
      setGroups((prev) => prev.filter((g) => g !== group))
    } catch (err: any) {
      showToast(`✗ ${err.message || 'Merge failed'}`, { type: 'error' })
    } finally {
      setMerging(false)
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>
  }

  return (
    <div style={layout.page}>
      {/* ── Header ── */}
      <div style={layout.header}>
        <div>
          <h1 style={{ ...typeography.title, marginBottom: 4 }}>Find &amp; Merge Duplicate Contacts</h1>
          <div style={typeography.muted}>
            Contacts are matched by identical email address or by the same name within a company.
          </div>
        </div>
        <Link href="/contacts" className="btn-touch" style={{ ...buttons.secondary, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <IconArrowLeft size={14} /> Back to Contacts
        </Link>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(184,80,74,0.12)', color: 'var(--rust)', border: '1px solid rgba(184,80,74,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>{error}</div>
      )}

      {/* ── Empty state ── */}
      {groups.length === 0 && !error && (
        <div className="panel-container" style={{ ...panel.container, textAlign: 'center', padding: '64px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
          <h2 style={{ ...typeography.subtitle, marginBottom: 8 }}>No duplicates found</h2>
          <p style={typeography.muted}>Nice — your contact list is clean. We&apos;ll keep watching for contacts that share an email address or a name within the same company.</p>
        </div>
      )}

      {/* ── Duplicate groups ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {groups.map((group, gi) => (
          <div key={gi} className="panel-container" style={panel.container}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--panel-border)' }}>
              <span style={{
                fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600,
                color: 'var(--gold)', backgroundColor: 'rgba(184,146,74,0.12)', border: '1px solid rgba(184,146,74,0.3)',
                borderRadius: 6, padding: '3px 8px',
              }}>
                {group.type === 'email' ? 'Identical email' : 'Same name + company'}
              </span>
              <span style={typeography.small}>Matched by {group.type === 'email' ? 'identical email address' : 'same name within the same company'}</span>
            </div>
            <div className="dup-pair-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {group.contacts.map((c) => (
                <div key={c.id} style={{
                  backgroundColor: 'var(--bg)', border: '1px solid var(--panel-border)', borderRadius: 10,
                  padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={`${c.firstName} ${c.lastName}`} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--fg)' }}>{c.firstName} {c.lastName}</div>
                      <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{c.title || 'No title'}</div>
                    </div>
                    {!c.isActive && (
                      <span style={{
                        marginLeft: 'auto', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700,
                        color: 'var(--fg-dim)', backgroundColor: 'var(--panel-elevated)', border: '1px solid var(--panel-border)',
                        borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap',
                      }}>Archived</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--fg-dim)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {c.email && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconMail size={12} /> {c.email}</span>}
                    {(c.phone || c.mobile) && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconPhone size={12} /> {c.phone || c.mobile}</span>}
                    <span>{c.company?.name || 'No company'}</span>
                    <span style={{ color: 'var(--fg-dimmer)' }}>Created {formatDate(c.createdAt)}</span>
                  </div>
                  <button
                    className="btn-touch dup-keep-btn"
                    style={{ ...buttons.primary, marginTop: 'auto', width: '100%', minHeight: 44, fontSize: 15, opacity: merging ? 0.6 : 1 }}
                    disabled={merging}
                    onClick={() => askMerge(group, c)}
                  >
                    Keep this one
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Merge confirmation ── */}
      <ConfirmDialog
        open={!!pending}
        title="Merge duplicate contacts?"
        confirmLabel="Merge"
        message={pending ? pendingMessage : undefined}
        onCancel={() => setPending(null)}
        onConfirm={performMerge}
      />
    </div>
  )
}

export default function DuplicatesPage() {
  return <ProtectedLayout><DuplicatesContent /></ProtectedLayout>
}