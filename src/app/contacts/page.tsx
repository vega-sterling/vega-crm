'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import ProtectedLayout from '../components/ProtectedLayout'
import Spinner from '../components/Spinner'
import { apiFetch } from '../lib/api'
import { layout, panel, typeography, forms, buttons, table } from '../lib/styles'
import type { Contact, Company, Tenant } from '../lib/types'

interface ContactListItem extends Contact {
  company?: { id: string; name: string }
}

interface ContactListResponse {
  data: ContactListItem[]
}

interface CompanyListResponse {
  data: Company[]
}

interface TenantListResponse {
  data: Tenant[]
}

const formatDate = (d?: string) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const emptyForm = {
  companyId: '',
  tenantId: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  title: '',
}

/**
 * ContactsPage — list contacts, search client-side, create, edit, and delete contacts.
 */
function ContactsContent() {
  const [contacts, setContacts] = useState<ContactListItem[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<ContactListItem | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({ ...emptyForm })

  const load = useCallback(async () => {
    try {
      const [contactsRes, companiesRes, tenantsRes] = await Promise.all([
        apiFetch<ContactListResponse>('/api/contacts'),
        apiFetch<CompanyListResponse>('/api/companies'),
        apiFetch<TenantListResponse>('/api/admin/tenants'),
      ])
      setContacts(Array.isArray(contactsRes) ? contactsRes : contactsRes.data || [])
      setCompanies(Array.isArray(companiesRes) ? companiesRes : companiesRes.data || [])
      setTenants(Array.isArray(tenantsRes) ? tenantsRes : tenantsRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load contacts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const companyMap = useMemo(() => {
    const map = new Map<string, Company>()
    companies.forEach((c) => map.set(c.id, c))
    return map
  }, [companies])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter(
      (c) =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.company?.name || '').toLowerCase().includes(q)
    )
  }, [contacts, search])

  const openNew = () => {
    setEditingContact(null)
    setForm({ ...emptyForm })
    setModalOpen(true)
  }

  const openEdit = (contact: ContactListItem) => {
    setEditingContact(contact)
    setForm({
      companyId: contact.companyId,
      tenantId: contact.tenantId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email || '',
      phone: contact.phone || '',
      title: contact.title || '',
    })
    setModalOpen(true)
  }

  const handleDelete = async (contact: ContactListItem) => {
    if (!window.confirm(`Delete contact "${contact.firstName} ${contact.lastName}"?`)) return
    try {
      await apiFetch(`/api/contacts/${contact.id}`, { method: 'DELETE' })
      setContacts((prev) => prev.filter((c) => c.id !== contact.id))
    } catch (err: any) {
      setError(err.message || 'Failed to delete contact')
    }
  }

  const handleCompanyChange = (companyId: string) => {
    const company = companyMap.get(companyId)
    setForm((prev) => ({
      ...prev,
      companyId,
      tenantId: company?.tenantId || '',
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (editingContact) {
        const updated = await apiFetch<ContactListItem>(`/api/contacts/${editingContact.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        })
        setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      } else {
        const created = await apiFetch<Contact>('/api/contacts', {
          method: 'POST',
          body: JSON.stringify(form),
        })
        setContacts((prev) => [created, ...prev])
      }
      setModalOpen(false)
      setEditingContact(null)
      setForm({ ...emptyForm })
    } catch (err: any) {
      setError(err.message || `Failed to ${editingContact ? 'update' : 'create'} contact`)
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
        <h1 style={typeography.title}>Contacts</h1>
        <button style={buttons.primary} onClick={openNew}>New Contact</button>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div style={{ ...panel.compact, marginBottom: 24 }}>
        <input
          style={forms.input}
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div style={panel.container}>
        <table style={table.table}>
          <thead>
            <tr>
              <th style={table.th}>Name</th>
              <th style={table.th}>Email</th>
              <th style={table.th}>Phone</th>
              <th style={table.th}>Title</th>
              <th style={table.th}>Company</th>
              <th style={table.th}>Created</th>
              <th style={table.th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...table.td, color: 'var(--fg-dim)', textAlign: 'center' }}>
                  No contacts found.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} style={table.tr}>
                  <td style={table.td}>
                    <Link href={`/contacts/${c.id}`} style={{ fontWeight: 600, color: 'var(--fg)' }}>
                      {c.firstName} {c.lastName}
                    </Link>
                  </td>
                  <td style={table.td}>{c.email || '—'}</td>
                  <td style={table.td}>{c.phone || '—'}</td>
                  <td style={table.td}>{c.title || '—'}</td>
                  <td style={table.td}>
                    {c.company ? (
                      <Link href={`/companies/${c.company.id}`} style={{ color: 'var(--gold)' }}>
                        {c.company.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
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
          <div style={{ ...panel.container, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>{editingContact ? 'Edit Contact' : 'New Contact'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={forms.group}>
                <span style={forms.label}>Company</span>
                <select
                  style={forms.select}
                  required
                  value={form.companyId}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                >
                  <option value="">Select company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>First name</span>
                  <input
                    style={forms.input}
                    required
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  />
                </label>
                <label style={forms.group}>
                  <span style={forms.label}>Last name</span>
                  <input
                    style={forms.input}
                    required
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  />
                </label>
              </div>

              <div style={forms.row}>
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
                  <span style={forms.label}>Phone</span>
                  <input
                    style={forms.input}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </label>
              </div>

              <label style={forms.group}>
                <span style={forms.label}>Title</span>
                <input
                  style={forms.input}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>

              <input type="hidden" value={form.tenantId} />

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" style={buttons.primary} disabled={submitting}>
                  {submitting ? 'Saving...' : editingContact ? 'Save Changes' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ContactsPage() {
  return (
    <ProtectedLayout>
      <ContactsContent />
    </ProtectedLayout>
  )
}
