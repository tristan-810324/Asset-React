import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import type { PurchaseRequisitionLine, PurchaseRequisitionStockCheck, ServiceRequest, StaffRoute } from '../requesters/requesterApi'
import { formatDate, formatDateTime } from '../requesters/requesterrequestutils'
import { DeliveryChecklist } from './deliveryLink'
import { listInventoryItems, type InventoryItemRecord } from './inventoryApi'
import {
  listAwaitingDeliveries,
  listStaffPurchaseRequisitions,
  recordPurchaseDeliveries,
  staffReviewPurchaseRequisition,
  undoPurchaseDelivery,
  type AwaitingDeliveryLine,
} from './purchaseRequisitionsApi'
import {
  FINANCE_STATUSES,
  ISSUABLE_STATUSES,
  ROUTES,
  canRecordDelivery,
  categoryLabel,
  countLines,
  deliveryOpen,
  formText,
  inventoryCategoryMatches,
  inventoryMatchesLine,
  linesOf,
  staffDecides,
} from './requisitionFlow'
import { Banner, DeliveryRecords, EmptyState, HistoryList, LineStatusBadge, QuantityChips, RequestSummary, RoutePill, fieldInput, fieldLabel } from './requisitionParts'

type Tab = 'review' | 'link' | 'issue' | 'waiting'
type StepStatus = 'current' | 'upcoming' | 'done'

// `link` is a worklist of items, not of requests: bought items already in Item Master Data that requests are waiting for.
const TABS: Record<Tab, { label: string; hint: string; empty: string; unit: string }> = {
  review: { label: 'To check', hint: 'New requests. Check each item, then confirm its route.', empty: 'No new requests to check.', unit: 'request' },
  link: { label: 'Ready to link', hint: 'Bought items are in Item Master Data. Link them to the requests waiting for them, many at once.', empty: 'Nothing is ready to link.', unit: 'item' },
  issue: { label: 'Ready to issue', hint: 'Stock is reserved. Hand it over in Main Issuance.', empty: 'Nothing is waiting for issuance.', unit: 'request' },
  waiting: { label: 'Waiting', hint: 'With the GSO Head or the requester, or approved for purchase while you buy the items and wait for the delivery.', empty: 'Nothing is waiting.', unit: 'request' },
}
const TAB_ORDER = Object.keys(TABS) as Tab[]

const stepStyles: Record<StepStatus, { badge: string; label: string; suffix: string }> = {
  done: { badge: 'bg-emerald-600 text-white', label: 'text-emerald-700', suffix: ' · Done' },
  current: { badge: 'bg-blue-600 text-white ring-4 ring-blue-100', label: 'text-blue-700', suffix: '' },
  upcoming: { badge: 'bg-slate-200 text-slate-700', label: 'text-slate-600', suffix: '' },
}

function WorkflowStepHeader({ step, status, titleId, title, description, children }: {
  step: 1 | 2 | 3
  status: StepStatus
  titleId: string
  title: string
  description: string
  children?: ReactNode
}) {
  const styles = stepStyles[status]
  return <div className="flex items-start gap-3">
    <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black ${styles.badge}`}>
      {status === 'done'
        ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
        : step}
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className={`text-xs font-extrabold uppercase tracking-wide ${styles.label}`}>Step {step} of 3{styles.suffix}</p>
          <h2 id={titleId} className="mt-0.5 text-base font-black leading-tight text-slate-900">{title}</h2>
        </div>
        {children}
      </div>
      <p className="mt-1 text-sm leading-snug text-slate-600">{description}</p>
    </div>
  </div>
}

function QueueStageSelector({ active, counts, onChange }: { active: Tab; counts: Record<Tab, number>; onChange: (tab: Tab) => void }) {
  return <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="group" aria-label="Filter requisition queue">
    {TAB_ORDER.map((key) => {
      const selected = key === active
      return <button key={key} type="button" aria-pressed={selected} onClick={() => onChange(key)} className={`rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${selected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'}`}>
        <span className={`block text-xs font-extrabold ${selected ? 'text-blue-800' : 'text-slate-900'}`}>{TABS[key].label}</span>
        <span className={`mt-1 block text-[0.68rem] font-semibold ${selected ? 'text-blue-700' : 'text-slate-500'}`}>{counts[key]} {TABS[key].unit}{counts[key] === 1 ? '' : 's'}</span>
      </button>
    })}
  </div>
}

function tabsFor(request: ServiceRequest): Tab[] {
  const tabs: Tab[] = []
  if (request.status === 'Submitted' && countLines(request, ['WAITING_STAFF_REVIEW'])) tabs.push('review')
  if (countLines(request, ISSUABLE_STATUSES)) tabs.push('issue')
  if (deliveryOpen(request) && linesOf(request).some(canRecordDelivery)) tabs.push('waiting')
  // Once GSO has prepared every per-unit asset, the requisition leaves this
  // checking workspace. Its pickup status and barcode labels live in Main Issuance.
  if (!tabs.length && !['Completed', 'Rejected', 'Ready for Pickup'].includes(request.status)) tabs.push('waiting')
  return tabs
}

