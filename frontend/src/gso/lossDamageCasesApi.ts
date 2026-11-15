import { apiRequest } from '../auth/authApi'
import type { ServiceRequest } from '../requesters/requesterApi'

// Loss & Damage Cases: GSO decisions and the PayMongo TEST payment state. The backend holds the rules;
// these types only describe what it sends back.
export type LossDamageResolution = 'NO_CHARGE' | 'FOR_REPAIR' | 'PAYMENT_REQUIRED'
export type LossDamageSettlementStatus = 'NO_CHARGE' | 'FOR_REPAIR' | 'PENDING_LINK' | 'AWAITING_PAYMENT' | 'PAID'

export type LossDamageSettlement = {
  id: string
  requestId: string
  resolution: LossDamageResolution
  reason: string
  amountCentavos: number | null
  currency: string
  status: LossDamageSettlementStatus
  assessedAt: string
  assessedBy: string | null
  linkId: string | null
  checkoutUrl: string | null
  linkReference: string | null
  linkCreatedAt: string | null
  linkCreatedBy: string | null
  cancelledLinkCount: number
  paymentId: string | null
  paidAt: string | null
  updatedAt: string
  // The last PayMongo report that was logged but not applied to this case.
  paymentWarning: { outcome: string; receivedAt: string } | null
}

export type LossDamageCase = ServiceRequest & { settlement: LossDamageSettlement | null }
export type LossDamageSetup = { paymentLinks: boolean; webhook: boolean }
export type LossDamageCaseList = { cases: LossDamageCase[]; setup: LossDamageSetup }
export type LossDamageCaseResult = { case: LossDamageCase; setup: LossDamageSetup }
export type LossDamageDecisionResult = LossDamageCaseResult & { linkError: string }

// What the requester sees on their own report. The checkout link is sent only while it can still be paid.
export type MyLossDamageSettlement = {
  resolution: LossDamageResolution
  reason: string
  amountCentavos: number | null
  currency: string
  status: LossDamageSettlementStatus
  decidedAt: string
  checkoutUrl: string | null
  paidAt: string | null
}
export type MyLossDamageCase = { requestStatus: string; settlement: MyLossDamageSettlement | null }

const base = '/loss-damage'
const caseUrl = (id: string) => `${base}/cases/${encodeURIComponent(id)}`

export function listLossDamageCases() {
  return apiRequest<LossDamageCaseList>(`${base}/cases`)
}

export function getLossDamageCase(id: string) {
  return apiRequest<LossDamageCaseResult>(caseUrl(id))
}

export function startLossDamageReview(id: string) {
  return apiRequest<LossDamageCaseResult>(`${caseUrl(id)}/start-review`, { method: 'POST' })
}

export function saveLossDamageDecision(id: string, payload: { resolution: LossDamageResolution; reason: string; amount?: string; resolvedUnits?: Array<{ issuanceId: string; tagCodes: string[] }> }) {
  return apiRequest<LossDamageDecisionResult>(`${caseUrl(id)}/decision`, { method: 'POST', body: JSON.stringify(payload) })
}

export function createLossDamagePaymentLink(id: string) {
  return apiRequest<LossDamageCaseResult>(`${caseUrl(id)}/payment-link`, { method: 'POST' })
}

export function cancelLossDamagePaymentLink(id: string, reason: string) {
  return apiRequest<LossDamageCaseResult>(`${caseUrl(id)}/cancel-link`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export function closeLossDamageCase(id: string, payload: { handled: true; note: string }) {
  return apiRequest<LossDamageCaseResult>(`${caseUrl(id)}/close`, { method: 'POST', body: JSON.stringify(payload) })
}

export function getMyLossDamageCase(id: string) {
  return apiRequest<MyLossDamageCase>(`${base}/mine/${encodeURIComponent(id)}`)
}

export function formatPesos(centavos: number | null | undefined) {
  if (centavos === null || centavos === undefined) return '—'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100)
}

// What the amount field accepts: pesos with at most two decimals, at least ₱1.00. The server checks the same rule.
export function amountProblem(value: string) {
  const cleaned = value.trim().replace(/,/g, '')
  if (!cleaned) return 'Enter the amount.'
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return 'Use numbers only, with at most two decimals. For example 1500.50.'
  if (Number(cleaned) < 1) return 'The minimum is ₱1.00.'
  return ''
}
