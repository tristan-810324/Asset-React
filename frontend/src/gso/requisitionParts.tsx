import { useState, type ReactNode } from 'react'
import type { ServiceRequest, PurchaseRequisitionLine, PurchaseRequisitionReceipt, StaffRoute } from '../requesters/requesterApi'
import { formatDate, formatDateTime } from '../requesters/requesterrequestutils'
import { LINE_STATUS, ROUTES, formText, linesOf } from './requisitionFlow'

export const fieldLabel = 'mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600'
export const fieldInput = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'

const routeOrder: StaffRoute[] = ['ISSUE', 'HEAD_ISSUE', 'PURCHASE']

export function RoutePill({ route }: { route: StaffRoute }) {
  const info = ROUTES[route]
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6rem] font-extrabold ${info.tone}`}>
    <span className={`grid h-4 w-4 place-items-center rounded-full text-[0.5rem] font-black ${info.solid}`}>{info.step}</span>{info.label}
  </span>
}

export function LineStatusBadge({ status }: { status: string }) {
  const info = LINE_STATUS[status] || { label: status, tone: 'bg-slate-100 text-slate-600' }
  return <span className={`shrink-0 rounded-lg px-2 py-1 text-[0.6rem] font-extrabold ${info.tone}`}>{info.label}</span>
}

// The three routes and their rules, so both GSO Staff and the GSO Head read the same conditions.
export function RouteLegend({ onDark = false }: { onDark?: boolean }) {
  return <div className="grid gap-2 sm:grid-cols-3">
    {routeOrder.map((route) => {
      const info = ROUTES[route]
      return <div key={route} className={onDark ? 'rounded-2xl border border-white/10 bg-white/8 px-4 py-3' : `rounded-xl border p-3 ${info.tone}`}>
        <div className="flex items-center gap-2">
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[0.62rem] font-black ${onDark ? 'bg-white/10 text-blue-100' : info.solid}`}>{info.step}</span>
          <p className={`text-xs font-black ${onDark ? 'text-white' : ''}`}>{info.label}</p>
        </div>
        <p className={`mt-1.5 text-[0.65rem] font-semibold leading-relaxed ${onDark ? 'text-blue-100' : 'opacity-90'}`}>{info.rule}</p>
        <p className={`mt-1 text-[0.56rem] font-extrabold uppercase tracking-[0.12em] ${onDark ? 'text-blue-200/80' : 'opacity-70'}`}>{info.who}</p>
      </div>
    })}
  </div>
}

export type TabOption<T extends string> = { key: T; label: string; count: number; needsAction?: boolean }

