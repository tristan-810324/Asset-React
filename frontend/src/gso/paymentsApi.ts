import { apiRequest } from '../auth/authApi'

// Where a charge came from: a facility item written off, a returned unit written off, or a Loss & Damage case.
export type ChargeKind = 'FACILITY' | 'RETURN' | 'LOSS'

export type ChargeRow = {
  kind: ChargeKind
  ref: string
  referenceNo: string
  itemName: string
  personName: string
  amount: string | number | null
  chargedAt: string | null
  settlementStatus: string | null
  receiptName: string | null
  receiptNote: string | null
  amountPaid: string | number | null
  uploadedAt: string | null
  uploadedBy: string | null
  paid: boolean
  status: 'To pay' | 'Paid'
}

export type ChargeReceipt = {
  receiptData: string
  receiptName: string
  note: string
  uploadedAt: string
  uploadedBy: string | null
}

export const CHARGE_SOURCE_LABEL: Record<ChargeKind, string> = {
  FACILITY: 'Facility item',
  RETURN: 'Returned unit',
  LOSS: 'Loss & Damage',
}

export async function listCharges() {
  const result = await apiRequest<{ charges: ChargeRow[] }>('/charges')
  return result.charges
}

export async function getChargeReceipt(kind: ChargeKind, ref: string) {
  const result = await apiRequest<{ receipt: ChargeReceipt }>(`/charges/${kind}/${encodeURIComponent(ref)}/receipt`)
  return result.receipt
}

// Stores the receipt image and marks the charge Paid. The server records who uploaded it.
export async function markChargePaid(kind: ChargeKind, ref: string, input: { receiptData: string; receiptName: string; note: string; amountPaid: number }) {
  return apiRequest<{ result: { status: string } }>(`/charges/${kind}/${encodeURIComponent(ref)}/paid`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// A charge waived instead of paid (no payment). Its proof is the signed waiver: a PDF or a picture.
export type WaivedRow = {
  kind: ChargeKind
  ref: string
  referenceNo: string
  itemName: string
  personName: string
  amount: string | number | null
  decidedAt: string | null
  proofName: string | null
  proofMime: string | null
  proofUploadedAt: string | null
  proofUploadedBy: string | null
  hasProof: boolean
}

export type WaiverProof = {
  proofData: string
  proofName: string
  proofMime: string
  note: string
  uploadedAt: string
  uploadedBy: string | null
}

export async function listWaivedCharges() {
  const result = await apiRequest<{ waivers: WaivedRow[] }>('/charges/waivers')
  return result.waivers
}

export async function getWaiverProof(kind: ChargeKind, ref: string) {
  const result = await apiRequest<{ proof: WaiverProof }>(`/charges/${kind}/${encodeURIComponent(ref)}/proof`)
  return result.proof
}

// Attaches the signed waiver to a waived charge. The server records who attached it.
export async function saveWaiverProof(kind: ChargeKind, ref: string, input: { proofData: string; proofName: string; note: string }) {
  return apiRequest<{ result: { status: string } }>(`/charges/${kind}/${encodeURIComponent(ref)}/proof`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
