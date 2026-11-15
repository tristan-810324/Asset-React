import type { ServiceRequest, ServiceRouteTeam, ServiceWorkflowTask } from './requesterApi'

export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  ELECTRICAL_LIGHTING: 'Electrical & Lighting',
  PLUMBING_WATER: 'Plumbing & Water',
  FURNITURE_CARPENTRY: 'Furniture & Carpentry',
  BUILDING_REPAIR: 'Classroom / Building Repair',
  CLEANING_SANITATION: 'Cleaning & Sanitation',
  EVENT_SETUP_MOVING: 'Event Setup & Moving',
  SAFETY_HAZARD: 'Safety Hazard',
  COMPUTER_DEVICE: 'Computer & Device',
  NETWORK_CONNECTIVITY: 'Network & Connectivity',
  SOFTWARE_ACCESS: 'Software & Access',
  PERIPHERALS_PRINTING: 'Printing & Peripherals',
  OTHER_GENERAL: 'Other General Service',
  OTHERS: 'Others',
}

/** The category name. "Others" shows the description the requester typed, so staff and requesters see the same text. */
export function serviceCategoryText(category: string, detail = '') {
  const label = SERVICE_CATEGORY_LABELS[category] || category.replace(/_/g, ' ')
  return category === 'OTHERS' && detail ? `${label}: ${detail}` : label
}

export type ServiceRequestView = {
  routeTeam: ServiceRouteTeam | null
  category: string
  priority: string
  targetDate: string | null
  deadlineLabel: string
  assignedStaffName: string
  completionNote: string
  autoCloseAt: string | null
  tasks: ServiceWorkflowTask[]
}

const stringValue = (value: unknown) => typeof value === 'string' ? value.trim() : ''

function formTasks(value: unknown): ServiceWorkflowTask[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') return []
    const task = raw as Record<string, unknown>
    const particulars = stringValue(task.particulars)
    const natureOfWork = stringValue(task.natureOfWork)
    return [{
      id: stringValue(task.id) || `submitted-task-${index + 1}`,
      label: particulars || `Work item ${index + 1}`,
      quantity: Number(task.quantity) || 1,
      particulars,
      natureOfWork,
      remarks: stringValue(task.remarks),
      status: 'Submitted',
      completed: false,
    }]
  })
}

/** Normalizes new workflow metadata and old JOB_REQUEST form data into one view model. */
export function serviceRequestView(request: ServiceRequest): ServiceRequestView {
  const workflow = request.serviceWorkflow
  const form = request.formData
  const rawRoute = workflow?.routeTeam || request.routeTeam || stringValue(form.serviceRoute)
  const routeTeam: ServiceRouteTeam | null = rawRoute === 'ITSS' || rawRoute === 'GSO' ? rawRoute : null
  const rawCategory = workflow?.serviceCategory || request.serviceCategory || stringValue(form.serviceCategory)
  const tasks = workflow?.tasks?.length ? workflow.tasks : formTasks(form.tasks)
  return {
    routeTeam,
    category: rawCategory ? serviceCategoryText(rawCategory, stringValue(form.serviceOther)) : 'Service request',
    priority: workflow?.priority || request.priority || 'Standard',
    targetDate: workflow?.targetDate || request.targetDate || stringValue(form.requiredDate) || null,
    deadlineLabel: workflow?.deadlineLabel || request.deadlineLabel || '',
    assignedStaffName: workflow?.assignedStaffName || request.assignedStaffName || '',
    completionNote: workflow?.completionNote || request.completionNote || '',
    autoCloseAt: workflow?.autoCloseAt || request.autoCloseAt || null,
    tasks,
  }
}

export function serviceRouteLabel(routeTeam: ServiceRouteTeam | null) {
  return routeTeam === 'ITSS' ? 'ITSS Support' : routeTeam === 'GSO' ? 'GSO Facilities' : 'Service Team'
}

export function serviceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    Submitted: 'Submitted',
    'Under Review': 'Under review',
    'Needs Information': 'Information needed',
    'In Progress': 'In progress',
    Completed: 'Completed',
    'Awaiting Requester Confirmation': 'Awaiting your confirmation',
    Closed: 'Closed',
    Rejected: 'Rejected',
  }
  return labels[status] || status
}

export function serviceStatusTone(status: string) {
  if (status === 'Awaiting Requester Confirmation') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (status === 'Completed' || status === 'Closed') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'Rejected') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (status === 'Needs Information') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-blue-200 bg-blue-50 text-blue-700'
}
