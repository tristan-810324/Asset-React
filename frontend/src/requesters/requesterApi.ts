import { apiRequest } from '../auth/authApi'

export type RequestType = 'BORROWING' | 'FACILITY_USE' | 'JOB_REQUEST' | 'PURCHASE_REQUISITION' | 'LOSS_DAMAGE_REPORT'

export type RequestAsset = {
  id: string
  itemId: string
  itemCode: string
  itemName: string
  quantity: number
  unitOfMeasure: string
  conditionOut: string | null
  conditionIn: string | null
  dueDate: string | null
  issuedAt: string | null
  returnedAt: string | null
}

export type RequestHistory = {
  id: string
  previousStatus: string | null
  status: string
  note: string
  changedBy: string | null
  changedAt: string
}

export type ServiceRequest = {
  id: string
  referenceNo: string
  requestType: RequestType
  title: string
  formData: Record<string, any>
  status: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
  requesterId: string
  requesterName: string
  requesterEmail: string
  assets: RequestAsset[]
  history: RequestHistory[]
}

export type CatalogAsset = {
  id: string
  itemCode: string
  name: string
  category: string
  description: string
  condition: string
  unitOfMeasure: string
  availableQuantity: number
}

export type RequesterIdentityStatus = 'Incomplete' | 'Pending' | 'Verified' | 'Needs Correction'

export type RequesterIdentity = {
  userId: string | number
  accountName: string
  accountEmail: string
  employeeCode: string
  department: string
  position: string
  contactNumber: string
  status: RequesterIdentityStatus
  reviewNote: string
  submittedAt: string | null
  reviewedAt: string | null
  matchedEmployeeCode: string | null
  matchedDepartment: string | null
  matchedPosition: string | null
  matchedEmail: string | null
  matchedEmployeeStatus: string | null
  employeeRecordMatch: boolean
}

export type RequesterIdentityInput = Pick<RequesterIdentity, 'employeeCode' | 'department' | 'position' | 'contactNumber'>

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  BORROWING: 'Borrow an Asset',
  FACILITY_USE: 'Facility Use Permit',
  JOB_REQUEST: 'Job / Service Request',
  PURCHASE_REQUISITION: 'Purchase Requisition',
  LOSS_DAMAGE_REPORT: 'Loss / Damage Report',
}

export function listCatalogAssets() {
  return apiRequest<{ items: CatalogAsset[] }>('/requests/assets').then((data) => data.items)
}

export function listMyRequests() {
  return apiRequest<{ requests: ServiceRequest[] }>('/requests/mine').then((data) => data.requests)
}

export function getMyRequest(id: string) {
  return apiRequest<{ request: ServiceRequest }>(`/requests/mine/${encodeURIComponent(id)}`).then((data) => data.request)
}

export function submitRequest(requestType: RequestType, formData: Record<string, unknown>) {
  return apiRequest<{ request: ServiceRequest }>('/requests', {
    method: 'POST',
    body: JSON.stringify({ requestType, formData }),
  }).then((data) => data.request)
}

export function cancelMyRequest(id: string) {
  return apiRequest<{ request: ServiceRequest }>(`/requests/mine/${encodeURIComponent(id)}/cancel`, { method: 'POST' }).then((data) => data.request)
}

export function respondToRequest(id: string, message: string) {
  return apiRequest<{ request: ServiceRequest }>(`/requests/mine/${encodeURIComponent(id)}/respond`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  }).then((data) => data.request)
}

export function requestAssetReturn(id: string) {
  return apiRequest<{ request: ServiceRequest }>(`/requests/mine/${encodeURIComponent(id)}/return`, { method: 'POST' }).then((data) => data.request)
}

export function getMyRequesterIdentity() {
  return apiRequest<{ identity: RequesterIdentity }>('/requester-identity/me').then((data) => data.identity)
}

export function submitRequesterIdentity(identity: RequesterIdentityInput) {
  return apiRequest<{ identity: RequesterIdentity }>('/requester-identity/me', {
    method: 'PUT',
    body: JSON.stringify(identity),
  }).then((data) => data.identity)
}

export function listRequesterIdentityReviews(status = 'all') {
  const query = new URLSearchParams()
  if (status !== 'all') query.set('status', status)
  return apiRequest<{ profiles: RequesterIdentity[] }>(`/requester-identity/reviews${query.size ? `?${query.toString()}` : ''}`).then((data) => data.profiles)
}

export function reviewRequesterIdentity(userId: string | number, payload: { status: 'Verified' | 'Needs Correction'; note: string }) {
  return apiRequest<{ identity: RequesterIdentity }>(`/requester-identity/reviews/${encodeURIComponent(String(userId))}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((data) => data.identity)
}

export type GsoRequestFilters = { type?: string; status?: string; search?: string }

export function listGsoRequests(filters: GsoRequestFilters = {}) {
  const query = new URLSearchParams()
  if (filters.type) query.set('type', filters.type)
  if (filters.status) query.set('status', filters.status)
  if (filters.search) query.set('search', filters.search)
  return apiRequest<{ requests: ServiceRequest[] }>(`/requests${query.size ? `?${query.toString()}` : ''}`).then((data) => data.requests)
}

export function updateGsoRequestStatus(
  id: string,
  payload: { status: string; note?: string; dueDate?: string; conditionOut?: string; conditionIn?: string },
) {
  return apiRequest<{ request: ServiceRequest }>(`/requests/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((data) => data.request)
}
