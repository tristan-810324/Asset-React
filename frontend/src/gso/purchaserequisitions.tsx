import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import type { PurchaseRequisitionLine, PurchaseRequisitionStockCheck, ServiceRequest } from '../requesters/requesterApi'
import { formatDate, formatDateTime } from '../requesters/requesterrequestutils'
import { listInventoryItems, type InventoryItemRecord } from './inventoryApi'
import { RequisitionIssuanceShortcuts } from './requisitionIssuanceShortcuts'
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
  canRecordDelivery,
  categoryLabel,
  countIssuableLines,
  countLines,
  deliveryOpen,
  formText,
  inventoryCategoryMatches,
  inventoryMatchesLine,
  linesOf,
} from './requisitionFlow'
import { Banner, DeliveryRecords, EmptyState, LineStatusBadge, QuantityChips, RequestSummary, fieldInput, fieldLabel } from './requisitionParts'

type Tab = 'review' | 'waiting'
type StepStatus = 'current' | 'upcoming' | 'done'

const TABS: Record<Tab, { label: string; hint: string; empty: string; unit: string }> = {
  review: { label: 'To check', hint: 'New requests. Check each item, then confirm its route.', empty: 'No new requests to check.', unit: 'request' },
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
  return <div className="grid grid-cols-2 gap-2 lg:grid-cols-2" role="group" aria-label="Filter requisition queue">
    {TAB_ORDER.map((key) => {
      const selected = key === active
      return <button key={key} type="button" aria-pressed={selected} onClick={() => onChange(key)} className={`rounded-xl border-2 p-3 text-left shadow-md transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${selected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-300/80 bg-white shadow-slate-300/35 ring-1 ring-slate-900/5 hover:border-blue-300 hover:bg-blue-50/40'}`}>
        <span className={`block text-xs font-extrabold ${selected ? 'text-blue-800' : 'text-slate-900'}`}>{TABS[key].label}</span>
        <span className={`mt-1 block text-[0.68rem] font-semibold ${selected ? 'text-blue-700' : 'text-slate-500'}`}>{counts[key]} {TABS[key].unit}{counts[key] === 1 ? '' : 's'}</span>
      </button>
    })}
  </div>
}

function tabsFor(request: ServiceRequest): Tab[] {
  const tabs: Tab[] = []
  if (request.status === 'Submitted' && countLines(request, ['WAITING_STAFF_REVIEW'])) tabs.push('review')
  if (deliveryOpen(request) && linesOf(request).some(canRecordDelivery)) tabs.push('waiting')
  const hasWaitingLine = linesOf(request).some((line) => ['WAITING_GSO_HEAD', 'WAITING_FINANCE', 'WAITING_FOR_PURCHASE', 'PARTIAL_STOCK', 'NEEDS_INFORMATION'].includes(line.routeStatus))
  // Once GSO has prepared every individually tracked item, the requisition leaves this
  // checking workspace. Its pickup status and barcode labels live in Main Issuance.
  if (!tabs.length && !['Completed', 'Rejected', 'Ready for Pickup', 'Issued'].includes(request.status)
    && (hasWaitingLine || countIssuableLines(request) === 0)) tabs.push('waiting')
  return tabs
}

// Who has the request now, in words a staff member can act on.
function waitingOn(request: ServiceRequest) {
  if (request.status === 'Under Review') return { label: 'With GSO Head', tone: 'bg-amber-50 text-amber-800', detail: `The GSO Head is deciding ${countLines(request, ['WAITING_GSO_HEAD'])} item line(s). Items already in stock can be issued now.` }
  if (request.status === 'Needs Information') return { label: 'With requester', tone: 'bg-amber-50 text-amber-800', detail: 'Waiting for the requester to answer. Their reply brings the request back to "To check".' }
  if (request.status === 'GSO Endorsed') return { label: 'Ready for handoff', tone: 'bg-indigo-50 text-indigo-700', detail: 'The signed PDF is ready in Procurement. Download or print it and give it to Finance before buying the shortage quantities.' }
  if (request.status === 'Sent to Finance') return { label: 'To buy', tone: 'bg-indigo-50 text-indigo-700', detail: `GSO Staff handed the signed requisition to Finance${request.financeSentAt ? ` on ${formatDate(request.financeSentAt)}` : ''}. Stocked items remain reserved; do not issue anything until every requested line is complete.` }
  if (FINANCE_STATUSES.includes(request.status)) return { label: 'Purchase approved', tone: 'bg-indigo-50 text-indigo-700', detail: 'The complete request is approved. Print the signed PDF and hand it to Finance before buying the shortage quantities.' }
  if (request.status === 'Completed') return { label: 'Completed', tone: 'bg-slate-100 text-slate-600', detail: 'Every approved item was issued.' }
  if (request.status === 'Rejected') return { label: 'Declined', tone: 'bg-rose-50 text-rose-700', detail: 'GSO declined the entire request. Nothing is issued.' }
  return { label: request.status, tone: 'bg-slate-100 text-slate-600', detail: 'Waiting for the next update.' }
}

