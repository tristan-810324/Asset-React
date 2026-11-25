import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { listFacilityFinanceReport, listGsoRequests, type FacilityFinanceRow } from '../requesters/requesterApi'
import { formatDateTime } from '../requesters/requesterrequestutils'
import { listIssuanceRecords, listRepairHistory, type RepairHistoryRecord } from './issuancesApi'
import { getChargeReceipt, listCharges, type ChargeKind, type ChargeReceipt } from './paymentsApi'
import { listServiceWorkOrders } from './serviceWorkboardApi'
import { listAuditLogs, type AuditLogEntry } from '../admin/auditLogsApi'
import { listEmployees } from './employeesApi'
import { listLossDamageCases } from './lossDamageCasesApi'

type SourceKey = 'returns' | 'facilities' | 'service' | 'loss' | 'employees' | 'requisitions' | 'payments'
type TabKey = 'returns' | 'service' | 'loss' | 'employees' | 'payments'
type ReturnsView = 'all' | 'issued' | 'declined' | 'returned'
// The Loss, Repair & Unserviceable tab shows one category at a time, picked from its Category dropdown.
type LossCategory = 'loss' | 'repair' | 'unserviceable'
// The Category dropdown shows every category together, or one of them.
type LossView = 'all' | LossCategory
const CATEGORY_TONE: Record<LossCategory, string> = {
  loss: 'bg-rose-50 text-rose-700',
  repair: 'bg-amber-50 text-amber-800',
  unserviceable: 'bg-slate-100 text-slate-700',
}
const LOSS_CATEGORIES: { value: LossView; label: string; empty: string }[] = [
  { value: 'all', label: 'All categories', empty: 'No lost, repair, or unserviceable items yet. They show here once a loss report, repair, or write-off is recorded.' },
  { value: 'loss', label: 'Loss', empty: 'No lost items yet. Lost items from Loss & Damage reports and facility items that came back missing show here.' },
  { value: 'repair', label: 'Repair', empty: 'Nothing is in repair right now. Units sent to Repair & Maintenance show here.' },
  { value: 'unserviceable', label: 'Unserviceable', empty: 'No unserviceable items yet. Items that could not be repaired, charged or waived, show here.' },
]

// Which history sources each tab shows, merged and sorted together.
const TAB_SOURCES: Record<TabKey, SourceKey[]> = {
  returns: ['returns'],
  service: ['service'],
  loss: ['loss'],
  employees: ['employees'],
  payments: ['payments'],
}
// Old ?tab= links keep working: they open the group their module now belongs to.
const LEGACY_TABS: Record<string, TabKey> = { requisitions: 'returns', facilities: 'returns', repair: 'loss', unserviceable: 'loss' }

// Tabs with a working history list. The rest are placeholders until their data is wired.
const TABS: { key: TabKey; label: string; ready: boolean }[] = [
  { key: 'returns', label: 'Returns & Requisitions', ready: true },
  { key: 'service', label: 'Service Workboard', ready: true },
  { key: 'loss', label: 'Loss, Repair & Unserviceable', ready: true },
  { key: 'employees', label: 'Employees', ready: true },
  { key: 'payments', label: 'To Pay / Settled', ready: true },
]

type HistoryRow = { id: string; date: string | null; reference: string; detail: string; items?: string; view?: 'issued' | 'declined' | 'returned'; itemName?: string; condition?: string | null; reason?: string; charge?: { kind: string; ref: string }; person: string; personEmail?: string; status: string; service?: { title: string; team: string; claimedBy: string | null; closedAt: string | null }; actorName?: string; actorEmail?: string; category?: LossCategory; tag?: string; place?: string; handledBy?: string; chargeText?: string }

// Service Workboard job statuses, coloured the way the workboard cards are.
const serviceStatusTone = (status: string) => {
  if (status === 'In Progress') return 'bg-blue-50 text-blue-700'
  if (status === 'Awaiting Requester Confirmation') return 'bg-violet-50 text-violet-700'
  if (['Closed', 'Completed'].includes(status)) return 'bg-emerald-50 text-emerald-700'
  if (['Rejected', 'Cancelled'].includes(status)) return 'bg-rose-50 text-rose-700'
  if (status === 'Needs Information') return 'bg-amber-50 text-amber-700'
  return 'bg-slate-100 text-slate-700'
}

const FACILITY_DONE = ['Completed', 'Closed', 'Rejected']
const BORROW_DONE = ['Returned', 'Closed', 'Rejected']
const LOSS_DONE = ['Completed', 'Closed']
// Charged reports read To pay or Settled from the charge receipts (see settledStatus), the same as an unserviceable write-off.
const LOSS_STATUS: Record<string, string> = { NO_CHARGE: 'Waived', FOR_REPAIR: 'For repair', RESOLVED: 'Resolved' }
const YEAR_MS = 365 * 24 * 60 * 60 * 1000
const isoDay = (date: Date) => date.toISOString().slice(0, 10)
// Units that could not be repaired: those the GSO check marked Unserviceable, or an item that came back Unserviceable.
const unserviceableCount = (row: { condition: string | null; damagedQuantity: number; unserviceableQuantity: number }) =>
  row.unserviceableQuantity || (row.condition === 'Unserviceable' ? row.damagedQuantity : 0)
// One history line per facility item from the return check.
// Unserviceable items sort by what is left to do: To pay first, then Waived, then Settled.
// A charge reads Settled once its receipt is uploaded (the same list as To Pay / Settled), or once the item was replaced.
const settledStatus = (paid: Set<string>, key: string, settlementStatus: string | null | undefined) =>
  paid.has(key) || settlementStatus === 'Paid' || settlementStatus === 'Replaced' ? 'Settled' : 'To pay'
// The charges that already have a receipt, as KIND:ref keys.
const paidChargeKeys = async () => new Set((await listCharges()).filter((charge) => charge.paid).map((charge) => `${charge.kind}:${charge.ref}`))
const writeOffStatus = (row: FacilityFinanceRow, paid: Set<string>) => {
  if (row.writeOffDecision === 'WAIVED') return 'Waived'
  if (row.writeOffDecision !== 'CHARGED') return 'No decision'
  return settledStatus(paid, `FACILITY:${row.assetId}`, row.settlementStatus)
}
// What a unit's repair ended with: repaired and back in stock, written off (waived or to pay), or still being repaired.
const repairStatusOf = (record: RepairHistoryRecord, paid: Set<string>) => {
  if (record.outcome === 'Repaired') return 'Repaired'
  if (record.outcome === 'Written Off') {
    if (record.writeOffDecision !== 'CHARGED') return 'Waived'
    return settledStatus(paid, `RETURN:${record.id}`, record.settlementStatus)
  }
  return 'In repair'
}
const repairTone = (status: string) => ({
  Repaired: 'bg-emerald-50 text-emerald-700',
  Done: 'bg-emerald-50 text-emerald-700',
  'To pay': 'bg-rose-50 text-rose-700',
  Settled: 'bg-emerald-50 text-emerald-700',
  Waived: 'bg-slate-100 text-slate-700',
  'In repair': 'bg-amber-50 text-amber-800',
  'Needs Repair': 'bg-amber-50 text-amber-800',
} as Record<string, string>)[status] ?? 'bg-slate-100 text-slate-700'
const writeOffTone = (status: string) => status === 'To pay'
  ? 'bg-rose-50 text-rose-700'
  : status === 'Settled' ? 'bg-emerald-50 text-emerald-700'
    : status === 'Waived' ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-700'
