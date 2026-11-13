import { apiRequest } from '../auth/authApi'
import type { ServiceRequest, StaffRoute } from '../requesters/requesterApi'

export type ItemToBuyRequest = {
  requestId: string
  referenceNo: string
  requesterName: string
  department: string
  quantity: number
  status: string
  financeHandoffAt: string | null
}

export type ItemToBuy = {
  itemName: string
  category: string
  specifications: string
  totalQuantity: number
  requestCount: number
  requests: ItemToBuyRequest[]
}

export async function listItemsToBuy() {
  const result = await apiRequest<{ items: ItemToBuy[] }>('/requests/purchase-requisitions/items-to-buy')
  return result.items
}

export async function listStaffPurchaseRequisitions() {
  const result = await apiRequest<{ requests: ServiceRequest[] }>('/requests/purchase-requisitions/issuance-queue')
  return result.requests
}

export async function getStaffPurchaseRequisition(id: string) {
  const result = await apiRequest<{ request: ServiceRequest }>(`/requests/purchase-requisitions/${encodeURIComponent(id)}/issuance-details`)
  return result.request
}

// `routes` are the routes the staff member saw; the server refuses if stock or a rule changed since.
export async function staffReviewPurchaseRequisition(
  id: string,
  input: { action: 'ROUTE'; routes: Record<string, StaffRoute>; note?: string } | { action: 'NEEDS_INFORMATION'; note: string },
) {
  return apiRequest<{ request: ServiceRequest; requesterNotified: boolean | null }>(`/requests/purchase-requisitions/${encodeURIComponent(id)}/staff-review`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

// An inventory record that could fill a waiting item: the same name, or a similar one staff must confirm.
export type DeliveryCandidate = {
  itemId: string
  itemCode: string
  name: string
  category: string
  unitOfMeasure: string
  availableQuantity: number
  match: 'EXACT' | 'SIMILAR'
}

// A requisition item whose purchase was sent to Finance and that Item Master Data can now fill. Oldest request first.
export type AwaitingDeliveryLine = {
  lineId: string
  requestId: string
  referenceNo: string
  createdAt: string
  requesterName: string
  department: string
  itemName: string
  category: string
  requestedQuantity: number
  remainingQuantity: number
  candidates: DeliveryCandidate[]
}

// `itemIds` limits the answer to those inventory records, for the check right after a restock.
export async function listAwaitingDeliveries(itemIds: string[] = []) {
  const query = itemIds.length ? `?itemIds=${itemIds.map(encodeURIComponent).join(',')}` : ''
  const result = await apiRequest<{ lines: AwaitingDeliveryLine[] }>(`/requests/purchase-requisitions/awaiting-delivery${query}`)
  return result.lines
}

export type DeliveryInput = { lineId: string; itemId: string; quantity: number; confirmSimilarName?: boolean }

// Links bought units already in Item Master Data to the requisition items waiting for them. One receipt covers all of them.
export async function recordPurchaseDeliveries(input: { deliveries: DeliveryInput[]; receiptReference?: string }) {
  const result = await apiRequest<{ requests: ServiceRequest[] }>('/requests/purchase-requisitions/deliveries', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.requests
}

// Takes a linked delivery back until its units are issued.
export async function undoPurchaseDelivery(requestId: string, receiptId: string) {
  const result = await apiRequest<{ request: ServiceRequest }>(
    `/requests/purchase-requisitions/${encodeURIComponent(requestId)}/deliveries/${encodeURIComponent(receiptId)}/undo`,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return result.request
}

// Get the GSO Head-approved PDF for GSO Staff viewing and printing.
export async function getFinancePdf(id: string) {
  const result = await apiRequest<{ pdf: string; filename: string; referenceNo: string }>(
    `/requests/purchase-requisitions/${encodeURIComponent(id)}/finance-pdf`,
  )
  return result
}

// After handing the printed, signed PDF to Finance, GSO Staff records the physical handoff.
export async function handPurchaseRequisitionToFinance(id: string) {
  return apiRequest<{ request: ServiceRequest; requesterNotified: boolean | null }>(
    `/requests/purchase-requisitions/${encodeURIComponent(id)}/hand-to-finance`,
    { method: 'POST', body: JSON.stringify({}) },
  )
}

export async function logFinancePdfReprint(id: string, input: { reason: string; details: string }) {
  return apiRequest<{ referenceNo: string }>(
    `/requests/purchase-requisitions/${encodeURIComponent(id)}/finance-pdf-reprint`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}