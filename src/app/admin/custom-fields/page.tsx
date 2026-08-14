'use client'

// ============================================================================
// File: src/app/admin/custom-fields/page.tsx
// Description: Custom Properties Management — admin page for creating and
//   managing custom field definitions for companies and contacts.
//   HubSpot/Salesforce-style field builder with field type selection,
//   dropdown options editor, required/visible toggles, and reordering.
// ============================================================================

import { useEffect, useState, useCallback } from 'react'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import ConfirmDialog from '../../components/ConfirmDialog'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, table, statusBadge } from '../../lib/styles'

interface CustomProperty {
  id: string
  tenantId: string
  entity: string
  key: string
  label: string
  fieldType: string
  options: string[]
  defaultValue: string | null
  isRequired: boolean
  isVisible: boolean
  position: number
  createdAt: string
  tenant?: { id: string; name: string; slug: string }
  _count?: { values: number }
}

interface Tenant {
  id: string
  name: string
}

const FIELD_TYPES = [
  { value: 'TEXT', label: 'Text', icon: '📝' },
  { value: 'NUMBER', label: 'Number', icon: '🔢' },
  { value: 'DROPDOWN', label: 'Dropdown', icon: '📋' },
  { value: 'DATE', label: 'Date', icon: '📅' },
  { value: 'BOOLEAN', label: 'Yes/No', icon: '✓' },
]

const ENTITY_TYPES = [
  { value: 'COMPANY', label: 'Company', icon: '🏢' },
  { value: 'CONTACT', label: 'Contact', icon: '👤' },
]

const fieldTypeColor: Record<string, string> = {
  text: 'var(--blue)',
  number: 'var(--cyan)',
  dropdown: 'var(--violet)',
  date: 'var(--gold)',
  boolean: 'var(--emerald)',
}

