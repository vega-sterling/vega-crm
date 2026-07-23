'use client'

import { useEffect, useState, useCallback } from 'react'
import ProtectedLayout from '../../components/ProtectedLayout'
import Spinner from '../../components/Spinner'
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

/**
 * AdminUsersPage — user management for administrators.
 */
function AdminUsersContent() {
  const [users, setUsers] = useState<UserListItem[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
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
    setModalOpen(true)
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
    setModalOpen(true)
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
      setModalOpen(false)
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
        <button style={buttons.primary} onClick={openNew}>New User</button>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--rust)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div style={panel.container}>
        <table style={table.table}>
          <thead>
            <tr>
              <th style={table.th}>Name</th>
              <th style={table.th}>Email</th>
              <th style={table.th}>Role</th>
              <th style={table.th}>Active</th>
              <th style={table.th}>Tenants</th>
              <th style={table.th}></th>
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
                <tr key={u.id} style={table.tr}>
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
                    <button style={buttons.small} onClick={() => openEdit(u)}>Edit</button>
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
            <h2 style={{ ...typeography.subtitle, marginTop: 0 }}>{editingUser ? 'Edit User' : 'New User'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                  <span style={forms.label}>Email</span>
                  <input
                    style={forms.input}
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>
              </div>

              <label style={forms.group}>
                <span style={forms.label}>{editingUser ? 'New password (optional)' : 'Password'}</span>
                <input
                  style={forms.input}
                  type="password"
                  {...(editingUser ? {} : { required: true })}
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </label>

              <div style={forms.row}>
                <label style={forms.group}>
                  <span style={forms.label}>Global role</span>
                  <select
                    style={forms.select}
                    value={form.globalRole}
                    onChange={(e) => setForm({ ...form, globalRole: e.target.value as User['globalRole'] })}
                  >
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </label>

                <label style={forms.group}>
                  <span style={forms.label}>Active</span>
                  <select
                    style={forms.select}
                    value={form.isActive ? 'true' : 'false'}
                    onChange={(e) => setForm({ ...form, isActive: e.target.value === 'true' })}
                  >
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

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" style={buttons.secondary} onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" style={buttons.primary} disabled={submitting}>
                  {submitting ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
