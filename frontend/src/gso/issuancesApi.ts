import { apiRequest } from '../auth/authApi'

export type EmployeeIssuanceRecord = {
  assignedItems: Array<{
    id: string
    code: string
    name: string
    trackingMode: 'individual' | 'quantity'
    issueBehavior: 'consumable' | 'returnable'
    condition: string
    quantity: number
    unitOfMeasure: string
    assignedOn: string
    assetTagCodes: string[]
  }>
  history: Array<{
    date: string
    event: string
    item: string
    code: string
    assetTagCode?: string | null
    quantity: number
    unitOfMeasure: string
    note: string
    returnId?: string | null
    returnCondition?: string | null
    returnedByName?: string | null
    confirmationMethod?: ConfirmationMethod | null
    repairOutcome?: 'Repaired' | 'Written Off' | null
    repairResolvedAt?: string | null
    approvalAction?: ApprovalAction | null
    approvalDecisionNote?: string | null
  }>
}

export type ApprovalIssuanceItem = {
  itemCode: string
  itemName: string
  condition: string
  quantity: number
  unitOfMeasure: string
}

export type ApprovalIssuance = {
  status: string
  expiresAt: string
  condition: string
  requestedAt: string
  employeeName: string
  employeeCode: string
  itemCode: string
  itemName: string
  quantity?: number
  unitOfMeasure?: string
  items?: ApprovalIssuanceItem[]
}

export type ApprovalReturn = ApprovalIssuance & { reason: string }

export type ReturnLine = { condition: string; quantity: number }

export type EmployeeReturnRequest = {
  id: string
  lines: Array<ReturnLine & { id: string; status: string }>
  confirmationMethod: 'employee_code' | 'admin_override'
  employeeCode: string
  employeeName: string
  itemCode: string
  itemName: string
  quantity: number
  remainingQuantity: number
  unitOfMeasure: string
  reason: string
  emailQueued: boolean
}

export type ConfirmationMethod = 'scan' | 'typed_code' | 'employee_code' | 'admin_override'

export type IssuanceRecordReturn = {
  id: string
  status: 'Returned' | 'Lost' | 'Voided'
  quantity: number
  condition: string
  reason: string
  returnedAt: string
  processedBy: string | null
  confirmationMethod: ConfirmationMethod | null
  returnedByName: string | null
  tagCode: string | null
  repairOutcome: 'Repaired' | 'Written Off' | null
  repairResolvedAt: string | null
  settlementStatus: 'Pending' | 'Replaced' | 'Paid' | 'Waived' | null
  settlementNote: string | null
  settledAt: string | null
  voidReason: string | null
}

export type IssuanceRecordStatus =
  | 'Pending acknowledgment'
  | 'Issued'
  | 'Overdue'
  | 'Partially returned'
  | 'Returned'
  | 'Lost'
  | 'Consumed'
  | 'Rejected'
  | 'Expired'
  | 'Email failed'

// One GSO issuance with every return recorded against it.
export type IssuanceRecord = {
  id: string
  issuanceStatus: 'Pending' | 'Issued' | 'Returned' | 'Rejected' | 'Expired' | 'Email Failed'
  status: IssuanceRecordStatus
  quantity: number
  accountedQuantity: number
  returnedQuantity: number
  lostQuantity: number
  outQuantity: number
  isOverdue: boolean
  unitOfMeasure: string
  conditionAtIssue: string
  issueNote: string | null
  decisionNote: string | null
  requestedAt: string
  decidedAt: string | null
  issuedBy: string | null
  dueAt: string | null
  purpose: string | null
  useLocation: string | null
  itemCode: string
  itemName: string
  category: string
  trackingMode: 'individual' | 'quantity'
  issueBehavior: 'returnable' | 'consumable'
  employeeCode: string
  employeeName: string
  department: string
  position: string
  tagCodes: string[]
  returns: IssuanceRecordReturn[]
}

export type HoldingEntry = {
  issuanceId: string
  source: 'GSO issuance' | 'Request Center'
  employeeCode: string | null
  employeeName: string
  department: string
  itemCode: string
  itemName: string
  trackingMode: 'individual' | 'quantity'
  quantity: number
  unitOfMeasure: string
  conditionAtIssue: string | null
  issuedAt: string | null
  dueAt: string | null
  isOverdue: boolean
  tagCodes: string[]
  referenceNo: string | null
}

export type AccountabilityEntry = {
  returnId: string
  employeeCode: string
  employeeName: string
  itemCode: string
  itemName: string
  quantity: number
  unitOfMeasure: string
  tagCode: string | null
  reportedAt: string
  reason: string
  // Set while a GSO request waits for IT Admin; cleared when IT Admin declines it.
  approvalAction: ApprovalAction | null
  approvalNote: string | null
  approvalDecisionNote: string | null
}

