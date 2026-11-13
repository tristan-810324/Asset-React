import { apiRequest } from '../auth/authApi'

export type RequestType = 'BORROWING' | 'FACILITY_USE' | 'JOB_REQUEST' | 'PURCHASE_REQUISITION' | 'LOSS_DAMAGE_REPORT' | 'ISSUANCE_REQUEST'

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

export type PurchaseRequisitionAllocation = {
  id: string
  itemId: string
  itemCode: string
  inventoryName: string
  quantity: number
  fulfilledQuantity: number
  status: 'Reserved' | 'Fulfilled' | 'Released'
  unitOfMeasure: string
}

export type PurchaseRequisitionRecipient = {
  employeeCode: string
  employeeName: string
  quantity: number
  useLocation: string
  purpose: string
}

export type StaffRoute = 'ISSUE' | 'HEAD_ISSUE' | 'PURCHASE'

// Live stock and rule check the server adds to items GSO Staff still has to route.
export type PurchaseRequisitionStockCheck = {
  route: StaffRoute
  // Routes GSO Staff may pick; the first is the default. Two options means the staff member decides.
  options: StaffRoute[]
  availableQuantity: number
  reservedQuantity: number
  matches: Array<{ itemId: string; itemCode: string; name: string; unitOfMeasure: string; availableQuantity: number; reserveQuantity: number }>
}

export type PurchaseRequisitionLine = {
  id: string
  lineNumber: number
  itemNameId: string | null
  category: string
  itemName: string
  specifications: string
  requestedQuantity: number
  approvalPolicy: 'GSO_HEAD' | 'STAFF_ISSUE'
  staffIssueMaxQuantity: number | null
  reservedQuantity: number
  financeQuantity: number
  issuedQuantity: number
  routeStatus: string
  reviewNote: string
  pendingBatchId?: string | null
  issuedRecipients?: PurchaseRequisitionRecipient[]
  allocations: PurchaseRequisitionAllocation[]
  receipts?: PurchaseRequisitionReceipt[]
  stockCheck?: PurchaseRequisitionStockCheck
}

// A purchased delivery GSO Staff recorded in Item Master Data and linked to a requisition item.
export type PurchaseRequisitionReceipt = {
  id: string
  itemCode: string
  inventoryName: string
  quantity: number
  unitOfMeasure: string
  receiptReference: string
  receivedBy: string | null
  receivedAt: string
  // An undone link stays on record, marked with who undid it and when.
  voidedAt?: string | null
  voidedBy?: string | null
}

export type ServiceRequest = {
  id: string
  referenceNo: string
  requestType: RequestType
  title: string
  formData: Record<string, unknown> & {
    departmentOrganization?: string
    requesterEmployeeCode?: string
    requesterPosition?: string
    returnDate?: string
    responseMessages?: Array<{ message: string; createdAt: string }>
  }
  status: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
  gsoHeadEndorsedByUserId?: string | null
  gsoHeadEndorsedAt?: string | null
  financeEmail?: string | null
  financeSentAt?: string | null
  financeMessageId?: string | null
  staffReviewedAt?: string | null
  staffReviewedBy?: string | null
  staffReviewNote?: string
  requesterId: string
  requesterName: string
  requesterEmail: string
  assets: RequestAsset[]
  history: RequestHistory[]
  labelsAllPrinted?: boolean
  returnedItems?: Array<{ id: string; itemName: string; itemCode: string; tagCode: string | null; quantity: number; unitOfMeasure: string; employeeName: string; condition: string; status: string; returnedAt: string }>
  purchaseLines?: PurchaseRequisitionLine[]
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
  trackingMode: 'individual' | 'quantity'
  issueBehavior: 'consumable' | 'returnable'
}

export type PurchaseItemName = {
  id: string
  name: string
  category: string
  approvalPolicy: 'GSO_HEAD' | 'STAFF_ISSUE'
  staffIssueMaxQuantity: number | null
}

export type RequesterIdentityStatus = 'Incomplete' | 'Pending' | 'Verified' | 'Needs Correction'

