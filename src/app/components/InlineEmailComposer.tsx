'use client'

// ============================================================================
// InlineEmailComposer — Inline email composer for record pages.
// Replaces the old modal-based "Send Email" flow.
//
// Features:
// - Inline form (no modal) — appears below QuickActionBar when "Send Email" clicked
// - Template selector — pick a saved template, auto-fills subject + body
// - Variable substitution — {contact.firstName}, {company.name}, etc. merged on apply
// - Auto-fill recipient from contact/company email
// - Google connection warning (if not connected, show link to Settings)
// - Responsive: full-width on mobile, comfortable on desktop
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '../lib/api'
import { forms, buttons, panel, typeography } from '../lib/styles'
import type { EmailTemplate } from '../lib/types'

// ── Available template variables ──
const TEMPLATE_VARS = [
  { key: '{contact.firstName}', label: 'First name' },
  { key: '{contact.lastName}', label: 'Last name' },
  { key: '{contact.email}', label: 'Email' },
  { key: '{contact.phone}', label: 'Phone' },
  { key: '{contact.title}', label: 'Title' },
  { key: '{company.name}', label: 'Company name' },
  { key: '{company.industry}', label: 'Industry' },
  { key: '{company.website}', label: 'Website' },
  { key: '{deal.title}', label: 'Deal title' },
  { key: '{deal.value}', label: 'Deal value' },
]

interface InlineEmailComposerProps {
  tenantId: string
  companyId?: string
  contactId?: string
  dealId?: string
  toEmail?: string
  contact?: { firstName?: string; lastName?: string; email?: string; phone?: string; title?: string } | null
  company?: { name?: string; industry?: string; website?: string } | null
  deal?: { title?: string; value?: number } | null
  googleConnected?: boolean
  onSent?: () => void
  onCancel?: () => void
}