// Who has the request now, in words a staff member can act on.
function waitingOn(request: ServiceRequest) {
  if (request.status === 'Under Review') return { label: 'With GSO Head', tone: 'bg-amber-50 text-amber-800', detail: `The GSO Head is deciding ${countLines(request, ['WAITING_GSO_HEAD'])} item(s). Approved stock comes back to "Ready to issue".` }
  if (request.status === 'Needs Information') return { label: 'With requester', tone: 'bg-amber-50 text-amber-800', detail: 'Waiting for the requester to answer. Their reply brings the request back to "To check".' }
  if (request.status === 'Sent to Finance') return { label: 'To buy', tone: 'bg-indigo-50 text-indigo-700', detail: `The GSO Head sent the purchase to Finance${request.financeSentAt ? ` on ${formatDate(request.financeSentAt)}` : ''}. Buy the items, add them in Item Master Data, then link the delivery.` }
  if (FINANCE_STATUSES.includes(request.status)) return { label: 'Purchase approved', tone: 'bg-indigo-50 text-indigo-700', detail: 'The GSO Head approved the purchase and will send it to Finance. You can buy the items after that.' }
  if (request.status === 'Completed') return { label: 'Completed', tone: 'bg-slate-100 text-slate-600', detail: 'Every approved item was issued.' }
  if (request.status === 'Rejected') return { label: 'Declined', tone: 'bg-rose-50 text-rose-700', detail: 'The GSO Head declined every item.' }
  return { label: request.status, tone: 'bg-slate-100 text-slate-600', detail: 'Waiting for the next update.' }
}

function chipFor(request: ServiceRequest, tab: Tab) {
  if (tab === 'review') return { label: `${countLines(request, ['WAITING_STAFF_REVIEW'])} to check`, tone: 'bg-blue-50 text-blue-700' }
  if (tab === 'issue') return { label: `${countLines(request, ISSUABLE_STATUSES)} to issue`, tone: 'bg-emerald-50 text-emerald-700' }
  if (deliveryOpen(request) && linesOf(request).some(canRecordDelivery)) return { label: 'Awaiting delivery', tone: 'bg-indigo-50 text-indigo-700' }
  return waitingOn(request)
}

