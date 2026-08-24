'use client'

// ============================================================================
// File: src/app/admin/users/page.tsx
// Description: User management page. Lists all users with inline create/edit.
//              Phase 23: Converted from modal to inline form pattern.
// ============================================================================

import { useEffect, useState, useCallback } from 'react'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
import { IconPlus } from '../../components/Icons'
import { apiFetch } from '../../lib/api'
import { layout, panel, typeography, forms, buttons, table, statusBadge } from '../../lib/styles'
import type { User, Tenant } from '../../lib/types'

interface UserListItem extends User {
  userTenants?: { id: string; tenant: { id: string; name: string; slug: string } }[]
}

interface UserListResponse {
  data: UserListItem[]
}

interface TenantListResponse {
  data: Tenant[]
}

const roleColor: Record<string, string> = {
  SUPER_ADMIN: 'var(--rust)',
  ADMIN: 'var(--gold)',
  USER: 'var(--blue)',
}

function AdminUsersContent() {
  const [users, setUsers] = useState<UserListItem[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const emptyForm = {
    email: '',
    name: '',
    password: '',
    globalRole: 'USER' as User['globalRole'],
    tenantIds: [] as string[],
    isActive: true,
  }

  const [form, setForm] = useState({ ...emptyForm })

  const load = useCallback(async () => {
    try {
      const [usersRes, tenantsRes] = await Promise.all([
        apiFetch<UserListResponse>('/api/admin/users'),
        apiFetch<TenantListResponse>('/api/admin/tenants'),
      ])
      setUsers(Array.isArray(usersRes) ? usersRes : usersRes.data || [])
      setTenants(Array.isArray(tenantsRes) ? tenantsRes : tenantsRes.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openNew = () => {
    setEditingUser(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  const openEdit = (user: UserListItem) => {
    setEditingUser(user)
    setForm({
      email: user.email,
      name: user.name,
      password: '',
      globalRole: user.globalRole,
      tenantIds: user.userTenants?.map((ut) => ut.tenant.id) || [],
      isActive: user.isActive ?? true,
    })
    setShowForm(true)
    setTimeout(() => {
      document.getElementById('inline-user-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const body = { ...form }
      if (editingUser) {
        if (!body.password) delete (body as any).password
        const updated = await apiFetch<UserListItem>(`/api/admin/users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      } else {
        const created = await apiFetch<UserListItem>('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        setUsers((prev) => [created, ...prev])
      }
      setShowForm(false)
      setEditingUser(null)
      setForm({ ...emptyForm })
    } catch (err: any) {
      setError(err.message || `Failed to ${editingUser ? 'update' : 'create'} user`)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleTenant = (tenantId: string) => {
    setForm((prev) => ({
      ...prev,
      tenantIds: prev.tenantIds.includes(tenantId)
        ? prev.tenantIds.filter((id) => id !== tenantId)
        : [...prev.tenantIds, tenantId],
    }))
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
        <h1 style={typeography.title}>Users</h1>
        <button className="btn-touch" style={{ ...buttons.primary, display: 'flex', alignItems: 'center', gap: 6 }} onClick={openNew}>
          <IconPlus size={16} /> New User
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* ── Inline Create/Edit Form ── */}
      {showForm && (
        <div id="inline-user-form" className="panel-container" style={{ ...panel.container, marginBottom: 24, animation: 'slideUp 0.25s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ ...typeography.subtitle, margin: 0 }}>{editingUser ? 'Edit User' : 'New User'}</h2>
            <button className="btn-touch" style={{ ...buttons.secondary, padding: '6px 12px', fontSize: 13 }} onClick={() => setShowForm(false)}>✕ Close</button>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-grid" style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Name</span>
                <input className="form-input" style={forms.input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label style={forms.group}>
                <span style={forms.label}>Email</span>
                <input className="form-input" style={forms.input} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
            </div>

            <label style={forms.group}>
              <span style={forms.label}>{editingUser ? 'New password (optional)' : 'Password'}</span>
              <input className="form-input" style={forms.input} type="password" {...(editingUser ? {} : { required: true })} minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>

            <div className="form-grid" style={forms.row}>
              <label style={forms.group}>
                <span style={forms.label}>Global role</span>
                <select className="form-select" style={forms.select} value={form.globalRole} onChange={(e) => setForm({ ...form, globalRole: e.target.value as User['globalRole'] })}>
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
              </label>

              <label style={forms.group}>
                <span style={forms.label}>Active</span>
                <select className="form-select" style={forms.select} value={form.isActive ? 'true' : 'false'} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'true' })}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
            </div>

            <div>
              <span style={forms.label}>Tenants</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {tenants.map((t) => (
                  <label
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 8,
                      backgroundColor: form.tenantIds.includes(t.id) ? 'var(--bg-soft)' : 'transparent',
                      border: '1px solid var(--panel-border)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.tenantIds.includes(t.id)}
                      onChange={() => toggleTenant(t.id)}
                    />
                    <span>{t.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn-touch" style={buttons.secondary} onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn-touch" style={{ ...buttons.primary, opacity: submitting ? 0.6 : 1 }} disabled={submitting}>
                {submitting ? 'Saving…' : editingUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="panel-container" style={panel.container}>
        <div className="table-wrapper" style={{ overflowX: 'auto' }}>
          <table style={table.table}>
            <thead>
              <tr>
                <th style={table.th}>Name</th>
                <th style={table.th}>Email</th>
                <th style={table.th}>Role</th>
                <th style={table.th}>Active</th>
                <th style={table.th}>Tenants</th>
                <th style={{ ...table.th, width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...table.td, color: 'var(--fg-dim)', textAlign: 'center' }}>
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="vega-table-row" style={table.tr}>
                    <td style={table.td}><strong>{u.name}</strong></td>
                    <td style={table.td}>{u.email}</td>
                    <td style={table.td}>
                      <span style={statusBadge(roleColor[u.globalRole] || 'var(--fg-dim)')}>{u.globalRole.replace('_', ' ')}</span>
                    </td>
                    <td style={table.td}>
                      <span style={statusBadge(u.isActive ? 'var(--emerald)' : 'var(--rust)')}>{u.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td style={table.td}>
                      {u.userTenants?.length
                        ? u.userTenants.map((ut) => ut.tenant.name).join(', ')
                        : '—'}
                    </td>
                    <td style={table.td}>
                      <button className="btn-touch" style={buttons.small} onClick={() => openEdit(u)}>Edit</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function AdminUsersPage() {
  return (
    <ProtectedLayout>
      <AdminUsersContent />
    </ProtectedLayout>
  )
}