const lossGroupTone = (status: string) => ['To pay', 'Settled', 'Waived', 'No decision'].includes(status) ? writeOffTone(status) : repairTone(status)
const facilityHistoryRow = (row: FacilityFinanceRow, prefix: string, index: number, detail: string, status: string): HistoryRow => ({
  id: `${prefix}-${row.requestId}-${row.itemCode}-${index}`,
  date: row.returnedAt,
  reference: row.referenceNo,
  itemName: row.itemName,
  detail,
  person: row.accountableName,
  personEmail: row.accountableEmail,
  status,
  tag: row.itemCode,
})
const pesoText = (value: number | string | null | undefined) => `₱${Number(value ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
// The charge or waiver text: Charged with its amount, Waived, or nothing decided yet.
const chargeLabel = (decision: string | null | undefined, amount: number | string | null | undefined) => {
  if (decision === 'WAIVED' || decision === 'NO_CHARGE') return 'Waived'
  if (decision === 'CHARGED') return Number(amount) > 0 ? `Charged · ${pesoText(amount)}` : 'Charged'
  return '—'
}
// The items a loss report lists, as the requester entered them and as GSO resolved their tags.
type ReportedItem = { description?: string; quantity?: number | string; tagCode?: string; assetCode?: string }
const reportedItemsOf = (formData: Record<string, unknown>) => (Array.isArray(formData.items) ? formData.items as ReportedItem[] : [])
const reportedItemText = (rows: ReportedItem[]) => rows.map((row) => `${row.description || 'Item'}${Number(row.quantity) > 1 ? ` × ${row.quantity}` : ''}`).join(', ') || 'Item not recorded'
const reportedTagsText = (rows: ReportedItem[]) => [...new Set(rows.map((row) => String(row.tagCode || row.assetCode || '')).filter(Boolean))].join(', ')
// Who repairs a unit: GSO, or the IT team (ITSS).
const ownerText = (owner: string | null | undefined) => (owner === 'ITSS' ? 'IT (ITSS)' : owner || 'Not assigned')

// How the Returns list names the return condition.
const RETURN_CONDITION_LABEL: Record<string, string> = { 'Needs Repair': 'To be repaired', 'Under Maintenance': 'To be repaired' }
const conditionText = (row: { condition?: string | null }) => (row.condition ? RETURN_CONDITION_LABEL[row.condition] ?? row.condition : '—')

// Colours match the Items Master table.
const historyAvatarTone = (index: number) => (index % 2 === 0
  ? 'border-[#d6b333] bg-[#17377f] text-white'
  : 'border-[#17377f] bg-[#d6b333] text-[#17377f]')
const returnsStatusTone = (status: string) => {
  if (['Declined', 'Lost', 'Missing'].includes(status)) return 'bg-rose-50 text-rose-700'
  if (['Damaged', 'Pending'].includes(status)) return 'bg-amber-50 text-amber-700'
  if (['Returned', 'Verified'].includes(status)) return 'bg-emerald-50 text-emerald-700'
  return 'bg-blue-50 text-blue-700'
}
const conditionTone = (condition: string) => ({
  New: 'bg-sky-50 text-sky-700',
  Good: 'bg-emerald-50 text-emerald-700',
  Fair: 'bg-amber-50 text-amber-700',
  'To be repaired': 'bg-rose-50 text-rose-700',
  Unserviceable: 'bg-rose-50 text-rose-700',
  Lost: 'bg-rose-50 text-rose-700',
  Missing: 'bg-rose-50 text-rose-700',
  Damaged: 'bg-amber-50 text-amber-700',
  Retired: 'bg-slate-100 text-slate-600',
} as Record<string, string>)[condition] ?? 'bg-slate-100 text-slate-600'
// One table column: the header, the plain text used by the exports, and the cell as it looks on screen.
type TableColumn = { label: string; text: (row: HistoryRow) => string; render: (row: HistoryRow, index: number) => ReactNode }


// Status meanings in plain words, shown at the top of the record popup.
const STATUS_NOTE: Record<string, string> = {
  'To pay': 'Not paid yet. Once it is paid, GSO uploads the receipt in Proof of Settlements.',
  Settled: 'Paid. The receipt is on file below.',
  Waived: 'Waived. No payment is needed.',
  'In repair': 'Still being repaired.',
  Repaired: 'Repaired and back in stock.',
  'Needs Repair': 'Waiting for repair.',
  Done: 'Repair finished.',
  Missing: 'Reported missing. It has not been returned.',
  Lost: 'Reported lost.',
  Damaged: 'Returned damaged.',
  Returned: 'Returned to GSO.',
  Issued: 'Issued to the requester.',
  Declined: 'The request was declined.',
  Rejected: 'The request was rejected.',
  Verified: 'The account is verified.',
  'Needs Correction': 'Sent back for correction.',
}
// The payment receipt picture for a charge, shown in the record popup. It appears once the charge is paid.
function RecordReceipt({ charge }: { charge: { kind: string; ref: string } }) {
  const [receipt, setReceipt] = useState<ChargeReceipt | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    getChargeReceipt(charge.kind as ChargeKind, charge.ref)
      .then((value) => { if (active) setReceipt(value) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [charge.kind, charge.ref])
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-extrabold text-slate-900">Payment receipt</h3>
      <p className="mt-0.5 text-xs text-slate-500">The picture uploaded when this charge was paid.</p>
      <div className="mt-4">
        {failed
          ? <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">No receipt yet. It appears here once the charge is paid.</p>
          : !receipt
            ? <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">Loading the receipt…</p>
            : <figure>
              <img src={receipt.receiptData} alt="Payment receipt" className="mx-auto max-h-80 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain" />
              <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                <span>{receipt.receiptName || 'Receipt'}</span>
                <span>Uploaded by {receipt.uploadedBy || 'GSO Staff'} · {formatDateTime(receipt.uploadedAt)}</span>
              </figcaption>
            </figure>}
      </div>
    </section>
  )
}


async function loadSource(tab: SourceKey): Promise<HistoryRow[]> {
  if (tab === 'returns') {
    // Issued items, declined purchase items, and item returns with their condition, from the issuance records;
    // plus facility items brought back from facility requests.
    const [records, facilityRows] = await Promise.all([
      listIssuanceRecords({ from: isoDay(new Date(Date.now() - YEAR_MS)), to: isoDay(new Date()) }),
      listFacilityFinanceReport(),
    ])
    const issued: HistoryRow[] = records
      .filter((record) => record.issuanceStatus !== 'Rejected')
      .map((record) => ({
        id: `iss-${record.id}`,
        view: 'issued',
        date: record.decidedAt || record.requestedAt,
        reference: record.itemCode,
        itemName: record.itemName,
        detail: record.itemName,
        person: record.employeeName,
        status: record.issuanceStatus,
      }))
    const declined: HistoryRow[] = records
      .filter((record) => record.issuanceStatus === 'Rejected')
      .map((record) => ({
        id: `dec-${record.id}`,
        view: 'declined',
        date: record.decidedAt || record.requestedAt,
        reference: record.itemCode,
        itemName: record.itemName,
        detail: record.itemName,
        reason: record.decisionNote || 'No reason recorded',
        person: record.employeeName,
        status: 'Declined',
      }))
    const returned: HistoryRow[] = records.flatMap((record) => (record.returns || [])
      .filter((entry) => entry.status === 'Returned' || entry.status === 'Lost')
      .map((entry) => ({
        id: `ret-${entry.id}`,
        view: 'returned',
        date: entry.returnedAt,
        reference: record.itemCode,
        itemName: record.itemName,
        detail: record.itemName,
        condition: entry.status === 'Lost' ? 'Lost' : entry.condition,
        person: record.employeeName,
        status: entry.status === 'Lost' ? 'Lost' : 'Returned',
      })))
    const facilityReturns: HistoryRow[] = facilityRows
      .filter((row) => row.returnedAt && (row.returnedQuantity > 0 || row.lostQuantity > 0))
      .map((row, index) => {
        const mapped = facilityHistoryRow(
          row,
          'ret-fac',
          index,
          `${row.returnedQuantity} returned${row.lostQuantity ? `, ${row.lostQuantity} missing` : ''}${row.damagedQuantity ? `, ${row.damagedQuantity} damaged` : ''}`,
          row.lostQuantity ? 'Missing' : row.damagedQuantity ? 'Damaged' : 'Returned',
        )
        return { ...mapped, view: 'returned' as const, condition: row.lostQuantity ? 'Missing' : row.damagedQuantity ? 'Damaged' : 'Good' }
      })
    return [...issued, ...declined, ...returned, ...facilityReturns]
  }
  if (false) {
    // Finished facility requests, plus borrowed equipment that has been returned or closed.
    const [facilityRequests, borrowings] = await Promise.all([
      listGsoRequests({ type: 'FACILITY_USE' }),
      listGsoRequests({ type: 'BORROWING' }),
    ])
    // The items each request took, e.g. "Laptop × 2, Projector × 1", so the history shows what was borrowed.
    const itemsText = (formData: Record<string, unknown> | undefined, key: 'equipment' | 'items') => {
      const list = (formData?.[key] as Array<{ name?: string; itemName?: string; quantity?: number }> | undefined) || []
      return list.map((row) => `${row.name || row.itemName || 'Item'} × ${row.quantity ?? 1}`).join(', ')
    }
    const facilityRows = facilityRequests
      .filter((request) => FACILITY_DONE.includes(request.status))
      .map((request) => {
        const items = itemsText(request.formData, 'equipment')
        return { id: `fac-${request.id}`, date: request.createdAt, reference: request.referenceNo, detail: request.title, items, person: request.requesterName, personEmail: request.requesterEmail, status: request.status }
      })
    const borrowRows = borrowings
      .filter((request) => BORROW_DONE.includes(request.status))
      .map((request) => {
        const items = itemsText(request.formData, 'items')
        return { id: `brw-${request.id}`, date: request.createdAt, reference: request.referenceNo, detail: request.title, items, person: request.requesterName, personEmail: request.requesterEmail, status: request.status }
      })
    return [...facilityRows, ...borrowRows]
  }
  if (tab === 'service') {
    // Every job on the GSO Service Workboard and the ITSS Support Queue, with who claimed it and when it closed.
    // A queue the user cannot open is skipped. The status filter narrows the list.
    // The backend caps one page at 100 jobs per team.
    const results = await Promise.allSettled((['GSO', 'ITSS'] as const).map((team) => listServiceWorkOrders({ team, limit: 100 })))
    // Only fail the whole tab when no team could be read; one team the user cannot open is still skipped.
    if (results.every((result) => result.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason
    return results
      .flatMap((result) => (result.status === 'fulfilled' ? result.value.workOrders : []))
      .map((order) => {
        const claimed = typeof order.claimedBy === 'string' ? order.claimedBy : order.claimedBy?.name
        const closed = order.closedAt ? `Closed ${formatDateTime(order.closedAt)}` : ''
        const detail = [order.title, order.routeTeam, claimed ? `Claimed by ${claimed}` : 'Not claimed', closed].filter(Boolean).join(' · ')
        return {
          id: `svc-${order.id}`, date: order.closedAt || order.completedAt || order.updatedAt || null, reference: order.referenceNo, detail, person: order.requester?.name || '—', status: order.status,
          service: { title: order.title, team: order.routeTeam, claimedBy: claimed || null, closedAt: order.closedAt || null },
        }
      })
  }
  if (tab === 'requisitions') {
    // Every purchase requisition step and main issuance entry from the audit log, newest first.
    // shortcut: only the newest 100 entries are read, add paging when the list gets long.
    const requisitionActionLabel: Record<string, string> = { requested: 'Requested', issued: 'Issued', approved: 'Approved', rejected: 'Declined', cancelled: 'Cancelled', updated: 'Updated', received: 'Delivery linked' }
    const page = await listAuditLogs({ limit: 100, offset: 0, action: 'all', entityType: 'all', flag: 'all', search: '', from: '', to: '', module: 'requisitions' })
    return page.logs.map((log) => ({
      id: `req-${log.id}`,
      date: log.changedAt,
      reference: log.entityId,
      detail: log.reason,
      person: log.changedBy || 'System',
      status: requisitionActionLabel[log.action] ?? log.action,
    }))
  }
  if (tab === 'payments') {
    // Charges for lost or damaged items: To pay until a receipt is uploaded, then Settled.
    const charges = await listCharges()
    return charges.map((charge) => ({
      id: `chg-${charge.kind}-${charge.ref}`,
      date: charge.paid ? charge.uploadedAt || charge.chargedAt : charge.chargedAt,
      reference: charge.referenceNo,
      detail: `${charge.itemName} · ${Number(charge.amount ?? 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}`,
      person: charge.personName,
      status: charge.paid ? 'Settled' : 'To pay',
      charge: { kind: charge.kind, ref: charge.ref },
    }))
  }
  if (tab === 'employees') {
    // Requester accounts verified or sent back for correction in Requester Verification.
    const page = await listAuditLogs({ limit: 100, offset: 0, action: 'all', entityType: 'employee', flag: 'all', search: '', from: '', to: '' })
    return page.logs
      .filter((log) => log.newValues?.requesterVerification === true)
      .map((log) => ({
        id: `emp-${log.id}`,
        date: log.changedAt,
        reference: `ACC-${log.entityId}`,
        detail: log.reason,
        person: log.entityName,
        status: log.newValues.status === 'Verified' ? 'Verified' : log.newValues.status === 'Rejected' ? 'Rejected' : 'Needs Correction',
        actorName: typeof log.newValues.reviewerName === 'string' ? log.newValues.reviewerName : (log.changedBy || 'GSO'),
        actorEmail: typeof log.newValues.reviewerEmail === 'string' ? log.newValues.reviewerEmail : undefined,
      }))
  }
  if (tab === 'loss') {
    // One list for Loss, Repair & Unserviceable. Each row carries its category, which the Category dropdown filters by:
    // loss = lost items (loss reports and facility items that came back missing), repair = units in repair,
    // unserviceable = items that could not be repaired, charged or waived.
    const [{ cases }, repairRecords, facilityRows, paid, facilityRequests] = await Promise.all([
      listLossDamageCases(),
      listRepairHistory(),
      listFacilityFinanceReport(),
      paidChargeKeys(),
      // Without the facility requests the venue is left blank; the rest of the tab still loads.
      listGsoRequests({ type: 'FACILITY_USE' }).catch(() => []),
    ])
    const venueOf = new Map(facilityRequests.map((request) => [String(request.id), typeof request.formData.venue === 'string' ? request.formData.venue : '']))
    // A loss case sent to repair shows its units under Repair from the repair record, so the case row is kept only until a record exists.
    const repairCaseRefs = new Set(repairRecords.map((record) => record.caseReference).filter(Boolean))
    const isRepairCase = (item: (typeof cases)[number]) => item.settlement?.status === 'FOR_REPAIR' && Boolean(item.settlement.custodyResolvedAt)
    const lossCaseRows: HistoryRow[] = cases
      .filter((item) => LOSS_DONE.includes(item.status) && !isRepairCase(item))
      .map((item) => {
        const rows = reportedItemsOf(item.formData)
        const resolution = item.settlement?.resolution ?? ''
        return {
          id: `loss-${item.id}`,
          category: 'loss',
          date: item.updatedAt,
          reference: item.referenceNo,
          tag: reportedTagsText(rows) || item.referenceNo,
          itemName: reportedItemText(rows),
          detail: String(item.formData.incidentType ?? '') === 'DAMAGED' ? 'Damaged' : 'Lost',
          place: String(item.formData.keyArea || '').trim(),
          person: item.requesterName,
          status: resolution === 'CHARGED' && item.settlement ? settledStatus(paid, `LOSS:${item.settlement.id}`, null) : LOSS_STATUS[resolution] ?? 'Closed',
          chargeText: chargeLabel(resolution, item.settlement?.chargeAmount),
          charge: resolution === 'CHARGED' && item.settlement ? { kind: 'LOSS', ref: item.settlement.id } : undefined,
        }
      })
    const repairCaseRows: HistoryRow[] = cases
      .filter((item) => isRepairCase(item) && !repairCaseRefs.has(item.referenceNo))
      .map((item) => {
        const rows = reportedItemsOf(item.formData)
        return {
          id: `repcase-${item.id}`,
          category: 'repair',
          date: item.updatedAt,
          reference: item.referenceNo,
          tag: reportedTagsText(rows) || item.referenceNo,
          itemName: reportedItemText(rows),
          detail: 'Sent to repair from a loss report',
          person: item.requesterName,
          handledBy: ownerText(item.settlement?.repairOwner),
          status: 'In repair',
        }
      })
    // Tagged units from repair. Units still in repair or repaired stay under Repair; written-off units move to Unserviceable.
    const unitRows: HistoryRow[] = repairRecords.map((record) => {
      const writtenOff = record.outcome === 'Written Off'
      return {
        id: `rep-${record.id}`,
        category: writtenOff ? 'unserviceable' : 'repair',
        date: record.resolvedAt || record.decidedAt,
        reference: record.tagCode,
        tag: record.tagCode || record.itemCode,
        itemName: record.itemName,
        detail: [record.reason, record.caseReference ? `From loss report ${record.caseReference}` : ''].filter(Boolean).join(' · '),
        person: record.employeeName ?? '',
        handledBy: ownerText(record.owner),
        status: repairStatusOf(record, paid),
        chargeText: writtenOff ? chargeLabel(record.writeOffDecision, record.estimatedValue) : undefined,
        charge: writtenOff && record.writeOffDecision === 'CHARGED' ? { kind: 'RETURN', ref: record.id } : undefined,
      }
    })
    const facilityRepairRows: HistoryRow[] = facilityRows
      .filter((row) => row.condition === 'Needs Repair' && row.damagedQuantity > 0)
      .map((row, index) => {
        const pending = row.damagedQuantity - row.repairedQuantity - row.unserviceableQuantity
        return {
          ...facilityHistoryRow(row, 'rep', index, `${row.damagedQuantity} damaged · ${row.repairedQuantity} repaired · ${row.unserviceableQuantity} unserviceable`, pending > 0 ? 'Needs Repair' : 'Done'),
          category: 'repair',
          handledBy: ownerText(row.repairOwner),
        }
      })
    const facilityUnserviceableRows: HistoryRow[] = facilityRows
      .filter((row) => unserviceableCount(row) > 0)
      .map((row, index) => {
        // A waived write-off shows the GSO staff who checked it, taken from the reason ("... Checked by: <name>").
        const checkedBy = writeOffStatus(row, paid) === 'Waived' ? ` · Checked by ${(row.writeOffReason || '').match(/Checked by: (.+)$/)?.[1] || 'not recorded'}` : ''
        // Only the unserviceable units are charged; the damaged units that were repaired are not.
        const breakdown = row.damagedQuantity > 0 ? ` (of ${row.damagedQuantity} damaged, ${row.repairedQuantity} repaired)` : ''
        return {
          ...facilityHistoryRow(row, 'uns', index, `${unserviceableCount(row)} unserviceable${breakdown}${checkedBy}`, writeOffStatus(row, paid)),
          category: 'unserviceable',
          chargeText: chargeLabel(row.writeOffDecision, row.writeOffEstimatedValue),
          charge: row.writeOffDecision === 'CHARGED' ? { kind: 'FACILITY', ref: row.assetId } : undefined,
        }
      })
    // Facility items that came back missing: To pay until settled, Settled once paid or replaced, Waived when waived.
    const missingRows: HistoryRow[] = facilityRows
      .filter((row) => row.lostQuantity > 0)
      .map((row, index) => ({
        ...facilityHistoryRow(row, 'lost', index, `${row.lostQuantity} missing`, row.settlementStatus === 'Waived' ? 'Waived' : settledStatus(paid, `FACILITY:${row.assetId}`, row.settlementStatus)),
        category: 'loss',
        place: venueOf.get(String(row.requestId)) || '',
        chargeText: chargeLabel(row.writeOffDecision, row.writeOffEstimatedValue),
        charge: row.writeOffDecision === 'CHARGED' ? { kind: 'FACILITY', ref: row.assetId } : undefined,
      }))
    return [...lossCaseRows, ...repairCaseRows, ...unitRows, ...facilityRepairRows, ...facilityUnserviceableRows, ...missingRows]
  }
  return []
}

async function loadRows(tab: TabKey): Promise<HistoryRow[]> {
  return (await Promise.all(TAB_SOURCES[tab].map(loadSource))).flat()
}

const dateText = (value: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : formatDateTime(value)
}
// Local calendar day (YYYY-MM-DD) of a record, for the date filter.
const localDay = (value: string | null) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-CA') : ''
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
const downloadHistoryFile = (fileName: string, parts: BlobPart[], mimeType: string) => {
  const url = URL.createObjectURL(new Blob(parts, { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
type SortKey = 'newest' | 'oldest' | 'reference' | 'person'
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'reference', label: 'Reference A–Z' },
  { value: 'person', label: 'Person A–Z' },
]

// The styled report used by both exports, the same look as the Item Master Data reports.
// Column widths by name, so each tab exports the same columns it shows on screen.
const HISTORY_WIDTHS: Record<string, number> = { Name: 170, Category: 150, Person: 170, Date: 150, Reference: 150, Tag: 150, 'Tag / Ref': 150, 'Item & where lost': 240, Details: 260, 'Repair by': 150, 'Charge or waive': 170, 'Items borrowed': 200, 'Reviewed by': 170, Status: 130 }
const ATTENTION_STATUSES = ['To pay', 'Missing', 'Damaged', 'Rejected', 'Needs Repair', 'In repair', 'Unserviceable']
const historyStatusStyle = (status: string) => ATTENTION_STATUSES.includes(status)
  ? 'background:#fff1f2;color:#be123c;'
  : ['Repaired', 'Settled', 'Done', 'Returned', 'Completed', 'Closed', 'Verified', 'Available'].includes(status)
    ? 'background:#ecfdf5;color:#047857;'
    : status === 'Waived' ? 'background:#f1f5f9;color:#334155;' : 'background:#eff6ff;color:#1d4ed8;'

function historyReportParts({ title, note, generatedAt, headers, rows }: { title: string; note: string; generatedAt: string; headers: string[]; rows: string[][] }) {
  const statusIndex = headers.length - 1
  const widths = headers.map((label) => HISTORY_WIDTHS[label] ?? 160)
  const attention = rows.filter((cells) => ATTENTION_STATUSES.includes(cells[statusIndex])).length
  const header = `<table style="width:100%;margin-bottom:14px;border-collapse:collapse;"><tr><td colspan="${headers.length}" style="padding:18px 20px;background:#09244a;color:#ffffff;">
    <div style="font-size:9pt;font-weight:bold;letter-spacing:1.2px;color:#bfdbfe;">ASSET CUSTODY &amp; TRACKING</div>
    <h1 style="margin:7px 0 4px;font-size:22pt;color:#ffffff;">${escapeHtml(title)}</h1>
    <div style="font-size:9pt;color:#dbeafe;">Generated ${escapeHtml(generatedAt)} · ${escapeHtml(note)}</div>
  </td></tr></table>`
  // The two tiles split the table's width between them, so they line up with the columns in Excel and Word.
  const firstSpan = Math.ceil(headers.length / 2)
  const tile = (label: string, value: number, background: string, color: string, span: number) => `<td colspan="${span}" style="padding:10px 12px;border:1px solid #dbe3ef;background:${background};"><div style="font-size:8pt;color:${color};text-transform:uppercase;">${label}</div><strong style="font-size:16pt;color:${color};">${value}</strong></td>`
  const summary = `<table style="width:100%;margin-bottom:16px;border-collapse:collapse;"><tr>${tile('Records in this report', rows.length, '#f8fafc', '#09244a', firstSpan)}${tile('Needs attention', attention, '#fff1f2', '#be123c', headers.length - firstSpan)}</tr></table>`
  // Columns take their share of the full table width, so Word and Excel fill the same space as the banner.
  const totalWidth = widths.reduce((sum, width) => sum + width, 0)
  const columns = widths.map((width) => `<col style="width:${((width / totalWidth) * 100).toFixed(1)}%;">`).join('')
  const head = headers.map((label) =>`<th style="padding:9px 10px;background:#09244a;color:#ffffff;border:1px solid #09244a;text-align:left;">${label}</th>`).join('')
  const body = rows.map((cells, index) => `<tr style="background:${index % 2 ? '#f8fafc' : '#ffffff'};">${cells.map((cell, column) => column === statusIndex
    ? `<td style="padding:8px 10px;border:1px solid #dbe3ef;vertical-align:top;"><span style="${historyStatusStyle(cell)}display:inline-block;padding:4px 7px;font-weight:bold;">${escapeHtml(cell)}</span></td>`
    : `<td style="padding:8px 10px;border:1px solid #dbe3ef;vertical-align:top;">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
  const table = `<table style="width:100%;border-collapse:collapse;font-size:9pt;table-layout:fixed;"><colgroup>${columns}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
  return { header, summary, table }
}

export default function GsoHistory() {
  const [tab, setTab] = useState<TabKey>(() => {
    const requested = new URLSearchParams(window.location.search).get('tab') ?? ''
    const key = (LEGACY_TABS[requested] ?? requested) as TabKey
    return TABS.some((item) => item.key === key) ? key : 'returns'
  })
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [returnsView, setReturnsView] = useState<ReturnsView>('all')
  // The record popup and its audit trail. The audit list is keyed by the record, so an old list never shows for a new record.
  const [detailRow, setDetailRow] = useState<HistoryRow | null>(null)
  const [detailAudit, setDetailAudit] = useState<{ key: string; logs: AuditLogEntry[] } | null>(null)
  useEffect(() => {
    if (!detailRow) return
    let active = true
    const key = detailRow.id
    listAuditLogs({ limit: 20, offset: 0, action: 'all', entityType: 'all', flag: 'all', search: detailRow.reference, from: '', to: '' })
      .then((page) => { if (active) setDetailAudit({ key, logs: page.logs }) })
      .catch(() => { if (active) setDetailAudit({ key, logs: [] }) })
    return () => { active = false }
  }, [detailRow])

  const [dateFilter, setDateFilter] = useState('')
  const [lossCategory, setLossCategory] = useState<LossView>('all')
  const [sortKey, setSortKey] = useState<SortKey>('oldest')
  // Employee first and last names by email, so the Person column shows a real name instead of the login name.
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({})
  useEffect(() => {
    listEmployees()
      .then(({ employees }) => setEmployeeNames(Object.fromEntries(employees.map((employee) => [employee.email.toLowerCase(), `${employee.firstName} ${employee.lastName}`.trim()]))))
      .catch(() => setEmployeeNames({}))
  }, [])
  const personName = (row: HistoryRow) => (row.personEmail && employeeNames[row.personEmail.toLowerCase()]) || row.person
  // The GSO staff member who reviewed a requester account, shown by full name when the employee record has it.
  const reviewerName = (row: HistoryRow) => (row.actorEmail && employeeNames[row.actorEmail.toLowerCase()]) || row.actorName || '—'
  const current = TABS.find((item) => item.key === tab) ?? TABS[0]

  const selectModule = (key: TabKey) => {
    setTab(key)
    setSearch('')
    setStatusFilter('all')
    setDateFilter('')
    setSortKey('oldest')
    setLossCategory('all')
  }
  const changeLossCategory = (next: LossView) => {
    setLossCategory(next)
    setStatusFilter('all')
  }

  useEffect(() => {
    window.history.replaceState(null, '', `/gso/history?tab=${tab}`)
    if (!current.ready) return
    let cancelled = false
    setLoading(true)
    setError('')
    loadRows(tab)
      .then((result) => { if (!cancelled) setRows(result) })
      .catch((reason: unknown) => { if (!cancelled) { setRows([]); setError(reason instanceof Error ? reason.message : 'The history could not be loaded.') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tab, current.ready])

  // The Loss, Repair & Unserviceable tab shows the category picked in its dropdown (All by default); the other tabs show every row.
  const scopedRows = useMemo(() => (tab === 'loss' && lossCategory !== 'all' ? rows.filter((row) => row.category === lossCategory) : rows), [rows, tab, lossCategory])
  const statusOptions = useMemo(() => [...new Set(scopedRows.map((row) => row.status))].sort(), [scopedRows])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    const byNewest = (a: HistoryRow, b: HistoryRow) => (b.date ?? '').localeCompare(a.date ?? '')
    const sorted = [...scopedRows].sort((a, b) => {
      if (sortKey === 'reference') return a.reference.localeCompare(b.reference, undefined, { numeric: true })
      if (sortKey === 'person') return a.person.localeCompare(b.person)
      if (sortKey === 'oldest') return byNewest(b, a)
      return byNewest(a, b)
    })
    return sorted.filter((row) => (!query || `${row.reference} ${row.tag ?? ''} ${row.itemName ?? ''} ${row.detail} ${row.person} ${row.status}`.toLowerCase().includes(query))
      && (tab === 'returns' ? (returnsView === 'all' || row.view === returnsView) : (statusFilter === 'all' || row.status === statusFilter))
      && (!dateFilter || localDay(row.date) === dateFilter))
  }, [scopedRows, search, tab, sortKey, statusFilter, returnsView, dateFilter])

  const reportName = current.label.replace(/[^a-z0-9]+/gi, '_')
  const today = new Date().toISOString().slice(0, 10)
  // Same columns and order as the table on screen: Person, Date, Reference, Details, then the tab's extra column, then Status.
  const statusClass = (row: HistoryRow) => {
    if (tab === 'payments') return row.status === 'Settled' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
    if (tab === 'returns') return returnsStatusTone(row.status)
    if (tab === 'loss') return lossGroupTone(row.status)
    if (tab === 'service') return serviceStatusTone(row.status)
    if (tab === 'employees') return row.status === 'Verified' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
    return 'bg-slate-100 text-slate-700'
  }
  // The table columns. The same columns feed the CSV and Word export, so the export matches the screen.
  const nameColumn: TableColumn = {
    label: tab === 'returns' || tab === 'loss' ? 'Name' : 'Person',
    text: (row) => personName(row),
    render: (row, index) => (
      <div className="flex min-w-52 items-center gap-3">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 text-xs font-black shadow-sm ${historyAvatarTone(index)}`}>
          {personName(row).split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}
        </span>
        <span className="min-w-0 text-xs font-extrabold text-slate-800">{personName(row)}</span>
      </div>
    ),
  }
  const dateColumn: TableColumn = {
    label: 'Date & time',
    text: (row) => dateText(row.date),
    render: (row) => <span className="block whitespace-nowrap text-xs font-semibold text-slate-700">{dateText(row.date)}</span>,
  }
  const referenceColumn = (label: string): TableColumn => ({
    label,
    text: (row) => row.reference,
    render: (row) => <span className="block text-xs font-extrabold text-slate-900">{row.reference}</span>,
  })
  const itemColumn = (label: string): TableColumn => ({
    label,
    text: (row) => row.itemName || row.detail,
    render: (row) => <span className="block text-xs font-extrabold text-slate-800">{row.itemName || row.detail}</span>,
  })
  const reasonColumn: TableColumn = {
    label: 'Reason',
    text: (row) => row.reason || '',
    render: (row) => <span className="block max-w-md rounded-lg bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-700 ring-1 ring-slate-200">{row.reason || 'No reason recorded'}</span>,
  }
  const conditionColumn: TableColumn = {
    label: 'Condition',
    text: (row) => conditionText(row),
    render: (row) => <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${conditionTone(conditionText(row))}`}>{conditionText(row)}</span>,
  }
  const detailsColumn: TableColumn = {
    label: 'Details',
    text: (row) => (row.service ? row.service.title : row.detail),
    render: (row) => (row.service
      ? (
        <div className="max-w-md">
          <p className="truncate text-xs font-bold text-slate-900" title={row.service.title}>{row.service.title || 'Service request'}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold ${row.service.team === 'ITSS' ? 'bg-indigo-50 text-indigo-700' : 'bg-blue-50 text-blue-700'}`}>{row.service.team === 'ITSS' ? 'ITSS Support' : 'GSO Facilities'}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-bold text-slate-600">{row.service.claimedBy ? `Claimed by ${row.service.claimedBy}` : 'Not claimed'}</span>
            {row.service.closedAt && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-bold text-slate-600">Closed {dateText(row.service.closedAt)}</span>}
          </div>
        </div>
      )
      : <span className="block max-w-md text-xs text-slate-600">{row.detail}</span>),
  }
  const reviewerColumn: TableColumn = {
    label: 'Reviewed by',
    text: (row) => reviewerName(row),
    render: (row) => <span className="text-xs font-semibold text-slate-800">{reviewerName(row)}</span>,
  }
  const statusColumn: TableColumn = {
    label: 'Status',
    text: (row) => row.status,
    render: (row) => <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${statusClass(row)}`}>{row.status}</span>,
  }
  // Loss, Repair & Unserviceable: each category has its own columns.
  const tagColumn = (label: string): TableColumn => ({
    label,
    text: (row) => row.tag || row.reference,
    render: (row) => <span className="block whitespace-nowrap text-xs font-extrabold text-slate-900">{row.tag || row.reference}</span>,
  })
  const lostItemColumn: TableColumn = {
    label: 'Item & where lost',
    text: (row) => `${row.itemName || row.detail} · Location: ${row.place || 'not recorded'}`,
    render: (row) => (
      <div className="max-w-md">
        <p className="truncate text-xs font-extrabold text-slate-900" title={row.itemName || row.detail}>{row.itemName || row.detail}</p>
        <p className="mt-1 truncate text-[0.7rem] font-semibold text-slate-500">Location: {row.place || 'not recorded'}</p>
      </div>
    ),
  }
  const itemDetailsColumn: TableColumn = {
    label: 'Details',
    text: (row) => [row.itemName || row.detail, row.itemName ? row.detail : ''].filter(Boolean).join(' · '),
    render: (row) => (
      <div className="max-w-md">
        <p className="truncate text-xs font-extrabold text-slate-900" title={row.itemName || row.detail}>{row.itemName || row.detail}</p>
        {row.itemName && row.detail && <p className="mt-1 truncate text-[0.7rem] font-semibold text-slate-500" title={row.detail}>{row.detail}</p>}
      </div>
    ),
  }
  const repairByColumn: TableColumn = {
    label: 'Repair by',
    text: (row) => row.handledBy || '—',
    render: (row) => <span className="block whitespace-nowrap text-xs font-extrabold text-slate-800">{row.handledBy || '—'}</span>,
  }
  const chargeColumn: TableColumn = {
    label: 'Charge or waive',
    text: (row) => row.chargeText || '—',
    render: (row) => <span className="block whitespace-nowrap text-xs font-bold text-slate-700">{row.chargeText || '—'}</span>,
  }
  const categoryColumn: TableColumn = {
    label: 'Category',
    text: (row) => LOSS_CATEGORIES.find((option) => option.value === row.category)?.label ?? '—',
    render: (row) => <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${row.category ? CATEGORY_TONE[row.category] : ''}`}>{LOSS_CATEGORIES.find((option) => option.value === row.category)?.label ?? '—'}</span>,
  }
  const lossColumns: Record<LossView, TableColumn[]> = {
    all: [nameColumn, dateColumn, categoryColumn, itemDetailsColumn, tagColumn('Tag / Ref'), statusColumn],
    loss: [nameColumn, dateColumn, lostItemColumn, tagColumn('Tag / Ref'), statusColumn],
    repair: [nameColumn, dateColumn, tagColumn('Tag'), itemDetailsColumn, repairByColumn, statusColumn],
    unserviceable: [nameColumn, dateColumn, tagColumn('Tag'), itemDetailsColumn, chargeColumn, statusColumn],
  }
  const columns: TableColumn[] = tab === 'loss'
    ? lossColumns[lossCategory]
    : tab === 'returns' && returnsView === 'issued'
    ? [nameColumn, dateColumn, referenceColumn('Item code'), itemColumn('Item'), statusColumn]
    : tab === 'returns' && returnsView === 'declined'
      ? [nameColumn, dateColumn, itemColumn('Item requested'), reasonColumn, statusColumn]
      : tab === 'returns' && returnsView === 'returned'
        ? [nameColumn, dateColumn, itemColumn('Item returned'), conditionColumn]
        : tab === 'employees'
          ? [nameColumn, dateColumn, referenceColumn('Reference'), detailsColumn, reviewerColumn, statusColumn]
          : [nameColumn, dateColumn, referenceColumn('Reference'), detailsColumn, statusColumn]
  const reportHeaders = columns.map((column) => column.label)
  const reportCells = (row: HistoryRow) => columns.map((column) => column.text(row))
  const reportTitle = `${current.label} History`
  const reportNote = dateFilter ? `Filtered by date: ${dateFilter}` : 'Includes the records matching the selected filters'
  const reportGeneratedAt = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())
  const reportRows = visible.map((row) => reportCells(row).map((cell) => String(cell)))
  // CSV opens as a styled spreadsheet, like the Item Master Data report.
  const exportCsv = () => {
    const report = historyReportParts({ title: reportTitle, note: reportNote, generatedAt: reportGeneratedAt, headers: reportHeaders, rows: reportRows })
    const workbook = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><meta name="ProgId" content="Excel.Sheet"><title>${escapeHtml(reportTitle)}</title><style>body { font-family: Calibri, Arial, sans-serif; color: #1e293b; } table { border-collapse: collapse; }</style></head><body>${report.header}${report.summary}${report.table}</body></html>`
    downloadHistoryFile(`GSO_${reportName}_Styled_Report_${today}.xls`, ['﻿', workbook], 'application/vnd.ms-excel;charset=utf-8')
  }
  const exportWord = () => {
    const report = historyReportParts({ title: reportTitle, note: reportNote, generatedAt: reportGeneratedAt, headers: reportHeaders, rows: reportRows })
    const wordDocument = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escapeHtml(reportTitle)}</title><style>@page Section1 { size: 11in 8.5in; mso-page-orientation: landscape; margin: 0.45in; } div.Section1 { page: Section1; } body { font-family: Arial, sans-serif; color: #1e293b; font-size: 10pt; } table { border-collapse: collapse; } thead { display: table-header-group; } tr { page-break-inside: avoid; }</style></head><body><div class="Section1">${report.header}${report.summary}${report.table}</div></body></html>`
    downloadHistoryFile(`GSO_${reportName}_Styled_Report_${today}.doc`, ['﻿', wordDocument], 'application/msword;charset=utf-8')
  }

  // The facts shown in the record popup. Only the ones this record has are listed.
  const factsOf = (row: HistoryRow) => [
    { label: 'Name', value: personName(row) },
    { label: 'Date & time', value: dateText(row.date) },
    { label: 'Reference', value: row.reference },
    row.tag && row.tag !== row.reference ? { label: 'Tag', value: row.tag } : null,
    { label: 'Item', value: row.itemName || row.detail },
    row.itemName && row.detail ? { label: 'Details', value: row.detail } : null,
    row.place ? { label: 'Location', value: row.place } : null,
    row.handledBy ? { label: 'Repair by', value: row.handledBy } : null,
    row.condition ? { label: 'Condition', value: conditionText(row) } : null,
    row.chargeText ? { label: 'Charge or waive', value: row.chargeText } : null,
    row.reason ? { label: 'Reason', value: row.reason, wide: true } : null,
  ].filter((fact): fact is { label: string; value: string; wide?: boolean } => Boolean(fact))
  return <GsoPageFrame activePage="History" searchPlaceholder="Search history...">
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Records</span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">History</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-blue-100">Past activity for each module. Pick a module below.</p>
          <nav className="mt-5 flex flex-wrap gap-2 border-t border-blue-300/20 pt-4" aria-label="History modules">
            {TABS.map((item) => {
              const isActive = item.key === tab
              return <button
                key={item.key}
                type="button"
                onClick={() => selectModule(item.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-xl border px-4 py-2 text-xs font-extrabold transition ${isActive ? 'border-white bg-white text-blue-950 shadow-md' : 'border-white/15 bg-white/5 text-blue-100 hover:bg-white/12'}`}
              >
                {item.label}
              </button>
            })}
          </nav>
        </div>
      </section>

      {!current.ready && <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="text-sm font-extrabold text-slate-800">{current.label} history</p>
        <p className="mt-1 text-xs font-medium text-slate-500">Coming next. This module's history will appear here.</p>
      </section>}

      {current.ready && <section className="overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">{current.label} history</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Click on any row to open the full record and its audit trail. Generate CSV or Word exports what is shown.</p>
            <span className="mt-2 inline-flex rounded-lg bg-blue-50 px-3 py-2 text-[0.65rem] font-extrabold text-blue-700">{loading ? 'Loading…' : `${visible.length} record(s) found`}</span>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block w-40">
              <span className="mb-1 block text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-500">Filter by date</span>
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label={`Filter ${current.label} history by date`} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
            </label>
            {dateFilter && <button type="button" aria-label="Clear date filter" onClick={() => setDateFilter('')} className="mb-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[0.65rem] font-bold text-slate-600 transition hover:bg-slate-100">Clear date</button>}
            <button type="button" onClick={exportCsv} disabled={loading || visible.length === 0} className="inline-flex min-h-9 min-w-40 items-center justify-center gap-1.5 rounded-lg bg-[#138548] px-4 py-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#0f7440] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0">
              <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h2M8 17h2M14 13h2M14 17h2" /></svg>
              Generate CSV
            </button>
            <button type="button" onClick={exportWord} disabled={loading || visible.length === 0} className="inline-flex min-h-9 min-w-40 items-center justify-center gap-1.5 rounded-lg bg-[#2d5aa3] px-4 py-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#264e8e] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0">
              <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></svg>
              Generate Word
            </button>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">Search</span>
              <div className="relative">
                <svg aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.75" cy="10.75" r="5.75" /><path d="m15.1 15.1 4.15 4.15" /></svg>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, detail, or person" className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 text-xs font-semibold text-slate-800 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">{tab === 'returns' ? 'View' : 'Status'}</span>
              <select value={tab === 'returns' ? returnsView : statusFilter} onChange={(event) => (tab === 'returns' ? setReturnsView(event.target.value as ReturnsView) : setStatusFilter(event.target.value))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                {tab === 'returns'
                  ? <><option value="all">All</option><option value="issued">Issued</option><option value="declined">Declined / Rejected</option><option value="returned">Returns</option></>
                  : <><option value="all">All statuses</option>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</>}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">{tab === 'loss' ? 'Category' : 'Sort by'}</span>
              <select value={tab === 'loss' ? lossCategory : sortKey} onChange={(event) => (tab === 'loss' ? changeLossCategory(event.target.value as LossView) : setSortKey(event.target.value as SortKey))} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                {tab === 'loss'
                  ? LOSS_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)
                  : SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {error && <p role="alert" className="px-5 py-4 text-xs font-bold text-rose-700">{error}</p>}
        {!error && !loading && visible.length === 0 && <p className="px-5 py-12 text-center text-xs font-semibold text-slate-500">{scopedRows.length === 0
  ? tab === 'loss' ? LOSS_CATEGORIES.find((option) => option.value === lossCategory)?.empty : `No ${current.label.toLowerCase()} history yet.`
  : 'No records match these filters.'}</p>}
        {visible.length > 0 && <div className="inventory-list-scrollbar max-h-144 overflow-auto border-t border-slate-100">
          <table className="min-w-200 w-full text-left">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                {columns.map((column, index) => <th key={column.label} className={`sticky top-0 z-10 bg-slate-50 px-5 py-3.5 ${index === 0 || index === columns.length - 1 ? 'sm:px-6' : ''}`}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, rowIndex) => <tr key={row.id} onClick={() => setDetailRow(row)} className="cursor-pointer border-t border-slate-100 transition hover:bg-blue-50/50">
                {columns.map((column, index) => <td key={column.label} className={`px-5 py-4 ${index === 0 || index === columns.length - 1 ? 'sm:px-6' : ''}`}>{column.render(row, rowIndex)}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div>}

        {detailRow && <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailRow(null) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="history-detail-title" className="flex max-h-[88vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl shadow-slate-950/30">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 text-sm font-black ${historyAvatarTone(0)}`}>
                  {personName(detailRow).split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">{(detailRow.category && LOSS_CATEGORIES.find((option) => option.value === detailRow.category)?.label) || current.label}</p>
                  <h2 id="history-detail-title" className="mt-0.5 truncate text-lg font-black text-slate-900">{detailRow.itemName || detailRow.detail || detailRow.reference}</h2>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{detailRow.reference}</p>
                </div>
              </div>
              <button type="button" onClick={() => setDetailRow(null)} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50">Close</button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 px-4 py-5 sm:px-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${statusClass(detailRow)}`}>{detailRow.status}</span>
                  {STATUS_NOTE[detailRow.status] && <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-700">{STATUS_NOTE[detailRow.status]}</p>}
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    {factsOf(detailRow).map((fact) => (
                      <div key={fact.label} className={`rounded-xl bg-slate-50 px-4 py-3 ${fact.wide ? 'sm:col-span-2' : ''}`}>
                        <dt className="text-xs font-semibold text-slate-500">{fact.label}</dt>
                        <dd className="mt-1 break-words text-sm font-bold text-slate-900">{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <div className="space-y-4">
                  {detailRow.charge && <RecordReceipt key={detailRow.id} charge={detailRow.charge} />}

                  <section className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="text-sm font-extrabold text-slate-900">Activity</h3>
                    <p className="mt-0.5 text-xs text-slate-500">What happened to this record, newest first.</p>
                    <div className="mt-4 max-h-72 overflow-y-auto pr-2">
                      {detailAudit?.key === detailRow.id
                        ? detailAudit.logs.length === 0
                          ? <p className="text-sm font-semibold text-slate-500">No activity recorded for this yet.</p>
                          : <ol className="ml-2 space-y-4 border-l-2 border-slate-100">
                            {detailAudit.logs.map((log) => (
                              <li key={log.id} className="relative pl-6">
                                <span aria-hidden="true" className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow" />
                                <p className="text-sm font-semibold leading-relaxed text-slate-800">{log.reason || log.action}</p>
                                <p className="mt-1 text-xs text-slate-500">{log.changedBy || 'System'} · {dateText(log.changedAt)}</p>
                              </li>
                            ))}
                          </ol>
                        : <p className="text-sm font-semibold text-slate-500">Loading activity…</p>}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </section>
        </div>}
      </section>}
    </div>
  </GsoPageFrame>
}
