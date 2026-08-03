'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '../../lib/api'
import type { Project, ProjectColumn, ProjectTask, Subtask, User } from '../../lib/types'
import { layout, panel, typeography, buttons, forms, statusBadge } from '../../lib/styles'

const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#8b8d98',
  MEDIUM: '#60a5fa',
  HIGH: '#f59e0b',
  URGENT: '#e57373',
}

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
}

const LABEL_COLORS = ['#e57373', '#f59e0b', '#4ade80', '#60a5fa', '#a78bfa', '#22d3ee', '#ec4899', '#8b8d98']

function getLabelColor(label: string): string {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash)
  return LABEL_COLORS[Math.abs(hash) % LABEL_COLORS.length]
}

function isOverdue(dueDate?: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

function formatDate(dueDate?: string | null): string {
  if (!dueDate) return ''
  const d = new Date(dueDate)
  const now = new Date()
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays < 7) return `In ${diffDays}d`
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
}

export default function KanbanBoardPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [columns, setColumns] = useState<ProjectColumn[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Drag state
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null)
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null)
  const dragOverColumnRef = useRef<string | null>(null)

  // Modal state
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null)
  const [editingColumn, setEditingColumn] = useState<ProjectColumn | null>(null)
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [showEditProject, setShowEditProject] = useState(false)

  // Inline add task
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const fetchBoard = useCallback(async () => {
    try {
      const data = await apiFetch<Project & { columns: (ProjectColumn & { tasks: ProjectTask[] })[] }>(
        `/api/projects/${projectId}`
      )
      setProject(data)
      setColumns(data.columns || [])
    } catch (e: any) {
      setError(e.message || 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchBoard()
  }, [fetchBoard])

  useEffect(() => {
    apiFetch<{ data: User[] }>('/api/admin/users').then(res => setUsers(res.data || [])).catch(() => {})
  }, [])

  // === Task drag and drop ===
  const handleTaskDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggingTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taskId)
  }

  const handleTaskDragEnd = () => {
    setDraggingTaskId(null)
    setDragOverColumnId(null)
    dragOverColumnRef.current = null
  }

  const handleColumnDragOver = (e: React.DragEvent, columnId: string) => {
    if (!draggingTaskId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverColumnRef.current !== columnId) {
      dragOverColumnRef.current = columnId
      setDragOverColumnId(columnId)
    }
  }

  const handleColumnDrop = async (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const taskId = e.dataTransfer.getData('text/plain')
    if (!taskId || !draggingTaskId) return

    // Find task and its current column
    let sourceColumn: ProjectColumn | undefined
    let task: ProjectTask | undefined
    for (const col of columns) {
      const found = col.tasks?.find(t => t.id === taskId)
      if (found) { task = found; sourceColumn = col; break }
    }
    if (!task || !sourceColumn) return

    // If same column, find new position based on drop position
    const targetColumn = columns.find(c => c.id === targetColumnId)
    if (!targetColumn) return

    // Calculate new position — append to end for simplicity, or use drop Y position
    const tasksInTarget = targetColumn.tasks || []
    const newPos = tasksInTarget.length

    if (sourceColumn.id === targetColumnId && task.position === newPos - 1) {
      // No move needed (already at end of same column)
      handleTaskDragEnd()
      return
    }

    // Optimistic update
    const updatedColumns = columns.map(col => {
      if (col.id === sourceColumn!.id) {
        return { ...col, tasks: (col.tasks || []).filter(t => t.id !== taskId) }
      }
      if (col.id === targetColumnId) {
        return { ...col, tasks: [...(col.tasks || []), { ...task!, columnId: targetColumnId, position: newPos }] }
      }
      return col
    })
    setColumns(updatedColumns)

    try {
      await apiFetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ columnId: targetColumnId, position: newPos }),
      })
      // Refresh to get accurate positions
      fetchBoard()
    } catch (e) {
      // Revert on failure
      setColumns(columns)
    }

    handleTaskDragEnd()
  }

  // === Column drag and drop (reorder) ===
  const handleColumnDragStart = (e: React.DragEvent, columnId: string) => {
    // Only drag from column header, not from task
    if (draggingTaskId) return
    setDraggingColumnId(columnId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/column', columnId)
  }

  const handleColumnDragEnd = () => {
    setDraggingColumnId(null)
  }

  const handleColumnReorder = async (e: React.DragEvent, targetColumnId: string) => {
    if (!draggingColumnId || draggingColumnId === targetColumnId) return
    e.preventDefault()

    const sourceIdx = columns.findIndex(c => c.id === draggingColumnId)
    const targetIdx = columns.findIndex(c => c.id === targetColumnId)
    if (sourceIdx === -1 || targetIdx === -1) return

    // Reorder columns locally
    const reordered = [...columns]
    const [moved] = reordered.splice(sourceIdx, 1)
    reordered.splice(targetIdx, 0, moved)
    setColumns(reordered.map((col, idx) => ({ ...col, position: idx })))

    // Update on server
    try {
      await apiFetch(`/api/projects/${projectId}/columns/${draggingColumnId}`, {
        method: 'PUT',
        body: JSON.stringify({ position: targetIdx }),
      })
      fetchBoard()
    } catch (e) {
      fetchBoard()
    }

    setDraggingColumnId(null)
  }

  // === Task CRUD ===
  const handleCreateTask = async (columnId: string) => {
    if (!newTaskTitle.trim()) return
    try {
      const task = await apiFetch<ProjectTask>(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ columnId, title: newTaskTitle }),
      })
      setColumns(columns.map(col =>
        col.id === columnId
          ? { ...col, tasks: [...(col.tasks || []), task] }
          : col
      ))
      setNewTaskTitle('')
      setAddingToColumn(null)
    } catch (e) {
      alert('Failed to create task')
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return
    try {
      await apiFetch(`/api/projects/${projectId}/tasks/${taskId}`, { method: 'DELETE' })
      setSelectedTask(null)
      setColumns(columns.map(col => ({
        ...col,
        tasks: (col.tasks || []).filter(t => t.id !== taskId),
      })))
    } catch (e) {
      alert('Failed to delete task')
    }
  }

  const handleUpdateTask = async (taskId: string, updates: Record<string, unknown>) => {
    try {
      const updated = await apiFetch<ProjectTask>(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      })
      // Update in board state
      setColumns(prev => prev.map(col => ({
        ...col,
        tasks: (col.tasks || []).map(t => t.id === taskId ? { ...t, ...updated } : t),
      })))
      setSelectedTask(prev => prev ? { ...prev, ...updated } : prev)
    } catch (e) {
      alert('Failed to update task')
    }
  }

  // === Column CRUD ===
  const handleCreateColumn = async (name: string, color: string, wipLimit?: number) => {
    try {
      const column = await apiFetch<ProjectColumn>(`/api/projects/${projectId}/columns`, {
        method: 'POST',
        body: JSON.stringify({ name, color, wipLimit: wipLimit || null }),
      })
      setColumns([...columns, { ...column, tasks: [] }])
      setShowAddColumn(false)
    } catch (e) {
      alert('Failed to create column')
    }
  }

  const handleUpdateColumn = async (columnId: string, updates: Record<string, unknown>) => {
    try {
      const updated = await apiFetch<ProjectColumn>(`/api/projects/${projectId}/columns/${columnId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      })
      setColumns(prev => prev.map(col => col.id === columnId ? { ...col, ...updated } : col))
      setEditingColumn(null)
    } catch (e) {
      alert('Failed to update column')
    }
  }

  const handleDeleteColumn = async (columnId: string) => {
    if (!confirm('Delete this column and all its tasks?')) return
    try {
      await apiFetch(`/api/projects/${projectId}/columns/${columnId}`, { method: 'DELETE' })
      setColumns(columns.filter(c => c.id !== columnId))
      setEditingColumn(null)
    } catch (e) {
      alert('Failed to delete column')
    }
  }

  // === Subtask CRUD ===
  const handleCreateSubtask = async (taskId: string, title: string) => {
    try {
      const subtask = await apiFetch<Subtask>(`/api/projects/${projectId}/tasks/${taskId}/subtasks`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      })
      // Update in both selectedTask and board
      if (selectedTask?.id === taskId) {
        setSelectedTask(prev => prev ? {
          ...prev,
          subtasks: [...(prev.subtasks || []), subtask],
        } : prev)
      }
    } catch (e) {
      alert('Failed to create subtask')
    }
  }

  const handleToggleSubtask = async (taskId: string, subtaskId: string, isCompleted: boolean) => {
    try {
      await apiFetch(`/api/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: 'PUT',
        body: JSON.stringify({ isCompleted: !isCompleted }),
      })
      if (selectedTask?.id === taskId) {
        setSelectedTask(prev => prev ? {
          ...prev,
          subtasks: (prev.subtasks || []).map(s => s.id === subtaskId ? { ...s, isCompleted: !isCompleted } : s),
        } : prev)
      }
    } catch (e) {
      alert('Failed to update subtask')
    }
  }

  const handleDeleteSubtask = async (taskId: string, subtaskId: string) => {
    try {
      await apiFetch(`/api/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' })
      if (selectedTask?.id === taskId) {
        setSelectedTask(prev => prev ? {
          ...prev,
          subtasks: (prev.subtasks || []).filter(s => s.id !== subtaskId),
        } : prev)
      }
    } catch (e) {
      alert('Failed to delete subtask')
    }
  }

  // === Render ===
  if (loading) {
    return (
      <div style={layout.page}>
        <div style={{ ...panel.container, textAlign: 'center' }}>
          <p style={typeography.muted}>Loading board...</p>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div style={layout.page}>
        <div style={{ ...panel.container, textAlign: 'center' }}>
          <p style={{ color: 'var(--rust)', marginBottom: 16 }}>{error || 'Project not found'}</p>
          <button onClick={() => router.push('/projects')} style={buttons.secondary}>← Back to Projects</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '88px 24px 24px' }}>
      {/* Board Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.push('/projects')}
            style={{ ...buttons.small, fontSize: 14 }}
          >
            ← Projects
          </button>
          <span style={{ fontSize: 28 }}>{project.icon || '📋'}</span>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>{project.name}</h1>
            {project.description && (
              <p style={typeography.small}>{project.description}</p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowEditProject(true)}
            style={buttons.secondary}
          >
            ⚙ Board Settings
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="kanban-board-scroll" style={{
        display: 'flex',
        gap: 16,
        overflowX: 'auto',
        paddingBottom: 16,
        minHeight: 'calc(100vh - 220px)',
      }}>
        {columns.map((column) => {
          const tasks = column.tasks || []
          const wipExceeded = column.wipLimit && tasks.length > column.wipLimit
          return (
            <div
              key={column.id}
              className="kanban-column"
              onDragOver={e => handleColumnDragOver(e, column.id)}
              onDrop={e => handleColumnDrop(e, column.id)}
              onDragLeave={() => {
                if (dragOverColumnRef.current === column.id) {
                  dragOverColumnRef.current = null
                  setDragOverColumnId(null)
                }
              }}
              style={{
                minWidth: 300,
                maxWidth: 300,
                flexShrink: 0,
                backgroundColor: 'var(--bg-soft)',
                borderRadius: 12,
                border: dragOverColumnId === column.id
                  ? '2px dashed var(--gold)'
                  : '1px solid var(--panel-border)',
                display: 'flex',
                flexDirection: 'column',
                transition: 'border .2s',
              }}
            >
              {/* Column Header */}
              <div
                draggable={!draggingTaskId}
                onDragStart={e => handleColumnDragStart(e, column.id)}
                onDragEnd={handleColumnDragEnd}
                onDragOver={e => { if (draggingColumnId && draggingColumnId !== column.id) e.preventDefault() }}
                onDrop={e => { if (draggingColumnId) handleColumnReorder(e, column.id) }}
                onClick={() => setEditingColumn(column)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderBottom: '1px solid var(--panel-border)',
                  cursor: 'grab',
                  borderRadius: '12px 12px 0 0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: column.color,
                  }} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{column.name}</span>
                  <span style={{
                    ...typeography.small,
                    backgroundColor: wipExceeded ? 'var(--rust)' : 'var(--panel-elevated)',
                    color: wipExceeded ? '#fff' : 'var(--fg-dim)',
                    borderRadius: 10,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                  }}>
                    {tasks.length}{column.wipLimit ? `/${column.wipLimit}` : ''}
                  </span>
                  {column.isDoneColumn && (
                    <span style={{ fontSize: 12, color: 'var(--emerald)' }}>✓</span>
                  )}
                </div>
              </div>

              {/* Tasks */}
              <div style={{
                flex: 1,
                padding: '8px 8px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                {tasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isDragging={draggingTaskId === task.id}
                    onDragStart={e => handleTaskDragStart(e, task.id)}
                    onDragEnd={handleTaskDragEnd}
                    onClick={() => setSelectedTask(task)}
                  />
                ))}

                {/* Add task inline */}
                {addingToColumn === column.id ? (
                  <div style={{
                    ...panel.compact,
                    padding: 8,
                  }}>
                    <textarea
                      style={{
                        ...forms.textarea,
                        minHeight: 48,
                        fontSize: 13,
                      }}
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      placeholder="Task title..."
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreateTask(column.id) }
                        if (e.key === 'Escape') { setAddingToColumn(null); setNewTaskTitle('') }
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      <button
                        onClick={() => handleCreateTask(column.id)}
                        style={{ ...buttons.small, backgroundColor: 'var(--gold)', color: 'var(--bg)', border: 'none' }}
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setAddingToColumn(null); setNewTaskTitle('') }}
                        style={buttons.small}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingToColumn(column.id)}
                    style={{
                      ...buttons.small,
                      border: '1px dashed var(--panel-border)',
                      backgroundColor: 'transparent',
                      width: '100%',
                      padding: '8px 12px',
                      textAlign: 'left',
                      color: 'var(--fg-dimmer)',
                    }}
                  >
                    + Add task
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {/* Add Column button */}
        <div style={{ minWidth: 60, flexShrink: 0, display: 'flex', alignItems: 'flex-start', paddingTop: 12 }}>
          <button
            onClick={() => setShowAddColumn(true)}
            style={{
              ...buttons.secondary,
              width: 48,
              height: 48,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Task Detail Drawer */}
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          project={project}
          users={users}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updates) => handleUpdateTask(selectedTask.id, updates)}
          onDelete={() => handleDeleteTask(selectedTask.id)}
          onCreateSubtask={(title) => handleCreateSubtask(selectedTask.id, title)}
          onToggleSubtask={(subtaskId, isCompleted) => handleToggleSubtask(selectedTask.id, subtaskId, isCompleted)}
          onDeleteSubtask={(subtaskId) => handleDeleteSubtask(selectedTask.id, subtaskId)}
        />
      )}

      {/* Add Column Modal */}
      {showAddColumn && (
        <ColumnModal
          title="Add Column"
          onClose={() => setShowAddColumn(false)}
          onSave={handleCreateColumn}
        />
      )}

      {/* Edit Column Modal */}
      {editingColumn && (
        <ColumnModal
          title="Edit Column"
          column={editingColumn}
          onClose={() => setEditingColumn(null)}
          onSave={(name, color, wipLimit, isDoneColumn) =>
            handleUpdateColumn(editingColumn.id, { name, color, wipLimit, isDoneColumn })
          }
          onDelete={() => handleDeleteColumn(editingColumn.id)}
        />
      )}

      {/* Edit Project Modal */}
      {showEditProject && (
        <ProjectSettingsModal
          project={project}
          onClose={() => setShowEditProject(false)}
          onSaved={() => { setShowEditProject(false); fetchBoard() }}
        />
      )}
    </div>
  )
}

// ============================================================================
// TaskCard Component
// ============================================================================

function TaskCard({
  task,
  isDragging,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  task: ProjectTask
  isDragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onClick: () => void
}) {
  const overdue = isOverdue(task.dueDate)
  const completedSubtasks = task.subtasks?.filter(s => s.isCompleted).length ?? 0
  const totalSubtasks = task.subtasks?.length ?? 0

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        backgroundColor: 'var(--panel)',
        border: '1px solid var(--panel-border)',
        borderLeft: task.color ? `3px solid ${task.color}` : `3px solid ${PRIORITY_COLORS[task.priority]}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transition: 'opacity .2s, border-color .2s',
      }}
    >
      {/* Labels */}
      {task.labels.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
          {task.labels.map(label => (
            <span
              key={label}
              style={{
                backgroundColor: `${getLabelColor(label)}33`,
                color: getLabelColor(label),
                borderRadius: 4,
                padding: '1px 6px',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <p style={{
        fontSize: 13,
        fontWeight: 500,
        textDecoration: task.completedAt ? 'line-through' : 'none',
        opacity: task.completedAt ? 0.6 : 1,
        marginBottom: 8,
        lineHeight: 1.4,
      }}>
        {task.title}
      </p>

      {/* Footer: priority, assignee, due date, subtasks */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Priority dot */}
          <span
            style={{ ...statusBadge(PRIORITY_COLORS[task.priority]), padding: '2px 6px', fontSize: 10 }}
            title={`Priority: ${PRIORITY_LABELS[task.priority]}`}
          >
            {PRIORITY_LABELS[task.priority]}
          </span>

          {/* Subtask progress */}
          {totalSubtasks > 0 && (
            <span style={{ ...typeography.small, fontSize: 11 }}>
              ☑ {completedSubtasks}/{totalSubtasks}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Due date */}
          {task.dueDate && (
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: overdue ? 'var(--rust)' : 'var(--fg-dim)',
              backgroundColor: overdue ? 'var(--rust)22' : 'transparent',
              borderRadius: 4,
              padding: overdue ? '2px 6px' : '0',
            }}>
              {formatDate(task.dueDate)}
            </span>
          )}

          {/* Assignee avatar */}
          {task.assignee && (
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                backgroundColor: 'var(--gold)',
                color: 'var(--bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
              }}
              title={task.assignee.name}
            >
              {getInitials(task.assignee.name)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TaskDetailDrawer Component (slide-in panel)
// ============================================================================

function TaskDetailDrawer({
  task,
  project,
  users,
  onClose,
  onUpdate,
  onDelete,
  onCreateSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: {
  task: ProjectTask
  project: Project
  users: User[]
  onClose: () => void
  onUpdate: (updates: Record<string, unknown>) => void
  onDelete: () => void
  onCreateSubtask: (title: string) => void
  onToggleSubtask: (subtaskId: string, isCompleted: boolean) => void
  onDeleteSubtask: (subtaskId: string) => void
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')
  const [priority, setPriority] = useState(task.priority)
  const [assignedToId, setAssignedToId] = useState(task.assignedToId || '')
  const [dueDate, setDueDate] = useState(task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '')
  const [labelsInput, setLabelsInput] = useState(task.labels.join(', '))
  const [newSubtask, setNewSubtask] = useState('')
  const [showSubtaskInput, setShowSubtaskInput] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)

  // Sync local state when task changes
  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description || '')
    setPriority(task.priority)
    setAssignedToId(task.assignedToId || '')
    setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '')
    setLabelsInput(task.labels.join(', '))
  }, [task.id, task.title, task.description, task.priority, task.assignedToId, task.dueDate, task.labels])

  const saveField = (field: string, value: unknown) => {
    if (field === 'title' && value === task.title) { setEditingField(null); return }
    if (field === 'description' && value === (task.description || '')) { setEditingField(null); return }
    if (field === 'priority' && value === task.priority) { setEditingField(null); return }
    if (field === 'assignedToId' && value === (task.assignedToId || '')) { setEditingField(null); return }
    if (field === 'dueDate' && value === (task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '')) { setEditingField(null); return }
    if (field === 'labels' && value === task.labels.join(', ')) { setEditingField(null); return }

    const updates: Record<string, unknown> = {}
    if (field === 'title') updates.title = value
    if (field === 'description') updates.description = value || null
    if (field === 'priority') updates.priority = value
    if (field === 'assignedToId') updates.assignedToId = value || null
    if (field === 'dueDate') updates.dueDate = value || null
    if (field === 'labels') {
      updates.labels = (value as string).split(',').map(l => l.trim()).filter(Boolean)
    }

    onUpdate(updates)
    setEditingField(null)
  }

  const completedSubtasks = task.subtasks?.filter(s => s.isCompleted).length ?? 0
  const totalSubtasks = task.subtasks?.length ?? 0
  const progress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          zIndex: 90,
        }}
      />

      {/* Drawer */}
      <div
        className="task-drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          maxWidth: '90vw',
          backgroundColor: 'var(--bg)',
          borderLeft: '1px solid var(--panel-border)',
          overflowY: 'auto',
          zIndex: 91,
          padding: 24,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={typeography.small}>Task Details</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onDelete} style={{ ...buttons.small, color: 'var(--rust)', borderColor: 'var(--rust)' }}>
              Delete
            </button>
            <button onClick={onClose} style={buttons.small}>✕</button>
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 20 }}>
          {editingField === 'title' ? (
            <input
              style={{ ...forms.input, fontSize: 18, fontWeight: 700 }}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={() => saveField('title', title)}
              onKeyDown={e => { if (e.key === 'Enter') saveField('title', title) }}
              autoFocus
            />
          ) : (
            <h2
              onClick={() => setEditingField('title')}
              style={{
                fontSize: 20,
                fontWeight: 700,
                cursor: 'text',
                textDecoration: task.completedAt ? 'line-through' : 'none',
                opacity: task.completedAt ? 0.6 : 1,
              }}
            >
              {task.title}
            </h2>
          )}
        </div>

        {/* Metadata grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 24,
        }}>
          {/* Priority */}
          <div style={forms.group}>
            <label style={forms.label}>Priority</label>
            <select
              style={forms.select}
              value={priority}
              onChange={e => { setPriority(e.target.value as any); saveField('priority', e.target.value) }}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>

          {/* Assignee */}
          <div style={forms.group}>
            <label style={forms.label}>Assignee</label>
            <select
              style={forms.select}
              value={assignedToId}
              onChange={e => { setAssignedToId(e.target.value); saveField('assignedToId', e.target.value) }}
            >
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* Due Date */}
          <div style={forms.group}>
            <label style={forms.label}>Due Date</label>
            <input
              type="date"
              style={forms.input}
              value={dueDate}
              onChange={e => { setDueDate(e.target.value); saveField('dueDate', e.target.value) }}
            />
          </div>

          {/* Labels */}
          <div style={forms.group}>
            <label style={forms.label}>Labels (comma-separated)</label>
            <input
              style={forms.input}
              value={labelsInput}
              onChange={e => setLabelsInput(e.target.value)}
              onBlur={() => saveField('labels', labelsInput)}
              placeholder="bug, urgent, client"
            />
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 24 }}>
          <label style={forms.label}>Description</label>
          {editingField === 'description' ? (
            <textarea
              style={{ ...forms.textarea, minHeight: 120 }}
              value={description}
              onChange={e => setDescription(e.target.value)}
              onBlur={() => saveField('description', description)}
              autoFocus
            />
          ) : (
            <div
              onClick={() => setEditingField('description')}
              style={{
                ...panel.compact,
                cursor: 'text',
                minHeight: 80,
                color: description ? 'var(--fg)' : 'var(--fg-dimmer)',
                fontSize: 14,
                whiteSpace: 'pre-wrap',
              }}
            >
              {description || 'Click to add description...'}
            </div>
          )}
        </div>

        {/* Subtasks / Checklist */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <label style={forms.label}>
              Subtasks {totalSubtasks > 0 && `(${completedSubtasks}/${totalSubtasks})`}
            </label>
            <button
              onClick={() => setShowSubtaskInput(!showSubtaskInput)}
              style={{ ...buttons.small, fontSize: 11 }}
            >
              + Add
            </button>
          </div>

          {/* Progress bar */}
          {totalSubtasks > 0 && (
            <div style={{
              height: 6,
              backgroundColor: 'var(--panel-elevated)',
              borderRadius: 3,
              marginBottom: 12,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                backgroundColor: 'var(--emerald)',
                borderRadius: 3,
                transition: 'width .3s',
              }} />
            </div>
          )}

          {/* Subtask list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {task.subtasks?.map(subtask => (
              <div
                key={subtask.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  backgroundColor: 'var(--panel)',
                }}
              >
                <input
                  type="checkbox"
                  checked={subtask.isCompleted}
                  onChange={() => onToggleSubtask(subtask.id, subtask.isCompleted)}
                  style={{ cursor: 'pointer', accentColor: 'var(--emerald)' }}
                />
                <span style={{
                  flex: 1,
                  fontSize: 13,
                  textDecoration: subtask.isCompleted ? 'line-through' : 'none',
                  opacity: subtask.isCompleted ? 0.5 : 1,
                }}>
                  {subtask.title}
                </span>
                <button
                  onClick={() => onDeleteSubtask(subtask.id)}
                  style={{
                    ...buttons.small,
                    border: 'none',
                    padding: '2px 6px',
                    fontSize: 10,
                    color: 'var(--fg-dimmer)',
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* New subtask input */}
          {showSubtaskInput && (
            <div style={{ marginTop: 8 }}>
              <input
                style={forms.input}
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                placeholder="Subtask title..."
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && newSubtask.trim()) {
                    onCreateSubtask(newSubtask)
                    setNewSubtask('')
                  }
                  if (e.key === 'Escape') { setShowSubtaskInput(false); setNewSubtask('') }
                }}
                onBlur={() => {
                  if (newSubtask.trim()) { onCreateSubtask(newSubtask); setNewSubtask('') }
                  setShowSubtaskInput(false)
                }}
              />
            </div>
          )}
        </div>

        {/* Footer info */}
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--panel-border)' }}>
          <p style={typeography.small}>
            Created by {task.creator?.name || 'Unknown'} • {task.createdAt && new Date(task.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </>
  )
}

