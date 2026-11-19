import { apiRequest } from '../auth/authApi'

/**
 * Service work orders are the operational view of requester Job / Service
 * Requests.  Keeping the types here (instead of in a page component) lets the
 * dashboard and the workboard present the same live information.
 */
export type ServiceWorkTeam = 'GSO' | 'ITSS'

export type ServiceWorkQueue =
  | 'new'
  | 'review'
  | 'active'
  | 'due_today'
  | 'overdue'
  | 'awaiting_confirmation'
  | 'closed'

export type WorkOrderRequester = {
  id?: string
  name?: string
  email?: string
  department?: string
  position?: string
}

export type WorkOrderAssignee = {
  id?: string
  name?: string
  email?: string
} | string | null

export type WorkOrderChecklistItem = {
  id: string
  title: string
  completed?: boolean
  completedAt?: string | null
  note?: string | null
  details?: string | null
}

export type WorkOrderHistoryItem = {
  id: string
  status?: string
  previousStatus?: string | null
  note?: string
  changedAt: string
  changedBy?: string | null
  actorName?: string | null
}

export type ServiceWorkOrder = {
  id: string
  referenceNo: string
  title: string
  description?: string | null
  status: string
  routeTeam: ServiceWorkTeam
  serviceCategory?: string | null
  priority?: 'Urgent' | 'High' | 'Standard' | string | null
  deadlineLabel?: string | null
  targetDate?: string | null
  location?: string | null
  requester?: WorkOrderRequester | null
  claimedBy?: WorkOrderAssignee
  assignedTo?: WorkOrderAssignee
  checklist?: WorkOrderChecklistItem[]
  history?: WorkOrderHistoryItem[]
  transfers?: WorkOrderHistoryItem[]
  createdAt?: string
  updatedAt?: string
  completedAt?: string | null
  completedBy?: string | null
  completionNote?: string | null
  requesterConfirmedAt?: string | null
  closedAt?: string | null
  isOverdue?: boolean
  isDueToday?: boolean
  // Raw work-order fields are included so the normaliser can support a newly
  // migrated backend as well as its friendly view-model response.
  formData?: Record<string, unknown>
  tasks?: unknown
  requesterId?: string
  requesterName?: string
  requesterEmail?: string
  assignedStaffId?: string | null
  assignedStaffName?: string | null
  assignedStaffEmail?: string | null
  workCompletedAt?: string | null
  awaitingConfirmationAt?: string | null
  requestClosedAt?: string | null
}

export type ServiceWorkSummary = {
  new: number
  underReview: number
  dueToday: number
  overdue: number
  inProgress: number
  active: number
  awaitingConfirmation: number
  closed: number
  total: number
}

export type ListServiceWorkOrdersOptions = {
  team?: ServiceWorkTeam
  queue?: ServiceWorkQueue
  search?: string
  limit?: number
  offset?: number
}

const emptySummary: ServiceWorkSummary = {
  new: 0,
  underReview: 0,
  dueToday: 0,
  overdue: 0,
  inProgress: 0,
  active: 0,
  awaitingConfirmation: 0,
  closed: 0,
  total: 0,
}

function normaliseChecklist(value: unknown): WorkOrderChecklistItem[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return {
      id: String(record.id ?? `task-${index}`),
      title: String(record.title ?? record.label ?? record.task ?? record.particulars ?? `Service task ${index + 1}`),
      completed: Boolean(record.completed ?? record.isCompleted),
      completedAt: typeof record.completedAt === 'string' ? record.completedAt : null,
      note: typeof record.note === 'string' ? record.note : null,
      details: typeof record.details === 'string' ? record.details : typeof record.natureOfWork === 'string' ? record.natureOfWork : null,
    }
  })
}

function normaliseHistory(value: unknown): WorkOrderHistoryItem[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return {
      id: String(record.id ?? `history-${index}`),
      status: typeof record.status === 'string' ? record.status : undefined,
      previousStatus: typeof record.previousStatus === 'string' ? record.previousStatus : null,
      note: typeof record.note === 'string' ? record.note : '',
      changedAt: typeof record.changedAt === 'string' ? record.changedAt : new Date(0).toISOString(),
      changedBy: typeof record.changedBy === 'string' ? record.changedBy : null,
      actorName: typeof record.actorName === 'string' ? record.actorName : null,
    }
  })
}

/**
 * The API is deliberately normalised at the boundary. It keeps the interface
 * resilient to older rows that do not have optional workflow fields yet.
 */
