'use client'

// ============================================================================
// File: src/app/admin/data/page.tsx
// Description: Data Management page — CSV export and import wizard.
//   Export: Select entity → download CSV (with current filters).
//   Import: 4-step wizard — Select Entity → Upload & Map → Preview → Confirm.
//   Follows HubSpot/Salesforce patterns. Admin-only. Fully responsive.
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, table, statusBadge, statusDot } from '../../lib/styles'
import type { Tenant } from '../../lib/types'

// ── Types ──

interface FieldDef {
  name: string
  label: string
  required: boolean
  type: 'string' | 'number' | 'date' | 'enum' | 'array'
  enumValues?: string[]
  description?: string
}

interface ImportResult {
  created: number
  updated: number
  skipped: number
  failed: number
  errors: Array<{ row: number; message: string }>
}

type EntityType = 'companies' | 'contacts' | 'deals' | 'tasks' | 'activities'

const ENTITY_LABELS: Record<EntityType, string> = {
  companies: 'Companies',
  contacts: 'Contacts',
  deals: 'Deals',
  tasks: 'Tasks',
  activities: 'Activities',
}

const ENTITY_ICONS: Record<EntityType, string> = {
  companies: '🏢',
  contacts: '👤',
  deals: '💰',
  tasks: '✓',
  activities: '📞',
}

type ImportStep = 'select' | 'upload' | 'preview' | 'result'
type DuplicateMode = 'create' | 'skip' | 'update'

const DUPLICATE_KEY_OPTIONS: Record<EntityType, Array<{ value: string; label: string }>> = {
  companies: [{ value: 'name', label: 'Company Name' }, { value: 'email', label: 'Email' }],
  contacts: [{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }],
  deals: [{ value: 'title', label: 'Deal Title' }],
  tasks: [{ value: 'title', label: 'Task Title' }],
  activities: [{ value: 'subject', label: 'Subject' }],
}

// ── CSV utilities (client-side) ──

function parseCSVHeaders(text: string): string[] {
  const firstLine = text.split(/\r?\n/)[0]
  if (!firstLine) return []
  // Simple parse for headers (handles quoted headers)
  const headers: string[] = []
  let field = ''
  let inQ = false
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i]
    if (ch === '"') {
      if (inQ && firstLine[i + 1] === '"') { field += '"'; i++ }
      else { inQ = !inQ }
    } else if (ch === ',' && !inQ) {
      headers.push(field.trim())
      field = ''
    } else {
      field += ch
    }
  }
  headers.push(field.trim())
  return headers.map((h) => h.replace(/^"|"$/g, '').replace(/""/g, '"'))
}

function parseCSVRows(text: string): Record<string, string>[] {
  const lines: string[] = []
  let current = ''
  let inQuotes = false
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') { current += '""'; i++ }
      else { inQuotes = !inQuotes; current += ch }
    } else if (ch === '\n' && !inQuotes) {
      lines.push(current); current = ''
    } else { current += ch }
  }
  if (current) lines.push(current)
  if (lines.length === 0) return []

  const parseLine = (line: string): string[] => {
    const fields: string[] = []
    let field = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { field += '"'; i++ }
        else { inQ = !inQ }
      } else if (ch === ',' && !inQ) {
        fields.push(field); field = ''
      } else { field += ch }
    }
    fields.push(field)
    return fields.map((f) => f.trim().replace(/^"|"$/g, '').replace(/""/g, '"'))
  }

  const headers = parseLine(lines[0])
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const values = parseLine(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || ''
    }
    rows.push(row)
  }
  return rows
}

