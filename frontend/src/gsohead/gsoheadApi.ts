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

// The GSO Head makes one decision for the complete purchase requisition.
export async function reviewPurchaseRequisition(
  id: string,
  input: { action: 'DECIDE'; decision: 'APPROVE' | 'DECLINE'; note?: string },
) {
  return apiRequest<PurchaseRequisitionActionResult>(`/requests/purchase-requisitions/${encodeURIComponent(id)}/review`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}
