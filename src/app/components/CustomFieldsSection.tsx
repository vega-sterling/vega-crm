'use client'

// ============================================================================
// CustomFieldsSection — Renders custom property fields on company/contact
// detail pages. Each field uses inline editing (click to edit, Enter to save,
// Escape to cancel) matching the PropertyQuickEdit pattern. Supports text,
// number, dropdown, date, and boolean field types.
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { forms, typeography } from '../lib/styles'
import { apiFetch } from '../lib/api'

interface CustomFieldDef {
  id: string
  tenantId: string
  key: string
  label: string
  fieldType: string
  options: string[]
  defaultValue: string | null
  isRequired: boolean
  isVisible: boolean
  position: number
}

interface CustomFieldValue {
  id: string
  value: string | null
  property: CustomFieldDef
}

interface CustomFieldsSectionProps {
  entityId: string
  entityType: 'COMPANY' | 'CONTACT'
  tenantId: string
}

export default function CustomFieldsSection({ entityId, entityType, tenantId }: CustomFieldsSectionProps) {
  const [fields, setFields] = useState<CustomFieldValue[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: CustomFieldValue[] }>(
        `/api/custom-values?entityType=${entityType}&entityId=${entityId}`
      )
      setFields(res.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load custom fields')
    } finally {
      setLoading(false)
    }
  }, [entityId, entityType])

  useEffect(() => {
    load()
  }, [load])

  const startEdit = (field: CustomFieldValue) => {
    setEditingId(field.id)
    setDraftValue(field.value || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraftValue('')
  }

  const saveField = async (field: CustomFieldValue) => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await apiFetch('/api/custom-values', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: field.property.tenantId,
          propertyId: field.property.id,
          entityType,
          entityId,
          value: draftValue,
        }),
      })
      setFields((prev) =>
        prev.map((f) => (f.id === field.id ? { ...f, value: draftValue } : f))
      )
      setEditingId(null)
      setDraftValue('')
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, field: CustomFieldValue) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveField(field)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  const renderInput = (field: CustomFieldValue) => {
    const ft = field.property.fieldType
    const baseStyle = { ...forms.input, fontSize: 14 }

    if (ft === 'boolean') {
      return (
        <select
          className="form-input"
          style={{ ...forms.select, fontSize: 14 }}
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, field)}
          disabled={saving}
          autoFocus
        >
          <option value="">—</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      )
    }

    if (ft === 'dropdown') {
      return (
        <select
          className="form-input"
          style={{ ...forms.select, fontSize: 14 }}
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, field)}
          disabled={saving}
          autoFocus
        >
          <option value="">—</option>
          {field.property.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )
    }

    if (ft === 'date') {
      return (
        <input
          className="form-input"
          type="date"
          style={baseStyle}
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, field)}
          disabled={saving}
          autoFocus
        />
      )
    }

    if (ft === 'number') {
      return (
        <input
          className="form-input"
          type="number"
          style={baseStyle}
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, field)}
          disabled={saving}
          autoFocus
        />
      )
    }

    return (
      <input
        className="form-input"
        type="text"
        style={baseStyle}
        value={draftValue}
        onChange={(e) => setDraftValue(e.target.value)}
        onKeyDown={(e) => handleKeyDown(e, field)}
        disabled={saving}
        autoFocus
        placeholder="—"
      />
    )
  }

  const displayValue = (field: CustomFieldValue) => {
    const v = field.value
    if (!v) return <span style={{ color: 'var(--fg-dimmer)' }}>—</span>
    if (field.property.fieldType === 'boolean') {
      return v === 'true' ? 'Yes' : v === 'false' ? 'No' : v
    }
    if (field.property.fieldType === 'date') {
      try {
        return new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      } catch {
        return v
      }
    }
    return v
  }

  if (loading) return null

  const visibleFields = fields.filter((f) => f.property.isVisible !== false)

  if (visibleFields.length === 0) return null

  return (
    <div className="panel-container" style={{
      backgroundColor: 'var(--panel)',
      border: '1px solid var(--panel-border)',
      borderRadius: 12,
      padding: 24,
    }}>
      <h2 style={{ ...typeography.subtitle, marginTop: 0, marginBottom: 16 }}>
        Custom Fields
      </h2>
      {error && (
        <div style={{ color: 'var(--rust)', fontSize: 13, marginBottom: 12 }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: 'var(--rust)', cursor: 'pointer' }}>✕</button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visibleFields.map((field) => (
          <div
            key={field.id}
            className="property-quickedit"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              position: 'relative',
              padding: '6px 0',
              borderRadius: 6,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { if (editingId !== field.id) e.currentTarget.style.background = 'var(--bg-soft)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={typeography.small}>
              {field.property.label}
              {field.property.isRequired && <span style={{ color: 'var(--rust)', marginLeft: 2 }}>*</span>}
            </span>

            {editingId === field.id ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {renderInput(field)}
                <button
                  onClick={() => saveField(field)}
                  disabled={saving}
                  title="Save"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--emerald)',
                    borderRadius: 6,
                    color: 'var(--emerald)',
                    padding: '6px 8px',
                    cursor: saving ? 'wait' : 'pointer',
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {saving ? '…' : '✓'}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  title="Cancel"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--panel-border)',
                    borderRadius: 6,
                    color: 'var(--fg-dim)',
                    padding: '6px 8px',
                    cursor: 'pointer',
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, wordBreak: 'break-word', flex: 1 }}>
                  {displayValue(field)}
                </span>
                <button
                  onClick={() => startEdit(field)}
                  title={`Edit ${field.property.label}`}
                  className="prop-edit-btn"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--fg-dimmer)',
                    cursor: 'pointer',
                    fontSize: 13,
                    padding: '2px 4px',
                    opacity: 0,
                    transition: 'opacity 0.15s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0' }}
                >
                  ✏️
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <style>{`
        .property-quickedit:hover .prop-edit-btn { opacity: 1 !important; }
      `}</style>
    </div>
  )
}