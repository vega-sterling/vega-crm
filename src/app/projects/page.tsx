'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '../lib/api'
import type { Project, User } from '../lib/types'
import { layout, panel, typeography, buttons, forms } from '../lib/styles'
import ProtectedLayout from '../components/ProtectedLayout'
import ConfirmDialog from '../components/ConfirmDialog'

const PROJECT_COLORS = [
  '#c9a96e', '#60a5fa', '#4ade80', '#a78bfa',
  '#e57373', '#22d3ee', '#f59e0b', '#ec4899',
]

const PROJECT_ICONS = ['📋', '🚀', '🎨', '📦', '🔧', '📊', '🎯', '💡', '🔥', '⚙️']

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)

  // ── Inline form state (replaces modal) ──
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#c9a96e')
  const [icon, setIcon] = useState('📋')
  const [tenantId, setTenantId] = useState('')
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ data: Project[] }>(
        `/api/projects${showArchived ? '?archived=true' : ''}`
      )
      setProjects(res.data || [])
    } catch (e) {
      console.error('Failed to fetch projects:', e)
    } finally {
      setLoading(false)
    }
  }, [showArchived])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // Fetch tenants and users when inline form opens
  useEffect(() => {
    if (!showCreateForm) return
    apiFetch<{ data: { id: string; name: string }[] }>('/api/admin/tenants').then(res => {
      setTenants(res.data || [])
      if (res.data?.[0] && !tenantId) setTenantId(res.data[0].id)
    }).catch(() => {})
    apiFetch<{ data: User[] }>('/api/admin/users').then(res => {
      setUsers(res.data || [])
    }).catch(() => {})
  }, [showCreateForm]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!name.trim() || !tenantId) return
    setCreating(true)
    try {
      const project = await apiFetch<Project>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ tenantId, name, description, color, icon }),
      })
      setShowCreateForm(false)
      setName('')
      setDescription('')
      setColor('#c9a96e')
      setIcon('📋')
      router.push(`/projects/${project.id}`)
    } catch (e) {
      alert('Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  const handleArchive = async (id: string, archive: boolean) => {
    try {
      await apiFetch(`/api/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isArchived: archive }),
      })
      fetchProjects()
    } catch (e) {
      alert('Failed to update project')
    }
  }

  const handleDelete = (project: Project) => {
    setConfirmDelete(project)
  }

  const performDelete = async (project: any) => {
    try {
      await apiFetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      fetchProjects()
    } catch (e) {
      alert('Failed to delete project')
    }
  }

  return (
    <ProtectedLayout>
    <div style={layout.page}>
      <div style={layout.header}>
        <h1 style={typeography.title}>Projects</h1>
        <div style={layout.row}>
          <button
            onClick={() => setShowArchived(!showArchived)}
            style={buttons.secondary}
          >
            {showArchived ? '← Active Projects' : 'Archived Projects'}
          </button>
          <button onClick={() => setShowCreateForm(!showCreateForm)} style={buttons.primary}>
            {showCreateForm ? '× Cancel' : '+ New Project'}
          </button>
        </div>
      </div>

      {/* ── Inline Create Form (replaces modal) ── */}
      {showCreateForm && (
        <div id="inline-project-form" className="panel-container" style={{ ...panel.container, marginBottom: 24, animation: 'slideUp 0.25s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <h2 style={{ ...typeography.subtitle, margin: 0 }}>Create New Project</h2>
            <button type="button" style={{ ...buttons.small, fontSize: 18, lineHeight: 1, padding: '4px 12px' }} onClick={() => setShowCreateForm(false)}>×</button>
          </div>

          <div style={forms.group}>
            <label style={forms.label}>Tenant</label>
            <select
              className="form-select"
              style={forms.select}
              value={tenantId}
              onChange={e => setTenantId(e.target.value)}
            >
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div style={{ ...forms.group, marginTop: 16 }}>
            <label style={forms.label}>Name</label>
            <input
              className="form-input"
              style={forms.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Q4 Launch Campaign"
              autoFocus
            />
          </div>

          <div style={{ ...forms.group, marginTop: 16 }}>
            <label style={forms.label}>Description (optional)</label>
            <textarea
              className="form-textarea"
              style={forms.textarea}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the project..."
            />
          </div>

          <div style={{ ...forms.group, marginTop: 16 }}>
            <label style={forms.label}>Icon</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PROJECT_ICONS.map(ic => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  style={{
                    fontSize: 22,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: icon === ic ? '2px solid var(--gold)' : '1px solid var(--panel-border)',
                    backgroundColor: icon === ic ? 'var(--panel-elevated)' : 'var(--bg)',
                    cursor: 'pointer',
                  }}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          <div style={{ ...forms.group, marginTop: 16 }}>
            <label style={forms.label}>Color</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PROJECT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: c,
                    border: color === c ? '3px solid var(--fg)' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCreateForm(false)} style={buttons.secondary}>
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || !tenantId || creating}
              style={{
                ...buttons.primary,
                opacity: (!name.trim() || !tenantId || creating) ? 0.5 : 1,
              }}
            >
              {creating ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ ...panel.container, textAlign: 'center' }}>
          <p style={typeography.muted}>Loading projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <div style={{ ...panel.container, textAlign: 'center', padding: 64 }}>
          <p style={{ ...typeography.muted, fontSize: 18, marginBottom: 8 }}>
            {showArchived ? 'No archived projects' : 'No projects yet'}
          </p>
          <p style={typeography.small}>
            {showArchived ? 'Archived projects will appear here.' : 'Create your first project to start tracking work on a kanban board.'}
          </p>
        </div>
      ) : (
        <div className="project-grid"
 style={{
   display: 'grid',
   gap: 16,
   gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
 }}>
          {projects.map(project => (
            <div
              key={project.id}
              onClick={() => router.push(`/projects/${project.id}`)}
              style={{
                ...panel.compact,
                cursor: 'pointer',
                borderLeft: `4px solid ${project.color}`,
                transition: 'transform .2s, border-color .2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.borderColor = 'var(--panel-border-hot)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.borderColor = 'var(--panel-border)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 28 }}>{project.icon || '📋'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
                    {project.name}
                  </h3>
                  {project.description && (
                    <p style={{ ...typeography.small, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {project.description}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={typeography.small}>
                    {project._count?.columns ?? 0} columns
                  </span>
                  <span style={typeography.small}>
                    {project._count?.tasks ?? 0} tasks
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                  {!showArchived && (
                    <button
                      onClick={() => handleArchive(project.id, true)}
                      style={{ ...buttons.small, fontSize: 11 }}
                      title="Archive"
                    >
                      📦
                    </button>
                  )}
                  {showArchived && (
                    <>
                      <button
                        onClick={() => handleArchive(project.id, false)}
                        style={{ ...buttons.small, fontSize: 11 }}
                        title="Restore"
                      >
                        ↩️
                      </button>
                      <button
                        onClick={() => handleDelete(project)}
                        style={{ ...buttons.small, fontSize: 11, color: 'var(--rust)', borderColor: 'var(--rust)' }}
                        title="Delete"
                      >
                        🗑
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Project?"
        itemName={confirmDelete?.name}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => { performDelete(confirmDelete); setConfirmDelete(null) }}
      />
    </div>
    </ProtectedLayout>
  )
}