export type ApprovalAction = 'Written Off' | 'Paid' | 'Replaced'

export type ApprovalRequest = {
  returnId: string
  action: ApprovalAction
  note: string
  requestedAt: string
  requestedBy: string | null
  requestedByYou: boolean
  quantity: number
  condition: string
  returnedAt: string
  reason: string
  unitOfMeasure: string
  itemCode: string
  itemName: string
  employeeCode: string
  employeeName: string
  tagCode: string | null
}

// GSO asks IT Admin to write off a damaged return, or to settle a lost one as paid or replaced.
export async function requestReturnApproval(returnId: string, action: ApprovalAction, note: string) {
  const result = await apiRequest<{ result: { returnId: string; approvalAction: ApprovalAction } }>(
    `/issuances/returns/${encodeURIComponent(returnId)}/approval-request`,
    { method: 'POST', body: JSON.stringify({ action, note }) },
  )
  return result.result
}

export async function decideApprovalRequest(returnId: string, decision: 'approve' | 'reject', note: string) {
  const result = await apiRequest<{ result: { returnId: string; decision: string } }>(
    `/issuances/returns/${encodeURIComponent(returnId)}/approval-decision`,
    { method: 'POST', body: JSON.stringify({ decision, note }) },
  )
  return result.result
}

export async function listApprovalRequests() {
  const result = await apiRequest<{ requests: ApprovalRequest[] }>('/issuances/returns/approval-requests')
  return result.requests
}

// from/to are YYYY-MM-DD dates on the issued date; leave them empty for the newest 1,000 records.
export async function listIssuanceRecords(range: { from: string; to: string }) {
  const query = new URLSearchParams(Object.entries(range).filter(([, value]) => value)).toString()
  const result = await apiRequest<{ records: IssuanceRecord[] }>(`/issuances/records${query ? `?${query}` : ''}`)
  return result.records
}

export async function listHoldings(employeeCode?: string) {
  const query = employeeCode ? `?employeeCode=${encodeURIComponent(employeeCode)}` : ''
  return apiRequest<{ items: HoldingEntry[]; accountabilities: AccountabilityEntry[] }>(`/issuances/holdings${query}`)
}

// Puts repaired units back in stock; a write-off goes through requestReturnApproval instead.
export async function markReturnRepaired(returnId: string) {
  const result = await apiRequest<{ result: { returnId: string; outcome: string } }>(
    `/issuances/returns/${encodeURIComponent(returnId)}/repair`,
    { method: 'POST', body: JSON.stringify({ outcome: 'Repaired' }) },
  )
  return result.result
}

// IT Admin only.
export async function waiveLostItem(returnId: string, note: string) {
  const result = await apiRequest<{ result: { returnId: string; settlementStatus: string } }>(
    `/issuances/returns/${encodeURIComponent(returnId)}/settlement`,
    { method: 'PATCH', body: JSON.stringify({ status: 'Waived', note }) },
  )
  return result.result
}

export type EmployeeIssuanceBatchDetails = {
  id: string
  status: string
  employeeCode: string
  employeeName: string
  employeeEmail: string
  requesterAccountLinked?: boolean
  emailSent?: boolean
  requestedAt: string
  decidedAt: string | null
  decisionNote?: string | null
  expiresAt: string
  borrowUseDate: string | null
  expectedReturnDate: string | null
  borrowUseAt: string | null
  expectedReturnAt: string | null
  useLocation: string | null
  usePurpose: string | null
  items: Array<{
    issuanceId: string
    itemCode: string
    itemName: string
    trackingMode: 'individual' | 'quantity'
    issueBehavior?: 'consumable' | 'returnable'
    condition: string
    quantity: number
    unitOfMeasure: string
    status: string
    tags: Array<{ tagCode: string; unitNumber: number; printedAt?: string | null; returned?: boolean }>
  }>
}

export type AssetTagInspectionRecord = {
  id: string
  tagCode: string
  unitNumber: number
  serialNumber: string | null
  condition: string
  lifecycleStatus: string
  custodyStatus: string
  location: string
  disposalReason: string
  itemId: string
  itemCode: string
  itemName: string
  employeeCode: string | null
  employeeName: string | null
  borrowerHistory?: Array<{
    employeeCode: string
    employeeName: string
    department: string
    position: string
    email: string
    issuedAt: string
    returnedAt: string | null
    returnCondition: string | null
    status: 'Issued' | 'Returned'
  }>
  lastInspectedAt: string | null
  lastInspectionNote: string
  lastInspectedBy: string | null
}

