import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PurchaseRequisitionLine, ServiceRequest } from '../requesters/requesterApi'
import { formatDate, formatDateTime } from '../requesters/requesterrequestutils'
import { ROUTES, categoryLabel, countLines, formText, headApproval, linesOf } from '../gso/requisitionFlow'
import { Banner, DeliveryRecords, EmptyState, LineStatusBadge, QuantityChips, RequestSummary, RoutePill, TabBar } from '../gso/requisitionParts'
import { GsoHeadPageFrame } from './gsoheadnavbar'
import { listPurchaseRequisitions, reviewPurchaseRequisition } from './gsoheadApi'

type Tab = 'approval' | 'staff'

const TABS: Record<Tab, { label: string; hint: string; empty: string; needsAction: boolean }> = {
  approval: { label: 'For your approval', hint: 'Checked by GSO Staff. Decide on the whole request.', empty: 'Nothing is waiting for your approval.', needsAction: true },
  staff: { label: 'With GSO Staff', hint: 'Approved PDFs are printed and handed to Finance by GSO Staff.', empty: 'Nothing is with GSO Staff.', needsAction: false },
}
const TAB_ORDER = Object.keys(TABS) as Tab[]

function tabFor(request: ServiceRequest): Tab | null {
  if (['Sent to Finance', 'Finance Handoff Pending', 'Ready for Pickup', 'Issued', 'Rejected'].includes(request.status)) return null
  if (request.status === 'Under Review' && countLines(request, ['WAITING_GSO_HEAD'])) return 'approval'
  return 'staff'
}

function chipFor(request: ServiceRequest) {
  const tab = tabFor(request)
  if (tab === 'approval') return { label: 'Whole request', tone: 'bg-amber-50 text-amber-800' }
  if (request.status === 'GSO Endorsed') return { label: 'Ready for handoff', tone: 'bg-indigo-50 text-indigo-700' }
  if (request.status === 'Sent to Finance') return { label: 'Handed to Finance', tone: 'bg-indigo-50 text-indigo-700' }
  if (request.status === 'Submitted') return { label: 'Stock check', tone: 'bg-blue-50 text-blue-700' }
  if (request.status === 'Needs Information') return { label: 'With requester', tone: 'bg-amber-50 text-amber-800' }
  if (request.status === 'Approved') return { label: 'Issuing', tone: 'bg-emerald-50 text-emerald-700' }
  if (request.status === 'Rejected') return { label: 'Declined', tone: 'bg-rose-50 text-rose-700' }
  return { label: request.status, tone: 'bg-slate-100 text-slate-600' }
}

function staffStageText(request: ServiceRequest) {
  if (request.status === 'Submitted') return 'GSO Staff is checking stock.'
  if (request.status === 'Needs Information') return "Waiting for the requester's answer."
  if (request.status === 'Approved') return 'Approved and reserved. Ready for issuance.'
  if (request.status === 'GSO Endorsed') return 'The signed PDF is ready for GSO Staff to print and hand to Finance.'
  if (request.status === 'Sent to Finance') return 'GSO Staff handed the signed PDF to Finance and is buying the remaining items.'
  if (request.status === 'Ready for Pickup') return 'Ready for pickup. Labels printed.'
  return 'GSO Staff is handling this.'
}