/** Auto-match CSV column headers to CRM field names using fuzzy matching. */
function autoMapColumns(csvHeaders: string[], fields: FieldDef[]): Record<string, string> {
  const mappings: Record<string, string> = {}
  for (const header of csvHeaders) {
    const lower = header.toLowerCase().replace(/[^a-z0-9]/g, '')
    let bestMatch = '__skip'
    let bestScore = 0

    for (const field of fields) {
      const fieldLower = field.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      const labelLower = field.label.toLowerCase().replace(/[^a-z0-9]/g, '')

      // Exact match
      if (lower === fieldLower || lower === labelLower) {
        bestMatch = field.name
        bestScore = 100
        break
      }
      // Contains match
      if (lower.includes(fieldLower) || fieldLower.includes(lower)) {
        const score = Math.min(lower.length, fieldLower.length) / Math.max(lower.length, fieldLower.length) * 80
        if (score > bestScore) { bestMatch = field.name; bestScore = score }
      }
      if (lower.includes(labelLower) || labelLower.includes(lower)) {
        const score = Math.min(lower.length, labelLower.length) / Math.max(lower.length, labelLower.length) * 70
        if (score > bestScore) { bestMatch = field.name; bestScore = score }
      }
    }
    mappings[header] = bestMatch
  }
  return mappings
}

// ── Component ──

