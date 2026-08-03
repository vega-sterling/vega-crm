export interface User {
  id: string
  email: string
  name: string
  globalRole: 'SUPER_ADMIN' | 'ADMIN' | 'USER'
  isActive?: boolean
  tenantIds?: string[]
}

export interface Tenant {
  id: string
  name: string
  slug: string
  description?: string
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface Company {
  id: string
  tenantId: string
  name: string
  industry?: string
  website?: string
  phone?: string
  email?: string
  address?: string
  description?: string
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface Contact {
  id: string
  companyId: string
  tenantId: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  mobile?: string
  title?: string
  department?: string
  notes?: string
  tags?: string[]
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface Activity {
  id: string
  type: 'CALL' | 'EMAIL' | 'NOTE' | 'MEETING' | 'TASK'
  tenantId: string
  companyId: string
  contactId?: string
  userId: string
  subject: string
  description?: string
  scheduledAt?: string
  completedAt?: string
  callDirection?: string
  callDuration?: number
  callOutcome?: string
  source?: string
  createdAt: string
  updatedAt?: string
  user?: { name: string }
  company?: { id?: string; name: string }
  contact?: { id?: string; firstName: string; lastName: string }
}

export interface Task {
  id: string
  tenantId: string
  companyId: string
  contactId?: string
  title: string
  description?: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  assignedToId: string
  createdById: string
  dueDate?: string
  completedAt?: string
  createdAt?: string
  updatedAt?: string
  assignee?: { name: string }
  creator?: { name: string }
  company?: { id?: string; name: string }
  contact?: { firstName: string; lastName: string }
}

export interface DashboardData {
  stats: {
    companies: number
    contacts: number
    activities: number
    tasks: number
    overdueTasks: number
  }
  recentActivities: Activity[]
  taskSummary: {
    pending: number
    inProgress: number
    completed: number
    overdue: number
  }
}

// ============================================================================
// PROJECTS (Kanban)
// ============================================================================

export interface ProjectColumn {
  id: string
  projectId: string
  name: string
  color: string
  position: number
  wipLimit?: number | null
  isDoneColumn: boolean
  createdAt: string
  updatedAt: string
  tasks?: ProjectTask[]
}

export interface Subtask {
  id: string
  taskId: string
  title: string
  isCompleted: boolean
  position: number
  assignedToId?: string | null
  dueDate?: string | null
  assignee?: { id: string; name: string } | null
}

export interface ProjectTask {
  id: string
  projectId: string
  columnId: string
  tenantId: string
  title: string
  description?: string | null
  position: number
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  assignedToId?: string | null
  createdById: string
  dueDate?: string | null
  completedAt?: string | null
  labels: string[]
  color?: string | null
  createdAt: string
  updatedAt: string
  assignee?: { id: string; name: string } | null
  creator?: { id: string; name: string } | null
  subtasks?: Subtask[]
}

export interface Project {
  id: string
  tenantId: string
  name: string
  description?: string | null
  color: string
  icon?: string | null
  isArchived: boolean
  createdById: string
  createdAt: string
  updatedAt: string
  creator?: { id: string; name: string } | null
  columns?: ProjectColumn[]
  _count?: { tasks: number; columns: number }
}