function DecisionCard({ line }: { line: PurchaseRequisitionLine }) {
  const approval = headApproval(line)
  const reserved = line.allocations.filter((allocation) => allocation.status === 'Reserved')
  return <article className="rounded-xl border border-slate-200 bg-white p-3.5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-slate-900">{line.itemName} <span className="font-bold text-slate-500">× {line.requestedQuantity}</span></p>
        <p className="mt-0.5 text-[0.65rem] text-slate-500">{categoryLabel(line.category)}</p>
      </div>
      <RoutePill route={approval.route} />
    </div>
    <p className={`mt-2 rounded-lg border px-2.5 py-2 text-[0.66rem] font-semibold leading-relaxed ${ROUTES[approval.route].tone}`}><span className="font-extrabold">Why you: </span>{approval.reason}</p>
    <QuantityChips line={line} />
    {reserved.length > 0 && <p className="mt-1.5 text-[0.6rem] font-semibold text-slate-500">Held from {reserved.map((allocation) => `${allocation.itemCode} (${allocation.quantity} ${allocation.unitOfMeasure})`).join(', ')}</p>}
    {line.specifications && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[0.65rem] leading-relaxed text-slate-600">{line.specifications}</p>}
  </article>
}

function DecisionPanel({ request, onSaved }: { request: ServiceRequest; onSaved: (message: string, updated: ServiceRequest) => void }) {
  const items = linesOf(request)
  const [decision, setDecision] = useState<'APPROVE' | 'DECLINE' | ''>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const shortageLines = items.filter((line) => line.financeQuantity > 0)
  const heldUnits = items.reduce((sum, line) => sum + line.reservedQuantity, 0)
  const shortageUnits = shortageLines.reduce((sum, line) => sum + line.financeQuantity, 0)

  async function submit() {
    if (!decision) return
    if (decision === 'DECLINE' && !note.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await reviewPurchaseRequisition(request.id, {
        action: 'DECIDE',
        decision,
        note: note.trim(),
      })
      const parts = decision === 'DECLINE'
        ? 'declined'
        : shortageUnits > 0 ? `approved; ${shortageUnits} unit(s) go to Finance` : 'approved'
      onSaved(`${result.request.referenceNo} ${parts}.${result.requesterNotified ? ' Requester emailed.' : ''}`, result.request)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save your decisions.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="mt-4" aria-label="Your decisions">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h4 className="text-xs font-extrabold text-slate-800">One decision for all {items.length} item(s)</h4></div>
    </div>
    <div className="mt-2 space-y-2">
      {items.map((line) => <DecisionCard key={line.id} line={line} />)}
    </div>

    <div className="sticky bottom-0 mt-4 rounded-2xl border-2 border-slate-300/80 bg-white/95 p-3.5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 backdrop-blur">
      {error && <div className="mb-3"><Banner tone="error">{error}</Banner></div>}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[0.68rem] font-semibold leading-relaxed text-amber-950">
        {shortageUnits > 0
          ? `${shortageUnits} unit(s) to buy · ${heldUnits} reserved from stock. Nothing is issued until every item is complete.`
          : 'All items are in stock.'}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Decision for the complete purchase requisition">
        <button type="button" role="radio" aria-checked={decision === 'APPROVE'} disabled={busy} onClick={() => setDecision('APPROVE')} className={`rounded-xl border px-3 py-2.5 text-xs font-extrabold transition ${decision === 'APPROVE' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700'}`}>Approve</button>
        <button type="button" role="radio" aria-checked={decision === 'DECLINE'} disabled={busy} onClick={() => setDecision('DECLINE')} className={`rounded-xl border px-3 py-2.5 text-xs font-extrabold transition ${decision === 'DECLINE' ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-rose-300 hover:text-rose-700'}`}>Decline</button>
      </div>
      {decision === 'DECLINE' && <label className="mt-3 block">
        <span className="mb-1 block text-[0.6rem] font-extrabold uppercase tracking-wide text-rose-700">Reason for the requester</span>
        <textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} className="min-h-20 w-full resize-y rounded-xl border border-rose-200 bg-white p-3 text-xs font-semibold outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100" placeholder="Why are you declining?" />
        <span className="mt-1 block text-[0.6rem] text-slate-500">Reserved stock will be released.</span>
      </label>}
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" disabled={busy || !decision || (decision === 'DECLINE' && !note.trim())} onClick={() => void submit()} className={`rounded-xl px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${decision === 'DECLINE' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>{busy ? 'Saving…' : 'Save decision'}</button>
      </div>
    </div>
  </section>
}

function ReadOnlyLines({ request }: { request: ServiceRequest }) {
  return <div className="mt-4 space-y-2">
    <h4 className="text-xs font-extrabold text-slate-800">Requested items</h4>
    {linesOf(request).map((line) => <article key={line.id} className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-xs font-extrabold text-slate-900">{line.itemName} <span className="font-bold text-slate-500">× {line.requestedQuantity}</span></p><p className="mt-0.5 text-[0.65rem] text-slate-500">{categoryLabel(line.category)}</p></div>
        <LineStatusBadge status={line.routeStatus} />
      </div>
      <QuantityChips line={line} />
      {line.reviewNote && ['REJECTED', 'NEEDS_INFORMATION'].includes(line.routeStatus) && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[0.65rem] text-slate-700"><span className="font-extrabold">{line.routeStatus === 'REJECTED' ? 'Reason: ' : 'Question: '}</span>{line.reviewNote}</p>}
      <DeliveryRecords line={line} />
    </article>)}
  </div>
}

// The Head records approval; GSO Staff then prints the signed PDF and hands it to Finance.
function HandoffTrail({ request }: { request: ServiceRequest }) {
  if (!request.gsoHeadEndorsedAt && !request.financeSentAt) return null
  const lines = linesOf(request)
  const received = lines.reduce((total, line) => total + (line.receipts || []).filter((receipt) => !receipt.voidedAt).reduce((sum, receipt) => sum + Number(receipt.quantity), 0), 0)
  const toReceive = lines.reduce((total, line) => total + line.financeQuantity, 0)
  return <dl className="mt-4 grid gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 sm:grid-cols-3">
    <div><dt className="text-[0.55rem] font-extrabold uppercase tracking-wide text-indigo-700">Purchase approved</dt><dd className="mt-0.5 text-[0.68rem] font-semibold text-slate-700">{request.gsoHeadEndorsedAt ? formatDateTime(request.gsoHeadEndorsedAt) : '—'}</dd></div>
    <div><dt className="text-[0.55rem] font-extrabold uppercase tracking-wide text-indigo-700">Printed handoff</dt><dd className="mt-0.5 text-[0.68rem] font-semibold text-slate-700">{request.financeSentAt ? formatDateTime(request.financeSentAt) : 'Waiting for GSO Staff'}</dd></div>
    <div><dt className="text-[0.55rem] font-extrabold uppercase tracking-wide text-indigo-700">Bought items received</dt><dd className="mt-0.5 text-[0.68rem] font-semibold text-slate-700">{request.financeSentAt ? `${received} received · ${toReceive} still to receive` : '—'}</dd></div>
  </dl>
}

const linkedRequestId = new URLSearchParams(window.location.search).get('request') || ''

export default function PurchaseRequisitions() {
  const params = new URLSearchParams(window.location.search)
  const urlTab = params.get('tab') as Tab | null
  const [chosenTab, setChosenTab] = useState<Tab | null>(urlTab && TAB_ORDER.includes(urlTab) ? urlTab : null)
  const [selectedId, setSelectedId] = useState(params.get('request') || '')
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // State is set in promise callbacks, so the first load can start from an effect.
  const loadQueue = useCallback(() => listPurchaseRequisitions()
    .then((rows) => {
      setRequests(rows)
      setError('')
      // A link to one request (from the overview) opens the tab that request is in.
      const linked = rows.find((request) => request.id === linkedRequestId)
      if (linked) {
        const linkedTab = tabFor(linked)
        if (linkedTab) setChosenTab((current) => current ?? linkedTab)
      }
    })
    .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load purchase requisitions.'))
    .finally(() => setLoading(false)), [setChosenTab])

  useEffect(() => { void loadQueue() }, [loadQueue])

  const counts = useMemo(() => {
    const totals: Record<Tab, number> = { approval: 0, staff: 0 }
    for (const request of requests) {
      const tab = tabFor(request)
      if (tab) totals[tab] += 1
    }
    return totals
  }, [requests])
  // Open the first tab with work for the Head until they pick one.
  const tab: Tab = chosenTab ?? (counts.approval > 0 ? 'approval' : 'staff')
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return requests.filter((request) => tabFor(request) === tab
      && (!query || `${request.referenceNo} ${request.requesterName} ${formText(request.formData.departmentOrganization)} ${linesOf(request).map((line) => line.itemName).join(' ')}`.toLowerCase().includes(query)))
  }, [requests, search, tab])
  const selected = visible.find((request) => request.id === selectedId) || visible[0] || null

  async function afterChange(message: string, updated: ServiceRequest) {
    setNotice(message)
    await loadQueue()
    // The request has moved to the GSO Staff handoff queue, so the page follows it.
    setSearch('')
    const newTab = tabFor(updated)
    if (newTab) {
      setChosenTab(newTab)
      setSelectedId(updated.id)
    } else {
      setSelectedId('')
    }
  }

  return (
    <GsoHeadPageFrame activePage="requests" contentWidth="wide">
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Purchase Requisitions</span>
            <h1 className="mt-3 text-xl font-black tracking-tight sm:mt-4 sm:text-3xl">Review and decide</h1>
            <p className="mt-1.5 max-w-2xl text-xs font-medium leading-relaxed text-blue-100 sm:mt-2 sm:text-sm">Check GSO Staff's work and approve complete requests. Approved shortage forms go to the GSO Staff handoff queue for printing.</p>
          </div>
        </section>

        <section className="space-y-4" aria-label="Requisition stages">
          <div className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <TabBar accent="indigo" label="Requisition stages" tabs={TAB_ORDER.map((key) => ({ key, label: TABS[key].label, count: counts[key], needsAction: TABS[key].needsAction }))} active={tab} onChange={(next) => { setChosenTab(next); setNotice('') }} />
                <p className="mt-2 text-[0.68rem] font-medium text-slate-500">{TABS[tab].hint}</p>
              </div>
              <div className="flex gap-2">
                <input type="search" name="requisition-search" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, requester, item" aria-label="Search requisitions" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 md:w-72" />
                <button type="button" onClick={() => { setLoading(true); void loadQueue() }} disabled={loading} className="h-10 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 shadow-sm hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60">{loading ? 'Loading…' : 'Refresh'}</button>
              </div>
            </div>
            {error && <div className="mt-3"><Banner tone="error">{error}</Banner></div>}
            {notice && <div className="mt-3"><Banner tone="success">{notice}</Banner></div>}
          </div>

          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(22rem,0.8fr)_minmax(0,1.2fr)]">
              <section className="flex min-w-0 flex-col rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                <div className="border-b border-slate-200 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-black text-white shadow-sm shadow-indigo-600/30">1</span>
                    <div className="min-w-0">
                      <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-indigo-700">Step 1 of 2</p>
                      <h2 className="mt-0.5 text-base font-black leading-tight text-slate-900">Choose a requisition</h2>
                      <p className="mt-1 text-xs text-slate-500">{visible.length} request{visible.length === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 p-4 sm:p-5">
                  <div className="max-h-[48vh] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                {loading && requests.length === 0 ? <p className="p-8 text-center text-xs font-semibold text-slate-400">Loading requisitions…</p>
                  : visible.length === 0 ? <p className="p-8 text-center text-xs font-semibold text-slate-500">{search ? 'No requests match your search.' : TABS[tab].empty}</p>
                    : visible.map((request) => {
                      const chip = chipFor(request)
                      const isSelected = selected?.id === request.id
                      return <button key={request.id} type="button" onClick={() => { setSelectedId(request.id); setNotice('') }} aria-current={isSelected ? 'true' : undefined} className={`block w-full rounded-xl border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 ${isSelected ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'}`}>
                        <span className="flex items-center justify-between gap-2"><span className="text-xs font-black text-slate-800">{request.referenceNo}</span><span className={`shrink-0 rounded-full px-2 py-1 text-[0.56rem] font-extrabold ${chip.tone}`}>{chip.label}</span></span>
                        <span className="mt-1 block truncate text-[0.68rem] font-bold text-slate-600">{formText(request.formData.requesterName) || request.requesterName} · {formText(request.formData.departmentOrganization) || request.requesterEmail}</span>
                        <span className="mt-1 block truncate text-[0.62rem] text-slate-500">{linesOf(request).map((line) => `${line.itemName} × ${line.requestedQuantity}`).join(', ')}</span>
                        <span className="mt-1 flex items-center gap-2 text-[0.6rem] text-slate-400">Submitted {formatDate(request.createdAt)}{request.formData.urgency === 'Urgent' && <span className="rounded bg-rose-50 px-1.5 py-0.5 font-extrabold text-rose-700">Urgent</span>}</span>
                      </button>
                    })}
                  </div>
                </div>
              </section>

              <section className="flex min-w-0 flex-col rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                <div className="border-b border-slate-200 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${selected ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30' : 'bg-slate-100 text-slate-500'}`}>2</span>
                    <div className="min-w-0">
                      <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-indigo-700">Step 2 of 2</p>
                      <h2 className="mt-0.5 text-base font-black leading-tight text-slate-900">Review and decide</h2>
                      {selected && <p className="mt-1 text-xs text-slate-500">{TABS[tab].label}</p>}
                    </div>
                  </div>
                </div>
                <div className="min-w-0 p-4 sm:p-5 lg:max-h-[calc(100vh-24rem)] lg:overflow-y-auto">
                {!selected ? <EmptyState title={TABS[tab].empty} detail="Requests appear here after the stock check." /> : <>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5"><RequestSummary request={selected} statusLabel={chipFor(selected).label} statusTone={chipFor(selected).tone} /></div>
                  {selected.staffReviewedAt && <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
                    <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-blue-700">Checked by GSO Staff</p>
                    <p className="mt-0.5 text-[0.68rem] font-semibold text-slate-700">{selected.staffReviewedBy || 'GSO Staff'} · {formatDateTime(selected.staffReviewedAt)}</p>
                    {selected.staffReviewNote && <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-700"><span className="font-extrabold">Note: </span>{selected.staffReviewNote}</p>}
                  </div>}

                  {tabFor(selected) === 'approval'
                    ? <DecisionPanel key={selected.id} request={selected} onSaved={(message, updated) => void afterChange(message, updated)} />
                    : <>
                      <ReadOnlyLines request={selected} />
                      {tabFor(selected) === 'staff' && <div className="mt-4"><Banner tone="info">{staffStageText(selected)}</Banner></div>}
                    </>}
                  <HandoffTrail request={selected} />
                </>}
                </div>
              </section>
            </div>
          </section>
      </div>
    </GsoHeadPageFrame>
  )
}
