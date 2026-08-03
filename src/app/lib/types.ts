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

// ============================================================================
// DEALS (Sales Pipeline)
// ============================================================================

export interface PipelineStage {
  id: string
  tenantId: string
  name: string
  color: string
  position: number
  probability: number
  isWonStage: boolean
  isLostStage: boolean
  createdAt: string
  updatedAt: string
  deals?: Deal[]
  _count?: { deals: number }
}

export interface Deal {
  id: string
  tenantId: string
  companyId: string
  contactId?: string | null
  title: string
  description?: string | null
  value: number
  currency: string
  probability: number
  stageId: string
  assignedToId?: string | null
  createdById: string
  expectedCloseDate?: string | null
  actualCloseDate?: string | null
  status: 'OPEN' | 'WON' | 'LOST'
  lossReason?: string | null
  leadSource?: string | null
  createdAt: string
  updatedAt: string
  company?: { id: string; name: string } | null
  contact?: { id: string; firstName: string; lastName: string } | null
  stage?: PipelineStage | null
  assignee?: { id: string; name: string } | null
  creator?: { id: string; name: string } | null
  activities?: Activity[]
}

// ============================================================================
// CUSTOM PROPERTIES
// ============================================================================

export interface CustomProperty {
  id: string
  tenantId: string
  name: string
  label: string
  entityType: 'COMPANY' | 'CONTACT'
  fieldType: 'TEXT' | 'NUMBER' | 'DROPDOWN' | 'DATE' | 'BOOLEAN'
  options?: { value: string; label: string }[] | null
  defaultValue?: string | null
  isRequired: boolean
  isVisible: boolean
  position: number
  createdAt: string
  updatedAt: string
}

export interface CustomValue {
  id: string
  propertyId: string
  entityType: 'COMPANY' | 'CONTACT'
  entityId: string
  value?: string | null
}

// ============================================================================
// EMAIL
// ============================================================================

export interface EmailMessage {
  id: string
  tenantId: string
  userId: string
  companyId?: string | null
  contactId?: string | null
  dealId?: string | null
  threadId: string
  messageId: string
  direction: 'INBOUND' | 'OUTBOUND'
  fromEmail: string
  toEmail: string
  ccEmail?: string | null
  subject: string
  body: string
  isRead: boolean
  syncedAt?: string | null
  createdAt: string
}

export interface EmailTemplate {
  id: string
  tenantId: string
  name: string
  subject: string
  body: string
  variables: string[]
  createdById: string
  createdAt: string
  updatedAt: string
}

export interface EmailSequence {
  id: string
  tenantId: string
  name: string
  description?: string | null
  steps: { subject: string; body: string; delayDays: number }[]
  createdById: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface SequenceEnrollment {
  id: string
  sequenceId: string
  contactId: string
  currentStep: number
  enrolledAt: string
  completedAt?: string | null
  status: 'ACTIVE' | 'COMPLETED' | 'UNSUBSCRIBED'
}

// ============================================================================
// WORKFLOWS
// ============================================================================

export interface Workflow {
  id: string
  tenantId: string
  name: string
  description?: string | null
  triggerType: 'DEAL_STAGE_CHANGE' | 'NEW_CONTACT' | 'TASK_ASSIGNED' | 'EMAIL_RECEIVED' | 'DEAL_CREATED'
  triggerConfig?: Record<string, unknown> | null
  conditions: { field: string; operator: string; value: unknown }[]
  actions: { type: string; config: Record<string, unknown> }[]
  isActive: boolean
  executionCount: number
  lastExecutedAt?: string | null
  createdById: string
  createdAt: string
  updatedAt: string
}

// ============================================================================
// CALENDAR & BOOKINGS
// ============================================================================

export interface CalendarEvent {
  id: string
  tenantId: string
  userId: string
  companyId?: string | null
  contactId?: string | null
  googleEventId?: string | null
  title: string
  description?: string | null
  startTime: string
  endTime: string
  location?: string | null
  attendees: string[]
  status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED'
  createdAt: string
  updatedAt: string
}

export interface BookingSlot {
  id: string
  tenantId: string
  userId: string
  weekday: number
  startTime: string
  endTime: string
  durationMinutes: number
  isActive: boolean
  createdAt: string
}

export interface Booking {
  id: string
  bookingSlotId: string
  contactId: string
  companyId?: string | null
  scheduledAt: string
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
  notes?: string | null
  createdAt: string
}