function DataManagementContent() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'export' | 'import'>('export')

  // Export state
  const [exportEntity, setExportEntity] = useState<EntityType>('companies')
  const [exportTenantId, setExportTenantId] = useState('')
  const [exporting, setExporting] = useState(false)

  // Import state
  const [importStep, setImportStep] = useState<ImportStep>('select')
  const [importEntity, setImportEntity] = useState<EntityType>('companies')
  const [importTenantId, setImportTenantId] = useState('')
  const [fields, setFields] = useState<FieldDef[]>([])
  const [csvText, setCsvText] = useState('')
  const [csvFileName, setCsvFileName] = useState('')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('create')
  const [duplicateKey, setDuplicateKey] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load tenants ──
  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Tenant[] }>('/api/admin/tenants')
      setTenants(res.data || [])
      if (res.data && res.data.length > 0) setExportTenantId(res.data[0].id)
    } catch (err: any) {
      setError(err.message || 'Failed to load tenants')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Load field definitions when entity changes ──
  const loadFields = useCallback(async (entity: EntityType) => {
    try {
      const res = await apiFetch<{ fields: FieldDef[] }>(`/api/import?entity=${entity}`)
      setFields(res.fields || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load field definitions')
    }
  }, [])

  // ── Export handler ──
  const handleExport = async () => {
    setExporting(true)
    setError('')
    try {
      const params = new URLSearchParams({ entity: exportEntity })
      if (exportTenantId) params.set('tenantId', exportTenantId)
      const url = `/api/export?${params.toString()}`
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `Export failed (${response.status})`)
      }
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') || ''
      const filenameMatch = disposition.match(/filename="?(.+?)"?$/)
      const filename = filenameMatch ? filenameMatch[1] : `${exportEntity}-export.csv`

      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch (err: any) {
      setError(err.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  // ── Import handlers ──
  const handleEntitySelect = async (entity: EntityType) => {
    setImportEntity(entity)
    await loadFields(entity)
    setImportStep('upload')
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || ''
      setCsvText(text)
      const headers = parseCSVHeaders(text)
      const rows = parseCSVRows(text)
      setCsvHeaders(headers)
      setCsvRows(rows)
      // Auto-map columns
      if (fields.length > 0) {
        const autoMappings = autoMapColumns(headers, fields)
        setMappings(autoMappings)
      }
    }
    reader.readAsText(file)
  }

  const handleMappingChange = (csvCol: string, crmField: string) => {
    setMappings((prev) => ({ ...prev, [csvCol]: crmField }))
  }

  const handleDownloadTemplate = () => {
    if (fields.length === 0) return
    const headers = fields.map((f) => f.label)
    const csv = headers.join(',') + '\r\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${importEntity}-template.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    setImporting(true)
    setError('')
    try {
      const result = await apiFetch<ImportResult>('/api/import', {
        method: 'POST',
        body: JSON.stringify({
          entity: importEntity,
          csvData: csvText,
          mappings,
          tenantId: importTenantId || tenants[0]?.id,
          duplicateMode,
          duplicateKey: duplicateMode !== 'create' ? duplicateKey : undefined,
        }),
      })
      setImportResult(result)
      setImportStep('result')
    } catch (err: any) {
      setError(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const resetImport = () => {
    setImportStep('select')
    setImportEntity('companies')
    setCsvText('')
    setCsvFileName('')
    setCsvHeaders([])
    setCsvRows([])
    setMappings({})
    setDuplicateMode('create')
    setDuplicateKey('')
    setImportResult(null)
  }

  // ── Render ──
  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}><Spinner size={32} /></div>
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
    color: 'var(--fg-dim)', marginBottom: 12,
  }

  const cardStyle: React.CSSProperties = {
    ...panel.container, padding: 24, cursor: 'pointer', transition: 'border-color .2s, transform .1s',
    display: 'flex', flexDirection: 'column', gap: 8, minHeight: 120, justifyContent: 'center',
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    backgroundColor: active ? 'var(--panel-elevated)' : 'transparent',
    color: active ? 'var(--gold)' : 'var(--fg-dim)', border: 'none',
    borderBottom: active ? '2px solid var(--gold)' : '2px solid transparent',
    transition: 'all .2s',
  })

  return (
    <div style={layout.page}>
      {/* ── Header ── */}
      <div style={layout.header}>
        <h1 style={typeography.title}>Data Management</h1>
      </div>

      {error && (
        <div style={{
          backgroundColor: 'rgba(184,80,74,0.12)', color: 'var(--rust)',
          border: '1px solid rgba(184,80,74,0.3)', borderRadius: 8, padding: 12, marginBottom: 24,
        }}>
          {error}
        </div>
      )}

      {/* ── Tab switcher ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--panel-border)', marginBottom: 32 }}>
        <button style={tabStyle(tab === 'export')} onClick={() => setTab('export')}>Export Data</button>
        <button style={tabStyle(tab === 'import')} onClick={() => setTab('import')}>Import Data</button>
      </div>

      {/* ── Export Tab ── */}
      {tab === 'export' && (
        <div style={{ maxWidth: 600 }}>
          <div style={sectionLabel}>Export CRM Records to CSV</div>
          <p style={{ ...typeography.muted, marginBottom: 24 }}>
            Download your CRM data as a CSV file. Exports include all fields and are scoped to your accessible tenants.
          </p>

          <div style={{ ...panel.container, padding: 32 }}>
            <div style={{ marginBottom: 20 }}>
              <label style={forms.label}>Entity to Export</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 8 }}>
                {(Object.keys(ENTITY_LABELS) as EntityType[]).map((entity) => (
                  <button
                    key={entity}
                    onClick={() => setExportEntity(entity)}
                    className="btn-touch"
                    style={{
                      ...panel.compact, padding: 16, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
                      border: exportEntity === entity ? '2px solid var(--gold)' : '1px solid var(--panel-border)',
                      transition: 'border-color .2s',
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{ENTITY_ICONS[entity]}</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{ENTITY_LABELS[entity]}</span>
                  </button>
                ))}
              </div>
            </div>

            {tenants.length > 1 && (
              <div style={{ marginBottom: 20 }}>
                <label style={forms.label}>Tenant</label>
                <select
                  style={forms.select}
                  value={exportTenantId}
                  onChange={(e) => setExportTenantId(e.target.value)}
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              className="btn-touch"
              style={{ ...buttons.primary, width: '100%', opacity: exporting ? 0.6 : 1 }}
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Preparing export…' : `⬇ Export ${ENTITY_LABELS[exportEntity]} to CSV`}
            </button>
          </div>

          <div style={{ ...panel.compact, marginTop: 16, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Export includes:</div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.8 }}>
              <li>All active records within your accessible tenants</li>
              <li>Full field data including IDs for relational linking</li>
              <li>Counts of related records (for companies)</li>
              <li>Timestamps in ISO 8601 format</li>
              <li>CSV format compatible with Excel, Google Sheets, and re-import</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Import Tab ── */}
      {tab === 'import' && (
        <div style={{ maxWidth: 800 }}>
          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 32 }}>
            {(['select', 'upload', 'preview', 'result'] as ImportStep[]).map((step, idx) => {
              const stepLabels = ['1. Choose Entity', '2. Upload & Map', '3. Preview', '4. Results']
              const isCurrent = importStep === step
              const isPast = (['select', 'upload', 'preview', 'result'] as ImportStep[]).indexOf(importStep) > idx
              return (
                <div key={step} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                    backgroundColor: isCurrent ? 'var(--gold)' : isPast ? 'var(--emerald, #10b981)' : 'var(--panel-elevated)',
                    color: isCurrent || isPast ? 'var(--bg)' : 'var(--fg-dim)',
                    border: isCurrent ? 'none' : '1px solid var(--panel-border)',
                  }}>
                    {isPast ? '✓' : idx + 1}
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: isCurrent ? 600 : 400,
                    color: isCurrent ? 'var(--fg)' : 'var(--fg-dim)',
                  }}>
                    {stepLabels[idx]}
                  </span>
                  {idx < 3 && <div style={{ flex: 1, height: 1, backgroundColor: 'var(--panel-border)' }} />}
                </div>
              )
            })}
          </div>

          {/* Step 1: Select Entity */}
          {importStep === 'select' && (
            <div>
              <div style={sectionLabel}>What would you like to import?</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 16 }}>
                {(Object.keys(ENTITY_LABELS) as EntityType[]).map((entity) => (
                  <button
                    key={entity}
                    onClick={() => handleEntitySelect(entity)}
                    className="btn-touch"
                    style={cardStyle}
                  >
                    <span style={{ fontSize: 32 }}>{ENTITY_ICONS[entity]}</span>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{ENTITY_LABELS[entity]}</span>
                    <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
                      {entity === 'contacts' && 'Link to existing companies'}
                      {entity === 'deals' && 'Link to companies & stages'}
                      {entity === 'tasks' && 'Link to companies'}
                      {entity === 'activities' && 'Log calls, notes, meetings'}
                      {entity === 'companies' && 'Standalone records'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Upload & Map */}
          {importStep === 'upload' && (
            <div>
              <div style={sectionLabel}>Upload CSV File — {ENTITY_LABELS[importEntity]}</div>

              {tenants.length > 1 && (
                <div style={{ marginBottom: 20 }}>
                  <label style={forms.label}>Target Tenant</label>
                  <select
                    style={forms.select}
                    value={importTenantId}
                    onChange={(e) => setImportTenantId(e.target.value)}
                  >
                    <option value="">Select tenant…</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Upload zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  ...panel.container, padding: 40, textAlign: 'center', cursor: 'pointer',
                  border: '2px dashed var(--panel-border)', transition: 'border-color .2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--panel-border)' }}
              >
                <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
                {csvFileName ? (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{csvFileName}</div>
                    <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
                      {csvRows.length} data rows • {csvHeaders.length} columns detected
                    </div>
                    <button className="btn-touch" style={{ ...buttons.small, marginTop: 12 }} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>
                      Choose a different file
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Click to upload CSV file</div>
                    <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Max 5,000 rows • .csv format</div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
              </div>

              {/* Template download */}
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <button className="btn-touch" style={{ ...buttons.secondary, fontSize: 13 }} onClick={handleDownloadTemplate}>
                  ⬇ Download CSV Template
                </button>
              </div>

              {/* Column mapping */}
              {csvHeaders.length > 0 && fields.length > 0 && (
                <div style={{ marginTop: 32 }}>
                  <div style={sectionLabel}>Map Columns</div>
                  <p style={{ ...typeography.muted, marginBottom: 16 }}>
                    We auto-detected column mappings. Review and adjust below. Unmapped columns will be skipped.
                  </p>

                  <div style={{ ...panel.container, padding: 0, overflow: 'hidden' }}>
                    {/* Desktop table */}
                    <table className="data-mapping-table" style={{ ...table.table }}>
                      <thead>
                        <tr>
                          <th style={table.th}>CSV Column</th>
                          <th style={table.th}>Sample Data</th>
                          <th style={table.th}>Map To CRM Field</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvHeaders.map((header) => {
                          const sampleValue = csvRows[0]?.[header] || ''
                          const mappedField = mappings[header] || '__skip'
                          const fieldDef = fields.find((f) => f.name === mappedField)
                          return (
                            <tr key={header}>
                              <td style={{ ...table.td, fontWeight: 600 }}>{header}</td>
                              <td style={{ ...table.td, color: 'var(--fg-dim)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {sampleValue || <span style={{ color: 'var(--fg-dimmer)' }}>—</span>}
                              </td>
                              <td style={table.td}>
                                <select
                                  style={{ ...forms.select, padding: '6px 8px', fontSize: 13 }}
                                  value={mappedField}
                                  onChange={(e) => handleMappingChange(header, e.target.value)}
                                >
                                  <option value="__skip">— Skip this column —</option>
                                  {fields.map((f) => (
                                    <option key={f.name} value={f.name}>
                                      {f.label}{f.required ? ' *' : ''}
                                    </option>
                                  ))}
                                </select>
                                {fieldDef?.required && mappedField !== '__skip' && (
                                  <span style={{ ...statusDot('var(--gold)'), marginLeft: 8, display: 'inline-block' }} />
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    {/* Mobile cards */}
                    <div className="data-mapping-cards">
                      {csvHeaders.map((header) => {
                        const sampleValue = csvRows[0]?.[header] || ''
                        const mappedField = mappings[header] || '__skip'
                        return (
                          <div key={header} className="data-map-card">
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{header}</div>
                            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              Sample: {sampleValue || '—'}
                            </div>
                            <select
                              style={{ ...forms.select, padding: '8px', fontSize: 14 }}
                              value={mappedField}
                              onChange={(e) => handleMappingChange(header, e.target.value)}
                            >
                              <option value="__skip">— Skip —</option>
                              {fields.map((f) => (
                                <option key={f.name} value={f.name}>
                                  {f.label}{f.required ? ' *' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Required fields check */}
                  <div style={{ marginTop: 16, padding: 16, ...panel.compact }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Required Fields Status:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {fields.filter((f) => f.required).map((f) => {
                        const isMapped = Object.values(mappings).includes(f.name)
                        return (
                          <span key={f.name} style={statusBadge(isMapped ? 'var(--emerald, #10b981)' : 'var(--rust)')}>
                            {isMapped ? '✓' : '✗'} {f.label}
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  {/* Duplicate handling */}
                  <div style={{ marginTop: 20 }}>
                    <div style={sectionLabel}>Duplicate Handling</div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {([
                        { value: 'create', label: 'Create new (ignore duplicates)' },
                        { value: 'skip', label: 'Skip duplicates' },
                        { value: 'update', label: 'Update existing records' },
                      ] as Array<{ value: DuplicateMode; label: string }>).map((opt) => (
                        <button
                          key={opt.value}
                          className="btn-touch"
                          style={{
                            ...panel.compact, padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                            border: duplicateMode === opt.value ? '2px solid var(--gold)' : '1px solid var(--panel-border)',
                          }}
                          onClick={() => {
                            setDuplicateMode(opt.value)
                            if (opt.value !== 'create' && !duplicateKey) {
                              const opts = DUPLICATE_KEY_OPTIONS[importEntity]
                              if (opts.length > 0) setDuplicateKey(opts[0].value)
                            }
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {duplicateMode !== 'create' && (
                      <div style={{ marginTop: 12 }}>
                        <label style={forms.label}>Dedup Key Field</label>
                        <select
                          style={{ ...forms.select, maxWidth: 300 }}
                          value={duplicateKey}
                          onChange={(e) => setDuplicateKey(e.target.value)}
                        >
                          {DUPLICATE_KEY_OPTIONS[importEntity].map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
                    <button className="btn-touch" style={buttons.secondary} onClick={() => setImportStep('select')}>
                      ← Back
                    </button>
                    <button
                      className="btn-touch"
                      style={{
                        ...buttons.primary, flex: 1,
                        opacity: csvHeaders.length === 0 || !fields.some((f) => f.required && Object.values(mappings).includes(f.name)) ? 0.5 : 1,
                      }}
                      onClick={() => setImportStep('preview')}
                      disabled={csvHeaders.length === 0}
                    >
                      Preview Import →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Preview */}
          {importStep === 'preview' && (
            <div>
              <div style={sectionLabel}>Preview — {ENTITY_LABELS[importEntity]}</div>

              <div style={{ ...panel.compact, padding: 16, marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Entity</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{ENTITY_ICONS[importEntity]} {ENTITY_LABELS[importEntity]}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rows</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{csvRows.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Mapped Columns</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{Object.values(mappings).filter((v) => v !== '__skip').length} / {csvHeaders.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Duplicate Mode</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>
                    {duplicateMode === 'create' ? 'Create new' : duplicateMode === 'skip' ? 'Skip duplicates' : 'Update existing'}
                  </div>
                </div>
              </div>

              {/* Data preview table */}
              <div style={{ ...panel.container, padding: 0, overflow: 'auto', maxHeight: 400 }}>
                <table style={{ ...table.table, fontSize: 13 }}>
                  <thead>
                    <tr>
                      {fields.filter((f) => Object.values(mappings).includes(f.name)).map((f) => (
                        <th key={f.name} style={table.th}>{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 10).map((row, idx) => (
                      <tr key={idx}>
                        {fields.filter((f) => Object.values(mappings).includes(f.name)).map((f) => {
                          const csvCol = Object.entries(mappings).find(([, v]) => v === f.name)?.[0]
                          const val = csvCol ? row[csvCol] : ''
                          return <td key={f.name} style={table.td}>{val || <span style={{ color: 'var(--fg-dimmer)' }}>—</span>}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {csvRows.length > 10 && (
                <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginTop: 8, textAlign: 'center' }}>
                  Showing first 10 of {csvRows.length} rows
                </div>
              )}

              {/* Required fields validation */}
              <div style={{ marginTop: 16, padding: 16, ...panel.compact }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Validation:</div>
                {fields.filter((f) => f.required).map((f) => {
                  const isMapped = Object.values(mappings).includes(f.name)
                  return (
                    <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 13 }}>
                      <span style={{ color: isMapped ? 'var(--emerald, #10b981)' : 'var(--rust)' }}>{isMapped ? '✓' : '✗'}</span>
                      <span>{f.label} {f.required && '(required)'}</span>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
                <button className="btn-touch" style={buttons.secondary} onClick={() => setImportStep('upload')}>
                  ← Back to Mapping
                </button>
                <button
                  className="btn-touch"
                  style={{ ...buttons.primary, flex: 1, opacity: importing ? 0.6 : 1 }}
                  onClick={handleImport}
                  disabled={importing}
                >
                  {importing ? 'Importing…' : `✓ Start Import (${csvRows.length} rows)`}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Results */}
          {importStep === 'result' && importResult && (
            <div>
              <div style={sectionLabel}>Import Results</div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div style={{ ...panel.container, padding: 24, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--emerald, #10b981)' }}>{importResult.created}</div>
                  <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginTop: 4 }}>Created</div>
                </div>
                <div style={{ ...panel.container, padding: 24, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--gold)' }}>{importResult.updated}</div>
                  <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginTop: 4 }}>Updated</div>
                </div>
                <div style={{ ...panel.container, padding: 24, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--fg-dim)' }}>{importResult.skipped}</div>
                  <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginTop: 4 }}>Skipped</div>
                </div>
                <div style={{ ...panel.container, padding: 24, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--rust)' }}>{importResult.failed}</div>
                  <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginTop: 4 }}>Failed</div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div style={{ ...panel.container, padding: 0, overflow: 'auto', maxHeight: 300 }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--panel-border)', fontWeight: 600, fontSize: 14 }}>
                    Errors ({importResult.errors.length})
                  </div>
                  <table style={{ ...table.table, fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={table.th}>Row</th>
                        <th style={table.th}>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.errors.slice(0, 50).map((err, idx) => (
                        <tr key={idx}>
                          <td style={{ ...table.td, fontWeight: 600, whiteSpace: 'nowrap' }}>Row {err.row}</td>
                          <td style={table.td}>{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importResult.errors.length > 50 && (
                    <div style={{ padding: 12, fontSize: 13, color: 'var(--fg-dim)', textAlign: 'center' }}>
                      Showing first 50 of {importResult.errors.length} errors
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
                <button className="btn-touch" style={buttons.secondary} onClick={resetImport}>
                  Import Another File
                </button>
                <button className="btn-touch" style={{ ...buttons.primary, flex: 1 }} onClick={() => { setTab('export') }}>
                  Done — Go to Export
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function DataManagementPage() {
  return (
    <ProtectedLayout>
      <DataManagementContent />
    </ProtectedLayout>
  )
}