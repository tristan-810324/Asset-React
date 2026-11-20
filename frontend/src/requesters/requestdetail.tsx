import { useCallback, useEffect, useState, type FormEvent } from 'react'
import RequesterLayout from './requesterlayout'
import { cancelMyRequest, confirmMyServiceRequest, getMyRequest, reopenMyServiceRequest, requestAssetReturn, respondToRequest, REQUEST_TYPE_LABELS, type ServiceRequest } from './requesterApi'
import { formatDate, formatDateTime, requestStatusLabel } from './requesterrequestutils'
import { RequestProgressSection } from '../components/requestpath'
import { serviceRequestView, serviceRouteLabel, serviceStatusLabel, serviceStatusTone } from './serviceWorkflow'
import LossDamageDecisionPanel, { LossDamageItemList } from './lossdamagedecisionpanel'

const statusTone = (status: string) => ['Approved', 'Ready for Pickup', 'Returned', 'Completed', 'Closed', 'GSO Endorsed'].includes(status) ? 'bg-emerald-50 text-emerald-700' : ['Rejected', 'Cancelled', 'For Repair'].includes(status) ? 'bg-rose-50 text-rose-700' : status === 'Needs Information' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700'

const purchaseLineStatus: Record<string, string> = {
  WAITING_STAFF_REVIEW: 'GSO Staff checking stock',
  WAITING_GSO_HEAD: 'Waiting for GSO Head approval',
  NEEDS_INFORMATION: 'Waiting for your reply',
  READY_FOR_STAFF: 'Reserved · held with the complete request',
  PARTIAL_STOCK: 'Partial delivery received · waiting for full quantity',
  WAITING_FINANCE: 'Purchase approved · going to Finance',
  WAITING_FOR_PURCHASE: 'Waiting for the full quantity',
  HANDOVER_PENDING: 'Waiting for item handover',
  PARTIALLY_ISSUED: 'Partially issued',
  ISSUED: 'Issued',
  REJECTED: 'Declined',
  CANCELLED: 'Cancelled',
}