export default function InlineEmailComposer({
  tenantId,
  companyId,
  contactId,
  dealId,
  toEmail,
  contact,
  company,
  deal,
  googleConnected = false,
  onSent,
  onCancel,
}: InlineEmailComposerProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [form, setForm] = useState({ to: '', subject: '', body: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showVars, setShowVars] = useState(false)
  const [loadedTemplates, setLoadedTemplates] = useState(false)

  // ── Load templates once ──
  useEffect(() => {
    if (loadedTemplates) return
    setLoadedTemplates(true)
    apiFetch<{ data: EmailTemplate[] }>('/api/email/templates?limit=100')
      .then((res) => setTemplates(res.data || []))
      .catch(() => {})
  }, [loadedTemplates])

  // ── Auto-fill recipient on mount ──
  useEffect(() => {
    if (toEmail && !form.to) {
      setForm((prev) => ({ ...prev, to: toEmail }))
    }
  }, [toEmail])

  // ── Variable substitution ──
  const replaceVars = useCallback((text: string) => {
    return text
      .replace(/\{contact\.firstName\}/g, contact?.firstName || '')
      .replace(/\{contact\.lastName\}/g, contact?.lastName || '')
      .replace(/\{contact\.email\}/g, contact?.email || '')
      .replace(/\{contact\.phone\}/g, contact?.phone || '')
      .replace(/\{contact\.title\}/g, contact?.title || '')
      .replace(/\{company\.name\}/g, company?.name || '')
      .replace(/\{company\.industry\}/g, company?.industry || '')
      .replace(/\{company\.website\}/g, company?.website || '')
      .replace(/\{deal\.title\}/g, deal?.title || '')
      .replace(/\{deal\.value\}/g, deal?.value ? String(deal.value) : '')
  }, [contact, company, deal])

  // ── Apply a template ──
  const applyTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl) return
    setForm((prev) => ({
      ...prev,
      subject: replaceVars(tpl.subject),
      body: replaceVars(tpl.body),
    }))
  }

  // ── Insert a variable at cursor position in body ──
  const insertVar = (key: string) => {
    setForm((prev) => ({ ...prev, body: prev.body + key }))
  }

  // ── Send email ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.to.trim() || !form.subject.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        tenantId,
        to: [form.to],
        subject: form.subject,
        body: form.body,
      }
      if (companyId) body.companyId = companyId
      if (contactId) body.contactId = contactId
      if (dealId) body.dealId = dealId

      await apiFetch('/api/email/send', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setForm({ to: '', subject: '', body: '' })
      onSent?.()
    } catch (err: any) {
      setError(err.message || 'Failed to send email')
    } finally {
      setSubmitting(false)
    }
  }

  const canSend = googleConnected && form.to.trim() && form.subject.trim() && !submitting

  return (
    <div
      className="panel-container"
      style={{
        ...panel.container,
        padding: 20,
        animation: 'slideUp 0.2s ease',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>✉️</span>
          <h3 style={{ ...typeography.subtitle, margin: 0 }}>Send Email</h3>
        </div>
        {onCancel && (
          <button
            type="button"
            className="btn-touch"
            style={{ ...buttons.secondary, padding: '6px 12px', fontSize: 13 }}
            onClick={onCancel}
          >
            ✕ Cancel
          </button>
        )}
      </div>

      {/* Google not connected warning */}
      {!googleConnected && (
        <div style={{
          backgroundColor: 'rgba(239,68,68,0.12)',
          color: 'var(--rust)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          fontSize: 13,
        }}>
          Google account not connected.{' '}
          <Link href="/settings" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>
            Connect in Settings
          </Link>{' '}
          to send email.
        </div>
      )}

      {error && (
        <div style={{
          backgroundColor: 'rgba(239,68,68,0.12)',
          color: 'var(--rust)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Template selector */}
        {templates.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <label style={{ ...forms.group, flex: 1 }}>
              <span style={forms.label}>Template (optional)</span>
              <select
                className="form-select"
                style={forms.select}
                value=""
                onChange={(e) => { if (e.target.value) applyTemplate(e.target.value) }}
              >
                <option value="">Choose a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            {/* Variable inserter toggle */}
            <button
              type="button"
              className="btn-touch"
              style={{
                ...buttons.secondary,
                padding: '10px 14px',
                whiteSpace: 'nowrap',
                fontSize: 13,
              }}
              onClick={() => setShowVars(!showVars)}
            >
              {showVars ? '▲ Hide vars' : '▼ Insert variable'}
            </button>
          </div>
        )}

        {/* Variable chips (collapsible) */}
        {showVars && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            padding: '10px 12px',
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--panel-border)',
            borderRadius: 8,
          }}>
            {TEMPLATE_VARS.map((v) => (
              <button
                key={v.key}
                type="button"
                className="btn-touch"
                style={{
                  backgroundColor: 'var(--panel-elevated)',
                  color: 'var(--fg-dim)',
                  border: '1px solid var(--panel-border)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => insertVar(v.key)}
                title={`Insert ${v.label}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}

        {/* To field */}
        <label style={forms.group}>
          <span style={forms.label}>To</span>
          <input
            className="form-input"
            style={forms.input}
            type="email"
            required
            placeholder="recipient@example.com"
            value={form.to}
            onChange={(e) => setForm({ ...form, to: e.target.value })}
          />
        </label>

        {/* Subject field */}
        <label style={forms.group}>
          <span style={forms.label}>Subject</span>
          <input
            className="form-input"
            style={forms.input}
            required
            placeholder="Email subject"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
        </label>

        {/* Body field */}
        <label style={forms.group}>
          <span style={forms.label}>Body</span>
          <textarea
            className="form-textarea"
            style={{ ...forms.textarea, minHeight: 120 }}
            rows={6}
            placeholder="Write your email…"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </label>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 4 }}>
          {onCancel && (
            <button type="button" className="btn-touch" style={buttons.secondary} onClick={onCancel}>
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="btn-touch"
            style={{ ...buttons.primary, opacity: canSend ? 1 : 0.5 }}
            disabled={!canSend}
          >
            {submitting ? 'Sending…' : 'Send Email'}
          </button>
        </div>
      </form>
    </div>
  )
}