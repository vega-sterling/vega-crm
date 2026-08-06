'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import ConfirmDialog from '../components/ConfirmDialog'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, table, statusBadge } from '../lib/styles'
import type { Deal } from '../lib/types'

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
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

const formatDate = (d?: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const statusColor = (status: Quote['status']) => {
  switch (status) {
    case 'ACCEPTED': return 'var(--emerald)'
    case 'SENT': return 'var(--blue)'
    case 'REJECTED': return 'var(--rust)'
    case 'EXPIRED': return 'var(--rust)'
    default: return 'var(--fg-dim)'
  }
}

interface QuotesResponse {
  data: Quote[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

function QuotesContent() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)

  const [form, setForm] = useState({
    dealId: '',
    notes: '',
    validUntil: '',
  })
  const [lineItems, setLineItems] = useState<{ description: string; quantity: string; unitPrice: string }[]>([
    { description: '', quantity: '1', unitPrice: '' },
  ])

  const load = useCallback(async () => {
    try {
      const [quotesRes, dealsRes] = await Promise.all([
        apiFetch<QuotesResponse>('/api/quotes'),
        apiFetch<{ deals?: Deal[] }>('/api/deals'),
      ])
      setQuotes(quotesRes.data || [])
      setDeals(dealsRes.deals || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load quotes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const selectedDeal = useMemo(() => deals.find((d) => d.id === form.dealId), [deals, form.dealId])

  const parsedLineItems = useMemo(
    () =>
      lineItems.map((item) => ({
        description: item.description,
        quantity: Math.max(0, Number(item.quantity) || 0),
        unitPrice: Math.max(0, Number(item.unitPrice) || 0),
        total: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
      })),
    [lineItems]
  )

  const subtotal = useMemo(
    () => parsedLineItems.reduce((sum, item) => sum + item.total, 0),
    [parsedLineItems]
  )
  const total = subtotal

  const openNew = () => {
    setForm({ dealId: deals[0]?.id || '', notes: '', validUntil: '' })
    setLineItems([{ description: '', quantity: '1', unitPrice: '' }])
    setShowNew(true)
  }

  const updateLineItem = (index: number, field: keyof typeof lineItems[number], value: string) => {
    setLineItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { description: '', quantity: '1', unitPrice: '' }])
  }

  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDeal) {
      setError('Select a deal')
      return
    }
    const validItems = parsedLineItems.filter((item) => item.description.trim() !== '')
    if (validItems.length === 0) {
      setError('Add at least one line item')
      return
    }
    setSubmitting(true)
    try {
      const body = {
        dealId: selectedDeal.id,
        tenantId: selectedDeal.tenantId,
        notes: form.notes || null,
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
        lineItems: validItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      }
      const created = await apiFetch<Quote>('/api/quotes', { method: 'POST', body: JSON.stringify(body) })
      setQuotes((prev) => [created, ...prev])
      setShowNew(false)
      setError('')
    } catch (err: any) {
      setError(err.message || 'Failed to create quote')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = (quote: Quote) => {
    setConfirmDelete(quote)
  }

  const performDelete = async (quote: any) => {
    try {
      await apiFetch<{ success: boolean }>(`/api/quotes/${quote.id}`, { method: 'DELETE' })
      setQuotes((prev) => prev.filter((q) => q.id !== quote.id))
    } catch (err: any) {
      setError(err.message || 'Failed to delete quote')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div style={layout.page}>
      <div style={layout.header}>
        <div>
          <h1 style={{ ...typeography.title, marginBottom: 4 }}>Quotes & Proposals</h1>
          <div style={{ color: 'var(--fg-dim)', fontSize: 14 }}>
            {quotes.length} quote{quotes.length === 1 ? '' : 's'} · Total {currencyFmt(quotes.reduce((sum, q) => sum + (q.total || 0), 0))}
          </div>
        </div>
        <button style={buttons.primary} onClick={openNew}>+ New Quote</button>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div style={panel.compact}>
        {quotes.length === 0 ? (
          <p style={typeography.muted}>No quotes yet. Create your first quote to get started.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>Quote #</th>
                  <th style={table.th}>Deal</th>
                  <th style={table.th}>Status</th>
                  <th style={{ ...table.th, textAlign: 'right' }}>Total</th>
                  <th style={table.th}>Valid Until</th>
                  <th style={table.th}>Created</th>
                  <th style={table.th}></th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id} style={table.tr}>
                    <td style={table.td}>
                      <div style={{ fontWeight: 600 }}>{quote.number}</div>
                      <div style={typeography.small}>{quote.tenant?.name || '—'}</div>
                    </td>
                    <td style={table.td}>{quote.deal?.title || '—'}</td>
                    <td style={table.td}>
                      <span style={statusBadge(statusColor(quote.status))}>{quote.status}</span>
                    </td>
                    <td style={{ ...table.td, textAlign: 'right', fontWeight: 700, color: 'var(--gold)' }}>
                      {currencyFmt(quote.total || 0)}
                    </td>
                    <td style={table.td}>{formatDate(quote.validUntil)}</td>
                    <td style={table.td}>{formatDate(quote.createdAt)}</td>
                    <td style={table.td}>
                      <button style={buttons.danger} onClick={() => handleDelete(quote)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setShowNew(false)}
        >
          <div style={{ ...panel.container, width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...layout.header, marginBottom: 16 }}>
              <h2 style={{ ...typeography.subtitle, margin: 0 }}>New Quote</h2>
              <button style={{ ...buttons.small, fontSize: 16 }} onClick={() => setShowNew(false)}>✕</button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Deal</span>
                <select style={forms.select} value={form.dealId} onChange={(e) => setForm({ ...form, dealId: e.target.value })}>
                  <option value="">Select a deal</option>
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </label>

              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Valid Until</span>
                  <input style={forms.input} type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
                </label>
              </div>

              <label style={forms.group}>
                <span style={forms.label}>Notes</span>
                <textarea style={forms.textarea} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>

              <div>
                <div style={{ ...layout.header, marginBottom: 12 }}>
                  <h3 style={{ ...typeography.subtitle, margin: 0, fontSize: 16 }}>Line Items</h3>
                  <button type="button" style={buttons.small} onClick={addLineItem}>+ Add row</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {lineItems.map((item, index) => (
                    <div key={index} style={{ ...forms.row, alignItems: 'end' }}>
                      <label style={{ ...forms.group, flex: 2 }}>
                        <span style={forms.label}>Description</span>
                        <input
                          style={forms.input}
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          placeholder="Item description"
                        />
                      </label>
                      <label style={forms.group}>
                        <span style={forms.label}>Qty</span>
                        <input
                          style={forms.input}
                          type="number"
                          min={0}
                          step="any"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                        />
                      </label>
                      <label style={forms.group}>
                        <span style={forms.label}>Unit Price</span>
                        <input
                          style={forms.input}
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItem(index, 'unitPrice', e.target.value)}
                        />
                      </label>
                      <label style={forms.group}>
                        <span style={forms.label}>Total</span>
                        <input
                          style={{ ...forms.input, color: 'var(--fg-dim)' }}
                          type="text"
                          readOnly
                          value={currencyFmt(parsedLineItems[index]?.total || 0)}
                        />
                      </label>
                      <button type="button" style={buttons.danger} onClick={() => removeLineItem(index)} disabled={lineItems.length === 1}>Remove</button>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--panel-border)' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={typeography.small}>Subtotal</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{currencyFmt(subtotal)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={typeography.small}>Total</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>{currencyFmt(total)}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Creating...' : 'Create Quote'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Quote?"
        itemName={confirmDelete?.number}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => { performDelete(confirmDelete); setConfirmDelete(null) }}
      />
    </div>
  )
}

export default function QuotesPage() {
  return (
    <ProtectedLayout>
      <QuotesContent />
    </ProtectedLayout>
  )
}
