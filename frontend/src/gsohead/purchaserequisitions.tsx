import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PurchaseRequisitionLine, ServiceRequest } from '../requesters/requesterApi'
import { formatDate, formatDateTime } from '../requesters/requesterrequestutils'
import { ROUTES, categoryLabel, countLines, formText, headApproval, linesOf } from '../gso/requisitionFlow'
import { Banner, DeliveryRecords, EmptyState, HistoryList, LineStatusBadge, QuantityChips, RequestSummary, RoutePill, TabBar } from '../gso/requisitionParts'
import { GsoHeadPageFrame } from './gsoheadnavbar'
import { listPurchaseRequisitions, reviewPurchaseRequisition, sendPurchaseRequisitionToFinance } from './gsoheadApi'

type Tab = 'approval' | 'finance' | 'staff' | 'closed'

const TABS: Record<Tab, { label: string; hint: string; empty: string; needsAction: boolean }> = {
  approval: { label: 'For your approval', hint: 'GSO Staff already checked stock. Decide each item they sent you.', empty: 'Nothing is waiting for your approval.', needsAction: true },
  finance: { label: 'Send to Finance', hint: 'Purchases you approved. Email the requisition PDF to Finance; after that, GSO Staff buy the items.', empty: 'No approved purchases to send.', needsAction: true },
  staff: { label: 'With GSO Staff', hint: 'Stock checks, buying, deliveries, and issuance handled by GSO Staff. No action needed from you.', empty: 'Nothing is with GSO Staff.', needsAction: false },
  closed: { label: 'Closed', hint: 'Completed, declined, or cancelled requisitions.', empty: 'No closed requisitions yet.', needsAction: false },
}
const TAB_ORDER = Object.keys(TABS) as Tab[]

function tabFor(request: ServiceRequest): Tab {
  if (request.status === 'Under Review' && countLines(request, ['WAITING_GSO_HEAD'])) return 'approval'
  if (['GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed'].includes(request.status)) return 'finance'
  if (['Completed', 'Rejected', 'Cancelled'].includes(request.status)) return 'closed'
  return 'staff'
}

function chipFor(request: ServiceRequest) {
  const tab = tabFor(request)
  if (tab === 'approval') return { label: `${countLines(request, ['WAITING_GSO_HEAD'])} to decide`, tone: 'bg-amber-50 text-amber-800' }
  if (request.status === 'Finance Handoff Failed') return { label: 'Email failed', tone: 'bg-rose-50 text-rose-700' }
  if (request.status === 'Finance Handoff Pending') return { label: 'Sending…', tone: 'bg-blue-50 text-blue-700' }
  if (tab === 'finance') return { label: 'Ready to send', tone: 'bg-indigo-50 text-indigo-700' }
  if (request.status === 'Sent to Finance') return { label: 'Staff buying', tone: 'bg-indigo-50 text-indigo-700' }
  if (request.status === 'Submitted') return { label: 'Stock check', tone: 'bg-blue-50 text-blue-700' }
  if (request.status === 'Needs Information') return { label: 'With requester', tone: 'bg-amber-50 text-amber-800' }
  if (request.status === 'Approved') return { label: 'Issuing', tone: 'bg-emerald-50 text-emerald-700' }
  if (request.status === 'Rejected') return { label: 'Declined', tone: 'bg-rose-50 text-rose-700' }
  return { label: request.status, tone: 'bg-slate-100 text-slate-600' }
}

function staffStageText(request: ServiceRequest) {
  if (request.status === 'Submitted') return 'GSO Staff is checking stock. Items that need you will appear in “For your approval”.'
  if (request.status === 'Needs Information') return 'Waiting for the requester to answer a question. Their reply goes back to GSO Staff for a fresh stock check.'
  if (request.status === 'Approved') return 'Approved items are reserved. GSO Staff hands them over through Main Issuance.'
  if (request.status === 'Sent to Finance') return 'You sent this to Finance. GSO Staff buy the items, add them in Item Master Data, and link each delivery. Delivered items show under each item below.'
  if (request.status === 'Completed') return 'Every approved item was issued.'
  if (request.status === 'Rejected') return 'Every item was declined.'
  if (request.status === 'Cancelled') return 'The requester cancelled this requisition.'
  return 'GSO Staff is handling this requisition.'
}

type Choice = { decision: 'APPROVE' | 'DECLINE' | ''; note: string }