export function normaliseServiceWorkOrder(value: ServiceWorkOrder): ServiceWorkOrder {
  const formData = value.formData && typeof value.formData === 'object' ? value.formData : {}
  const assigned = value.claimedBy ?? value.assignedTo ?? (value.assignedStaffName
    ? { id: value.assignedStaffId ?? undefined, name: value.assignedStaffName, email: value.assignedStaffEmail ?? undefined }
    : null)
  const targetDate = value.targetDate ?? (typeof formData.requiredDate === 'string' ? formData.requiredDate : null)
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const status = String(value.status ?? '')
  const isOpen = !['Closed', 'Rejected', 'Cancelled'].includes(status)
  const priority = value.priority ? `${value.priority.charAt(0).toUpperCase()}${value.priority.slice(1).toLowerCase()}` : null
  return {
    ...value,
    routeTeam: value.routeTeam === 'ITSS' ? 'ITSS' : 'GSO',
    priority,
    targetDate,
    location: value.location ?? (typeof formData.location === 'string' ? formData.location : null),
    description: value.description ?? (typeof formData.purpose === 'string' ? formData.purpose : typeof formData.remarks === 'string' ? formData.remarks : null),
    requester: value.requester ?? {
      id: value.requesterId,
      name: value.requesterName,
      email: value.requesterEmail,
      department: typeof formData.departmentOrganization === 'string' ? formData.departmentOrganization : undefined,
    },
    claimedBy: assigned,
    assignedTo: assigned,
    checklist: normaliseChecklist(value.checklist ?? value.tasks),
    history: normaliseHistory(value.history),
    transfers: normaliseHistory(value.transfers),
    completedAt: value.completedAt ?? value.workCompletedAt ?? null,
    closedAt: value.closedAt ?? value.requestClosedAt ?? null,
    isOverdue: Boolean(value.isOverdue ?? (Boolean(targetDate && targetDate < todayKey) && isOpen)),
    isDueToday: Boolean(value.isDueToday ?? (Boolean(targetDate) && targetDate === todayKey && isOpen)),
  }
}

export async function listServiceWorkOrders(options: ListServiceWorkOrdersOptions = {}) {
  const query = new URLSearchParams()
  if (options.team) query.set('team', options.team)
  if (options.queue) query.set('queue', options.queue)
  if (options.search?.trim()) query.set('search', options.search.trim())
  if (options.limit) query.set('limit', String(options.limit))
  if (options.offset) query.set('offset', String(options.offset))

  const result = await apiRequest<{ workOrders: ServiceWorkOrder[]; summary?: Partial<ServiceWorkSummary> }>(
    `/requests/service-work-orders${query.size ? `?${query.toString()}` : ''}`,
  )

  return {
    workOrders: (result.workOrders ?? []).map(normaliseServiceWorkOrder),
    summary: { ...emptySummary, ...(result.summary ?? {}) },
  }
}

export async function getServiceWorkOrder(id: string) {
  const result = await apiRequest<{ workOrder: ServiceWorkOrder }>(`/requests/service-work-orders/${encodeURIComponent(id)}`)
  return normaliseServiceWorkOrder(result.workOrder)
}

async function workOrderAction<T extends Record<string, unknown> = Record<string, never>>(id: string, action: string, body?: T) {
  const result = await apiRequest<{ workOrder: ServiceWorkOrder }>(
    `/requests/service-work-orders/${encodeURIComponent(id)}/${action}`,
    { method: 'POST', body: JSON.stringify(body ?? {}) },
  )
  return normaliseServiceWorkOrder(result.workOrder)
}

export function claimServiceWorkOrder(id: string) {
  return workOrderAction(id, 'claim')
}

export function forwardServiceWorkOrder(id: string, team: ServiceWorkTeam, note?: string) {
  return workOrderAction(id, 'forward', { team, ...(note?.trim() ? { note: note.trim() } : {}) })
}

export function startServiceWorkOrder(id: string, note?: string) {
  return workOrderAction(id, 'start', note?.trim() ? { note: note.trim() } : {})
}

export function completeServiceWorkOrder(
  id: string,
  payload: { completionNote: string; taskUpdates?: Array<{ id: string; completed: boolean }>; incompleteReason?: string },
) {
  return workOrderAction(id, 'complete', payload)
}

// The job is not finished yet: the reason is recorded and the job stays In Progress.
export function notFinishServiceWorkOrder(id: string, reason: string, expectedDate: string) {
  return workOrderAction(id, 'not-finished', { reason, expectedDate })
}

export function rejectServiceWorkOrder(id: string, reason: string) {
  return workOrderAction(id, 'reject', { reason: reason.trim() })
}

export function takeOverServiceWorkOrder(id: string, note?: string) {
  return workOrderAction(id, 'takeover', note?.trim() ? { note: note.trim() } : {})
}
