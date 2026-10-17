import { apiRequest } from '../auth/authApi'

export type EmployeeIssuanceRecord = {
  assignedItems: Array<{
    id: string
    code: string
    name: string
    condition: string
    quantity: number
    unitOfMeasure: string
    assignedOn: string
  }>
  history: Array<{
    date: string
    event: string
    item: string
    code: string
    quantity: number
    unitOfMeasure: string
    note: string
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

export type EmployeeReturnRequest = {
  id: string
  status: string
  employeeCode: string
  employeeName: string
  employeeEmail: string
  itemCode: string
  itemName: string
  quantity: number
  remainingQuantity?: number
  unitOfMeasure: string
  condition: string
  reason: string
  requestedAt: string
  expiresAt?: string | null
  emailSent: boolean
}

export async function createEmployeeIssuance(employeeCode: string, itemId: string, notes: string, quantity = 1) {
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
    body: JSON.stringify({ employeeCode, itemId, quantity, notes }),
  })
  return result.issuance
}

export async function createEmployeeIssuanceBatch(
  employeeCode: string,
  items: Array<{ itemId: string; quantity: number }>,
  notes: string,
) {
  const result = await apiRequest<{
    batch: {
      id: string
      status: string
      employeeCode: string
      employeeName: string
      employeeEmail: string
      items: Array<{
        id: string
        itemId: string
        itemCode: string
        itemName: string
        condition: string
        quantity: number
        unitOfMeasure: string
        availableQuantity: number
      }>
      notes: string
      requestedAt: string
      expiresAt: string
    }
  }>('/issuances/batch', {
    method: 'POST',
    body: JSON.stringify({ employeeCode, items, notes }),
  })
  return result.batch
}

export async function createEmployeeReturn(
  employeeCode: string,
  itemCode: string,
  condition: string,
  reason: string,
  issuanceId?: string,
  quantity?: number,
) {
  const result = await apiRequest<{ request: EmployeeReturnRequest }>('/issuances/returns', {
    method: 'POST',
    body: JSON.stringify({ employeeCode, itemCode, condition, reason, issuanceId, quantity }),
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
