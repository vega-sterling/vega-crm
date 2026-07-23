'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, table } from '../lib/styles'
import type { Company, Tenant } from '../lib/types'

interface CompanyListItem extends Company {
  _count?: { contacts: number }
  tenant?: { id: string; name: string; slug: string }
}

interface CompanyListResponse {
  data: CompanyListItem[]
}

interface TenantListResponse {
  data: Tenant[]
}

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const emptyForm = {
  tenantId: '',
  name: '',
  industry: '',
  website: '',
  phone: '',
  email: '',
  address: '',
  description: '',
}

/**
 * CompaniesPage — list companies, search client-side, create, edit, and delete companies.
 */
function CompaniesContent() {
  const [companies, setCompanies] = useState<CompanyListItem[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCompany, setEditingCompany] = useState<CompanyListItem | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({ ...emptyForm })

  const load = useCallback(async () => {
    try {
      const [companiesRes, tenantsRes] = await Promise.all([
        apiFetch<CompanyListResponse>('/api/companies'),
        apiFetch<TenantListResponse>('/api/admin/tenants'),
      ])
      setCompanies(Array.isArray(companiesRes) ? companiesRes : companiesRes.data || [])
      setTenants(Array.isArray(tenantsRes) ? tenantsRes : tenantsRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load companies')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return companies
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
    )
  }, [companies, search])

  const openNew = () => {
    setEditingCompany(null)
    setForm({ ...emptyForm })
    setModalOpen(true)
  }

  const openEdit = (company: CompanyListItem) => {
    setEditingCompany(company)
    setForm({
      tenantId: company.tenantId,
      name: company.name,
      industry: company.industry || '',
      website: company.website || '',
      phone: company.phone || '',
      email: company.email || '',
      address: company.address || '',
      description: company.description || '',
    })
    setModalOpen(true)
  }

  const handleDelete = async (company: CompanyListItem) => {
    if (!window.confirm(`Delete company "${company.name}"?`)) return
    try {
      await apiFetch(`/api/companies/${company.id}`, { method: 'DELETE' })
      setCompanies((prev) => prev.filter((c) => c.id !== company.id))
    } catch (err: any) {
      setError(err.message || 'Failed to delete company')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (editingCompany) {
        const updated = await apiFetch<CompanyListItem>(`/api/companies/${editingCompany.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        })
        setCompanies((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      } else {
        const created = await apiFetch<Company>('/api/companies', {
          method: 'POST',
          body: JSON.stringify(form),
        })
        setCompanies((prev) => [created, ...prev])
      }
      setModalOpen(false)
      setEditingCompany(null)
      setForm({ ...emptyForm })
    } catch (err: any) {
      setError(err.message || `Failed to ${editingCompany ? 'update' : 'create'} company`)
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
        <h1 style={typeography.title}>Companies</h1>
        <button style={buttons.primary} onClick={openNew}>
          New Company
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div style={{ ...panel.compact, marginBottom: 24 }}>
        <input
          style={forms.input}
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div style={panel.container}>
        <table style={table.table}>
          <thead>
            <tr>
              <th style={table.th}>Name</th>
              <th style={table.th}>Industry</th>
              <th style={table.th}>Phone</th>
              <th style={table.th}>Email</th>
              <th style={table.th}>Contacts</th>
              <th style={table.th}>Created</th>
              <th style={table.th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...table.td, color: 'var(--fg-dim)', textAlign: 'center' }}>
                  No companies found.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} style={table.tr}>
                  <td style={table.td}>
                    <Link href={`/companies/${c.id}`} style={{ fontWeight: 600, color: 'var(--fg)' }}>
                      {c.name}
                    </Link>
                  </td>
                  <td style={table.td}>{c.industry || '—'}</td>
                  <td style={table.td}>{c.phone || '—'}</td>
                  <td style={table.td}>{c.email || '—'}</td>
                  <td style={table.td}>{c._count?.contacts ?? 0}</td>
                  <td style={{ ...table.td, color: 'var(--fg-dim)', fontSize: 12 }}>{formatDate(c.createdAt)}</td>
                  <td style={table.td}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={buttons.small} onClick={() => openEdit(c)}>Edit</button>
                      <button style={buttons.danger} onClick={() => handleDelete(c)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 24,
          }}
          onClick={() => setModalOpen(false)}
        >
          <div style={{ ...panel.container, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>{editingCompany ? 'Edit Company' : 'New Company'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Tenant</span>
                <select
                  style={forms.select}
                  required
                  value={form.tenantId}
                  onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                >
                  <option value="">Select tenant</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Name</span>
                  <input
                    style={forms.input}
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Industry</span>
                  <input
                    style={forms.input}
                    value={form.industry}
                    onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  />
                </label>
              </div>

              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Website</span>
                  <input
                    style={forms.input}
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                  />
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Phone</span>
                  <input
                    style={forms.input}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </label>
              </div>

              <label style={forms.group}>
                <span style={forms.label}>Email</span>
                <input
                  style={forms.input}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>

              <label style={forms.group}>
                <span style={forms.label}>Address</span>
                <input
                  style={forms.input}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </label>

              <label style={forms.group}>
                <span style={forms.label}>Description</span>
                <textarea
                  style={forms.textarea}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" style={buttons.primary} disabled={submitting}>
                  {submitting ? 'Saving...' : editingCompany ? 'Save Changes' : 'Save Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CompaniesPage() {
  return (
    <ProtectedLayout>
      <CompaniesContent />
    </ProtectedLayout>
  )
}
