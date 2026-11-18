import { apiRequest } from '../auth/authApi'
import type { ServiceRequest } from '../requesters/requesterApi'

// Loss & Damage Cases use a staff decision followed by either closure or repair.
export type LossDamageResolution = 'NO_CHARGE' | 'FOR_REPAIR' | 'RESOLVED'
export type EditableLossDamageResolution = Exclude<LossDamageResolution, 'RESOLVED'>
export type LossDamageSettlementStatus = LossDamageResolution

export type LossDamageSettlement = {
  id: string
  requestId: string
  resolution: LossDamageResolution
  reason: string
  status: LossDamageSettlementStatus
  assessedAt: string
  assessedBy: string | null
  updatedAt: string
}

export type LossDamageCase = ServiceRequest & { settlement: LossDamageSettlement | null }
export type LossDamageCaseList = { cases: LossDamageCase[] }
export type LossDamageCaseResult = { case: LossDamageCase }

// What the requester sees on their own report.
export type MyLossDamageSettlement = {
  resolution: LossDamageResolution
  reason: string
  status: LossDamageSettlementStatus
  decidedAt: string
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

export function saveLossDamageDecision(id: string, payload: { resolution: EditableLossDamageResolution; reason: string; resolvedUnits?: Array<{ issuanceId: string; tagCodes: string[] }> }) {
  return apiRequest<LossDamageCaseResult>(`${caseUrl(id)}/decision`, { method: 'POST', body: JSON.stringify(payload) })
}

export function closeLossDamageCase(id: string, payload: { handled: true; note: string }) {
  return apiRequest<LossDamageCaseResult>(`${caseUrl(id)}/close`, { method: 'POST', body: JSON.stringify(payload) })
}

export function getMyLossDamageCase(id: string) {
  return apiRequest<MyLossDamageCase>(`${base}/mine/${encodeURIComponent(id)}`)
}