// A facility request leaves out fields that were not filled in, such as "Other activity type" when the nature is not Others.
function isEmptyValue(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0)
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.map((entry) => typeof entry === 'object' ? Object.values(entry as Record<string, unknown>).filter(Boolean).join(' · ') : String(entry)).join('; ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// A facility item: reserved, released (due at the end of the activity), or returned with any damaged or missing units.
function facilityItemStatus(asset: ServiceRequest['assets'][number]) {
  const missing = Number(asset.lostQuantity || 0)
  const damaged = Number(asset.damagedQuantity || 0)
  const repaired = Number(asset.repairedQuantity || 0)
  const unserviceable = Number(asset.unserviceableQuantity || 0)
  if (asset.returnedAt) {
    // Only the unserviceable units are charged; repaired units cost nothing.
    return [
      `Returned ${asset.returnedQuantity ?? 0} of ${asset.quantity}`,
      damaged > 0 ? `${damaged} damaged · ${repaired} repaired · ${unserviceable} unserviceable` : '',
      missing > 0 ? `${missing} missing · ${asset.settlementStatus === 'Pending' ? 'Not settled' : asset.settlementStatus}` : '',
    ].filter(Boolean).join(' · ')
  }
  if (asset.issuedAt) return asset.dueDate ? `Released · Return by ${formatDate(asset.dueDate)}` : 'Released'
  return 'Reserved'
}

function nextRequestStep(request: ServiceRequest) {
  if (request.requestType === 'JOB_REQUEST') {
    const service = serviceRequestView(request)
    const team = serviceRouteLabel(service.routeTeam)
    if (request.status === 'Needs Information') return `${team} needs more information before work can begin.`
    if (request.status === 'Submitted') return `${team} will review and claim this service request.`
    if (request.status === 'Under Review') return `${team} is reviewing the request details.`
    if (request.status === 'In Progress') return `${team} is working on the reported issue.`
    if (request.status === 'Awaiting Requester Confirmation') return 'Confirm whether the completed work resolved the issue.'
    if (request.status === 'Completed') return 'The service team marked this work complete.'
    if (request.status === 'Closed') return 'This service request is closed.'
  }
  if (request.status === 'Needs Information') return 'Reply to the GSO question above.'
  if (request.requestType === 'PURCHASE_REQUISITION') {
    if (request.status === 'Submitted') return 'GSO Staff will check stock for the complete request.'
    if (request.status === 'Under Review') return 'The GSO Head will make one decision for the complete request. Available stock stays reserved.'
    if (request.status === 'Approved') return 'The complete request is approved and fully reserved. GSO Staff can prepare the full issuance.'
    if (request.status === 'GSO Endorsed') return 'The GSO Head approved the complete request. GSO Staff will print the signed PDF and hand the shortage form to Finance.'
    if (['Finance Handoff Pending', 'Finance Handoff Failed'].includes(request.status)) return 'The signed PDF is ready for GSO Staff to print and hand to Finance.'
    if (request.status === 'Sent to Finance') return 'GSO Staff is buying the shortages. No part of the request will be issued until every requested item is available.'
    if (request.status === 'Issued') return 'The items were issued to the recipients. No further action is needed.'
  }
  if (request.requestType === 'FACILITY_USE') {
    const missing = request.assets.some((asset) => asset.settlementStatus === 'Pending')
    if (request.status === 'Approved') return request.assets.length > 0 ? 'Approved. Pick up the items at the GSO office. GSO will give you a slip.' : 'Approved. Use the venue on the scheduled date and time.'
    if (request.status === 'Issued') return 'Keep the slip. Bring it back with the items to the GSO office right after the activity.'
    if (request.status === 'For Repair') {
      const unserviceable = request.assets.some((asset) => Number(asset.damagedQuantity || 0) > 0 && asset.conditionIn === 'Unserviceable')
      return unserviceable ? 'GSO received an item marked Unserviceable. GSO is reviewing how to resolve it.' : 'GSO received the items. Some of them need repair.'
    }
    if (request.status === 'Returned') return missing ? 'Some items were not returned. Settle this with GSO. You cannot request equipment until it is settled.' : 'GSO received the items and will close this request.'
    if (request.status === 'Completed') return 'GSO completed this facility request. The returned items are recorded in Item Master Data.'
  }
  if (request.status === 'Ready for Pickup') return 'Coordinate pickup with GSO and bring your school ID.'
  if (request.status === 'Issued') return 'Keep the item safe. Bring it back to GSO by the return date; GSO will inspect it and confirm the return.'
  if (request.status === 'Return Requested') return 'Wait for GSO to inspect the item and confirm the return.'
  if (request.status === 'Rejected') return 'GSO declined this request, so no items will be lent. Submit a new request if you still need them.'
  if (['Cancelled', 'Returned', 'Completed', 'Closed'].includes(request.status)) return 'This request is closed. Contact GSO if you need help.'
  return 'Wait for the next GSO status update.'
}

// Where each unit of a purchase line went: the recorded handover if issued, otherwise the designation the requester entered.
type LineDestination = { location: string; person: string; quantity: number }
function lineDestinations(request: ServiceRequest, line: NonNullable<ServiceRequest['purchaseLines']>[number]): { label: string; rows: LineDestination[] } {
  const grouped = (rows: LineDestination[]) => {
    const totals = new Map<string, LineDestination>()
    rows.forEach((row) => {
      const key = `${row.location}|${row.person}`
      const existing = totals.get(key)
      if (existing) existing.quantity += row.quantity
      else totals.set(key, { ...row })
    })
    return [...totals.values()].filter((row) => row.quantity > 0)
  }
  const issued = grouped((line.issuedRecipients || []).map((recipient) => ({
    location: recipient.useLocation || '',
    person: recipient.employeeName || recipient.employeeCode || '',
    quantity: Number(recipient.quantity) || 0,
  })))
  if (issued.length > 0) return { label: 'Assigned to', rows: issued }
  const items = Array.isArray(request.formData.items) ? request.formData.items : []
  const raw = items[line.lineNumber - 1]
  const planned = raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).plannedRecipients)
    ? ((raw as Record<string, unknown>).plannedRecipients as Array<Record<string, unknown>>)
    : []
  const rows = planned.map((recipient) => ({
    location: typeof recipient.useLocation === 'string' ? recipient.useLocation : '',
    person: typeof recipient.employeeName === 'string' ? recipient.employeeName : typeof recipient.employeeCode === 'string' ? recipient.employeeCode : '',
    quantity: Number(recipient.quantity) || 0,
  })).filter((row) => row.quantity > 0)
  return { label: 'Designated to', rows: grouped(rows) }
}