function ConditionIcon({ ok }: { ok: boolean }) {
  return <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${ok ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
    <svg aria-hidden="true" className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">{ok ? <path d="m5 12.5 4.5 4.5L19 7.5" /> : <path d="M7 7l10 10M17 7 7 17" />}</svg>
    <span className="sr-only">{ok ? 'Yes' : 'No'}</span>
  </span>
}

const STAFF_CHOICES: Array<{ route: StaffRoute; title: string; detail: string; on: string; dot: string }> = [
  { route: 'ISSUE', title: 'Issue now', detail: 'You reserve it and hand it over.', on: 'border-emerald-500 bg-emerald-50', dot: 'border-emerald-600 bg-emerald-600' },
  { route: 'HEAD_ISSUE', title: 'Ask GSO Head first', detail: 'Reserved while the Head decides.', on: 'border-amber-400 bg-amber-50', dot: 'border-amber-500 bg-amber-500' },
]

// The conditions behind an item's route, checked against live stock.
// When the item is in stock, the staff member chooses: issue now or ask the GSO Head first.
function StockCheckCard({ line, check, route, onChoose }: {
  line: PurchaseRequisitionLine
  check: PurchaseRequisitionStockCheck
  route: StaffRoute
  onChoose: (route: StaffRoute) => void
}) {
  const shortage = line.requestedQuantity - check.reservedQuantity
  const conditions = [
    {
      ok: check.matches.length > 0,
      label: 'Matches inventory',
      detail: check.matches.length ? check.matches.map((match) => match.itemCode).join(', ') : 'No inventory record with this name and category',
    },
    {
      ok: check.availableQuantity >= line.requestedQuantity,
      label: 'Enough stock',
      detail: `${check.availableQuantity} available · ${line.requestedQuantity} requested`,
    },
  ]
  const result = route === 'ISSUE'
    ? `Reserve ${check.reservedQuantity} now. You issue it in Main Issuance; the GSO Head is not asked.`
    : route === 'HEAD_ISSUE'
      ? `Reserve ${check.reservedQuantity} now. You issue it once the GSO Head approves.`
      : check.reservedQuantity > 0
        ? `Reserve ${check.reservedQuantity} now and ask the GSO Head to approve buying ${shortage}.`
        : `Ask the GSO Head to approve buying all ${shortage}.`
  return <article className="rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-slate-900">{line.itemName} <span className="font-bold text-slate-500">× {line.requestedQuantity}</span></p>
        <p className="mt-0.5 text-xs font-medium text-slate-500">{categoryLabel(line.category)}</p>
      </div>
      <RoutePill route={route} />
    </div>
    {line.specifications && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[0.65rem] leading-relaxed text-slate-600">{line.specifications}</p>}
    <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label={`Conditions for ${line.itemName}`}>
      {conditions.map((condition) => <li key={condition.label} className={`rounded-xl border px-3 py-2.5 ${condition.ok ? 'border-emerald-100 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'}`}>
        <p className={`flex items-center gap-1.5 text-[0.68rem] font-extrabold ${condition.ok ? 'text-emerald-800' : 'text-slate-700'}`}><ConditionIcon ok={condition.ok} />{condition.label}</p>
        <p className="mt-1 wrap-break-word text-[0.62rem] leading-snug text-slate-500">{condition.detail}</p>
      </li>)}
    </ul>
    {staffDecides(check.options) && <div className="mt-3">
      <p className="mb-1.5 text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Choose route</p>
      <div className="grid gap-1 rounded-xl border border-slate-300 bg-slate-100 p-1 sm:grid-cols-2" role="radiogroup" aria-label={`Route for ${line.itemName}`}>
        {STAFF_CHOICES.map((choice) => {
          const selected = route === choice.route
          return <button key={choice.route} type="button" role="radio" aria-checked={selected} onClick={() => onChoose(choice.route)} className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${selected ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-700 hover:bg-white/70'}`}>
            <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${selected ? choice.dot : 'border-slate-300 bg-white'}`}>{selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>
            <span><span className="block text-xs font-extrabold">{choice.title}</span><span className="mt-0.5 block text-[0.62rem] text-slate-500">{choice.detail}</span></span>
          </button>
        })}
      </div>
    </div>}
    <p className={`mt-3 rounded-xl border px-3 py-2.5 text-[0.68rem] font-semibold leading-relaxed ${ROUTES[route].tone}`}><span className="font-extrabold">Result: </span>{result}</p>
  </article>
}

function LineCard({ line, children, onUndo }: { line: PurchaseRequisitionLine; children?: ReactNode; onUndo?: (receiptId: string) => Promise<void> }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-slate-900">{line.itemName} <span className="font-bold text-slate-500">× {line.requestedQuantity}</span></p>
        <p className="mt-0.5 text-xs font-medium text-slate-500">{categoryLabel(line.category)}</p>
      </div>
      <LineStatusBadge status={line.routeStatus} />
    </div>
    <QuantityChips line={line} />
    {line.reviewNote && ['REJECTED', 'NEEDS_INFORMATION'].includes(line.routeStatus) && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[0.65rem] leading-relaxed text-slate-700"><span className="font-extrabold">{line.routeStatus === 'REJECTED' ? 'GSO Head reason: ' : 'Question: '}</span>{line.reviewNote}</p>}
    {line.allocations.some((allocation) => allocation.status === 'Reserved') && <p className="mt-2 text-[0.6rem] font-semibold text-slate-500">Reserved from {line.allocations.filter((allocation) => allocation.status === 'Reserved').map((allocation) => `${allocation.itemCode} (${allocation.quantity - allocation.fulfilledQuantity} ${allocation.unitOfMeasure})`).join(', ')}</p>}
    <DeliveryRecords line={line} onUndo={onUndo} />
    {children}
  </article>
}

function StepBadge({ step }: { step: number }) {
  return <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-black text-white">{step}</span>
}

// The receipt typed on a recent restock in Item Master Data, so staff do not type it twice.
function recentReceiptReference(item: InventoryItemRecord) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const latest = [...(item.receiptHistory || [])]
    .filter((receipt) => receipt.referenceNumber && new Date(receipt.createdAt).getTime() >= weekAgo)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  return latest?.referenceNumber || ''
}

// After the GSO Head sends the purchase to Finance and GSO Staff buy the item: put it in Item Master Data,
// then link what arrived to this requisition item so it can be issued. (Several requests at once: the "Ready to link" tab.)
function DeliveryForm({ request, line, inventory, refreshing, similarOffer, onRefreshInventory, onOpenLinkTab, onReceived }: {
  request: ServiceRequest
  line: PurchaseRequisitionLine
  inventory: InventoryItemRecord[]
  refreshing: boolean
  similarOffer?: AwaitingDeliveryLine
  onRefreshInventory: () => void
  onOpenLinkTab: () => void
  onReceived: (message: string) => void
}) {
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reference, setReference] = useState('')
  const [referenceFromStock, setReferenceFromStock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const matches = inventory.filter((item) => inventoryMatchesLine(item, line) && item.availableQuantity > 0)
  const chosen = matches.find((item) => item.id === itemId)
  const categoryName = inventory.find((item) => inventoryCategoryMatches(item.category, line))?.category || categoryLabel(line.category)
  const amount = Number(quantity)
  const problem = !chosen ? 'Select the item you put in Item Master Data.'
    : !Number.isInteger(amount) || amount < 1 ? 'Enter how many arrived.'
      : amount > line.financeQuantity ? `Only ${line.financeQuantity} still to receive for this request.`
        : amount > chosen.availableQuantity ? `${chosen.itemCode} has only ${chosen.availableQuantity} ${chosen.unitOfMeasure} available. Restock it in Item Master Data first.`
          : ''

  function chooseItem(id: string) {
    setItemId(id)
    const item = matches.find((entry) => entry.id === id)
    if (!item) return
    if (!quantity) setQuantity(String(Math.min(line.financeQuantity, item.availableQuantity)))
    const receipt = recentReceiptReference(item)
    if (!reference.trim() && receipt) {
      setReference(receipt)
      setReferenceFromStock(true)
    }
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      await recordPurchaseDeliveries({ deliveries: [{ lineId: line.id, itemId, quantity: amount }], receiptReference: reference.trim() })
      onReceived(`${amount} ${chosen?.unitOfMeasure || ''} ${line.itemName} recorded for ${request.referenceNo}. It is now in “Ready to issue”; hand it over in Main Issuance.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to record the delivery.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 sm:p-4" aria-label={`Record the purchased ${line.itemName}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="text-sm font-black text-indigo-950">Record the purchased item</p>
        <p className="mt-0.5 text-xs leading-relaxed text-indigo-900/80">The GSO Head sent this purchase to Finance. After you buy it, record it in two steps.</p>
      </div>
      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[0.62rem] font-extrabold text-indigo-700 ring-1 ring-indigo-200">{line.financeQuantity} still to receive</span>
    </div>

    <ol className="mt-3 space-y-2.5">
      <li className="flex gap-3 rounded-xl border border-indigo-100 bg-white p-3.5">
        <StepBadge step={1} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold text-slate-900">Put it in Item Master Data</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">Already listed? <span className="font-bold text-slate-800">Restock</span> it with the quantity you bought. New item? <span className="font-bold text-slate-800">Add</span> it named <span className="font-extrabold text-slate-900">“{line.itemName}”</span> under <span className="font-bold text-slate-800">{categoryName}</span> so it matches this request.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" onClick={() => window.open('/gso/items', '_blank')} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-indigo-700">
              Open Item Master Data
              <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
            </button>
            <button type="button" disabled={refreshing} onClick={onRefreshInventory} className="rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-xs font-extrabold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60">{refreshing ? 'Checking…' : 'Refresh list'}</button>
          </div>
          <p className="mt-1.5 text-[0.65rem] text-slate-500">Opens in a new tab. The list in step 2 updates when you come back here.</p>
        </div>
      </li>

      <li className="flex gap-3 rounded-xl border border-indigo-100 bg-white p-3.5">
        <StepBadge step={2} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold text-slate-900">Link what arrived to this request</p>
          {matches.length === 0 && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">No “{line.itemName}” with available stock in Item Master Data yet. Finish step 1, then come back.</p>}
          {matches.length === 0 && similarOffer && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <p className="min-w-0 text-xs leading-relaxed text-blue-900">Item Master Data has a similar item, <span className="font-extrabold">{similarOffer.candidates[0]?.name}</span>. Confirm it is the same in “Ready to link”.</p>
            <button type="button" onClick={onOpenLinkTab} className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-[0.65rem] font-extrabold text-white transition hover:bg-blue-700">Open Ready to link</button>
          </div>}
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className={fieldLabel}>Item in Item Master Data</span>
              <select value={itemId} onChange={(event) => chooseItem(event.target.value)} disabled={matches.length === 0} className={`${fieldInput} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400`}>
                <option value="">{matches.length ? 'Select the item you bought' : 'Nothing to select yet'}</option>
                {matches.map((item) => <option key={item.id} value={item.id}>{item.itemCode} · {item.itemName} · {item.availableQuantity} {item.unitOfMeasure} available</option>)}
              </select>
            </label>
            <label className="block"><span className={fieldLabel}>Quantity received</span>
              <input type="number" min={1} max={line.financeQuantity} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} className={fieldInput} />
            </label>
            <label className="block"><span className={fieldLabel}>Receipt / invoice no.</span>
              <input value={reference} onChange={(event) => { setReference(event.target.value); setReferenceFromStock(false) }} maxLength={120} placeholder="Optional · e.g. OR-004512" className={fieldInput} />
            </label>
          </div>
          {referenceFromStock && <p className="mt-1.5 text-[0.65rem] text-slate-500">Filled in from the latest restock in Item Master Data. Change it if this delivery has a different receipt.</p>}
          {error && <div className="mt-3"><Banner tone="error">{error}</Banner></div>}
          <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-[0.68rem] leading-relaxed ${problem ? 'text-slate-500' : 'font-semibold text-emerald-700'}`}>{problem || `Saved with your account and the time. ${amount} ${chosen?.unitOfMeasure || ''} will be ready to issue.`}</p>
            <button type="button" disabled={Boolean(problem) || busy} onClick={() => void save()} className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Saving…' : 'Record delivery'}</button>
          </div>
        </div>
      </li>
    </ol>
  </section>
}

function IssuePanel({ request }: { request: ServiceRequest }) {
  const issueLines = linesOf(request).filter((line) => ISSUABLE_STATUSES.includes(line.routeStatus))
  const pending = issueLines.find((line) => line.routeStatus === 'HANDOVER_PENDING' && line.pendingBatchId)
  const employeeCode = formText(request.formData.requesterEmployeeCode)
  const href = pending?.pendingBatchId
    ? `/gso/main-issuance?batchId=${encodeURIComponent(pending.pendingBatchId)}`
    : employeeCode
      ? `/gso/main-issuance?employeeCode=${encodeURIComponent(employeeCode)}&purchaseRequisitionId=${encodeURIComponent(request.id)}`
      : ''

  return <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4" aria-label="Main Issuance handover">
    <p className="text-sm font-extrabold text-emerald-950">{issueLines.length} item(s) ready in Main Issuance</p>
    <p className="mt-1 text-xs leading-relaxed text-emerald-800">Open Main Issuance to complete the handover for this request.</p>
    {href ? <a href={href} className="mt-3 inline-flex rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-800">{pending ? 'Record pending handover' : 'Open Main Issuance'}</a>
      : <p className="mt-3 text-[0.65rem] font-semibold text-amber-800">No employee code is linked to this request, so Main Issuance cannot open it.</p>}
  </section>
}

function routedMessage(request: ServiceRequest) {
  const ready = countLines(request, ['READY_FOR_STAFF'])
  const toHead = countLines(request, ['WAITING_GSO_HEAD'])
  return `${request.referenceNo} routed. ${[ready && `${ready} item(s) moved to "Ready to issue"`, toHead && `${toHead} item(s) sent to the GSO Head`].filter(Boolean).join('; ')}.`
}

function ReviewPanel({ request, onSaved, onRefresh }: { request: ServiceRequest; onSaved: (message: string) => void; onRefresh: () => void }) {
  const checks = linesOf(request).flatMap((line) => line.routeStatus === 'WAITING_STAFF_REVIEW' && line.stockCheck ? [{ line, check: line.stockCheck }] : [])
  const [choices, setChoices] = useState<Record<string, StaffRoute>>({})
  // A choice that stock or a rule no longer allows falls back to the item's default route.
  const routeOf = (line: PurchaseRequisitionLine, check: PurchaseRequisitionStockCheck) => {
    const chosen = choices[line.id]
    return chosen && check.options.includes(chosen) ? chosen : check.route
  }
  const count = (route: StaffRoute) => checks.filter(({ line, check }) => routeOf(line, check) === route).length
  const toHead = count('HEAD_ISSUE') + count('PURCHASE')
  const choosable = checks.filter(({ check }) => staffDecides(check.options)).length
  const [mode, setMode] = useState<'route' | 'ask'>('route')
  const [note, setNote] = useState('')
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requester = formText(request.formData.requesterName) || request.requesterName

  async function submit(action: 'ROUTE' | 'NEEDS_INFORMATION') {
    setBusy(true)
    setError('')
    try {
      if (action === 'ROUTE') {
        const routes = Object.fromEntries(checks.map(({ line, check }) => [line.id, routeOf(line, check)]))
        const result = await staffReviewPurchaseRequisition(request.id, { action, routes, note: note.trim() })
        onSaved(routedMessage(result.request))
      } else {
        await staffReviewPurchaseRequisition(request.id, { action, note: question.trim() })
        onSaved(`${request.referenceNo}: question sent to ${requester}. It returns to "To check" when they reply.`)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save the stock check.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="mt-5 border-t border-slate-200 pt-5">
    <WorkflowStepHeader
      step={2}
      status="current"
      titleId={`stock-check-${request.id}`}
      title="Check stock"
      description={choosable > 0 ? 'Review available stock, then choose how each item should move.' : 'These items require the GSO Head’s decision.'}
    >
      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">{checks.length} item{checks.length === 1 ? '' : 's'}</span>
    </WorkflowStepHeader>
    <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:p-3">
      {checks.map(({ line, check }) => <StockCheckCard key={line.id} line={line} check={check} route={routeOf(line, check)} onChoose={(route) => setChoices((current) => ({ ...current, [line.id]: route }))} />)}
    </div>
    <section className="mt-5 border-t border-slate-200 pt-5" aria-label="Confirm routing">
      <WorkflowStepHeader
        step={3}
        status="upcoming"
        titleId={`route-confirmation-${request.id}`}
        title="Confirm route"
        description="Review where each item will go before saving the stock check."
      />
      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
      {mode === 'route' ? <>
        <div className="rounded-xl border border-blue-100 bg-white/80 p-3">
        <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-blue-700">Route summary</p>
        <ul className="mt-2 space-y-2">
          {(['ISSUE', 'HEAD_ISSUE', 'PURCHASE'] as StaffRoute[]).filter((route) => count(route) > 0).map((route) => <li key={route} className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <RoutePill route={route} />
            <span>{count(route)} item(s) {route === 'ISSUE' ? 'ready for Main Issuance' : route === 'HEAD_ISSUE' ? 'sent to the GSO Head' : 'sent for purchase approval'}</span>
          </li>)}
        </ul>
        </div>
        {toHead > 0 && <label className="mt-3 block">
          <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Note for the GSO Head <span className="font-bold normal-case text-slate-400">(optional)</span></span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} className="min-h-20 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-xs font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Context that helps the decision, such as a deadline or additional details." />
        </label>}
        {error && <div className="mt-3 space-y-2"><Banner tone="error">{error}</Banner><button type="button" onClick={onRefresh} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[0.65rem] font-extrabold text-rose-700 hover:bg-rose-50">Refresh stock check</button></div>}
        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" disabled={busy} onClick={() => { setMode('ask'); setError('') }} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-700 transition hover:border-amber-300 hover:text-amber-800 disabled:opacity-50">Ask requester for details</button>
          <button type="button" disabled={busy || checks.length === 0} onClick={() => void submit('ROUTE')} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Saving…' : toHead ? 'Confirm routing' : 'Reserve stock for issuance'}</button>
        </div>
      </> : <>
        <label className="block">
          <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Question for {requester}</span>
          <textarea autoFocus value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} required className="min-h-20 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-xs font-medium outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100" placeholder="What is missing? For example: the model, size, or the reason for the quantity." onKeyDown={(event) => { if (event.key === 'Escape') setMode('route') }} />
        </label>
        <p className="mt-1.5 text-[0.62rem] leading-relaxed text-slate-500">Nothing is reserved yet. The request goes back to the requester and returns here when they reply.</p>
        {error && <div className="mt-3"><Banner tone="error">{error}</Banner></div>}
        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={() => { setMode('route'); setError('') }} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Back</button>
          <button type="button" disabled={busy || !question.trim()} onClick={() => void submit('NEEDS_INFORMATION')} className="rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Sending…' : 'Send question'}</button>
        </div>
      </>}
      </div>
    </section>
  </section>
}

// Bought items already in Item Master Data, with the requests waiting for them: check the requests and link them all at once.
function ReadyToLinkPanel({ lines, loading, onLinked, onRefresh }: {
  lines: AwaitingDeliveryLine[]
  loading: boolean
  onLinked: (message: string) => void
  onRefresh: () => void
}) {
  return <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5" aria-label="Link deliveries to requests">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
      <div className="min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-wide text-blue-700">Bought items</p>
        <h2 className="mt-0.5 text-base font-black leading-tight text-slate-900">Link deliveries to requests</h2>
        <p className="mt-1 max-w-3xl text-sm leading-snug text-slate-600">These items are in Item Master Data and requests are waiting for them. Check the requests, add the receipt once, and record everything in one step.</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">{lines.length} item{lines.length === 1 ? '' : 's'}</span>
        <button type="button" onClick={onRefresh} disabled={loading} className="h-9 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-wait disabled:opacity-60">{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
    </div>
    <div className="mt-4">
      {loading && lines.length === 0 ? <p className="p-8 text-center text-xs font-semibold text-slate-400">Checking Item Master Data…</p>
        : lines.length === 0 ? <div className="space-y-3">
          <EmptyState title="Nothing is ready to link" detail="After you buy an item and add or restock it in Item Master Data, the requests waiting for it appear here." />
          <div className="flex justify-center">
            <button type="button" onClick={() => window.open('/gso/items', '_blank')} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-indigo-700">
              Open Item Master Data
              <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
            </button>
          </div>
        </div>
          : <DeliveryChecklist key={lines.map((line) => `${line.lineId}:${line.remainingQuantity}`).join('|')} lines={lines} onRefresh={onRefresh} onLinked={onLinked} />}
    </div>
  </section>
}

const linkedRequestId = new URLSearchParams(window.location.search).get('request') || ''

export default function GsoPurchaseRequisitions() {
  const params = new URLSearchParams(window.location.search)
  const urlTab = params.get('tab') as Tab | null
  const [chosenTab, setChosenTab] = useState<Tab | null>(urlTab && TAB_ORDER.includes(urlTab) ? urlTab : null)
  const [selectedId, setSelectedId] = useState(params.get('request') || '')
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [inventory, setInventory] = useState<InventoryItemRecord[]>([])
  const [refreshingInventory, setRefreshingInventory] = useState(false)
  const [awaiting, setAwaiting] = useState<AwaitingDeliveryLine[]>([])
  const [awaitingLoading, setAwaitingLoading] = useState(true)

  // State is set in promise callbacks, so the first load can start from an effect.
  const loadQueue = useCallback(() => listStaffPurchaseRequisitions()
    .then((rows) => {
      setRequests(rows)
      setError('')
      // A link to one request opens the first tab that request is in.
      const linked = rows.find((request) => request.id === linkedRequestId)
      if (linked) setChosenTab((current) => current ?? tabsFor(linked)[0])
    })
    .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load purchase requisitions.'))
    .finally(() => setLoading(false)), [setChosenTab])

  // Items GSO Staff can link a delivery to now: the purchase is with Finance and Item Master Data has stock for it.
  const loadAwaiting = useCallback(() => listAwaitingDeliveries()
    .then(setAwaiting)
    .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to check Item Master Data for deliveries.'))
    .finally(() => setAwaitingLoading(false)), [])

  useEffect(() => { void loadQueue() }, [loadQueue])
  useEffect(() => { void loadAwaiting() }, [loadAwaiting])
  useEffect(() => {
    listInventoryItems().then(setInventory).catch(() => setInventory([]))
  }, [])

  async function refreshInventory() {
    setRefreshingInventory(true)
    try {
      setInventory(await listInventoryItems())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to refresh inventory.')
    } finally {
      setRefreshingInventory(false)
    }
  }

  const counts = useMemo(() => {
    const totals: Record<Tab, number> = { review: 0, link: awaiting.length, issue: 0, waiting: 0 }
    for (const request of requests) for (const tab of tabsFor(request)) totals[tab] += 1
    return totals
  }, [requests, awaiting])
  // Open the first tab that needs action until the staff member picks one.
  const tab: Tab = chosenTab ?? TAB_ORDER.find((key) => counts[key] > 0) ?? 'review'
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return requests.filter((request) => tabsFor(request).includes(tab)
      && (!query || `${request.referenceNo} ${request.requesterName} ${formText(request.formData.departmentOrganization)} ${linesOf(request).map((line) => line.itemName).join(' ')}`.toLowerCase().includes(query)))
  }, [requests, search, tab])
  const selected = visible.find((request) => request.id === selectedId) || visible[0] || null
  const selectedTabs = selected ? tabsFor(selected) : []
  const selectedChip = selected ? chipFor(selected, tab) : null
  // Items still being checked render in the review panel; every other item renders as a status card.
  const otherLines = selected
    ? linesOf(selected).filter((line) => !(selectedTabs.includes('review') && line.routeStatus === 'WAITING_STAFF_REVIEW' && line.stockCheck))
    : []
  const deliveryVisible = Boolean(selected && deliveryOpen(selected) && linesOf(selected).some(canRecordDelivery))

  // Coming back from the Item Master Data tab shows the new or restocked item without a manual refresh.
  const watchesInventory = deliveryVisible || tab === 'link'
  useEffect(() => {
    if (!watchesInventory) return
    const reload = () => {
      listInventoryItems().then(setInventory).catch(() => undefined)
      listAwaitingDeliveries().then(setAwaiting).catch(() => undefined)
    }
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [watchesInventory])

  function chooseTab(next: Tab) {
    setChosenTab(next)
    setNotice('')
  }

  async function afterChange(message: string) {
    setNotice(message)
    await Promise.all([loadQueue(), refreshInventory(), loadAwaiting()])
  }

  async function undoDelivery(request: ServiceRequest, receiptId: string) {
    await undoPurchaseDelivery(request.id, receiptId)
    await afterChange(`Delivery undone for ${request.referenceNo}. The item is waiting for purchase again; link it when it is ready.`)
  }

  return <GsoPageFrame activePage="Purchase Requisitions" searchPlaceholder="Search reference, requester, item...">
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#092447] via-[#123c70] to-[#24558f] p-6 text-white shadow-xl shadow-blue-950/15 sm:p-8">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.3),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.16),transparent_36%)]" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GSO Staff checks first</span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Purchase Requisitions</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-blue-100">Check stock, then route each item.</p>
            <nav className="mt-5 flex flex-wrap gap-2 border-t border-blue-300/20 pt-4" aria-label="Purchase requisition shortcuts">
              <button type="button" aria-pressed={tab === 'review'} onClick={() => chooseTab('review')} className={`rounded-xl border px-4 py-2 text-xs font-extrabold transition ${tab === 'review' ? 'border-white bg-white text-blue-950 shadow-md' : 'border-white/15 bg-white/5 text-blue-100 hover:bg-white/12'}`}>To check</button>
              <button type="button" aria-pressed={tab === 'waiting'} onClick={() => chooseTab('waiting')} className={`rounded-xl border px-4 py-2 text-xs font-extrabold transition ${tab === 'waiting' ? 'border-white bg-white text-blue-950 shadow-md' : 'border-white/15 bg-white/5 text-blue-100 hover:bg-white/12'}`}>With GSO Head</button>
            </nav>
          </div>
        </section>

        <section className="space-y-3" aria-label="Requisition stages">
          <QueueStageSelector active={tab} counts={counts} onChange={chooseTab} />
          <p className="min-h-5 text-[0.68rem] leading-relaxed text-slate-500">{TABS[tab].hint}</p>
          {error && <Banner tone="error">{error}</Banner>}
          {notice && <Banner tone="success">{notice}</Banner>}
        </section>

        {tab === 'link' && <ReadyToLinkPanel lines={awaiting} loading={awaitingLoading} onLinked={(message) => void afterChange(message)} onRefresh={() => { setAwaitingLoading(true); void loadAwaiting() }} />}

        {tab !== 'link' && <section className="grid gap-5 xl:grid-cols-2" aria-label="Purchase requisition workflow">
          <section className="flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="p-4 sm:p-5">
              <WorkflowStepHeader
                step={1}
                status={selected ? 'done' : 'current'}
                titleId="requisition-queue-title"
                title="Choose a requisition"
                description="Select a request, then check the available stock and route each item."
              >
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">{visible.length} request{visible.length === 1 ? '' : 's'}</span>
              </WorkflowStepHeader>
              <div className="mt-4 flex w-full gap-2">
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, requester, or item" aria-label="Search requisitions" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                <button type="button" onClick={() => { setLoading(true); void loadQueue() }} disabled={loading} className="h-11 shrink-0 rounded-xl border border-slate-300 bg-white px-4 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-wait disabled:opacity-60">{loading ? 'Loading…' : 'Refresh'}</button>
              </div>
              <div className="inventory-list-scrollbar mt-3 max-h-[58vh] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                {loading && requests.length === 0 ? <p className="p-8 text-center text-xs font-semibold text-slate-400">Loading requisitions…</p>
                  : visible.length === 0 ? <p className="p-8 text-center text-xs font-semibold text-slate-500">{search ? 'No requests match your search.' : TABS[tab].empty}</p>
                    : visible.map((request) => {
                      const chip = chipFor(request, tab)
                      const isSelected = selected?.id === request.id
                      return <button key={request.id} type="button" onClick={() => { setSelectedId(request.id); setNotice('') }} aria-current={isSelected ? 'true' : undefined} className={`block w-full rounded-xl border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${isSelected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'}`}>
                        <span className="flex items-center justify-between gap-2"><span className="text-sm font-extrabold text-slate-900">{request.referenceNo}</span><span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${chip.tone}`}>{chip.label}</span></span>
                        <span className="mt-1.5 block truncate text-xs font-semibold text-slate-700">{formText(request.formData.requesterName) || request.requesterName} · {formText(request.formData.departmentOrganization) || request.requesterEmail}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{linesOf(request).map((line) => `${line.itemName} × ${line.requestedQuantity}`).join(', ')}</span>
                        <span className="mt-2 flex items-center gap-2 text-[0.68rem] text-slate-500">Needed {formText(request.formData.requiredDate) ? formatDate(String(request.formData.requiredDate)) : 'date not set'}{request.formData.urgency === 'Urgent' && <span className="rounded-md bg-rose-50 px-1.5 py-0.5 font-extrabold text-rose-700">Urgent</span>}</span>
                      </button>
                    })}
              </div>
            </div>

          </section>

          <section className="flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-wide text-blue-700">Request review</p><h2 className="mt-0.5 text-base font-black leading-tight text-slate-900">Request details</h2><p className="mt-1 text-sm leading-snug text-slate-600">Review the requester and item information below.</p></div>
                <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">{TABS[tab].label}</span>
              </div>
              {!selected || !selectedChip ? <EmptyState title={TABS[tab].empty} detail="New requisitions from department heads appear in “To check”." /> : <>
                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5"><RequestSummary request={selected} statusLabel={selectedChip.label} statusTone={selectedChip.tone} /></div>

                {selectedTabs.includes('review') && (selected.formData.responseMessages?.length ?? 0) > 0 && <div className="mt-3"><Banner tone="info"><span className="font-extrabold">Requester replied: </span>{selected.formData.responseMessages?.at(-1)?.message}</Banner></div>}
                {selected.staffReviewedAt && !selectedTabs.includes('review') && <p className="mt-3 text-[0.62rem] font-semibold text-slate-500">Checked by {selected.staffReviewedBy || 'GSO Staff'} on {formatDateTime(selected.staffReviewedAt)}{selected.staffReviewNote ? ` · Note: ${selected.staffReviewNote}` : ''}</p>}

                {selectedTabs.includes('review') && <ReviewPanel key={selected.id} request={selected} onSaved={(message) => void afterChange(message)} onRefresh={() => { setLoading(true); void loadQueue() }} />}

                {otherLines.length > 0 && <>
                  <div className="mt-4 flex items-end justify-between gap-2"><h4 className="text-xs font-extrabold text-slate-800">{selectedTabs.includes('review') ? 'Other items in this request' : 'Requested items'}</h4><span className="text-[0.62rem] font-semibold text-slate-400">Each item follows its own route</span></div>
                  <div className="mt-2 space-y-2">
                    {otherLines.map((line) => <LineCard key={line.id} line={line} onUndo={(receiptId) => undoDelivery(selected, receiptId)}>
                      {deliveryOpen(selected) && canRecordDelivery(line) && <DeliveryForm request={selected} line={line} inventory={inventory} refreshing={refreshingInventory} similarOffer={awaiting.find((entry) => entry.lineId === line.id && entry.candidates.every((candidate) => candidate.match === 'SIMILAR'))} onRefreshInventory={() => void refreshInventory()} onOpenLinkTab={() => chooseTab('link')} onReceived={(message) => void afterChange(message)} />}
                    </LineCard>)}
                  </div>
                </>}

                {selectedTabs.includes('issue') && <IssuePanel request={selected} />}
                {selectedTabs.includes('waiting') && !(deliveryOpen(selected) && linesOf(selected).some(canRecordDelivery)) && <div className="mt-4"><Banner tone={selected.status === 'Rejected' ? 'warning' : 'info'}>{waitingOn(selected).detail}</Banner></div>}

                <HistoryList request={selected} />
              </>}
          </section>
        </section>}
      </div>
  </GsoPageFrame>
}