export async function createEmployeeIssuance(
  employeeCode: string,
  itemId: string,
  notes: string,
  quantity = 1,
  borrowDetails: {
    useAt: string
    expectedReturnAt: string
    useDate: string
    expectedReturnDate: string
    useLocation: string
    purpose: string
  } | null = null,
) {
  const result = await apiRequest<{
    issuance: {
      id: string
      status: string
      employeeCode: string
      employeeName: string
      employeeEmail: string
      itemCode: string
      itemName: string
      condition: string
      quantity: number
      unitOfMeasure: string
      notes: string
      requestedAt: string
      expiresAt: string
    }
  }>('/issuances', {
    method: 'POST',
    body: JSON.stringify({ employeeCode, itemId, quantity, notes, borrowDetails }),
  })
  return result.issuance
}

export async function createEmployeeIssuanceBatch(
  employeeCode: string,
  items: Array<{ itemId: string; quantity: number }>,
  notes: string,
  borrowDetails: {
    useAt: string
    expectedReturnAt: string
    useDate: string
    expectedReturnDate: string
    useLocation: string
    purpose: string
  } | null = null,
) {
  const result = await apiRequest<{
    batch: {
      id: string
      status: string
      employeeCode: string
      employeeName: string
      employeeEmail: string
      requesterAccountLinked: boolean
      borrowDetails: {
        useAt: string
        expectedReturnAt: string
        useDate: string
        expectedReturnDate: string
        useLocation: string
        purpose: string
      } | null
      items: Array<{
        id: string
        itemId: string
        itemCode: string
        itemName: string
        trackingMode: 'individual' | 'quantity'
        issueBehavior: 'consumable' | 'returnable'
        condition: string
        quantity: number
        unitOfMeasure: string
        availableQuantity: number
      }>
      notes: string
      requestedAt: string
      expiresAt: string
      emailSent: boolean
    }
  }>('/issuances/batch', {
    method: 'POST',
    body: JSON.stringify({ employeeCode, items, notes, borrowDetails }),
  })
  return result.batch
}

