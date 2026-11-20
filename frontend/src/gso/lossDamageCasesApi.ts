import { apiRequest } from '../auth/authApi'
import type { ServiceRequest } from '../requesters/requesterApi'

// GSO either waives a report (NO_CHARGE) or charges it (CHARGED) with a calculated amount, then closes the follow-up.
export type LossDamageResolution = 'NO_CHARGE' | 'CHARGED' | 'FOR_REPAIR' | 'RESOLVED'
export type EditableLossDamageResolution = 'NO_CHARGE' | 'CHARGED' | 'FOR_REPAIR'
export type LossDamageRepairOwner = 'GSO' | 'ITSS'
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
  chargeAmount: number | null
  repairOwner: LossDamageRepairOwner | null
  // Set once the item has left the requester's holdings (a repair decision does this at once).
  custodyResolvedAt: string | null
}

export type ChargeEstimate = {
  total: number
  lines: Array<{ description: string; quantity: number; unitCost: number; amount: number }>
}

export type LossDamageCase = ServiceRequest & { settlement: LossDamageSettlement | null; chargeEstimate: ChargeEstimate }
export type LossDamageCaseList = { cases: LossDamageCase[] }
export type LossDamageCaseResult = { case: LossDamageCase }

// What the requester sees on their own report.
export type MyLossDamageSettlement = {
  resolution: LossDamageResolution
  reason: string
  status: LossDamageSettlementStatus
  decidedAt: string
  chargeAmount: number | null
}
// What Repair & Maintenance did with each reported unit (by barcode).
export type MyLossDamageRepair = {
  tagCode: string
  outcome: string | null
  owner: string | null
  writeOffDecision: string | null
  estimatedValue: number | null
}
export type MyLossDamageCase = { requestStatus: string; settlement: MyLossDamageSettlement | null; repairs: MyLossDamageRepair[] }

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

export function saveLossDamageDecision(id: string, payload: { resolution: EditableLossDamageResolution; reason: string; repairOwner?: LossDamageRepairOwner; resolvedUnits?: Array<{ issuanceId: string; tagCodes: string[] }> }) {
  return apiRequest<LossDamageCaseResult>(`${caseUrl(id)}/decision`, { method: 'POST', body: JSON.stringify(payload) })
}

export function closeLossDamageCase(id: string, payload: { handled: true; note: string }) {
  return apiRequest<LossDamageCaseResult>(`${caseUrl(id)}/close`, { method: 'POST', body: JSON.stringify(payload) })
}

export function getMyLossDamageCase(id: string) {
  return apiRequest<MyLossDamageCase>(`${base}/mine/${encodeURIComponent(id)}`)
}
