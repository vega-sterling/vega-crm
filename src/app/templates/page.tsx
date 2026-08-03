'use client'

import { useEffect, useState, useCallback } from 'react'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, statusBadge } from '../lib/styles'
import type { EmailTemplate, EmailSequence, Contact } from '../lib/types'

const TEMPLATE_VARS = [
  { key: '{contact.firstName}', label: 'Contact first name' },
  { key: '{contact.lastName}', label: 'Contact last name' },
  { key: '{company.name}', label: 'Company name' },
  { key: '{company.industry}', label: 'Company industry' },
]

function TemplatesContent() {
  const [tab, setTab] = useState<'templates' | 'sequences'>('templates')
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [sequences, setSequences] = useState<EmailSequence[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [templateModal, setTemplateModal] = useState<EmailTemplate | null>(null)
  const [sequenceModal, setSequenceModal] = useState<EmailSequence | null>(null)
  const [enrollSequence, setEnrollSequence] = useState<EmailSequence | null>(null)
  const [enrollContactId, setEnrollContactId] = useState('')

  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', body: '' })
  const [sequenceForm, setSequenceForm] = useState<{
    name: string
    description: string
    steps: { subject: string; body: string; delayDays: number }[]
  }>({ name: '', description: '', steps: [{ subject: '', body: '', delayDays: 1 }] })

  const load = useCallback(async () => {
    try {
      const [templatesRes, sequencesRes, contactsRes] = await Promise.all([
        apiFetch<{ data: EmailTemplate[] }>('/api/email/templates'),
        apiFetch<{ data: EmailSequence[] }>('/api/email/sequences'),
        apiFetch<{ data: Contact[] }>('/api/contacts'),
      ])
      setTemplates(templatesRes.data || [])
      setSequences(sequencesRes.data || [])
      setContacts(contactsRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openTemplate = (t?: EmailTemplate) => {
    if (t) {
      setTemplateForm({ name: t.name, subject: t.subject, body: t.body })
    } else {
      setTemplateForm({ name: '', subject: '', body: '' })
    }
    setTemplateModal(t || ({} as EmailTemplate))
  }

  const openSequence = (s?: EmailSequence) => {
    if (s) {
      setSequenceForm({ name: s.name, description: s.description || '', steps: s.steps.length ? s.steps : [{ subject: '', body: '', delayDays: 1 }] })
    } else {
      setSequenceForm({ name: '', description: '', steps: [{ subject: '', body: '', delayDays: 1 }] })
    }
    setSequenceModal(s || ({} as EmailSequence))
  }

  const insertVar = (key: string) => {
    setTemplateForm((prev) => ({ ...prev, body: prev.body + key }))
  }

  const insertSeqVar = (key: string, idx: number) => {
    setSequenceForm((prev) => {
      const steps = [...prev.steps]
      steps[idx] = { ...steps[idx], body: steps[idx].body + key }
      return { ...prev, steps }
    })
  }

  const updateStep = (idx: number, patch: Partial<{ subject: string; body: string; delayDays: number }>) => {
    setSequenceForm((prev) => {
      const steps = [...prev.steps]
      steps[idx] = { ...steps[idx], ...patch }
      return { ...prev, steps }
    })
  }

  const addStep = () => {
    setSequenceForm((prev) => ({ ...prev, steps: [...prev.steps, { subject: '', body: '', delayDays: 1 }] }))
  }

  const removeStep = (idx: number) => {
    setSequenceForm((prev) => ({ ...prev, steps: prev.steps.filter((_, i) => i !== idx) }))
  }

  const extractVariables = (text: string) => {
    const matches = text.match(/\{[^}]+\}/g) || []
    return Array.from(new Set(matches))
  }

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const body = {
        ...templateForm,
        variables: extractVariables(`${templateForm.subject} ${templateForm.body}`),
      }
      if (templateModal?.id) {
        const updated = await apiFetch<EmailTemplate>(`/api/email/templates/${templateModal.id}`, { method: 'PUT', body: JSON.stringify(body) })
        setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      } else {
        const created = await apiFetch<EmailTemplate>('/api/email/templates', { method: 'POST', body: JSON.stringify(body) })
        setTemplates((prev) => [created, ...prev])
      }
      setTemplateModal(null)
    } catch (err: any) {
      setError(err.message || 'Failed to save template')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return
    try {
      await apiFetch(`/api/email/templates/${id}`, { method: 'DELETE' })
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    } catch (err: any) {
      setError(err.message || 'Failed to delete template')
    }
  }

  const handleSaveSequence = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const body = sequenceForm
      if (sequenceModal?.id) {
        const updated = await apiFetch<EmailSequence>(`/api/email/sequences/${sequenceModal.id}`, { method: 'PUT', body: JSON.stringify(body) })
        setSequences((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      } else {
        const created = await apiFetch<EmailSequence>('/api/email/sequences', { method: 'POST', body: JSON.stringify(body) })
        setSequences((prev) => [created, ...prev])
      }
      setSequenceModal(null)
    } catch (err: any) {
      setError(err.message || 'Failed to save sequence')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSequence = async (id: string) => {
    if (!confirm('Delete this sequence?')) return
    try {
      await apiFetch(`/api/email/sequences/${id}`, { method: 'DELETE' })
      setSequences((prev) => prev.filter((s) => s.id !== id))
    } catch (err: any) {
      setError(err.message || 'Failed to delete sequence')
    }
  }

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!enrollSequence || !enrollContactId) return
    setSubmitting(true)
    try {
      await apiFetch('/api/email/sequences/enroll', {
        method: 'POST',
        body: JSON.stringify({ sequenceId: enrollSequence.id, contactId: enrollContactId }),
      })
      setEnrollSequence(null)
      setEnrollContactId('')
    } catch (err: any) {
      setError(err.message || 'Failed to enroll contact')
    } finally {
      setSubmitting(false)
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
        <h1 style={{ ...typeography.title, marginBottom: 0 }}>Templates & Sequences</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          {tab === 'templates' && <button style={buttons.primary} onClick={() => openTemplate()}>+ New Template</button>}
          {tab === 'sequences' && <button style={buttons.primary} onClick={() => openSequence()}>+ New Sequence</button>}
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '1px solid var(--panel-border)' }}>
        {(['templates', 'sequences'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent',
              color: tab === t ? 'var(--fg)' : 'var(--fg-dim)',
              padding: '10px 4px',
              fontWeight: 600,
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'templates' && (
        <div className="panel-container" style={panel.container}>
          <div className="table-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', color: 'var(--fg-dim)', fontSize: 12, textTransform: 'uppercase' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', color: 'var(--fg-dim)', fontSize: 12, textTransform: 'uppercase' }}>Subject preview</th>
                  <th style={{ textAlign: 'left', padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', color: 'var(--fg-dim)', fontSize: 12, textTransform: 'uppercase' }}>Variables</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', color: 'var(--fg-dim)', fontSize: 12, textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} style={{ transition: 'background .2s' }}>
                    <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', fontSize: 14 }}>{t.name}</td>
                    <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', fontSize: 14, color: 'var(--fg-dim)' }}>{t.subject}</td>
                    <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', fontSize: 14 }}>
                      <span style={statusBadge('var(--gold)')}>{(t.variables || []).length}</span>
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', fontSize: 14, textAlign: 'right' }}>
                      <button style={buttons.small} onClick={() => openTemplate(t)}>Edit</button>
                      {' '}
                      <button style={buttons.danger} onClick={() => handleDeleteTemplate(t.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'sequences' && (
        <div className="panel-container" style={panel.container}>
          <div className="table-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', color: 'var(--fg-dim)', fontSize: 12, textTransform: 'uppercase' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', color: 'var(--fg-dim)', fontSize: 12, textTransform: 'uppercase' }}>Steps</th>
                  <th style={{ textAlign: 'left', padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', color: 'var(--fg-dim)', fontSize: 12, textTransform: 'uppercase' }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', color: 'var(--fg-dim)', fontSize: 12, textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sequences.map((s) => (
                  <tr key={s.id} style={{ transition: 'background .2s' }}>
                    <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', fontSize: 14 }}>{s.name}</td>
                    <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', fontSize: 14 }}>
                      <span style={statusBadge('var(--blue)')}>{s.steps.length} steps</span>
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', fontSize: 14 }}>
                      <span style={statusBadge(s.isActive ? 'var(--emerald)' : 'var(--fg-dim)')}>{s.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', fontSize: 14, textAlign: 'right' }}>
                      <button style={buttons.small} onClick={() => setEnrollSequence(s)}>Enroll</button>
                      {' '}
                      <button style={buttons.small} onClick={() => openSequence(s)}>Edit</button>
                      {' '}
                      <button style={buttons.danger} onClick={() => handleDeleteSequence(s.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {templateModal && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setTemplateModal(null)}
        >
          <div className="modal-content" style={{ ...panel.container, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>{templateModal.id ? 'Edit Template' : 'New Template'}</h2>
            <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Name</span>
                <input style={forms.input} required value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Subject</span>
                <input style={forms.input} required value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Body</span>
                <textarea style={forms.textarea} rows={8} value={templateForm.body} onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })} />
              </label>
              <div style={forms.group}>
                <span style={forms.label}>Insert variable</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {TEMPLATE_VARS.map((v) => (
                    <button key={v.key} type="button" style={buttons.small} onClick={() => insertVar(v.key)}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => setTemplateModal(null)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Save Template'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sequenceModal && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setSequenceModal(null)}
        >
          <div className="modal-content" style={{ ...panel.container, width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>{sequenceModal.id ? 'Edit Sequence' : 'New Sequence'}</h2>
            <form onSubmit={handleSaveSequence} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Name</span>
                <input style={forms.input} required value={sequenceForm.name} onChange={(e) => setSequenceForm({ ...sequenceForm, name: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Description</span>
                <input style={forms.input} value={sequenceForm.description} onChange={(e) => setSequenceForm({ ...sequenceForm, description: e.target.value })} />
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ ...layout.header, marginBottom: 0 }}>
                  <span style={forms.label}>Steps</span>
                  <button type="button" style={buttons.small} onClick={addStep}>+ Add step</button>
                </div>
                {sequenceForm.steps.map((step, idx) => (
                  <div key={idx} style={{ ...panel.compact, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>Step {idx + 1}</span>
                      <button type="button" style={buttons.danger} onClick={() => removeStep(idx)}>Remove</button>
                    </div>
                    <div style={forms.row}>
                      <label style={forms.group}>
                        <span style={forms.label}>Subject</span>
                        <input style={forms.input} value={step.subject} onChange={(e) => updateStep(idx, { subject: e.target.value })} />
                      </label>
                      <label style={forms.group}>
                        <span style={forms.label}>Delay (days)</span>
                        <input style={forms.input} type="number" min={0} value={step.delayDays} onChange={(e) => updateStep(idx, { delayDays: Number(e.target.value) })} />
                      </label>
                    </div>
                    <label style={forms.group}>
                      <span style={forms.label}>Body</span>
                      <textarea style={forms.textarea} rows={4} value={step.body} onChange={(e) => updateStep(idx, { body: e.target.value })} />
                    </label>
                    <div style={forms.group}>
                      <span style={forms.label}>Insert variable</span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {TEMPLATE_VARS.map((v) => (
                          <button key={v.key} type="button" style={buttons.small} onClick={() => insertSeqVar(v.key, idx)}>
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => setSequenceModal(null)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Saving...' : 'Save Sequence'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {enrollSequence && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setEnrollSequence(null)}
        >
          <div className="modal-content" style={{ ...panel.container, width: '100%', maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Enroll contact in “{enrollSequence.name}”</h2>
            <form onSubmit={handleEnroll} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Contact</span>
                <select style={forms.select} required value={enrollContactId} onChange={(e) => setEnrollContactId(e.target.value)}>
                  <option value="">Select contact</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => setEnrollSequence(null)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={submitting}>{submitting ? 'Enrolling...' : 'Enroll'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TemplatesPage() {
  return (
    <ProtectedLayout>
      <TemplatesContent />
    </ProtectedLayout>
  )
}