export async function recordEmployeeIssuanceHandover(
  batchId: string,
  input: { method: 'signed_receipt' | 'authorized_handover'; reference: string },
) {
  const result = await apiRequest<{ decision: { status: string; generatedTagCount: number } }>(
    `/issuances/batch/${encodeURIComponent(batchId)}/handover`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return result.decision
}

export async function getEmployeeIssuanceBatch(batchId: string) {
  const result = await apiRequest<{ batch: EmployeeIssuanceBatchDetails }>(`/issuances/batch/${encodeURIComponent(batchId)}`)
  return result.batch
}

export async function listApprovedIssuanceBatches() {
  const result = await apiRequest<{ batches: EmployeeIssuanceBatchDetails[] }>('/issuances/batch/approved')
  return result.batches
}

function normalizeAssetTagRequestCode(tagCode: string) {
  const normalized = tagCode.trim().toUpperCase()
  return /^(?:[A-Z0-9]{13}|[A-F0-9]{20})$/.test(normalized) ? `AST-${normalized}` : normalized
}

export async function getAssetTagForInspection(tagCode: string) {
  const result = await apiRequest<{ tag: AssetTagInspectionRecord }>(`/issuances/tags/${encodeURIComponent(normalizeAssetTagRequestCode(tagCode))}`)
  return result.tag
}

export async function inspectAssetTag(tagCode: string, input: { condition: string; note: string }) {
  const result = await apiRequest<{ tag: AssetTagInspectionRecord }>(`/issuances/tags/${encodeURIComponent(normalizeAssetTagRequestCode(tagCode))}/inspection`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return result.tag
}

export type TaggedReturnOtpChallenge = {
  challengeId: string
  expiresAt: string
  sentTo: string
}

export async function sendTaggedReturnOtp(tagCode: string) {
  const result = await apiRequest<{ challenge: TaggedReturnOtpChallenge }>(
    `/issuances/tags/${encodeURIComponent(normalizeAssetTagRequestCode(tagCode))}/return-otp`,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return result.challenge
}

export async function confirmTaggedAssetReturn(tagCode: string, input: {
  condition: string
  reason: string
  entryMethod: 'scan' | 'typed'
  returnedByName?: string
  // Required when the unit has a serial on file, read off the unit itself.
  serialLast4?: string
  otpChallengeId: string
  otp: string
}) {
  const result = await apiRequest<{
    result: {
      id: string
      status: string
      tagCode: string
      employeeCode: string
      employeeName: string
      itemCode: string
      itemName: string
      condition: string
      destination: string
      confirmationMethod: ConfirmationMethod
      remainingQuantity: number
      emailQueued: boolean
    }
  }>(`/issuances/tags/${encodeURIComponent(normalizeAssetTagRequestCode(tagCode))}/return`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.result
}

// Current labels can be printed. Returned labels are included as read-only history.
export type UnitLabel = {
  tagCode: string
  labelVersion: number
  unitNumber: number
  itemCode: string
  itemName: string
  holderCode: string
  holderName: string
  issuedAt: string | null
  batchId: string | null
  // Set when the current barcode itself came from a reprint.
  reprintedAt: string | null
  reprintReason: string | null
  // When the current barcode used its one print; null means it has not been printed yet.
  labelPrintedAt: string | null
  labelPrintedBy: string | null
  needsPrinting: boolean
  isReturned: boolean
  returnedAt: string | null
  returnCondition: string | null
  returnReason: string | null
  returnedByName: string | null
  processedBy: string | null
}

export async function listUnitLabels() {
  const result = await apiRequest<{ labels: UnitLabel[] }>('/issuances/labels')
  return result.labels
}

// Gives the unit a new barcode; the old label stops scanning at once.
// Uses the one print of a barcode that has not been printed yet; a second print needs reprintUnitLabel.
export async function recordLabelPrint(tagCode: string) {
  const result = await apiRequest<{ label: { tagCode: string; printedAt: string } }>(
    `/issuances/tags/${encodeURIComponent(tagCode)}/print`,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return result.label
}

export async function reprintUnitLabel(tagCode: string, reason: string) {
  const result = await apiRequest<{
    label: { tagCode: string; oldTagCode: string; labelVersion: number; reprintedAt: string; unitNumber: number; itemCode: string; itemName: string }
  }>(`/issuances/tags/${encodeURIComponent(tagCode)}/reprint`, { method: 'POST', body: JSON.stringify({ reason }) })
  return result.label
}

export async function completeTaggedAssetRepair(tagCode: string) {
  const result = await apiRequest<{ result: { tagCode: string; condition: string; location: string } }>(
    `/issuances/tags/${encodeURIComponent(normalizeAssetTagRequestCode(tagCode))}/repair-complete`,
    { method: 'PATCH', body: JSON.stringify({}) },
  )
  return result.result
}

export async function sendBulkReturnOtp(input: { issuanceId: string; lines: ReturnLine[] }) {
  const result = await apiRequest<{ challenge: TaggedReturnOtpChallenge }>('/issuances/returns/otp', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.challenge
}

export async function createEmployeeReturn(input: {
  employeeCode: string
  itemCode: string
  issuanceId: string
  lines: ReturnLine[]
  reason: string
  returnedByName: string
  otp: { challengeId: string; code: string }
}) {
  const { otp, ...details } = input
  const result = await apiRequest<{ request: EmployeeReturnRequest }>('/issuances/returns', {
    method: 'POST',
    body: JSON.stringify({ ...details, otpChallengeId: otp.challengeId, otp: otp.code }),
  })
  return result.request
}

export async function listEmployeeIssuances(employeeCode: string) {
  return apiRequest<EmployeeIssuanceRecord>(`/issuances/employee/${encodeURIComponent(employeeCode)}`)
}

export async function getIssuanceApproval(token: string) {
  const result = await apiRequest<{ issuance: ApprovalIssuance }>(
    `/issuances/approval?token=${encodeURIComponent(token)}`,
    { auth: false },
  )
  return result.issuance
}

export async function submitIssuanceDecision(token: string, action: 'approve' | 'reject') {
  const result = await apiRequest<{
    issuance: {
      status: string
      employeeName: string
      employeeCode?: string
      itemName: string
      itemCode?: string
      items?: ApprovalIssuanceItem[]
      alreadyDecided?: boolean
    }
  }>('/issuances/approval', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ token, action }),
  })
  return result.issuance
}

export async function getReturnApproval(token: string) {
  const result = await apiRequest<{ request: ApprovalReturn }>(
    `/issuances/returns/approval?token=${encodeURIComponent(token)}`,
    { auth: false },
  )
  return result.request
}

export async function submitReturnDecision(token: string, action: 'approve' | 'reject') {
  const result = await apiRequest<{
    request: {
      status: string
      employeeName: string
      employeeCode?: string
      itemName: string
      itemCode?: string
      condition?: string
      alreadyDecided?: boolean
    }
  }>('/issuances/returns/approval', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ token, action }),
  })
  return result.request
}