export function TabBar<T extends string>({ tabs, active, onChange, label, accent = 'blue' }: {
  tabs: TabOption<T>[]
  active: T
  onChange: (tab: T) => void
  label: string
  accent?: 'blue' | 'indigo'
}) {
  const on = accent === 'blue' ? 'border-blue-600 bg-blue-600 shadow-blue-600/20' : 'border-indigo-600 bg-indigo-600 shadow-indigo-600/20'
  const badge = accent === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-indigo-50 text-indigo-700'
  return <div role="tablist" aria-label={label} className="flex gap-2 overflow-x-auto pb-1">
    {tabs.map((tab) => {
      const selected = tab.key === active
      return <button key={tab.key} type="button" role="tab" aria-selected={selected} onClick={() => onChange(tab.key)} className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${selected ? `${on} text-white shadow-sm` : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>
        {tab.label}
        <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[0.58rem] ${selected ? 'bg-white/20 text-white' : tab.needsAction && tab.count ? badge : 'bg-slate-100 text-slate-500'}`}>{tab.count}</span>
      </button>
    })}
  </div>
}

function Fact({ label, value, tone = 'text-slate-800' }: { label: string; value: ReactNode; tone?: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
    <dt className="text-[0.55rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className={`mt-0.5 truncate text-xs font-bold ${tone}`}>{value}</dd>
  </div>
}

export function RequestSummary({ request, statusLabel, statusTone }: { request: ServiceRequest; statusLabel: string; statusTone: string }) {
  const form = request.formData
  const urgent = form.urgency === 'Urgent'
  const purpose = formText(form.purpose)
  const remarks = formText(form.remarks)
  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
      <div className="min-w-0">
        <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">{request.referenceNo}</p>
        <h3 className="mt-1 text-lg font-black text-slate-900">{formText(form.requesterName) || request.requesterName}</h3>
        <p className="mt-1 text-xs font-semibold text-slate-600">{[formText(form.requesterEmployeeCode), formText(form.departmentOrganization) || 'Department not set'].filter(Boolean).join(' · ')}</p>
        {formText(form.requesterPosition) && <p className="mt-0.5 text-[0.65rem] text-slate-500">{formText(form.requesterPosition)}</p>}
      </div>
      <span className={`rounded-full px-2.5 py-1.5 text-[0.62rem] font-extrabold ${statusTone}`}>{statusLabel}</span>
    </div>
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Fact label="Date needed" value={formText(form.requiredDate) ? formatDate(String(form.requiredDate)) : 'Not set'} tone={urgent ? 'text-rose-700' : undefined} />
      <Fact label="Submitted" value={formatDate(request.createdAt)} />
      <Fact label="Items" value={`${linesOf(request).length} item${linesOf(request).length === 1 ? '' : 's'}`} />
    </dl>
    {urgent && <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[0.68rem] font-semibold text-rose-800"><span className="font-extrabold">Urgent:</span> {formText(form.urgentReason) || 'No reason given.'}</p>}
    {(purpose || remarks) && <div className="mt-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      {purpose && <p className="text-[0.68rem] leading-relaxed text-slate-700"><span className="font-extrabold text-slate-500">Purpose: </span>{purpose}</p>}
      {remarks && <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-600"><span className="font-extrabold text-slate-500">Remarks: </span>{remarks}</p>}
    </div>}
  </div>
}

export function QuantityChips({ line }: { line: PurchaseRequisitionLine }) {
  return <div className="mt-2 flex flex-wrap gap-1.5 text-[0.6rem] font-bold">
    <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">Requested {line.requestedQuantity}</span>
    {line.reservedQuantity > 0 && <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">Reserved {line.reservedQuantity}</span>}
    {line.financeQuantity > 0 && <span className="rounded-md bg-indigo-50 px-2 py-1 text-indigo-800">To buy {line.financeQuantity}</span>}
    {line.issuedQuantity > 0 && <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-800">Issued {line.issuedQuantity}</span>}
  </div>
}

// Takes one linked delivery back. A short inline question comes first, so a stray click cannot undo it.
function UndoDelivery({ receipt, onUndo }: { receipt: PurchaseRequisitionReceipt; onUndo: (receiptId: string) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function undo() {
    setBusy(true)
    setError('')
    try {
      await onUndo(receipt.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to undo this delivery.')
    } finally {
      setBusy(false)
    }
  }

  if (!confirming) return <button type="button" onClick={() => setConfirming(true)} className="rounded-md px-1.5 py-0.5 text-[0.62rem] font-extrabold text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100">Undo</button>
  return <div className="basis-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
    <p className="text-[0.68rem] font-semibold leading-relaxed text-amber-900">Undo this delivery? The {receipt.quantity} {receipt.unitOfMeasure} go back to “waiting for purchase” and the stock is released. You can link it again later.</p>
    {error && <p role="alert" className="mt-1.5 text-[0.65rem] font-semibold text-rose-700">{error}</p>}
    <div className="mt-2 flex justify-end gap-2">
      <button type="button" disabled={busy} onClick={() => { setConfirming(false); setError('') }} className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-[0.65rem] font-extrabold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50">Keep it</button>
      <button type="button" disabled={busy} onClick={() => void undo()} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[0.65rem] font-extrabold text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60">{busy ? 'Undoing…' : 'Yes, undo'}</button>
    </div>
  </div>
}

// The purchased deliveries linked to one requisition item: what arrived, how many, the receipt, who, and when.
// With `onUndo`, GSO Staff can take a delivery back until its units are issued; an undone record stays listed.
export function DeliveryRecords({ line, onUndo }: { line: PurchaseRequisitionLine; onUndo?: (receiptId: string) => Promise<void> }) {
  const receipts = line.receipts || []
  if (!receipts.length) return null
  const received = receipts.filter((receipt) => !receipt.voidedAt).reduce((total, receipt) => total + Number(receipt.quantity), 0)
  const canUndo = Boolean(onUndo) && !['HANDOVER_PENDING', 'ISSUED', 'REJECTED', 'CANCELLED'].includes(line.routeStatus)
  return <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
    <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Delivery records · {received} received</p>
    <ul className="mt-2 space-y-1.5">
      {receipts.map((receipt) => receipt.voidedAt
        ? <li key={receipt.id} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-slate-500">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="text-xs font-bold line-through">{receipt.quantity} {receipt.unitOfMeasure} · {receipt.itemCode}</span>
            <span className="text-[0.62rem] font-semibold">{formatDateTime(receipt.receivedAt)}</span>
          </div>
          <p className="mt-0.5 text-[0.62rem] font-semibold">Undone by {receipt.voidedBy || 'GSO Staff'} · {formatDateTime(receipt.voidedAt)}</p>
        </li>
        : <li key={receipt.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="text-xs font-extrabold text-slate-800">{receipt.quantity} {receipt.unitOfMeasure} · {receipt.itemCode}</span>
            <span className="text-[0.62rem] font-semibold text-slate-500">{formatDateTime(receipt.receivedAt)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-[0.65rem] text-slate-600">
              Receipt/invoice: <span className="font-bold text-slate-800">{receipt.receiptReference || 'Not recorded'}</span>
              <span className="text-slate-400"> · </span>Recorded by {receipt.receivedBy || 'GSO Staff'}
            </p>
            {canUndo && onUndo && <UndoDelivery receipt={receipt} onUndo={onUndo} />}
          </div>
        </li>)}
    </ul>
  </div>
}

export function Banner({ tone, children }: { tone: 'error' | 'success' | 'info' | 'warning'; children: ReactNode }) {
  const tones = {
    error: 'border-rose-200 bg-rose-50 text-rose-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  }
  return <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-3 py-2.5 text-xs font-semibold leading-relaxed ${tones[tone]}`}>{children}</p>
}

export function HistoryList({ request }: { request: ServiceRequest }) {
  const events = [...request.history].reverse()
  return <details className="group mt-4 rounded-xl border border-slate-200 bg-white">
    <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">
      History ({events.length})<span className="transition group-open:rotate-180" aria-hidden="true">⌄</span>
    </summary>
    <ol className="max-h-64 space-y-2.5 overflow-y-auto border-t border-slate-100 p-3">
      {events.length === 0 && <li className="text-xs text-slate-400">No history yet.</li>}
      {events.map((event) => <li key={event.id} className="text-[0.65rem]">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-extrabold text-slate-700">{event.status}</span><span className="text-slate-400">{formatDateTime(event.changedAt)}</span></div>
        {event.note && <p className="mt-0.5 leading-relaxed text-slate-600">{event.note}</p>}
        {event.changedBy && <p className="mt-0.5 text-slate-400">by {event.changedBy}</p>}
      </li>)}
    </ol>
  </details>
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center">
    <div><p className="text-sm font-extrabold text-slate-700">{title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p></div>
  </div>
}