// ============================================================================
// ColumnModal Component (add/edit column)
// ============================================================================

function ColumnModal({
  title,
  column,
  onClose,
  onSave,
  onDelete,
}: {
  title: string
  column?: ProjectColumn
  onClose: () => void
  onSave: (name: string, color: string, wipLimit?: number, isDoneColumn?: boolean) => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(column?.name || '')
  const [color, setColor] = useState(column?.color || '#8b8d98')
  const [wipLimit, setWipLimit] = useState(column?.wipLimit?.toString() || '')
  const [isDoneColumn, setIsDoneColumn] = useState(column?.isDoneColumn || false)

  const COLUMN_COLORS = ['#8b8d98', '#60a5fa', '#c9a96e', '#4ade80', '#a78bfa', '#e57373', '#22d3ee', '#f59e0b']

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...panel.container,
          width: 420,
          maxWidth: '90vw',
        }}
      >
        <h2 style={{ ...typeography.subtitle, marginBottom: 24 }}>{title}</h2>

        <div style={forms.group}>
          <label style={forms.label}>Column Name</label>
          <input
            style={forms.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., In Progress"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name, color, wipLimit ? parseInt(wipLimit) : undefined, isDoneColumn) }}
          />
        </div>

        <div style={{ ...forms.group, marginTop: 16 }}>
          <label style={forms.label}>Color</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {COLUMN_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  backgroundColor: c,
                  border: color === c ? '3px solid var(--fg)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ ...forms.group, marginTop: 16 }}>
          <label style={forms.label}>WIP Limit (optional — max cards in column)</label>
          <input
            type="number"
            min={1}
            max={100}
            style={forms.input}
            value={wipLimit}
            onChange={e => setWipLimit(e.target.value)}
            placeholder="e.g., 5 (leave empty for unlimited)"
          />
        </div>

        <div style={{ ...forms.group, marginTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isDoneColumn}
              onChange={e => setIsDoneColumn(e.target.checked)}
              style={{ accentColor: 'var(--emerald)' }}
            />
            <span style={{ fontSize: 14 }}>Done column (tasks here auto-complete)</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'space-between' }}>
          <div>
            {onDelete && (
              <button
                onClick={onDelete}
                style={{ ...buttons.danger, fontSize: 12 }}
              >
                Delete Column
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} style={buttons.secondary}>Cancel</button>
            <button
              onClick={() => name.trim() && onSave(name, color, wipLimit ? parseInt(wipLimit) : undefined, isDoneColumn)}
              disabled={!name.trim()}
              style={{ ...buttons.primary, opacity: name.trim() ? 1 : 0.5 }}
            >
              {column ? 'Save' : 'Add Column'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ProjectSettingsModal Component
// ============================================================================

function ProjectSettingsModal({
  project,
  onClose,
  onSaved,
}: {
  project: Project
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description || '')
  const [color, setColor] = useState(project.color)
  const [icon, setIcon] = useState(project.icon || '📋')
  const [saving, setSaving] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)

  const PROJECT_COLORS = ['#c9a96e', '#60a5fa', '#4ade80', '#a78bfa', '#e57373', '#22d3ee', '#f59e0b', '#ec4899']
  const PROJECT_ICONS = ['📋', '🚀', '🎨', '📦', '🔧', '📊', '🎯', '💡', '🔥', '⚙️']

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiFetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, color, icon }),
      })
      onSaved()
    } catch (e) {
      alert('Failed to save project')
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async () => {
    try {
      await apiFetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isArchived: true }),
      })
      onSaved()
    } catch (e) {
      alert('Failed to archive project')
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...panel.container,
          width: 480,
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h2 style={{ ...typeography.subtitle, marginBottom: 24 }}>Board Settings</h2>

        <div style={forms.group}>
          <label style={forms.label}>Name</label>
          <input style={forms.input} value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div style={{ ...forms.group, marginTop: 16 }}>
          <label style={forms.label}>Description</label>
          <textarea style={forms.textarea} value={description} onChange={e => setDescription(e.target.value)} />
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

        <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowArchiveConfirm(true)}
            style={{ ...buttons.danger, fontSize: 12 }}
          >
            Archive Project
          </button>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} style={buttons.secondary}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              style={{ ...buttons.primary, opacity: (!name.trim() || saving) ? 0.5 : 1 }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {showArchiveConfirm && (
          <div style={{
            ...panel.compact,
            marginTop: 16,
            borderColor: 'var(--rust)',
            backgroundColor: 'var(--rust)11',
          }}>
            <p style={{ fontSize: 13, marginBottom: 12 }}>
              Archive this project? It will be hidden from the active board list but can be restored later.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleArchive} style={{ ...buttons.danger, fontSize: 12 }}>
                Yes, Archive
              </button>
              <button onClick={() => setShowArchiveConfirm(false)} style={buttons.small}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}