function chipFor(request: ServiceRequest, tab: Tab) {
  if (tab === 'review') return { label: `${countLines(request, ['WAITING_STAFF_REVIEW'])} to check`, tone: 'bg-blue-50 text-blue-700' }
  if (deliveryOpen(request) && linesOf(request).some(canRecordDelivery)) return { label: 'Awaiting delivery', tone: 'bg-indigo-50 text-indigo-700' }
  return waitingOn(request)
}

// The requester's specs next to the units in storage. GSO Staff tick the units that match, by hand.
function StockCheckCard({ line, check, selected, covered, onToggle, rejected }: {
  line: PurchaseRequisitionLine
  check: PurchaseRequisitionStockCheck
  selected: string[]
  covered: number
  onToggle: (itemId: string) => void
  rejected: boolean
}) {
  const short = Math.max(line.requestedQuantity - covered, 0)
  // Once the ticked units cover the requested quantity, no other unit can be ticked (the server would ignore it anyway).
  const full = covered >= line.requestedQuantity
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const visible = needle
    ? check.matches.filter((unit) => [unit.itemCode, unit.name, unit.description, unit.storageLocation ?? ''].some((text) => String(text).toLowerCase().includes(needle)))
    : check.matches
  return <article className="rounded-xl border border-slate-200 bg-white p-3.5 transition-shadow hover:shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-slate-900">{line.itemName} <span className="font-bold text-slate-500">× {line.requestedQuantity}</span></p>
        <p className="mt-0.5 text-xs font-medium text-slate-500">{categoryLabel(line.category)}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${rejected ? 'bg-rose-50 text-rose-700' : short === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{rejected ? 'Rejected' : short === 0 ? `${covered} matched` : `${covered} matched · ${short} to purchase`}</span>
    </div>
    <div className="mt-3 rounded-xl border-2 border-blue-400 bg-blue-50 px-4 py-3 shadow-sm">
      <p className="text-[0.7rem] font-extrabold uppercase tracking-wide text-blue-800">Specs the requester needs</p>
      <p className="mt-1 whitespace-pre-wrap text-base font-black leading-snug text-slate-900">{line.specifications || 'No specs written by the requester.'}</p>
    </div>
    <p className="mt-3 text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Units in storage · tick the ones that match</p>
    {full && <p className="mt-1 text-[0.68rem] font-semibold text-amber-800">Enough units are ticked for the {line.requestedQuantity} requested. Untick one to choose another.</p>}
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, name, specs, or location" aria-label="Search units in storage" className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-800 outline-none placeholder:text-slate-400" />
    </div>
    {/* About three units show at once; scroll for the rest. */}
    <div className={`mt-2 max-h-80 overflow-y-auto pr-1 ${rejected ? 'pointer-events-none opacity-40' : ''}`}>
    {visible.length === 0
      ? <p className="mt-1.5 text-[0.68rem] text-slate-500">{check.matches.length === 0 ? 'No units in storage for this category.' : 'No units match your search.'}</p>
      : <ul className="space-y-1.5">
        {visible.map((unit) => {
          const on = selected.includes(unit.itemId)
          return <li key={unit.itemId}>
            <label className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 ${on ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'} ${!on && full ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={on} disabled={!on && full} onChange={() => onToggle(unit.itemId)} className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-xs font-black text-slate-900">{unit.itemCode}</span>
                  <span className="text-xs font-semibold text-slate-600">{unit.name}</span>
                </span>
                <span className="mt-1 block rounded-md bg-white px-2 py-1 text-[0.7rem] font-semibold leading-relaxed text-slate-800 ring-1 ring-slate-200">{unit.description || 'No specs entered'}</span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {unit.condition && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700">Condition: {unit.condition}</span>}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-bold text-slate-600">{unit.availableQuantity} {unit.unitOfMeasure} available</span>
                  {unit.storageLocation && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[0.6rem] font-bold text-blue-700">{unit.storageLocation}</span>}
                  {unit.dateAcquired && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-bold text-slate-600">Acquired {new Date(unit.dateAcquired).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</span>}
                  {(unit.unitCost ?? 0) > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-bold text-slate-600">{(unit.unitCost ?? 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</span>}
                </span>
              </span>
            </label>
          </li>
        })}
      </ul>}
    </div>
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
    {line.reviewNote && ['REJECTED', 'NEEDS_INFORMATION'].includes(line.routeStatus) && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[0.65rem] leading-relaxed text-slate-700"><span className="font-extrabold">{line.routeStatus === 'REJECTED' ? 'Reason: ' : 'Question: '}</span>{line.reviewNote}</p>}
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

// After GSO Staff hands the signed purchase form to Finance and buys the item: put it in Item Master Data,
// then record what arrived on this requisition item so it can be issued.
function DeliveryForm({ request, line, inventory, refreshing, similarOffer, onRefreshInventory, onReceived }: {
  request: ServiceRequest
  line: PurchaseRequisitionLine
  inventory: InventoryItemRecord[]
  refreshing: boolean
  similarOffer?: AwaitingDeliveryLine
  onRefreshInventory: () => void
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
      const remainingAfterReceipt = line.financeQuantity - amount
      const otherShortages = linesOf(request).some((entry) => entry.id !== line.id && entry.financeQuantity > 0)
      onReceived(remainingAfterReceipt > 0 || otherShortages
        ? `${amount} ${chosen?.unitOfMeasure || ''} ${line.itemName} recorded for ${request.referenceNo}. The remaining shortages must arrive before GSO can issue any item in this request.`
        : `${amount} ${chosen?.unitOfMeasure || ''} ${line.itemName} recorded for ${request.referenceNo}. Every requested item is now available; the complete request is ready in Main Issuance.`)
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
          <p className="mt-1 text-xs leading-relaxed text-slate-600">Already listed? <span className="font-bold text-slate-800">Restock</span> it with the quantity you bought. New item? <span className="font-bold text-slate-800">Add</span> it using the exact name <span className="font-extrabold text-slate-900">“{line.itemName}”</span> under <span className="font-bold text-slate-800">{categoryName}</span>. An exact match is reserved automatically; confirm a manual link only when the name is similar.</p>
          <p className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[0.68rem] leading-relaxed text-indigo-900"><span className="font-extrabold">Choose tracking mode:</span> use <span className="font-bold">Individual Asset</span> when every item needs its own barcode and record. Use <span className="font-bold">Quantity Stock</span> when matching items share one stock count.</p>
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
          {matches.length === 0 && similarOffer && <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">Item Master Data has a similar item, <span className="font-extrabold">{similarOffer.candidates[0]?.name}</span>. Check the item details and refresh the selector above after confirming the correct stock record.</p>}
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
            <p className={`text-[0.68rem] leading-relaxed ${problem ? 'text-slate-500' : 'font-semibold text-emerald-700'}`}>{problem || `Saved with your account and the time. This delivery remains reserved until the full request is available.`}</p>
            <button type="button" disabled={Boolean(problem) || busy} onClick={() => void save()} className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Saving…' : 'Record delivery'}</button>
          </div>
        </div>
      </li>
    </ol>
  </section>
}

function routedMessage(request: ServiceRequest) {
  if (request.status === 'Rejected') return `${request.referenceNo} rejected. The requester has been told the reason.`
  const toHead = countLines(request, ['WAITING_GSO_HEAD'])
  const reservedNow = countLines(request, ['READY_FOR_STAFF'])
  const issued = reservedNow ? ` ${reservedNow} item line(s) reserved for ${request.requesterName}. Issue them in Main Issuance.` : ''
  return `${request.referenceNo} routed.${issued} ${toHead ? `${toHead} item line(s) are with the GSO Head as one package.` : 'Nothing is with the GSO Head.'}`
}

function ReviewPanel({ request, onSaved, onRefresh }: { request: ServiceRequest; onSaved: (message: string) => void; onRefresh: () => void }) {
  const checks = linesOf(request).flatMap((line) => line.routeStatus === 'WAITING_STAFF_REVIEW' && line.stockCheck ? [{ line, check: line.stockCheck }] : [])
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  // Consumable lines GSO Staff chose to issue now from storage.
  const [issueNow, setIssueNow] = useState<Record<string, boolean>>({})
  // Consumable lines GSO Staff reject, and the one reason the requester sees for all of them.
  const [rejected, setRejected] = useState<Record<string, boolean>>({})
  const [rejectReason, setRejectReason] = useState('')
  const [mode, setMode] = useState<'route' | 'ask'>('route')
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requester = formText(request.formData.requesterName) || request.requesterName

  // Units GSO Staff ticked for a line, counted up to the requested quantity.
  const coveredOf = (line: PurchaseRequisitionLine, check: PurchaseRequisitionStockCheck) => {
    let covered = 0
    for (const itemId of picked[line.id] || []) {
      const unit = check.matches.find((entry) => entry.itemId === itemId)
      covered += Math.min(unit?.availableQuantity ?? 0, line.requestedQuantity - covered)
    }
    return covered
  }
  const toggle = (lineId: string, itemId: string) => setPicked((current) => {
    const list = current[lineId] || []
    return { ...current, [lineId]: list.includes(itemId) ? list.filter((id) => id !== itemId) : [...list, itemId] }
  })
  const requestRows = (Array.isArray(request.formData.items) ? request.formData.items : []) as Array<Record<string, unknown>>
  const requestedRow = (line: PurchaseRequisitionLine) => requestRows[line.lineNumber - 1] || {}
  // A consumable can be issued now when some of it is in stock and the item allows staff issue. The rest is not issued.
  // A per-unit item can be issued now only when all of it is in stock and its policy lets GSO Staff decide. Otherwise the GSO Head decides.
  const canIssueNow = (line: PurchaseRequisitionLine, check: PurchaseRequisitionStockCheck) => requestedRow(line).itemKind === 'CONSUMABLE'
    ? Boolean(check.issueAllowed) && coveredOf(line, check) > 0
    : Boolean(check.issueAllowed) && coveredOf(line, check) >= line.requestedQuantity
  const issueNowLineIds = checks
    .filter(({ line, check }) => issueNow[line.id] && canIssueNow(line, check))
    .map(({ line }) => line.id)
  const allIssueNow = checks.length > 0 && issueNowLineIds.length === checks.length
  // Issue now lines with only part of the request in stock. The rest is declined when the route is confirmed.
  const partialLines = checks.filter(({ line, check }) => issueNowLineIds.includes(line.id) && coveredOf(line, check) < line.requestedQuantity)
  const partialNote = partialLines.length ? ` ${partialLines.length} item(s) only partly in stock: only the units in stock are issued, and the rest is not issued.` : ''
  // Consumables get the Issue now and Reject choices in step 3. A per-unit item always goes to the GSO Head.
  const isConsumable = (line: PurchaseRequisitionLine) => requestedRow(line).itemKind === 'CONSUMABLE'
  const consumableChecks = checks
    .filter(({ line }) => isConsumable(line))
    .map(({ line, check }) => ({ line, check, unit: String(requestedRow(line).unitOfMeasure || '') }))
  const perUnitChecks = checks.filter(({ line }) => requestedRow(line).itemKind === 'PER_UNIT')
  const rejectLineIds = checks
    .filter(({ line }) => rejected[line.id] && isConsumable(line))
    .map(({ line }) => line.id)
  // Issue now takes the in-stock consumables out of the Head's package. Any other consumable not issued is rejected here.
  const autoRejected = issueNowLineIds.length > 0
    ? checks.filter(({ line }) => isConsumable(line) && !issueNowLineIds.includes(line.id) && !rejectLineIds.includes(line.id))
    : []
  const autoRejectLineIds = autoRejected.map(({ line }) => line.id)
  // Every line that leaves the request now: explicit rejects plus the automatic ones.
  const dropLineIds = [...rejectLineIds, ...autoRejectLineIds]
  const autoNote = autoRejected.length ? 'Sorry, we cannot issue this item because it is out of stock. You may request it again so it can be purchased.' : ''
  const routeNote = [rejectLineIds.length ? rejectReason.trim() : '', autoNote].filter(Boolean).join(' ')
  const unmatchedTotal = checks.reduce((total, { line, check }) => total + (dropLineIds.includes(line.id) ? 0 : Math.max(line.requestedQuantity - coveredOf(line, check), 0)), 0)
  // Lines still going to the GSO Head. The rest are issued now or rejected.
  const headLines = checks.length - issueNowLineIds.length - dropLineIds.length
  const rejectOnly = dropLineIds.length > 0 && headLines === 0 && issueNowLineIds.length === 0
  // Issue now and reject are mutually exclusive for a line.
  const chooseIssueNow = (lineId: string) => {
    setIssueNow((current) => ({ ...current, [lineId]: !current[lineId] }))
    setRejected((current) => ({ ...current, [lineId]: false }))
  }
  const chooseReject = (lineId: string) => {
    setRejected((current) => ({ ...current, [lineId]: !current[lineId] }))
    setIssueNow((current) => ({ ...current, [lineId]: false }))
  }

  async function submit(action: 'ROUTE' | 'NEEDS_INFORMATION') {
    setBusy(true)
    setError('')
    try {
      if (action === 'ROUTE') {
        // A ticked unit that is no longer in storage (issued or reserved elsewhere since the page loaded) is not sent.
        // It already counts as not matched on screen, so it goes to purchase instead of failing the whole route.
        const selectedUnits = Object.fromEntries(checks.map(({ line, check }) => [
          line.id,
          (picked[line.id] || []).filter((itemId) => check.matches.some((unit) => unit.itemId === itemId)),
        ]))
        const result = await staffReviewPurchaseRequisition(request.id, { action, selectedUnits, issueNowLineIds, rejectLineIds: dropLineIds, note: dropLineIds.length ? routeNote : undefined })
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
      description="Compare the requester's specs with the units in storage. Tick every unit that matches. Anything not ticked is bought."
    >
      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">{checks.length} item{checks.length === 1 ? '' : 's'}</span>
    </WorkflowStepHeader>
    <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:p-3">
      {checks.map(({ line, check }) => <StockCheckCard key={line.id} line={line} check={check} selected={picked[line.id] || []} covered={coveredOf(line, check)} onToggle={(itemId) => toggle(line.id, itemId)} rejected={Boolean(rejected[line.id])} />)}
    </div>
    <section className="mt-5 border-t border-slate-200 pt-5" aria-label="Confirm routing">
      <WorkflowStepHeader
        step={3}
        status="upcoming"
        titleId={`route-confirmation-${request.id}`}
        title="Confirm route"
        description={checks.length > 0 && headLines === 0 ? 'Nothing goes to the GSO Head. The choices above take effect now.' : dropLineIds.length > 0 || issueNowLineIds.length > 0 ? 'The rest of the request goes to the GSO Head as one package.' : 'The whole request goes to the GSO Head as one package.'}
      />
      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
      {mode === 'route' ? <>
        {perUnitChecks.length > 0 && <div className="mb-3 rounded-xl border border-blue-100 bg-white/80 p-3">
          <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-blue-700">Per-unit items</p>
          <ul className="mt-2 divide-y divide-slate-100">
            {perUnitChecks.map(({ line, check }) => <li key={line.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-slate-900">{line.itemName} <span className="font-bold text-slate-500">× {line.requestedQuantity}</span></p>
                {issueNow[line.id] && <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[0.65rem] font-semibold text-amber-900 ring-1 ring-amber-300">Yellow warning: this is recorded in the GSO audit logs as reserved without GSO Head approval.</p>}
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                {canIssueNow(line, check) ? <>
                  <button type="button" aria-pressed={Boolean(issueNow[line.id])} onClick={() => { if (!issueNow[line.id]) chooseIssueNow(line.id) }} className={`rounded-lg px-3 py-2 text-xs font-extrabold transition ${issueNow[line.id] ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20' : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>Issue now</button>
                  <button type="button" aria-pressed={!issueNow[line.id]} onClick={() => { if (issueNow[line.id]) chooseIssueNow(line.id) }} className={`rounded-lg px-3 py-2 text-xs font-extrabold transition ${issueNow[line.id] ? 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50' : 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'}`}>Ask GSO Head first</button>
                </> : coveredOf(line, check) < line.requestedQuantity ? <span className="text-amber-800">{coveredOf(line, check)} of {line.requestedQuantity} in stock · GSO Head approves</span> : <span className="text-slate-600">Needs GSO Head approval (item policy)</span>}
              </div>
            </li>)}
          </ul>
        </div>}
        {consumableChecks.length > 0 && <div className="mb-3 rounded-xl border border-blue-100 bg-white/80 p-3">
          <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-blue-700">Consumables</p>
          <ul className="mt-2 divide-y divide-slate-100">
            {consumableChecks.map(({ line, check, unit }) => <li key={line.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 first:pt-0 last:pb-0">
              <p className="min-w-0 text-xs font-extrabold text-slate-900">{line.itemName} <span className="font-bold text-slate-500">× {line.requestedQuantity}{unit ? ` ${unit}` : ''}</span></p>
              <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
                {autoRejectLineIds.includes(line.id) ? <span className="text-rose-700">Not issued · rejected automatically</span> : <>
                  {coveredOf(line, check) > 0 && coveredOf(line, check) < line.requestedQuantity && <span className="text-amber-800">{coveredOf(line, check)} of {line.requestedQuantity} in stock{issueNow[line.id] ? ' · the rest is not issued' : ''}</span>}
                  {canIssueNow(line, check) && <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={Boolean(issueNow[line.id])} onChange={() => chooseIssueNow(line.id)} className="h-4 w-4 accent-emerald-600" />Issue now</label>}
                  <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={Boolean(rejected[line.id])} onChange={() => chooseReject(line.id)} className="h-4 w-4 accent-rose-600" />Reject</label>
                </>}
              </div>
            </li>)}
          </ul>
        </div>}
        <div className="rounded-xl border border-blue-100 bg-white/80 p-3">
          <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-blue-700">Route summary</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-700">{allIssueNow && partialLines.length === 0
            ? 'Every item is in stock and reserved now. GSO Staff issue them in Main Issuance; the GSO Head is not needed.'
            : headLines === 0 && issueNowLineIds.length > 0
            ? `${issueNowLineIds.length} item(s) reserved for ${requester} now, so nothing waits for the GSO Head. Issue them in Main Issuance.${partialNote}${dropLineIds.length ? ` ${dropLineIds.length} item(s) not issued ${dropLineIds.length === 1 ? 'is' : 'are'} rejected; ${requester} sees the reason and can ask for them to be purchased or submit a new request.` : ''}`
            : headLines === 0 && rejectLineIds.length > 0
            ? `${rejectLineIds.length} item(s) rejected. Nothing is reserved for them, and ${requester} is told the reason.`
            : dropLineIds.length > 0
              ? `${dropLineIds.length} item(s) rejected and not bought. ${requester} is told the reason.${unmatchedTotal === 0 ? ' Every other unit is matched.' : ` ${unmatchedTotal} unit(s) are not matched and go to purchase.`}${issueNowLineIds.length > 0 ? ' The in-stock items are reserved now.' : ''}${partialNote} The GSO Head approves the rest as one package.`
            : issueNowLineIds.length > 0
              ? `In-stock items are reserved for ${requester} now, without waiting for the GSO Head. Issue them in Main Issuance. The rest goes to the GSO Head as one package.${partialNote}`
              : unmatchedTotal === 0
                ? 'Every requested unit is matched. The GSO Head approves, then the request is ready to issue.'
                : `${unmatchedTotal} unit(s) are not matched. They go to purchase, and the GSO Head approves the complete request.`}</p>
        </div>
        {rejectLineIds.length > 0 && <label className="mt-3 block">
          <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Reason for rejecting (required) · {requester} sees this</span>
          <textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} maxLength={2000} placeholder="e.g. Not needed this school year." className="min-h-20 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-xs font-medium outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100" />
        </label>}
        {error && <div className="mt-3 space-y-2"><Banner tone="error">{error}</Banner><button type="button" onClick={onRefresh} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[0.65rem] font-extrabold text-rose-700 hover:bg-rose-50">Refresh</button></div>}
        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" disabled={busy} onClick={() => { setMode('ask'); setError('') }} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Ask requester first</button>
          <button type="button" disabled={busy || checks.length === 0 || (rejectLineIds.length > 0 && !rejectReason.trim())} onClick={() => void submit('ROUTE')} className={`rounded-xl px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${rejectOnly ? 'bg-rose-600 shadow-rose-600/20 hover:bg-rose-700' : 'bg-blue-600 shadow-blue-600/20 hover:bg-blue-700'}`}>{busy ? 'Saving…' : checks.length === 0 || headLines > 0 ? 'Send to GSO Head' : issueNowLineIds.length > 0 ? 'Issue now' : 'Reject'}</button>
        </div>
      </> : <>
        <label className="block">
          <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Question for {requester}</span>
          <textarea autoFocus value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} required className="min-h-20 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-xs font-medium outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" />
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

/* Legacy bulk delivery panel removed from the visible requisition workflow.
// Bought items already in Item Master Data, with the requests waiting for them: check the requests and link them all at once.
function ReadyToLinkPanel({ lines, loading, onLinked, onRefresh }: {
  lines: AwaitingDeliveryLine[]
  loading: boolean
  onLinked: (message: string) => void
  onRefresh: () => void
}) {
  return <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-label="Link deliveries to requests">
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
*/

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

  // Find possible matching stock for delivery records shown inside the request details.
  const loadAwaiting = useCallback(
    () => listAwaitingDeliveries()
      .then(setAwaiting)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to check Item Master Data for deliveries.')),
    [],
  )

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
    const totals: Record<Tab, number> = { review: 0, waiting: 0 }
    for (const request of requests) for (const tab of tabsFor(request)) totals[tab] += 1
    return totals
  }, [requests])
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

  // Coming back from Item Master Data refreshes the request stage; a matching purchase delivery may
  // have just moved the complete request to Main Issuance.
  const watchesInventory = deliveryVisible
  useEffect(() => {
    const reload = () => {
      void loadQueue()
      if (watchesInventory) {
        listInventoryItems().then(setInventory).catch(() => undefined)
        listAwaitingDeliveries().then(setAwaiting).catch(() => undefined)
      }
    }
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [loadQueue, watchesInventory])

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
    await afterChange(`Delivery undone for ${request.referenceNo}. The item is waiting for purchase again; record it here when it is ready.`)
  }

  return <GsoPageFrame activePage="Purchase Requisitions" searchPlaceholder="Search reference, requester, item...">
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" /><div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border-18 border-white/4" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-[40%] h-64 w-64 rounded-full border-22 border-white/3" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GSO Staff checks first</span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Purchase Requisitions</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-blue-100">Check stock, then route each item.</p>
            <RequisitionIssuanceShortcuts active="requisitions" />
          </div>
        </section>

        <section className="space-y-3" aria-label="Requisition stages">
          <QueueStageSelector active={tab} counts={counts} onChange={chooseTab} />
          <p className="min-h-5 text-[0.68rem] leading-relaxed text-slate-500">{TABS[tab].hint}</p>
          {error && <Banner tone="error">{error}</Banner>}
          {notice && <Banner tone="success">{notice}</Banner>}
        </section>

        <section className="grid gap-5 xl:grid-cols-2" aria-label="Purchase requisition workflow">
          <section className="flex min-w-0 flex-col rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
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

          <section className="flex min-w-0 flex-col rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
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
                      {deliveryOpen(selected) && canRecordDelivery(line) && <DeliveryForm request={selected} line={line} inventory={inventory} refreshing={refreshingInventory} similarOffer={awaiting.find((entry) => entry.lineId === line.id && entry.candidates.every((candidate) => candidate.match === 'SIMILAR'))} onRefreshInventory={() => void refreshInventory()} onReceived={(message) => void afterChange(message)} />}
                    </LineCard>)}
                  </div>
                </>}


              </>}
          </section>
        </section>
      </div>
  </GsoPageFrame>
}