export default function CustomFieldsPage() {
  const [properties, setProperties] = useState<CustomProperty[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Filter state
  const [filterEntity, setFilterEntity] = useState<string>('')
  const [filterTenant, setFilterTenant] = useState<string>('')

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newField, setNewField] = useState({
    name: '',
    label: '',
    entityType: 'COMPANY',
    fieldType: 'TEXT',
    tenantId: '',
    isRequired: false,
    isVisible: true,
  })
  const [dropdownOptions, setDropdownOptions] = useState<string[]>([''])
  const [formError, setFormError] = useState('')

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editRequired, setEditRequired] = useState(false)
  const [editVisible, setEditVisible] = useState(true)
  const [editOptions, setEditOptions] = useState<string[]>([''])
  const [savingEdit, setSavingEdit] = useState(false)

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<CustomProperty | null>(null)

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterEntity) params.set('entityType', filterEntity)
      if (filterTenant) params.set('tenantId', filterTenant)

      const [propsRes, tenantsRes] = await Promise.all([
        apiFetch<{ data: CustomProperty[] }>(`/api/custom-properties?${params.toString()}`),
        apiFetch<{ data?: Tenant[] } | Tenant[]>('/api/admin/tenants'),
      ])
      setProperties(propsRes.data || [])
      const tList = Array.isArray(tenantsRes) ? tenantsRes : tenantsRes.data || []
      setTenants(tList)
      if (tList[0] && !newField.tenantId) {
        setNewField((prev) => ({ ...prev, tenantId: tList[0].id }))
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load custom properties')
    } finally {
      setLoading(false)
    }
  }, [filterEntity, filterTenant])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!newField.name.trim()) {
      setFormError('Field key is required')
      return
    }
    if (!/^[a-z0-9_]+$/.test(newField.name)) {
      setFormError('Field key must be lowercase letters, numbers, and underscores only')
      return
    }
    if (!newField.label.trim()) {
      setFormError('Label is required')
      return
    }
    if (newField.fieldType === 'DROPDOWN') {
      const validOptions = dropdownOptions.filter((o) => o.trim())
      if (validOptions.length < 1) {
        setFormError('Dropdown requires at least one option')
        return
      }
    }

    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        tenantId: newField.tenantId,
        name: newField.name,
        label: newField.label,
        entityType: newField.entityType,
        fieldType: newField.fieldType,
        isRequired: newField.isRequired,
        isVisible: newField.isVisible,
      }
      if (newField.fieldType === 'DROPDOWN') {
        body.options = dropdownOptions.filter((o) => o.trim()).map((v) => ({ value: v, label: v }))
      }

      await apiFetch('/api/custom-properties', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setSuccessMsg(`Field "${newField.label}" created successfully`)
      setTimeout(() => setSuccessMsg(''), 3000)
      setShowCreate(false)
      setNewField({
        name: '', label: '', entityType: 'COMPANY', fieldType: 'TEXT',
        tenantId: tenants[0]?.id || '', isRequired: false, isVisible: true,
      })
      setDropdownOptions([''])
      load()
    } catch (err: any) {
      setFormError(err.message || 'Failed to create field')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (prop: CustomProperty) => {
    setEditingId(prop.id)
    setEditLabel(prop.label)
    setEditRequired(prop.isRequired)
    setEditVisible(prop.isVisible !== false)
    setEditOptions(prop.options.length > 0 ? [...prop.options] : [''])
    setFormError('')
  }

  const handleSaveEdit = async (prop: CustomProperty) => {
    setSavingEdit(true)
    setFormError('')
    try {
      const body: Record<string, unknown> = {
        label: editLabel,
        isRequired: editRequired,
        isVisible: editVisible,
      }
      if (prop.fieldType === 'dropdown' || prop.fieldType === 'DROPDOWN') {
        const validOpts = editOptions.filter((o) => o.trim())
        body.options = validOpts.map((v) => ({ value: v, label: v }))
      }

      await apiFetch(`/api/custom-properties/${prop.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      setEditingId(null)
      setSuccessMsg(`Field "${prop.label}" updated`)
      setTimeout(() => setSuccessMsg(''), 3000)
      load()
    } catch (err: any) {
      setFormError(err.message || 'Failed to update field')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async (prop: CustomProperty) => {
    try {
      await apiFetch(`/api/custom-properties/${prop.id}`, { method: 'DELETE' })
      setSuccessMsg(`Field "${prop.label}" deleted`)
      setTimeout(() => setSuccessMsg(''), 3000)
      load()
    } catch (err: any) {
      setError(err.message || 'Failed to delete field')
    }
  }

  const handleMove = async (prop: CustomProperty, direction: 'up' | 'down') => {
    const sorted = [...properties].sort((a, b) => a.position - b.position)
    const idx = sorted.findIndex((p) => p.id === prop.id)
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === sorted.length - 1) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const swapProp = sorted[swapIdx]

    try {
      await Promise.all([
        apiFetch(`/api/custom-properties/${prop.id}`, {
          method: 'PUT',
          body: JSON.stringify({ position: swapProp.position }),
        }),
        apiFetch(`/api/custom-properties/${swapProp.id}`, {
          method: 'PUT',
          body: JSON.stringify({ position: prop.position }),
        }),
      ])
      load()
    } catch (err: any) {
      setError(err.message || 'Failed to reorder')
    }
  }

  if (loading) {
    return (
      <ProtectedLayout>
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={40} />
        </div>
      </ProtectedLayout>
    )
  }

  const sortedProps = [...properties].sort((a, b) => a.position - b.position)

  return (
    <ProtectedLayout>
      <div style={{ ...layout.page, maxWidth: 1100 }}>
        {/* Header */}
        <div style={layout.header}>
          <div>
            <h1 style={typeography.title}>Custom Fields</h1>
            <p style={{ ...typeography.muted, marginTop: -16 }}>
              Create custom properties for companies and contacts to track data unique to your business.
            </p>
          </div>
          <button
            className="btn-touch"
            style={buttons.primary}
            onClick={() => {
              setShowCreate(!showCreate)
              setFormError('')
            }}
          >
            {showCreate ? 'Cancel' : '+ Create Field'}
          </button>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24,
          }}>
            {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: 'var(--rust)', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {successMsg && (
          <div style={{
            backgroundColor: 'rgba(16,185,129,0.12)', color: 'var(--emerald)',
            border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: 12, marginBottom: 24,
          }}>
            {successMsg}
          </div>
        )}

        {/* Create Form */}
        {showCreate && (
          <div className="panel-container" style={{ ...panel.container, marginBottom: 24 }}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>Create Custom Field</h2>
            {formError && (
              <div style={{ color: 'var(--rust)', fontSize: 13, marginBottom: 16 }}>{formError}</div>
            )}
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Entity + Tenant */}
              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Applies To</span>
                  <select
                    className="form-input"
                    style={forms.select}
                    value={newField.entityType}
                    onChange={(e) => setNewField({ ...newField, entityType: e.target.value })}
                  >
                    {ENTITY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                    ))}
                  </select>
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Tenant</span>
                  <select
                    className="form-input"
                    style={forms.select}
                    value={newField.tenantId}
                    onChange={(e) => setNewField({ ...newField, tenantId: e.target.value })}
                    required
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Key + Label */}
              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Field Key</span>
                  <input
                    className="form-input"
                    style={forms.input}
                    value={newField.name}
                    onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                    placeholder="e.g. property_type"
                    required
                  />
                  <span style={{ ...typeography.small, marginTop: 4 }}>Lowercase, no spaces (a-z, 0-9, _)</span>
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Display Label</span>
                  <input
                    className="form-input"
                    style={forms.input}
                    value={newField.label}
                    onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                    placeholder="e.g. Property Type"
                    required
                  />
                </label>
              </div>

              {/* Field Type */}
              <label style={forms.group}>
                <span style={forms.label}>Field Type</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {FIELD_TYPES.map((ft) => (
                    <button
                      key={ft.value}
                      type="button"
                      className="btn-touch"
                      onClick={() => setNewField({ ...newField, fieldType: ft.value })}
                      style={{
                        ...buttons.secondary,
                        backgroundColor: newField.fieldType === ft.value ? 'var(--gold)' : 'transparent',
                        color: newField.fieldType === ft.value ? 'var(--bg)' : 'var(--fg)',
                        borderColor: newField.fieldType === ft.value ? 'var(--gold)' : 'var(--panel-border)',
                        padding: '10px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span>{ft.icon}</span> {ft.label}
                    </button>
                  ))}
                </div>
              </label>

              {/* Dropdown Options */}
              {newField.fieldType === 'DROPDOWN' && (
                <div>
                  <span style={forms.label}>Dropdown Options</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {dropdownOptions.map((opt, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          className="form-input"
                          style={forms.input}
                          value={opt}
                          onChange={(e) => {
                            const updated = [...dropdownOptions]
                            updated[i] = e.target.value
                            setDropdownOptions(updated)
                          }}
                          placeholder={`Option ${i + 1}`}
                        />
                        {dropdownOptions.length > 1 && (
                          <button
                            type="button"
                            className="btn-touch"
                            style={{ ...buttons.danger, padding: '8px 12px', flexShrink: 0 }}
                            onClick={() => setDropdownOptions(dropdownOptions.filter((_, idx) => idx !== i))}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn-touch"
                      style={{ ...buttons.secondary, alignSelf: 'flex-start' }}
                      onClick={() => setDropdownOptions([...dropdownOptions, ''])}
                    >
                      + Add Option
                    </button>
                  </div>
                </div>
              )}

              {/* Toggles */}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newField.isRequired}
                    onChange={(e) => setNewField({ ...newField, isRequired: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ fontSize: 14 }}>Required field</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newField.isVisible}
                    onChange={(e) => setNewField({ ...newField, isVisible: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ fontSize: 14 }}>Visible on record pages</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-touch" style={buttons.secondary} onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-touch" style={buttons.primary} disabled={creating}>
                  {creating ? 'Creating...' : 'Create Field'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <select
            className="form-input"
            style={{ ...forms.select, width: 'auto', minWidth: 160 }}
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value)}
          >
            <option value="">All Entities</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
            ))}
          </select>
          {tenants.length > 1 && (
            <select
              className="form-input"
              style={{ ...forms.select, width: 'auto', minWidth: 160 }}
              value={filterTenant}
              onChange={(e) => setFilterTenant(e.target.value)}
            >
              <option value="">All Tenants</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Properties List */}
        {sortedProps.length === 0 ? (
          <div className="panel-container" style={{ ...panel.container, textAlign: 'center', padding: 64 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>No Custom Fields Yet</h2>
            <p style={{ ...typeography.muted, marginBottom: 24 }}>
              Create custom properties to track data unique to your business — like property type, contract value, or renewal date.
            </p>
            <button className="btn-touch" style={buttons.primary} onClick={() => setShowCreate(true)}>
              + Create Your First Field
            </button>
          </div>
        ) : (
          <div className="table-wrapper" style={{ overflowX: 'auto' }}>
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>LABEL</th>
                  <th style={table.th}>KEY</th>
                  <th style={table.th}>ENTITY</th>
                  <th style={table.th}>TYPE</th>
                  <th style={table.th}>OPTIONS</th>
                  <th style={table.th}>REQUIRED</th>
                  <th style={table.th}>VALUES</th>
                  <th style={table.th}>TENANT</th>
                  <th style={table.th}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {sortedProps.map((prop, idx) => (
                  <tr key={prop.id} style={table.tr}>
                    {/* Label */}
                    <td style={{ ...table.td, fontWeight: 600 }}>
                      {editingId === prop.id ? (
                        <input
                          className="form-input"
                          style={{ ...forms.input, fontSize: 14 }}
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                        />
                      ) : prop.label}
                    </td>

                    {/* Key */}
                    <td style={{ ...table.td, fontFamily: 'monospace', fontSize: 13, color: 'var(--fg-dim)' }}>
                      {prop.key}
                    </td>

                    {/* Entity */}
                    <td style={table.td}>
                      <span style={statusBadge(prop.entity === 'company' ? 'var(--blue)' : 'var(--violet)')}>
                        {prop.entity === 'company' ? '🏢' : '👤'} {prop.entity}
                      </span>
                    </td>

                    {/* Type */}
                    <td style={table.td}>
                      <span style={statusBadge(fieldTypeColor[prop.fieldType] || 'var(--fg-dim)')}>
                        {prop.fieldType}
                      </span>
                    </td>

                    {/* Options */}
                    <td style={{ ...table.td, maxWidth: 200 }}>
                      {editingId === prop.id && (prop.fieldType === 'dropdown') ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {editOptions.map((opt, i) => (
                            <div key={i} style={{ display: 'flex', gap: 4 }}>
                              <input
                                className="form-input"
                                style={{ ...forms.input, fontSize: 13, padding: '4px 8px' }}
                                value={opt}
                                onChange={(e) => {
                                  const updated = [...editOptions]
                                  updated[i] = e.target.value
                                  setEditOptions(updated)
                                }}
                              />
                              <button
                                type="button"
                                className="btn-touch"
                                style={{ ...buttons.danger, padding: '4px 8px', fontSize: 12 }}
                                onClick={() => setEditOptions(editOptions.filter((_, idx2) => idx2 !== i))}
                              >✕</button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="btn-touch"
                            style={{ ...buttons.small, alignSelf: 'flex-start' }}
                            onClick={() => setEditOptions([...editOptions, ''])}
                          >+ Add</button>
                        </div>
                      ) : prop.options.length > 0 ? (
                        <span style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
                          {prop.options.slice(0, 3).join(', ')}
                          {prop.options.length > 3 && ` +${prop.options.length - 3}`}
                        </span>
                      ) : '—'}
                    </td>

                    {/* Required */}
                    <td style={table.td}>
                      {editingId === prop.id ? (
                        <input
                          type="checkbox"
                          checked={editRequired}
                          onChange={(e) => setEditRequired(e.target.checked)}
                          style={{ width: 18, height: 18 }}
                        />
                      ) : prop.isRequired ? (
                        <span style={{ color: 'var(--rust)', fontWeight: 600 }}>Yes</span>
                      ) : 'No'}
                    </td>

                    {/* Values count */}
                    <td style={table.td}>
                      <span style={{ ...typeography.small, fontSize: 13 }}>
                        {prop._count?.values || 0} records
                      </span>
                    </td>

                    {/* Tenant */}
                    <td style={{ ...table.td, fontSize: 13, color: 'var(--fg-dim)' }}>
                      {prop.tenant?.name || '—'}
                    </td>

                    {/* Actions */}
                    <td style={table.td}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {editingId === prop.id ? (
                          <>
                            <button
                              className="btn-touch"
                              style={{ ...buttons.small, backgroundColor: 'var(--emerald)', color: 'var(--bg)', border: 'none' }}
                              onClick={() => handleSaveEdit(prop)}
                              disabled={savingEdit}
                            >
                              {savingEdit ? '...' : 'Save'}
                            </button>
                            <button
                              className="btn-touch"
                              style={buttons.small}
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn-touch" style={buttons.small} onClick={() => startEdit(prop)}>
                              Edit
                            </button>
                            <button className="btn-touch" style={buttons.small} onClick={() => setConfirmDelete(prop)}>
                              Delete
                            </button>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <button
                                className="btn-touch"
                                style={{ ...buttons.small, padding: '2px 6px', fontSize: 10, lineHeight: 1 }}
                                disabled={idx === 0}
                                onClick={() => handleMove(prop, 'up')}
                              >▲</button>
                              <button
                                className="btn-touch"
                                style={{ ...buttons.small, padding: '2px 6px', fontSize: 10, lineHeight: 1 }}
                                disabled={idx === sortedProps.length - 1}
                                onClick={() => handleMove(prop, 'down')}
                              >▼</button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Custom Field?"
        itemName={confirmDelete?.label}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) handleDelete(confirmDelete)
          setConfirmDelete(null)
        }}
      />
    </ProtectedLayout>
  )
}