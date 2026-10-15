import { apiRequest } from '../auth/authApi'

export type EmployeeIssuanceRecord = {
  assignedItems: Array<{
    code: string
    name: string
    condition: string
    assignedOn: string
  }>
  history: Array<{
    date: string
    event: string
    item: string
    code: string
    note: string
  }>
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
}

export async function createEmployeeIssuance(employeeCode: string, itemId: string, notes: string) {
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
      notes: string
      requestedAt: string
      expiresAt: string
    }
  }>('/issuances', {
    method: 'POST',
    body: JSON.stringify({ employeeCode, itemId, notes }),
  })
  return result.issuance
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
      alreadyDecided?: boolean
    }
  }>('/issuances/approval', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ token, action }),
  })
  return result.issuance
}
