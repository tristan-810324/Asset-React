import { apiRequest } from '../auth/authApi'
import type { ServiceRequest } from '../requesters/requesterApi'

export type PurchaseRequisitionStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Needs Information'
  | 'Rejected'
  | 'GSO Endorsed'
  | 'Finance Handoff Pending'
  | 'Finance Handoff Failed'
  | 'Sent to Finance'
  | 'Finance Response Recorded'

export type FinanceDecision = 'Approved' | 'Needs Changes' | 'Rejected'
export type PurchaseRequisitionActionResult = {
  request: ServiceRequest
  requesterNotified: boolean | null
}

export async function listPurchaseRequisitions(input: { status?: string; search?: string } = {}) {
  const query = new URLSearchParams()
  if (input.status) query.set('status', input.status)
  if (input.search?.trim()) query.set('search', input.search.trim())
  const suffix = query.size ? `?${query.toString()}` : ''
  const result = await apiRequest<{ requests: ServiceRequest[] }>(`/requests/purchase-requisitions${suffix}`)
  return result.requests
}

export async function reviewPurchaseRequisition(id: string, status: 'Under Review' | 'Needs Information' | 'Rejected' | 'GSO Endorsed', note: string) {
  return apiRequest<PurchaseRequisitionActionResult>(`/requests/purchase-requisitions/${encodeURIComponent(id)}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ status, note }),
  })
}

export async function sendPurchaseRequisitionToFinance(id: string, financeEmail: string) {
  return apiRequest<PurchaseRequisitionActionResult>(`/requests/purchase-requisitions/${encodeURIComponent(id)}/send-to-finance`, {
    method: 'POST',
    body: JSON.stringify({ financeEmail }),
  })
}

export async function recordFinanceResponse(id: string, input: { decision: FinanceDecision; reference: string; note: string }) {
  return apiRequest<PurchaseRequisitionActionResult>(`/requests/purchase-requisitions/${encodeURIComponent(id)}/finance-response`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
