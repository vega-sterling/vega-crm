'use client'

// ============================================================================
// File: src/app/quotes/[id]/page.tsx
// Description: Quote Detail Page — document-style view with line items table,
//              status progression bar, inline editing, totals summary.
//
//              Phase 29: HubSpot/Salesforce-style quote detail page.
//              Left: Quote properties (status, valid until, deal, notes)
//              Main: Line items table with inline editing + totals
//              Responsive: 2-col desktop, single-col tablet/phone.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import ConfirmDialog from '../../components/ConfirmDialog'
import { IconArrowLeft, IconFileText, IconPlus, IconTrash, IconX, IconEdit, IconCheckSquare } from '../../components/Icons'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, table, statusBadge, statusDot } from '../../lib/styles'

interface QuoteLineItem {
  id?: string
  description: string
  quantity: number
  unitPrice: number
  total: number
}

interface Quote {
  id: string
  dealId: string
  tenantId: string
  number: string
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  notes?: string | null
  validUntil?: string | null
  sentAt?: string | null
  acceptedAt?: string | null
  createdAt: string
  updatedAt: string
  deal?: { id: string; title: string } | null
  tenant?: { id: string; name: string } | null
  lineItems?: QuoteLineItem[]
}

const currencyFmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0)

const formatDate = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatDateInput = (d?: string | null) => {
  if (!d) return ''
  return new Date(d).toISOString().slice(0, 10)
}

const statusColor = (status: string) => {
  switch (status) {
    case 'ACCEPTED': return 'var(--emerald)'
    case 'SENT': return 'var(--blue)'
    case 'REJECTED': return 'var(--rust)'
    case 'EXPIRED': return 'var(--rust)'
    default: return 'var(--fg-dim)'
  }
}

const STATUS_STEPS = ['DRAFT', 'SENT', 'ACCEPTED'] as const