// Purchase requisition fields shown under Submitted details; the rest stay out of the requester's view.
const PURCHASE_SUBMITTED_FIELDS = new Set(['purpose', 'urgency', 'requiredDate', 'requesterName', 'requesterAttestedAt', 'requesterEmployeeCode', 'departmentOrganization'])

function ServiceLifecycle({ request }: { request: ServiceRequest }) {
  const service = serviceRequestView(request)
  const steps = ['Submitted', 'Under Review', 'In Progress', 'Awaiting your confirmation', 'Closed']
  const current = request.status === 'Closed' ? 4
    : request.status === 'Awaiting Requester Confirmation' || request.status === 'Completed' ? 3
      : request.status === 'In Progress' ? 2
        : request.status === 'Under Review' || request.status === 'Needs Information' ? 1
          : 0

  return (
    <section className="mt-5 rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-5" aria-labelledby="service-progress-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Service workflow</p>
          <h2 id="service-progress-heading" className="mt-1 text-sm font-black text-slate-900">{serviceRouteLabel(service.routeTeam)}</h2>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[0.6rem] font-extrabold ${serviceStatusTone(request.status)}`}>{serviceStatusLabel(request.status)}</span>
      </div>
      <ol aria-label="Service request progress" className="mt-4 grid grid-cols-5 gap-1 sm:gap-2">
        {steps.map((step, index) => {
          const complete = index < current || current === 4
          const active = index === current && !complete
          return <li key={step} className="min-w-0 text-center">
            <span className={`mx-auto grid h-7 w-7 place-items-center rounded-full border-2 text-[0.6rem] font-black ${complete ? 'border-emerald-500 bg-emerald-500 text-white' : active ? 'border-blue-600 bg-blue-50 text-blue-700 ring-4 ring-blue-100' : 'border-slate-200 bg-white text-slate-400'}`}>{complete ? '✓' : index + 1}</span>
            <span className={`mt-1.5 block text-[0.55rem] font-extrabold leading-tight sm:text-[0.6rem] ${complete || active ? 'text-slate-800' : 'text-slate-400'}`}>{step}</span>
          </li>
        })}
      </ol>
      <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2">
        <div><p className="text-[0.56rem] font-extrabold uppercase tracking-wide text-slate-400">Category</p><p className="mt-1 text-xs font-bold text-slate-700">{service.category}</p></div>
        <div><p className="text-[0.56rem] font-extrabold uppercase tracking-wide text-slate-400">Target date</p><p className="mt-1 text-xs font-bold text-slate-700">{service.targetDate ? formatDate(service.targetDate) : 'Not set'}{service.deadlineLabel ? <span className="ml-1.5 font-semibold text-slate-500">· {service.deadlineLabel}</span> : null}</p></div>
      </div>
    </section>
  )
}

export default function RequestDetail() {
  const id = window.location.pathname.split('/').pop() || ''
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [request, setRequest] = useState<ServiceRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reopenMessage, setReopenMessage] = useState('')
  const [showReopenForm, setShowReopenForm] = useState(false)
  const [busy, setBusy] = useState(false)
  // Set by the request form right after a successful submit (?submitted=1).
  const [justSubmitted, setJustSubmitted] = useState(() => new URLSearchParams(window.location.search).get('submitted') === '1')

  // Drop the flag from the address, so a page refresh does not show the alert again.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('submitted')) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const refresh = useCallback(async () => {
    try { setRequest(await getMyRequest(id)); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load this request.') }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => {
    // Defer the initial request until after this render; this avoids a synchronous state cascade
    // while keeping the existing loading state visible immediately.
    const initialLoad = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(initialLoad)
  }, [refresh])

  async function act(action: 'cancel' | 'return' | 'respond', event?: FormEvent) {
    event?.preventDefault()
    if (!request) return
    setBusy(true); setError('')
    try {
      const updated = action === 'cancel' ? await cancelMyRequest(request.id) : action === 'return' ? await requestAssetReturn(request.id) : await respondToRequest(request.id, message)
      setRequest(updated); setMessage('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this request.') }
    finally { setBusy(false) }
  }

  async function actOnService(action: 'confirm' | 'reopen', event?: FormEvent) {
    event?.preventDefault()
    if (!request) return
    if (action === 'reopen' && !reopenMessage.trim()) return
    setBusy(true); setError('')
    try {
      const updated = action === 'confirm'
        ? await confirmMyServiceRequest(request.id)
        : await reopenMyServiceRequest(request.id, reopenMessage)
      setRequest(updated)
      setReopenMessage('')
      setShowReopenForm(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update this service request.')
    } finally { setBusy(false) }
  }

  const isServiceRequest = request?.requestType === 'JOB_REQUEST'
  const service = request && isServiceRequest ? serviceRequestView(request) : null
  const awaitingRequesterConfirmation = Boolean(request && isServiceRequest && (
    request.status === 'Awaiting Requester Confirmation'
    || (request.status === 'Completed' && service?.completionNote)
  ))

  return <RequesterLayout title="Request details" subtitle="Your reference, submitted details, and request timeline.">
    <a href="/requester/my-requests" className="text-xs font-extrabold text-blue-700 hover:underline">← My Requests</a>
    {loading ? <div className="grid min-h-64 place-items-center text-sm font-bold text-slate-400">Loading request…</div> : !request ? <div role="alert" className="mt-5 rounded-2xl border-2 border-rose-100 bg-white p-6 text-sm font-bold text-rose-700 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">{error || 'Request not found.'}</div> : <>
      {justSubmitted && <div role="status" className="mt-4 flex items-start justify-between gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3.5 shadow-md shadow-slate-300/35">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-sm font-black text-white">✓</span>
          <div>
            <p className="text-sm font-black text-emerald-900">Request submitted</p>
            <p className="mt-0.5 text-xs font-semibold text-emerald-800">Your reference is {request.referenceNo}. GSO will review it and notify you.</p>
          </div>
        </div>
        <button type="button" onClick={() => setJustSubmitted(false)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100">Close</button>
      </div>}
      <section className="relative mt-4 overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="absolute -right-12 top-1/2 hidden h-48 w-48 -translate-y-1/2 rounded-full border-22 border-white/5 sm:block" />
        <div className="relative"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[0.62rem] font-extrabold uppercase tracking-[0.15em] text-blue-200">{REQUEST_TYPE_LABELS[request.requestType]}</p><h1 className="mt-2 text-xl font-black sm:text-2xl">{request.referenceNo}</h1><p className="mt-1 text-sm font-medium text-blue-100">{request.title}</p></div><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-extrabold">{requestStatusLabel(request)}</span></div>
        <p className="mt-4 text-xs text-blue-100">Submitted {new Date(request.createdAt).toLocaleString('en-PH')}</p></div>
      </section>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
      {isServiceRequest && <ServiceLifecycle request={request} />}
      {awaitingRequesterConfirmation && service && <section className="mt-5 rounded-2xl border-2 border-emerald-200 bg-emerald-50/70 p-4 shadow-md shadow-emerald-900/5 sm:p-5" aria-labelledby="service-confirmation-heading">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-base font-black text-white">✓</span>
          <div className="min-w-0">
            <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-emerald-700">Work marked complete</p>
            <h2 id="service-confirmation-heading" className="mt-1 text-base font-black text-emerald-950">Is the issue resolved?</h2>
            <p className="mt-1 text-xs leading-relaxed text-emerald-900">Confirm only after checking the completed work. If the issue remains, send it back to the same service team with a short note.</p>
          </div>
        </div>
        {service.completionNote && <div className="mt-4 rounded-xl border border-emerald-200 bg-white/75 p-3"><p className="text-[0.58rem] font-extrabold uppercase tracking-wide text-emerald-700">Completion note</p><p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">{service.completionNote}</p></div>}
        {service.autoCloseAt && <p className="mt-3 text-[0.68rem] font-semibold leading-relaxed text-emerald-800">This request closes automatically on {formatDate(service.autoCloseAt)} if no response is submitted.</p>}
        {!showReopenForm ? <div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" disabled={busy} onClick={() => void actOnService('confirm')} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Updating…' : 'Yes, issue resolved'}</button><button type="button" disabled={busy} onClick={() => setShowReopenForm(true)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-200 bg-white px-4 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50">No, issue remains</button></div> : <form onSubmit={(event) => void actOnService('reopen', event)} className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3"><label className="block text-xs font-extrabold text-amber-900" htmlFor="reopen-service-message">What still needs attention?</label><textarea id="reopen-service-message" className="mt-2 min-h-24 w-full rounded-xl border border-amber-200 bg-white p-3 text-sm font-medium text-slate-800 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100" value={reopenMessage} onChange={(event) => setReopenMessage(event.target.value)} required maxLength={2000} placeholder="Describe the remaining issue so the team can continue the work." /><div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => { setShowReopenForm(false); setReopenMessage('') }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50">Cancel</button><button disabled={busy || !reopenMessage.trim()} className="min-h-10 rounded-xl bg-amber-700 px-3.5 text-xs font-extrabold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Sending…' : 'Reopen request'}</button></div></form>}
      </section>}
      {request.requestType === 'PURCHASE_REQUISITION' && ['Under Review', 'GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed', 'Sent to Finance'].includes(request.status) && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-950"><span className="font-extrabold">Whole-request hold:</span> GSO will not issue any requested item separately. If there is a shortage, stocked items stay reserved until every requested item is available.</div>}
      {(() => {
        const charged = request.assets.filter((asset) => asset.writeOffDecision === 'CHARGED')
        const waived = request.assets.filter((asset) => asset.writeOffDecision === 'WAIVED')
        if (charged.length === 0 && waived.length === 0) return null
        const total = charged.reduce((sum, asset) => sum + (Number(asset.writeOffEstimatedValue) || 0), 0)
        if (charged.length === 0) return <section className="mt-5 rounded-2xl border-2 border-emerald-200 bg-emerald-50/70 p-4 sm:p-5" aria-labelledby="writeoff-heading">
          <h2 id="writeoff-heading" className="text-sm font-black text-emerald-900">No payment needed</h2>
          <p className="mt-1 text-xs font-semibold text-emerald-800">GSO waived the damaged item{waived.length === 1 ? '' : 's'}: {waived.map((asset) => asset.itemName).join(', ')}.</p>
        </section>
        return <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5" aria-labelledby="writeoff-heading">
          <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-amber-800">To pay</p>
          <h2 id="writeoff-heading" className="mt-1 text-base font-black text-slate-900">Payment needed</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">Pay at the Finance office in person. The amount is set by Finance.</p>
          <ul className="mt-3 space-y-2">
            {charged.map((asset) => <li key={asset.id} className="rounded-xl border border-amber-200 bg-white p-3">
              <p className="text-sm font-extrabold text-slate-900">{asset.itemName} · {asset.writeOffEstimatedValue ? `Estimated ₱${Number(asset.writeOffEstimatedValue).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : 'Amount to be confirmed'}</p>
              <p className="mt-0.5 text-xs font-semibold text-slate-600">Reason: {asset.writeOffReason || '—'}</p>
            </li>)}
          </ul>
          <p className="mt-3 text-sm font-black text-slate-900">Total:₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
        </section>
      })()}
      {request.requestType === 'PURCHASE_REQUISITION' && request.gsoHeadEndorsedAt && <section className="mt-5 rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-100 text-indigo-700">✓</span><div><h2 className="text-sm font-black text-indigo-950">GSO Head & Finance handoff</h2></div></div><dl className="mt-4 grid gap-3 sm:grid-cols-2"><div><dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-indigo-700">GSO endorsement</dt><dd className="mt-1 text-xs font-semibold text-slate-700">{new Date(request.gsoHeadEndorsedAt).toLocaleString('en-PH')}</dd></div><div><dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-indigo-700">Printed handoff</dt><dd className="mt-1 text-xs font-semibold text-slate-700">{request.financeSentAt ? new Date(request.financeSentAt).toLocaleString('en-PH') : 'Signed PDF ready for GSO Staff'}</dd></div></dl></section>}
      {request.status === 'Needs Information' && <form onSubmit={(event) => void act('respond', event)} className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5"><h2 className="text-sm font-black text-amber-900">{isServiceRequest ? `${serviceRouteLabel(service?.routeTeam || null)} needs more information` : 'GSO needs more information'}</h2><p className="mt-1 text-xs text-amber-800">Reply here; the request will return to review.</p><textarea className="mt-3 min-h-24 w-full rounded-xl border border-amber-200 bg-white p-3 text-sm outline-none focus:ring-4 focus:ring-amber-100" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write your response…" required maxLength={2000} /><button disabled={busy} className="mt-3 rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send response'}</button></form>}
      {!isServiceRequest && <RequestProgressSection requestType={request.requestType} status={request.status} hasItems={request.assets.length > 0} />}
      {request.requestType === 'LOSS_DAMAGE_REPORT' && <LossDamageDecisionPanel requestId={request.id} requestStatus={request.status} />}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.75fr]">
        <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-5 sm:p-6 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5"><div className="border-b border-slate-100 pb-4"><h2 className="text-base font-black text-slate-900">Submitted details</h2></div><dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">{Object.entries(request.formData).filter(([key, value]) => key !== 'responseMessages' && !(request.requestType === 'LOSS_DAMAGE_REPORT' && key === 'items') &&!(request.requestType === 'FACILITY_USE' && isEmptyValue(value)) && !(request.requestType === 'PURCHASE_REQUISITION' && key === 'items') && !(request.requestType === 'JOB_REQUEST' && ['tasks', 'serviceCategory', 'serviceRoute', 'servicePriority', 'serviceOther'].includes(key)) && (request.requestType !== 'PURCHASE_REQUISITION' || PURCHASE_SUBMITTED_FIELDS.has(key))).map(([key, value]) => <div key={key} className="min-w-0 rounded-xl border-2 border-slate-300/80 bg-white p-4 shadow-sm"><dt className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-400">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}</dt><dd className="mt-1 wrap-break-word text-xs font-semibold leading-relaxed text-slate-700">{displayValue(value)}</dd></div>)}</dl>
          {isServiceRequest && service && <div className="mt-6"><div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-3"><div><h3 className="text-sm font-extrabold text-slate-800">Work items</h3><p className="mt-0.5 text-xs text-slate-500">Track the work included in this request.</p></div><span className="text-[0.62rem] font-bold text-slate-400">{service.tasks.length} item{service.tasks.length === 1 ? '' : 's'}</span></div><div className="mt-3 space-y-2">{service.tasks.length > 0 ? service.tasks.map((task, index) => <article key={task.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"><div className="flex items-start gap-3"><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.58rem] font-black ${task.completed ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white text-slate-500'}`}>{task.completed ? '✓' : index + 1}</span><div className="min-w-0"><p className="text-xs font-extrabold text-slate-800">{task.label}</p>{task.natureOfWork && <p className="mt-1 text-xs leading-relaxed text-slate-600">{task.natureOfWork}</p>}{task.note && <p className="mt-1.5 rounded-lg bg-white px-2.5 py-2 text-[0.65rem] font-semibold text-slate-600">{task.note}</p>}</div></div></article>) : <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">No separate work items were recorded for this request.</p>}</div></div>}
          {request.requestType === 'PURCHASE_REQUISITION' && request.purchaseLines && request.purchaseLines.length > 0 && <div className="mt-6"><div className="flex items-end justify-between gap-2 border-b border-slate-100 pb-3"><div><h3 className="text-sm font-extrabold text-slate-800">Requested items</h3></div><span className="text-[0.62rem] font-bold text-slate-400">{request.purchaseLines.length} item(s)</span></div><div className="mt-3 space-y-2">{request.purchaseLines.map((line) => <article key={line.id} className="rounded-xl border-2 border-slate-300/80 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-extrabold text-slate-800">{line.itemName} <span className="font-semibold text-slate-500">× {line.requestedQuantity}</span></p><p className="mt-1 text-[0.65rem] text-slate-500">{line.category}</p></div><span className={`rounded-full px-2.5 py-1 text-[0.58rem] font-extrabold ${line.routeStatus === 'ISSUED' ? 'bg-emerald-50 text-emerald-700' : line.routeStatus === 'REJECTED' || line.routeStatus === 'CANCELLED' ? 'bg-rose-50 text-rose-700' : line.routeStatus === 'NEEDS_INFORMATION' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700'}`}>{purchaseLineStatus[line.routeStatus] || 'In progress'}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.62rem] text-slate-600"><span>Reserved: {line.reservedQuantity}</span>{line.financeQuantity > 0 && <span>Finance: {line.financeQuantity}</span>}{line.issuedQuantity > 0 && <span>Issued: {line.issuedQuantity}</span>}</div>{line.specifications && <p className="mt-2 whitespace-pre-wrap text-[0.65rem] leading-relaxed text-slate-600">{line.specifications}</p>}{(() => { const destinations = lineDestinations(request, line); return destinations.rows.length > 0 && <div className="mt-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5"><p className="text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">{destinations.label}</p><ul className="mt-1.5 space-y-1">{destinations.rows.map((row, index) => <li key={index} className="flex items-center justify-between gap-3 text-[0.68rem]"><span className="min-w-0 font-semibold text-slate-800">{row.location || 'No location'}{row.person ? <span className="font-normal text-slate-500"> · {row.person}</span> : null}</span><span className="shrink-0 font-extrabold text-slate-800">{row.quantity} unit{row.quantity === 1 ? '' : 's'}</span></li>)}</ul></div> })()}{line.reviewNote && ['REJECTED', 'NEEDS_INFORMATION'].includes(line.routeStatus) && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[0.65rem] leading-relaxed text-slate-700"><span className="font-extrabold">{line.routeStatus === 'REJECTED' ? 'Reason: ' : 'GSO question: '}</span>{line.reviewNote}</p>}</article>)}</div></div>}
          {(request.returnedItems || []).length > 0 && <div className="mt-6"><h3 className="text-sm font-extrabold text-slate-800">Returned items</h3><ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">{(request.returnedItems || []).map((row) => <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-xs"><div className="min-w-0"><p className="font-extrabold text-slate-800">{row.itemName} <span className="font-semibold text-slate-500">· {row.tagCode || row.itemCode}</span></p><p className="mt-0.5 text-[0.65rem] text-slate-500">Returned by {row.employeeName} · {formatDateTime(row.returnedAt)}</p></div><div className="shrink-0 text-right"><p className="font-extrabold text-slate-800">{row.quantity} {row.unitOfMeasure}</p><p className="mt-0.5 text-[0.65rem] text-slate-500">{row.condition}</p></div></li>)}</ul></div>}
          {request.assets.length > 0 && <div className="mt-6"><h3 className="text-sm font-extrabold text-slate-800">Borrowed items</h3><div className="mt-3 space-y-2">{request.assets.map((asset) => <div key={asset.id} className={`flex flex-wrap justify-between gap-2 rounded-xl p-3 ${asset.writeOffDecision === 'CHARGED' ? 'border border-amber-200 bg-amber-50/60' : 'bg-slate-50'}`}><div><p className="text-xs font-extrabold text-slate-800">{asset.itemName}</p><p className="mt-1 text-[0.65rem] text-slate-500">{asset.itemCode} · {asset.quantity} {asset.unitOfMeasure}</p>{asset.writeOffDecision === 'CHARGED' && <p className="mt-2 inline-block rounded-md bg-amber-100 px-2 py-1 text-[0.65rem] font-extrabold text-amber-900">To pay · {asset.writeOffEstimatedValue ? `₱${Number(asset.writeOffEstimatedValue).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : 'amount to be confirmed'}</p>}{asset.writeOffDecision === 'CHARGED' && asset.writeOffReason && <p className="mt-1 text-[0.65rem] font-semibold text-slate-600">Reason: {asset.writeOffReason}</p>}{asset.writeOffDecision === 'WAIVED' && <p className="mt-2 text-[0.65rem] font-bold text-emerald-700">No payment needed (waived)</p>}</div><div className="text-right text-[0.65rem] text-slate-600">{request.requestType === 'FACILITY_USE' ? facilityItemStatus(asset) : asset.dueDate ? `Return by ${formatDate(asset.dueDate)}` : 'Not yet released'}{asset.conditionOut && <span className="block mt-1">Condition out: {asset.conditionOut}</span>}</div></div>)}</div></div>}
          {request.requestType === 'LOSS_DAMAGE_REPORT' && <LossDamageItemList request={request} />}
          {(request.formData.responseMessages?.length ?? 0) > 0 && <div className="mt-6"><h3 className="text-sm font-extrabold text-slate-800">Your responses</h3>{(request.formData.responseMessages ?? []).map((reply, index) => <p key={`${reply.createdAt}-${index}`} className="mt-2 rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-slate-700">{reply.message}</p>)}</div>}
        </section>
        <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-5 sm:p-6 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5"><div className="border-b border-slate-100 pb-4"><h2 className="text-base font-black text-slate-900">Status timeline</h2><p className="mt-1 text-xs font-medium text-slate-500">Latest review and handoff updates.</p></div><ol className="mt-4 space-y-0">{(showAllHistory ? request.history : request.history.slice(-3)).map((event, index, shown) => <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0"><span className="relative mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50"><span className="h-2 w-2 rounded-full bg-blue-600" />{index < shown.length - 1 && <span className="absolute left-1/2 top-5 h-full w-px -translate-x-1/2 bg-slate-200" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[0.6rem] font-extrabold ${statusTone(event.status)}`}>{event.status}</span><time className="text-[0.6rem] font-semibold text-slate-400">{new Date(event.changedAt).toLocaleString('en-PH')}</time></div>{event.note && <p title={event.note} className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">{event.note}</p>}{event.changedBy && <p className="mt-0.5 text-[0.62rem] font-bold text-slate-400">{event.changedBy}</p>}</div></li>)}</ol>{request.history.length > 3 && <button type="button" onClick={() => setShowAllHistory((open) => !open)} className="mt-3 text-xs font-extrabold text-blue-600 hover:underline">{showAllHistory ? 'Show latest steps only' : `Show all ${request.history.length} steps`}</button>}
          <div className="mt-6 border-t border-slate-100 pt-4"><p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-400">Next step</p><p className="mt-1 text-xs leading-relaxed text-slate-600">{nextRequestStep(request)}</p></div>
          <div className="mt-4 flex flex-wrap gap-2">{['Submitted', 'Needs Information'].includes(request.status) && <button disabled={busy} onClick={() => void act('cancel')} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-extrabold text-rose-600 hover:bg-rose-50 disabled:opacity-50">Cancel request</button>}{request.requestType === 'BORROWING' && request.status === 'Issued' && <button disabled={busy} onClick={() => void act('return')} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-blue-700 disabled:opacity-50">Request return</button>}</div>
        </section>
      </div>
    </>}
  </RequesterLayout>
}