export type RequesterIdentity = {
  userId: string | number
  accountName: string
  accountEmail: string
  employeeCode: string
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  department: string
  position: string
  contactNumber: string
  pictureData: string | null
  /** Set by the GSO review queue, which omits pictureData; load it with getRequesterIdentityPicture. */
  hasPicture?: boolean
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

export type RequesterIdentityInput = Pick<RequesterIdentity, 'employeeCode' | 'firstName' | 'middleName' | 'lastName' | 'suffix' | 'department' | 'position' | 'contactNumber'>

export type RequesterMasterDataChoice = { id: string; name: string }

export type RequesterIssuanceApproval = {
  id: string
  status: string
  requestedAt: string
  decidedAt?: string | null
  decisionNote?: string | null
  expiresAt?: string
  borrowUseDate: string | null
  expectedReturnDate: string | null
  borrowUseAt?: string | null
  expectedReturnAt?: string | null
  useLocation: string | null
  usePurpose: string | null
  employeeCode: string
  employeeName: string
  requestedBy: string | null
  items: Array<{
    issuanceId: string
    itemCode: string
    itemName: string
    recipientEmployeeCode: string
    recipientEmployeeName: string
    recipientLocation: string
    recipientPurpose: string
    trackingMode: 'individual' | 'quantity'
    issueBehavior: 'consumable' | 'returnable'
    status?: string
    condition: string
    quantity: number
    returnedQuantity?: number
    returnedAt?: string | null
    returnedByName?: string | null
    returnCondition?: string | null
    unitOfMeasure: string
    notes: string
    tags?: Array<{ tagCode: string; unitNumber: number }>
  }>
}

export type RequesterIssuanceDecision = {
  status: string
  employeeName: string
  employeeCode: string
  generatedTagCount: number
  alreadyDecided?: boolean
}

export type RequesterDepartmentStaff = {
  employeeCode: string
  employeeName: string
  email: string
  position: string
}

export type RequesterDepartmentReturn = {
  id: string
  status: string
  condition: string
  reason: string
  returnedByName: string | null
  requestedAt: string
  decidedAt: string | null
  quantity: number
  unitOfMeasure: string
  employeeCode: string
  employeeName: string
  itemCode: string
  itemName: string
  tagCode: string | null
  department: string
  recipientLocation?: string
  recipientPurpose?: string
  // BORROWING rows come from a returned borrowing; requestId links to its request details.
  source?: 'ISSUANCE' | 'BORROWING'
  requestId?: string | null
}

export type RequesterDepartmentIssuanceSummary = {
  totalIssuedUnits: number
  remainingUnits?: number
}

export async function listRequesterDepartments() {
  return apiRequest<{ departments: Array<{ id: string; name: string }> }>('/departments')
}

export async function listRequesterPositions() {
  return apiRequest<{ positions: RequesterMasterDataChoice[] }>('/employees/positions').then((data) => data.positions)
}

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  BORROWING: 'Borrow an Asset',
  FACILITY_USE: 'Facility Use Permit',
  JOB_REQUEST: 'Job / Service Request',
  PURCHASE_REQUISITION: 'Purchase Requisition',
  LOSS_DAMAGE_REPORT: 'Loss / Damage Report',
  ISSUANCE_REQUEST: 'Item Issuance Request',
}

export function listCatalogAssets() {
  return apiRequest<{ items: CatalogAsset[] }>('/requests/assets').then((data) => data.items)
}

export function listPurchaseItemNames() {
  return apiRequest<{ itemNames: PurchaseItemName[] }>('/requests/purchase-item-names').then((data) => data.itemNames)
}

export function listRequesterDepartmentStaff() {
  return apiRequest<{ staff: RequesterDepartmentStaff[] }>('/requests/requester-staff').then((data) => data.staff)
}

export function listMyRequests() {
  return apiRequest<{ requests: ServiceRequest[] }>('/requests/mine').then((data) => data.requests)
}

export type RequesterActivity = {
  id: string
  entityType: string
  entityName: string
  entityKey: string
  action: string
  reason: string
  flag: string | null
  changedAt: string
}

export function listMyActivity() {
  return apiRequest<{ activities: RequesterActivity[] }>('/requests/mine/activity').then((data) => data.activities)
}

export function listMyPendingIssuanceBatches() {
  return apiRequest<{ batches: RequesterIssuanceApproval[] }>('/issuances/mine/pending').then((data) => data.batches)
}

export function listMyIssuanceActivity() {
  return apiRequest<{ batches: RequesterIssuanceApproval[] }>('/issuances/mine/activity').then((data) => data.batches)
}

export function listMyDepartmentReturns() {
  return apiRequest<{ returns: RequesterDepartmentReturn[] }>('/issuances/mine/department-returns').then((data) => data.returns)
}

export function getMyDepartmentIssuanceSummary() {
  return apiRequest<{ summary: RequesterDepartmentIssuanceSummary }>('/issuances/mine/department-issuance-summary').then((data) => data.summary)
}

export function decideMyIssuanceBatch(batchId: string, action: 'acknowledge') {
  return apiRequest<{ decision: RequesterIssuanceDecision }>(`/issuances/mine/${encodeURIComponent(batchId)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  }).then((data) => data.decision)
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

export function getRequesterIdentityPicture(userId: string | number) {
  return apiRequest<{ pictureData: string | null }>(`/requester-identity/reviews/${encodeURIComponent(String(userId))}/picture`).then((data) => data.pictureData)
}

export function reviewRequesterIdentity(userId: string | number, payload: {
  status: 'Verified' | 'Needs Correction'
  note: string
  department?: string
  position?: string
  addDepartment?: boolean
  addPosition?: boolean
}) {
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
  payload: { status: string; note?: string; dueDate?: string; conditionOut?: string; conditionIn?: string; conditionsIn?: Record<string, string> },
) {
  return apiRequest<{ request: ServiceRequest }>(`/requests/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((data) => data.request)
}