function QuoteDetailContent() {
  const params = useParams()
  const router = useRouter()
  const quoteId = params.id as string

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Inline edit states
  const [editingLineItems, setEditingLineItems] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [lineItemsDraft, setLineItemsDraft] = useState<{ description: string; quantity: string; unitPrice: string }[]>([])

  const loadQuote = useCallback(async () => {
    try {
      const data = await apiFetch<Quote>(`/api/quotes/${quoteId}`)
      setQuote(data)
      setNotesDraft(data.notes || '')
    } catch (err: any) {
      setError(err.message || 'Failed to load quote')
    } finally {
      setLoading(false)
    }
  }, [quoteId])

  useEffect(() => {
    loadQuote()
  }, [loadQuote])

  // ── Status update ──
  const updateStatus = async (newStatus: Quote['status']) => {
    if (!quote || quote.status === newStatus) return
    setSaving(true)
    try {
      const updated = await apiFetch<Quote>(`/api/quotes/${quoteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      setQuote(updated)
    } catch (err: any) {
      setError(err.message || 'Failed to update status')
    } finally {
      setSaving(false)
    }
  }

  // ── Valid Until update ──
  const updateValidUntil = async (value: string) => {
    if (!quote) return
    setSaving(true)
    try {
      const updated = await apiFetch<Quote>(`/api/quotes/${quoteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ validUntil: value ? new Date(value).toISOString() : null }),
      })
      setQuote(updated)
    } catch (err: any) {
      setError(err.message || 'Failed to update date')
    } finally {
      setSaving(false)
    }
  }

  // ── Notes save ──
  const saveNotes = async () => {
    if (!quote) return
    setSaving(true)
    try {
      const updated = await apiFetch<Quote>(`/api/quotes/${quoteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: notesDraft || null }),
      })
      setQuote(updated)
      setEditingNotes(false)
    } catch (err: any) {
      setError(err.message || 'Failed to save notes')
    } finally {
      setSaving(false)
    }
  }

  // ── Line items editing ──
  const startEditLineItems = () => {
    if (!quote?.lineItems) return
    setLineItemsDraft(
      quote.lineItems.map((item) => ({
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
      }))
    )
    if (lineItemsDraft.length === 0) {
      setLineItemsDraft([{ description: '', quantity: '1', unitPrice: '' }])
    }
    setEditingLineItems(true)
  }

  const updateLineItemDraft = (index: number, field: string, value: string) => {
    setLineItemsDraft((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const addLineItemDraft = () => {
    setLineItemsDraft((prev) => [...prev, { description: '', quantity: '1', unitPrice: '' }])
  }

  const removeLineItemDraft = (index: number) => {
    setLineItemsDraft((prev) => prev.filter((_, i) => i !== index))
  }

  const saveLineItems = async () => {
    if (!quote) return
    const validItems = lineItemsDraft
      .filter((item) => item.description.trim() !== '')
      .map((item) => ({
        description: item.description,
        quantity: Math.max(0, Number(item.quantity) || 0),
        unitPrice: Math.max(0, Number(item.unitPrice) || 0),
      }))
    if (validItems.length === 0) {
      setError('At least one line item is required')
      return
    }
    setSaving(true)
    try {
      const updated = await apiFetch<Quote>(`/api/quotes/${quoteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ lineItems: validItems }),
      })
      setQuote(updated)
      setEditingLineItems(false)
    } catch (err: any) {
      setError(err.message || 'Failed to save line items')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete quote ──
  const performDelete = async () => {
    try {
      await apiFetch(`/api/quotes/${quoteId}`, { method: 'DELETE' })
      router.push('/quotes')
    } catch (err: any) {
      setError(err.message || 'Failed to delete quote')
    }
  }

  // ── Computed ──
  const draftLineItemsParsed = useMemo(
    () =>
      lineItemsDraft.map((item) => ({
        description: item.description,
        quantity: Math.max(0, Number(item.quantity) || 0),
        unitPrice: Math.max(0, Number(item.unitPrice) || 0),
        total: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
      })),
    [lineItemsDraft]
  )

  const draftSubtotal = useMemo(
    () => draftLineItemsParsed.reduce((sum, item) => sum + item.total, 0),
    [draftLineItemsParsed]
  )

  if (loading) {
    return (
      <ProtectedLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
          <Spinner size={32} />
        </div>
      </ProtectedLayout>
    )
  }

  if (error && !quote) {
    return (
      <ProtectedLayout>
        <div style={layout.page}>
          <div style={{ ...panel.container, textAlign: 'center', padding: 48 }}>
            <p style={{ color: 'var(--rust)', fontSize: 16, marginBottom: 16 }}>{error}</p>
            <Link href="/quotes" style={buttons.secondary}>← Back to Quotes</Link>
          </div>
        </div>
      </ProtectedLayout>
    )
  }

  if (!quote) return null

  // ── Status progression bar ──
  const currentStepIndex = STATUS_STEPS.indexOf(quote.status as typeof STATUS_STEPS[number])
  const isRejected = quote.status === 'REJECTED'
  const isExpired = quote.status === 'EXPIRED'

  return (
    <ProtectedLayout>
      <div style={layout.page}>
        {/* ── Header ── */}
        <div style={{ ...layout.header, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link href="/quotes" style={{ ...buttons.secondary, display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
              <IconArrowLeft size={16} />
            </Link>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconFileText size={28} />
                <h1 style={{ ...typeography.title, margin: 0, fontSize: 32 }}>{quote.number}</h1>
                <span style={statusBadge(statusColor(quote.status))}>{quote.status}</span>
              </div>
              <div style={{ color: 'var(--fg-dim)', fontSize: 14, marginTop: 4 }}>
                {quote.deal && (
                  <Link href={`/deals/${quote.deal.id}`} style={{ color: 'var(--gold)', textDecoration: 'none', fontWeight: 500 }}>
                    {quote.deal.title}
                  </Link>
                )}
                {quote.tenant && <span> · {quote.tenant.name}</span>}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
            {error}
          </div>
        )}

        {/* ── Status Progression Bar ── */}
        <div className="panel-container" style={{ ...panel.container, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, padding: '8px 0', flexWrap: 'wrap' }}>
            {STATUS_STEPS.map((step, idx) => {
              const isCompleted = currentStepIndex >= 0 && idx <= currentStepIndex
              const isCurrent = currentStepIndex === idx
              const stepColor = isRejected || isExpired ? 'var(--rust)' : isCompleted ? 'var(--emerald)' : 'var(--fg-dim)'
              return (
                <div key={step} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: isCurrent ? stepColor : isCompleted ? `${stepColor}22` : 'var(--panel-elevated)',
                      border: `2px solid ${stepColor}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: stepColor,
                      fontSize: 14,
                      fontWeight: 700,
                      transition: 'all 0.2s',
                    }}>
                      {isCompleted && !isCurrent ? '✓' : idx + 1}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 400, color: isCurrent ? stepColor : 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {step}
                    </span>
                  </div>
                  {idx < STATUS_STEPS.length - 1 && (
                    <div style={{
                      width: 60,
                      height: 2,
                      backgroundColor: currentStepIndex > idx ? 'var(--emerald)' : 'var(--panel-border)',
                      margin: '0 8px',
                      marginBottom: 22,
                      transition: 'background 0.2s',
                    }} />
                  )}
                </div>
              )
            })}
            {(isRejected || isExpired) && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginLeft: 16 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  backgroundColor: 'rgba(239,68,68,0.12)', border: '2px solid var(--rust)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--rust)', fontSize: 14, fontWeight: 700,
                }}>✕</div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--rust)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {quote.status}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── 2-column layout ── */}
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: '300px 1fr' }} className="quote-2col">
          {/* ── LEFT: Properties ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Quote Info */}
            <div className="panel-container" style={panel.container}>
              <h2 style={{ ...typeography.subtitle, fontSize: 16, marginBottom: 16 }}>Quote Details</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Status */}
                <div>
                  <label style={forms.label}>Status</label>
                  <select
                    style={forms.select}
                    value={quote.status}
                    onChange={(e) => updateStatus(e.target.value as Quote['status'])}
                    disabled={saving}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="SENT">Sent</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="EXPIRED">Expired</option>
                  </select>
                </div>

                {/* Valid Until */}
                <div>
                  <label style={forms.label}>Valid Until</label>
                  <input
                    style={forms.input}
                    type="date"
                    value={formatDateInput(quote.validUntil)}
                    onChange={(e) => updateValidUntil(e.target.value)}
                    disabled={saving}
                  />
                </div>

                {/* Created */}
                <div>
                  <label style={forms.label}>Created</label>
                  <div style={{ fontSize: 14, color: 'var(--fg)', padding: '8px 0' }}>{formatDate(quote.createdAt)}</div>
                </div>

                {/* Sent At */}
                {quote.sentAt && (
                  <div>
                    <label style={forms.label}>Sent Date</label>
                    <div style={{ fontSize: 14, color: 'var(--blue)', padding: '8px 0' }}>{formatDate(quote.sentAt)}</div>
                  </div>
                )}

                {/* Accepted At */}
                {quote.acceptedAt && (
                  <div>
                    <label style={forms.label}>Accepted Date</label>
                    <div style={{ fontSize: 14, color: 'var(--emerald)', padding: '8px 0' }}>{formatDate(quote.acceptedAt)}</div>
                  </div>
                )}

                {/* Deal Link */}
                {quote.deal && (
                  <div>
                    <label style={forms.label}>Deal</label>
                    <Link href={`/deals/${quote.deal.id}`} style={{
                      display: 'block',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--panel-border)',
                      textDecoration: 'none',
                      color: 'var(--fg)',
                      fontWeight: 600,
                      fontSize: 14,
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.background = 'var(--bg-soft)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--panel-border)'; e.currentTarget.style.background = 'transparent' }}
                    >
                      💠 {quote.deal.title}
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="panel-container" style={panel.container}>
              <div style={{ ...layout.header, marginBottom: 12 }}>
                <h2 style={{ ...typeography.subtitle, fontSize: 16, margin: 0 }}>Notes</h2>
                {!editingNotes ? (
                  <button style={buttons.small} onClick={() => setEditingNotes(true)}>Edit</button>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={buttons.small} onClick={() => { setEditingNotes(false); setNotesDraft(quote.notes || '') }}>Cancel</button>
                    <button style={{ ...buttons.small, backgroundColor: 'var(--gold)', color: 'var(--bg)', border: 'none' }} onClick={saveNotes} disabled={saving}>Save</button>
                  </div>
                )}
              </div>
              {editingNotes ? (
                <textarea
                  style={{ ...forms.textarea, minHeight: 100 }}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Add notes about this quote..."
                />
              ) : (
                <p style={{ ...typeography.muted, fontSize: 14, whiteSpace: 'pre-wrap' }}>
                  {quote.notes || 'No notes added.'}
                </p>
              )}
            </div>

            {/* Delete */}
            <button style={{ ...buttons.danger, width: '100%' }} onClick={() => setConfirmDelete(true)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <IconTrash size={16} /> Delete Quote
              </span>
            </button>
          </div>

          {/* ── RIGHT: Line Items + Totals ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="panel-container" style={panel.container}>
              <div style={{ ...layout.header, marginBottom: 16 }}>
                <h2 style={{ ...typeography.subtitle, fontSize: 18, margin: 0 }}>Line Items</h2>
                {!editingLineItems ? (
                  <button style={buttons.secondary} onClick={startEditLineItems}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <IconEdit size={14} /> Edit Items
                    </span>
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={buttons.secondary} onClick={() => setEditingLineItems(false)}>Cancel</button>
                    <button style={{ ...buttons.primary, display: 'flex', alignItems: 'center', gap: 6 }} onClick={saveLineItems} disabled={saving}>
                      <IconCheckSquare size={16} /> {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              {!editingLineItems ? (
                /* ── Read-only line items table ── */
                <div style={{ overflowX: 'auto' }}>
                  {quote.lineItems && quote.lineItems.length > 0 ? (
                    <table style={table.table}>
                      <thead>
                        <tr>
                          <th style={table.th}>Description</th>
                          <th style={{ ...table.th, textAlign: 'right' }}>Qty</th>
                          <th style={{ ...table.th, textAlign: 'right' }}>Unit Price</th>
                          <th style={{ ...table.th, textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quote.lineItems.map((item, idx) => (
                          <tr key={item.id || idx} style={table.tr}>
                            <td style={table.td}>{item.description}</td>
                            <td style={{ ...table.td, textAlign: 'right' }}>{item.quantity}</td>
                            <td style={{ ...table.td, textAlign: 'right' }}>{currencyFmt(item.unitPrice)}</td>
                            <td style={{ ...table.td, textAlign: 'right', fontWeight: 600 }}>{currencyFmt(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p style={typeography.muted}>No line items yet. Click "Edit Items" to add some.</p>
                  )}
                </div>
              ) : (
                /* ── Editable line items ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {lineItemsDraft.map((item, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 120px 120px 40px', gap: 8, alignItems: 'end' }} className="line-item-row">
                      <label style={forms.group}>
                        {index === 0 && <span style={forms.label}>Description</span>}
                        <input
                          style={forms.input}
                          value={item.description}
                          onChange={(e) => updateLineItemDraft(index, 'description', e.target.value)}
                          placeholder="Item description"
                        />
                      </label>
                      <label style={forms.group}>
                        {index === 0 && <span style={forms.label}>Qty</span>}
                        <input
                          style={forms.input}
                          type="number"
                          min={0}
                          step="any"
                          value={item.quantity}
                          onChange={(e) => updateLineItemDraft(index, 'quantity', e.target.value)}
                        />
                      </label>
                      <label style={forms.group}>
                        {index === 0 && <span style={forms.label}>Unit Price</span>}
                        <input
                          style={forms.input}
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItemDraft(index, 'unitPrice', e.target.value)}
                        />
                      </label>
                      <div style={forms.group}>
                        {index === 0 && <span style={forms.label}>Total</span>}
                        <div style={{ ...forms.input, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          {currencyFmt(draftLineItemsParsed[index]?.total || 0)}
                        </div>
                      </div>
                      <button
                        type="button"
                        style={{ ...buttons.danger, padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => removeLineItemDraft(index)}
                        disabled={lineItemsDraft.length === 1}
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  ))}
                  <button type="button" style={{ ...buttons.secondary, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }} onClick={addLineItemDraft}>
                    <IconPlus size={16} /> Add Line Item
                  </button>
                </div>
              )}

              {/* ── Totals ── */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--panel-border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 240 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={typeography.muted}>Subtotal</span>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>
                      {currencyFmt(editingLineItems ? draftSubtotal : quote.subtotal)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={typeography.muted}>Tax ({(editingLineItems ? 0 : quote.taxRate || 0)}%)</span>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>
                      {currencyFmt(editingLineItems ? 0 : quote.taxAmount)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--panel-border)', marginTop: 4 }}>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>Total</span>
                    <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--gold)' }}>
                      {currencyFmt(editingLineItems ? draftSubtotal : quote.total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Quote?"
        itemName={quote.number}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); performDelete() }}
      />
    </ProtectedLayout>
  )
}

export default function QuoteDetailPage() {
  return <QuoteDetailContent />
}