function approveMeans(line: PurchaseRequisitionLine) {
  if (line.financeQuantity > 0 && line.reservedQuantity > 0) return `GSO Staff issues the ${line.reservedQuantity} in stock; ${line.financeQuantity} go to “Send to Finance”.`
  if (line.financeQuantity > 0) return `All ${line.financeQuantity} go to “Send to Finance” for purchase.`
  return `GSO Staff issues the ${line.reservedQuantity} reserved unit(s).`
}

function DecisionCard({ line, choice, onChange }: { line: PurchaseRequisitionLine; choice: Choice; onChange: (choice: Choice) => void }) {
  const approval = headApproval(line)
  const reserved = line.allocations.filter((allocation) => allocation.status === 'Reserved')
  return <article className={`rounded-xl border-2 bg-white p-3.5 transition ${choice.decision === 'APPROVE' ? 'border-emerald-300' : choice.decision === 'DECLINE' ? 'border-rose-300' : 'border-slate-200'}`}>
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
    <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={`Decision for ${line.itemName}`}>
      <button type="button" role="radio" aria-checked={choice.decision === 'APPROVE'} onClick={() => onChange({ ...choice, decision: 'APPROVE' })} className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition ${choice.decision === 'APPROVE' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700'}`}>✓ Approve</button>
      <button type="button" role="radio" aria-checked={choice.decision === 'DECLINE'} onClick={() => onChange({ ...choice, decision: 'DECLINE' })} className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition ${choice.decision === 'DECLINE' ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-rose-300 hover:text-rose-700'}`}>✕ Decline</button>
    </div>
    {choice.decision === 'APPROVE' && <p className="mt-2 text-[0.63rem] font-semibold text-emerald-800">{approveMeans(line)}</p>}
    {choice.decision === 'DECLINE' && <label className="mt-2 block">
      <span className="mb-1 block text-[0.6rem] font-extrabold uppercase tracking-wide text-rose-700">Reason · the requester sees this</span>
      <input autoFocus value={choice.note} onChange={(event) => onChange({ ...choice, note: event.target.value })} maxLength={1000} className="h-10 w-full rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100" placeholder="For example: the department already has enough units." />
      <span className="mt-1 block text-[0.6rem] text-slate-500">Any reserved stock is released back to inventory.</span>
    </label>}
  </article>
}

function DecisionPanel({ request, onSaved }: { request: ServiceRequest; onSaved: (message: string) => void }) {
  const pending = linesOf(request).filter((line) => line.routeStatus === 'WAITING_GSO_HEAD')
  const handled = linesOf(request).filter((line) => line.routeStatus !== 'WAITING_GSO_HEAD')
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [mode, setMode] = useState<'decide' | 'ask'>('decide')
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const choiceOf = (line: PurchaseRequisitionLine): Choice => choices[line.id] || { decision: '', note: '' }
  const decidedCount = pending.filter((line) => choiceOf(line).decision === 'APPROVE' || (choiceOf(line).decision === 'DECLINE' && choiceOf(line).note.trim())).length
  const approved = pending.filter((line) => choiceOf(line).decision === 'APPROVE').length
  const declined = pending.filter((line) => choiceOf(line).decision === 'DECLINE').length
  const missingReasons = pending.filter((line) => choiceOf(line).decision === 'DECLINE' && !choiceOf(line).note.trim()).length

  async function submit(action: 'DECIDE' | 'NEEDS_INFORMATION') {
    const approvedLines = pending.filter((line) => choiceOf(line).decision === 'APPROVE')
    const purchases = approvedLines.filter((line) => line.financeQuantity > 0).length
    const fromStock = approvedLines.filter((line) => line.reservedQuantity > 0).length
    setBusy(true)
    setError('')
    try {
      const result = action === 'DECIDE'
        ? await reviewPurchaseRequisition(request.id, {
          action,
          decisions: pending.map((line) => ({ lineId: line.id, decision: choiceOf(line).decision === 'DECLINE' ? 'DECLINE' : 'APPROVE', note: choiceOf(line).note.trim() })),
        })
        : await reviewPurchaseRequisition(request.id, { action, note: question.trim() })
      const parts = action === 'NEEDS_INFORMATION'
        ? ['question sent to the requester']
        : [
          purchases && `${purchases} purchase(s) moved to “Send to Finance”`,
          fromStock && `${fromStock} item(s) went to GSO Staff for issuance`,
          declined && `${declined} declined`,
        ].filter(Boolean)
      onSaved(`${result.request.referenceNo}: ${parts.join('; ')}.${result.requesterNotified ? ' The requester was emailed.' : ''}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save your decisions.')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'ask') {
    return <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-4" aria-label="Ask the requester">
      <label className="block">
        <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-amber-900">Question for the requester</span>
        <textarea autoFocus value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setMode('decide') }} maxLength={2000} className="min-h-20 w-full resize-y rounded-xl border border-amber-200 bg-white p-3 text-xs font-medium outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100" placeholder="What do you need to know before deciding?" />
      </label>
      <p className="mt-1.5 text-[0.62rem] leading-relaxed text-amber-900/80">The {pending.length} waiting item(s) go back to the requester, and their reserved stock is released. After they reply, GSO Staff checks stock again.</p>
      {error && <div className="mt-3"><Banner tone="error">{error}</Banner></div>}
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" disabled={busy} onClick={() => { setMode('decide'); setError('') }} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Back</button>
        <button type="button" disabled={busy || !question.trim()} onClick={() => void submit('NEEDS_INFORMATION')} className="rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Sending…' : 'Send question'}</button>
      </div>
    </section>
  }

  return <section className="mt-4" aria-label="Your decisions">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h4 className="text-xs font-extrabold text-slate-800">Needs your decision · {pending.length} item(s)</h4><p className="mt-0.5 text-[0.62rem] text-slate-500">Approve or decline each item. Declines need a reason.</p></div>
      <button type="button" onClick={() => setChoices(Object.fromEntries(pending.map((line) => [line.id, { decision: 'APPROVE', note: '' }])))} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[0.65rem] font-extrabold text-emerald-800 hover:bg-emerald-100">Approve all</button>
    </div>
    <div className="mt-2 space-y-2">
      {pending.map((line) => <DecisionCard key={line.id} line={line} choice={choiceOf(line)} onChange={(choice) => setChoices((current) => ({ ...current, [line.id]: choice }))} />)}
    </div>

    {handled.length > 0 && <div className="mt-4">
      <h4 className="text-xs font-extrabold text-slate-800">Already handled by GSO Staff</h4>
      <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50">
        {handled.map((line) => <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"><span className="text-xs font-bold text-slate-700">{line.itemName} <span className="font-semibold text-slate-500">× {line.requestedQuantity}</span></span><LineStatusBadge status={line.routeStatus} /></div>)}
      </div>
    </div>}

    <div className="sticky bottom-0 mt-4 rounded-2xl border-2 border-slate-300/80 bg-white/95 p-3.5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 backdrop-blur">
      {error && <div className="mb-3"><Banner tone="error">{error}</Banner></div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.68rem] font-semibold text-slate-600"><span className="font-extrabold text-slate-900">{decidedCount} of {pending.length}</span> decided{approved ? ` · ${approved} approve` : ''}{declined ? ` · ${declined} decline` : ''}{missingReasons > 0 && <span className="text-rose-700"> · {missingReasons} decline{missingReasons === 1 ? ' needs a reason' : 's need reasons'}</span>}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button type="button" disabled={busy} onClick={() => { setMode('ask'); setError('') }} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-700 transition hover:border-amber-300 hover:text-amber-800 disabled:opacity-50">Ask requester first</button>
          <button type="button" disabled={busy || decidedCount !== pending.length} onClick={() => void submit('DECIDE')} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Saving…' : 'Submit decisions'}</button>
        </div>
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

// What happened to the purchase so far: approved, emailed to Finance, and how much GSO Staff have received.
function FinanceTrail({ request }: { request: ServiceRequest }) {
  if (!request.gsoHeadEndorsedAt && !request.financeSentAt) return null
  const lines = linesOf(request)
  const received = lines.reduce((total, line) => total + (line.receipts || []).filter((receipt) => !receipt.voidedAt).reduce((sum, receipt) => sum + Number(receipt.quantity), 0), 0)
  const toReceive = lines.reduce((total, line) => total + line.financeQuantity, 0)
  return <dl className="mt-4 grid gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 sm:grid-cols-3">
    <div><dt className="text-[0.55rem] font-extrabold uppercase tracking-wide text-indigo-700">Purchase approved</dt><dd className="mt-0.5 text-[0.68rem] font-semibold text-slate-700">{request.gsoHeadEndorsedAt ? formatDateTime(request.gsoHeadEndorsedAt) : '—'}</dd></div>
    <div><dt className="text-[0.55rem] font-extrabold uppercase tracking-wide text-indigo-700">Sent to Finance</dt><dd className="mt-0.5 wrap-break-word text-[0.68rem] font-semibold text-slate-700">{request.financeSentAt ? `${formatDateTime(request.financeSentAt)} · ${request.financeEmail}` : '—'}</dd></div>
    <div><dt className="text-[0.55rem] font-extrabold uppercase tracking-wide text-indigo-700">Bought items received</dt><dd className="mt-0.5 text-[0.68rem] font-semibold text-slate-700">{request.financeSentAt ? `${received} received · ${toReceive} still to receive` : '—'}</dd></div>
  </dl>
}

function SendToFinancePanel({ request, onSaved }: { request: ServiceRequest; onSaved: (message: string) => void }) {
  const toBuy = linesOf(request).filter((line) => line.financeQuantity > 0)
  const [email, setEmail] = useState(request.financeEmail || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sending = request.status === 'Finance Handoff Pending'

  async function send() {
    setBusy(true)
    setError('')
    try {
      const result = await sendPurchaseRequisitionToFinance(request.id, email.trim())
      onSaved(`${result.request.referenceNo} sent to Finance (${email.trim()}). GSO Staff can now buy the items and link the deliveries.${result.requesterNotified ? ' The requester was emailed.' : ''}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send the requisition to Finance.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4" aria-label="Send to Finance">
    <p className="text-sm font-black text-indigo-950">Send the purchase request to Finance</p>
    <p className="mt-1 text-[0.68rem] leading-relaxed text-indigo-900/80">Finance receives a PDF with only the items to buy; items already in stock stay with GSO Staff. Finance releases the funds outside A.S.SET, so you do not record a reply here. Once you send it, GSO Staff can buy the items.</p>
    <ul className="mt-3 divide-y divide-indigo-100 rounded-xl border border-indigo-100 bg-white">
      {toBuy.map((line) => <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"><span className="text-xs font-bold text-slate-800">{line.itemName}</span><span className="text-[0.65rem] font-extrabold text-indigo-800">Buy {line.financeQuantity}{line.reservedQuantity > 0 ? ` · ${line.reservedQuantity} from stock` : ''}</span></li>)}
    </ul>
    {request.status === 'Finance Handoff Failed' && <div className="mt-3"><Banner tone="warning">The last email to {request.financeEmail || 'Finance'} failed. Check the address and send again.</Banner></div>}
    {sending ? <div className="mt-3"><Banner tone="info">Sending to {request.financeEmail}… Refresh in a moment.</Banner></div> : <>
      <label className="mt-3 block">
        <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Finance email</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="finance@school.edu.ph" />
      </label>
      {error && <div className="mt-3"><Banner tone="error">{error}</Banner></div>}
      <div className="mt-3 flex justify-end"><button type="button" disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())} onClick={() => void send()} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Sending…' : 'Send PDF to Finance'}</button></div>
    </>}
  </section>
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
      if (linked) setChosenTab((current) => current ?? tabFor(linked))
    })
    .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load purchase requisitions.'))
    .finally(() => setLoading(false)), [setChosenTab])

  useEffect(() => { void loadQueue() }, [loadQueue])

  const counts = useMemo(() => {
    const totals: Record<Tab, number> = { approval: 0, finance: 0, staff: 0, closed: 0 }
    for (const request of requests) totals[tabFor(request)] += 1
    return totals
  }, [requests])
  // Open the first tab with work for the Head until they pick one.
  const tab: Tab = chosenTab ?? (['approval', 'finance'] as Tab[]).find((key) => counts[key] > 0) ?? 'approval'
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return requests.filter((request) => tabFor(request) === tab
      && (!query || `${request.referenceNo} ${request.requesterName} ${formText(request.formData.departmentOrganization)} ${linesOf(request).map((line) => line.itemName).join(' ')}`.toLowerCase().includes(query)))
  }, [requests, search, tab])
  const selected = visible.find((request) => request.id === selectedId) || visible[0] || null

  async function afterChange(message: string) {
    setNotice(message)
    await loadQueue()
  }

  return (
    <GsoHeadPageFrame activePage="requests" contentWidth="wide">
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GSO Head workflow</span>
              <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Purchase Requisitions</h1>
              <p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">Review only the requests that need your decision or a Finance handoff. GSO Staff handles stock checks, deliveries, and issuance.</p>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-3 xl:w-auto xl:min-w-120">
              <button type="button" onClick={() => { setChosenTab('approval'); setNotice('') }} className="rounded-2xl border border-amber-200/20 bg-white/10 px-4 py-3 text-left transition hover:bg-white/16 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25">
                <span className="block text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-blue-100">Needs approval</span>
                <span className="mt-1 block text-2xl font-black text-white">{counts.approval}</span>
              </button>
              <button type="button" onClick={() => { setChosenTab('finance'); setNotice('') }} className="rounded-2xl border border-indigo-200/20 bg-white/10 px-4 py-3 text-left transition hover:bg-white/16 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25">
                <span className="block text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-blue-100">Send to Finance</span>
                <span className="mt-1 block text-2xl font-black text-white">{counts.finance}</span>
              </button>
              <button type="button" onClick={() => { setChosenTab('staff'); setNotice('') }} className="rounded-2xl border border-emerald-200/20 bg-white/10 px-4 py-3 text-left transition hover:bg-white/16 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25">
                <span className="block text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-blue-100">With GSO Staff</span>
                <span className="mt-1 block text-2xl font-black text-white">{counts.staff}</span>
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-3" aria-label="Requisition stages">
          <div className="space-y-3 rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-5">
              <TabBar accent="indigo" label="Requisition stages" tabs={TAB_ORDER.map((key) => ({ key, label: TABS[key].label, count: counts[key], needsAction: TABS[key].needsAction }))} active={tab} onChange={(next) => { setChosenTab(next); setNotice('') }} />
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-[0.68rem] font-medium text-slate-500">{TABS[tab].hint}</p>
                <div className="flex gap-2">
                  <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, requester, item" aria-label="Search requisitions" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 md:w-72" />
                  <button type="button" onClick={() => { setLoading(true); void loadQueue() }} disabled={loading} className="h-10 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 shadow-sm hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60">{loading ? 'Loading…' : 'Refresh'}</button>
                </div>
              </div>
              {error && <Banner tone="error">{error}</Banner>}
              {notice && <Banner tone="success">{notice}</Banner>}
            </div>

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(20rem,0.84fr)_minmax(0,1.16fr)]">
              <section className="flex min-w-0 flex-col rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-600 text-sm font-black text-white shadow-sm shadow-indigo-600/30">1</span>
                      <div className="min-w-0"><p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-indigo-700">Step 1 of 2</p><h2 className="mt-0.5 text-base font-black leading-tight text-slate-900">Choose a requisition</h2><p className="mt-1 text-xs leading-relaxed text-slate-600">Select a request from the current stage.</p></div>
                    </div>
                    <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-indigo-700">{visible.length} request{visible.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-4 max-h-[58vh] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
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
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black ${selected ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30' : 'bg-slate-100 text-slate-500'}`}>2</span>
                    <div className="min-w-0"><p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-indigo-700">Step 2 of 2</p><h2 className="mt-0.5 text-base font-black leading-tight text-slate-900">Review and decide</h2><p className="mt-1 text-xs leading-relaxed text-slate-600">{selected ? 'Review the request, then complete the next action.' : 'Choose a requisition to see its details.'}</p></div>
                  </div>
                  <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-indigo-700">{TABS[tab].label}</span>
                </div>
                <div className="min-w-0 p-4 sm:p-5">
                {!selected ? <EmptyState title={TABS[tab].empty} detail="Requisitions appear here after GSO Staff completes the stock check." /> : <>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5"><RequestSummary request={selected} statusLabel={chipFor(selected).label} statusTone={chipFor(selected).tone} /></div>
                  {selected.staffReviewedAt && <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
                    <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-blue-700">Checked by GSO Staff</p>
                    <p className="mt-0.5 text-[0.68rem] font-semibold text-slate-700">{selected.staffReviewedBy || 'GSO Staff'} · {formatDateTime(selected.staffReviewedAt)}</p>
                    {selected.staffReviewNote && <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-700"><span className="font-extrabold">Note: </span>{selected.staffReviewNote}</p>}
                  </div>}

                  {tabFor(selected) === 'approval'
                    ? <DecisionPanel key={selected.id} request={selected} onSaved={(message) => void afterChange(message)} />
                    : <>
                      <ReadOnlyLines request={selected} />
                      {tabFor(selected) === 'finance' && <SendToFinancePanel key={selected.id} request={selected} onSaved={(message) => void afterChange(message)} />}
                      {['staff', 'closed'].includes(tabFor(selected)) && <div className="mt-4"><Banner tone="info">{staffStageText(selected)}</Banner></div>}
                    </>}
                  <FinanceTrail request={selected} />
                  <HistoryList request={selected} />
                </>}
                </div>
              </section>
            </div>
          </section>
      </div>
    </GsoHeadPageFrame>
  )
}
