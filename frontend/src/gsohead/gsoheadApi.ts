import { apiRequest } from '../auth/authApi'
import type { ServiceRequest } from '../requesters/requesterApi'

export type PurchaseRequisitionStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Needs Information'
  | 'Approved'
  | 'Rejected'
  | 'GSO Endorsed'
  | 'Finance Handoff Pending'
  | 'Finance Handoff Failed'
  | 'Sent to Finance'

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

export type HeadItemDecision = { lineId: string; decision: 'APPROVE' | 'DECLINE'; note: string }

// The GSO Head decides every item GSO Staff sent up, or asks the requester for details first.
export async function reviewPurchaseRequisition(
  id: string,
  input: { action: 'DECIDE'; decisions: HeadItemDecision[] } | { action: 'NEEDS_INFORMATION'; note: string },
) {
  return apiRequest<PurchaseRequisitionActionResult>(`/requests/purchase-requisitions/${encodeURIComponent(id)}/review`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function sendPurchaseRequisitionToFinance(id: string, financeEmail: string) {
  return apiRequest<PurchaseRequisitionActionResult>(`/requests/purchase-requisitions/${encodeURIComponent(id)}/send-to-finance`, {
    method: 'POST',
    body: JSON.stringify({ financeEmail }),
  })
}
