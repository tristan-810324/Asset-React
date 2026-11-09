import { useEffect, useState, type FormEvent } from 'react'
import RequesterLayout from './requesterlayout'
import { cancelMyRequest, getMyRequest, requestAssetReturn, respondToRequest, REQUEST_TYPE_LABELS, type ServiceRequest } from './requesterApi'

const statusTone = (status: string) => ['Approved', 'Ready for Pickup', 'Returned', 'Completed', 'Closed', 'GSO Endorsed'].includes(status) ? 'bg-emerald-50 text-emerald-700' : ['Rejected', 'Cancelled', 'For Repair', 'Finance Handoff Failed'].includes(status) ? 'bg-rose-50 text-rose-700' : status === 'Needs Information' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700'

const purchaseLineStatus: Record<string, string> = {
  WAITING_STAFF_REVIEW: 'GSO Staff checking stock',
  WAITING_GSO_HEAD: 'Waiting for GSO Head approval',
  NEEDS_INFORMATION: 'Waiting for your reply',
  READY_FOR_STAFF: 'Reserved · GSO Staff preparing issuance',
  PARTIAL_STOCK: 'Part reserved · rest being purchased',
  WAITING_FINANCE: 'Purchase approved · going to Finance',
  WAITING_FOR_PURCHASE: 'Being purchased by GSO',
  HANDOVER_PENDING: 'Waiting for item handover',
  PARTIALLY_ISSUED: 'Partially issued',
  ISSUED: 'Issued',
  REJECTED: 'Declined',
  CANCELLED: 'Cancelled',
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.map((entry) => typeof entry === 'object' ? Object.values(entry as Record<string, unknown>).filter(Boolean).join(' · ') : String(entry)).join('; ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function RequestDetail() {
  const id = window.location.pathname.split('/').pop() || ''
  const [request, setRequest] = useState<ServiceRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  async function refresh() {
    try { setRequest(await getMyRequest(id)); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang request.') }
    finally { setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh() }, [id, refresh])

  async function act(action: 'cancel' | 'return' | 'respond', event?: FormEvent) {
    event?.preventDefault()
    if (!request) return
    setBusy(true); setError('')
    try {
      const updated = action === 'cancel' ? await cancelMyRequest(request.id) : action === 'return' ? await requestAssetReturn(request.id) : await respondToRequest(request.id, message)
      setRequest(updated); setMessage('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hindi na-update ang request.') }
    finally { setBusy(false) }
  }

  return <RequesterLayout title="Request details" subtitle="Your reference, submitted details, and request timeline.">
    <a href="/requester/my-requests" className="text-xs font-extrabold text-blue-700 hover:underline">← My Requests</a>
    {loading ? <div className="grid min-h-64 place-items-center text-sm font-bold text-slate-400">Loading request…</div> : !request ? <div role="alert" className="mt-5 rounded-2xl border border-rose-100 bg-white p-6 text-sm font-bold text-rose-700">{error || 'Hindi makita ang request.'}</div> : <>
      <section className="relative mt-4 overflow-hidden rounded-3xl bg-[#09244a] p-5 text-white shadow-xl shadow-blue-950/15 sm:p-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="absolute -right-12 top-1/2 hidden h-48 w-48 -translate-y-1/2 rounded-full border-22 border-white/5 sm:block" />
        <div className="relative"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[0.62rem] font-extrabold uppercase tracking-[0.15em] text-blue-200">{REQUEST_TYPE_LABELS[request.requestType]}</p><h1 className="mt-2 text-xl font-black sm:text-2xl">{request.referenceNo}</h1><p className="mt-1 text-sm font-medium text-blue-100">{request.title}</p></div><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-extrabold">{request.status}</span></div>
        <p className="mt-4 text-xs text-blue-100">Submitted {new Date(request.createdAt).toLocaleString('en-PH')}</p></div>
      </section>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
      {request.requestType === 'PURCHASE_REQUISITION' && (request.gsoHeadEndorsedAt || request.financeEmail) && <section className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 sm:p-5"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-100 text-indigo-700">✉</span><div><h2 className="text-sm font-black text-indigo-950">GSO Head & Finance tracking</h2><p className="mt-0.5 text-[0.68rem] text-indigo-800">External Finance handoff recorded by GSO Head.</p></div></div><dl className="mt-4 grid gap-3 sm:grid-cols-2"><div><dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-indigo-700">GSO endorsement</dt><dd className="mt-1 text-xs font-semibold text-slate-700">{request.gsoHeadEndorsedAt ? new Date(request.gsoHeadEndorsedAt).toLocaleString('en-PH') : 'Pending'}</dd></div><div><dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-indigo-700">Finance email handoff</dt><dd className="mt-1 text-xs font-semibold text-slate-700">{request.financeSentAt ? new Date(request.financeSentAt).toLocaleString('en-PH') : request.status === 'Finance Handoff Pending' ? 'Sending…' : request.financeEmail ? 'Retry available in GSO Head workspace' : 'Not sent yet'}</dd></div></dl></section>}
      {request.status === 'Needs Information' && <form onSubmit={(event) => void act('respond', event)} className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5"><h2 className="text-sm font-black text-amber-900">GSO needs more information</h2><p className="mt-1 text-xs text-amber-800">Reply here; the request will return to Submitted for review.</p><textarea className="mt-3 min-h-24 w-full rounded-xl border border-amber-200 bg-white p-3 text-sm outline-none focus:ring-4 focus:ring-amber-100" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write your response…" required maxLength={2000} /><button disabled={busy} className="mt-3 rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send response'}</button></form>}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.75fr]">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6"><div className="border-b border-slate-100 pb-4"><h2 className="text-base font-black text-slate-900">Submitted details</h2><p className="mt-1 text-xs font-medium text-slate-500">Information included with this request.</p></div><dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">{Object.entries(request.formData).filter(([key]) => key !== 'responseMessages' && !(request.requestType === 'PURCHASE_REQUISITION' && key === 'items')).map(([key, value]) => <div key={key} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 p-3"><dt className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-400">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}</dt><dd className="mt-1 wrap-break-word text-xs font-semibold leading-relaxed text-slate-700">{displayValue(value)}</dd></div>)}</dl>
          {request.requestType === 'PURCHASE_REQUISITION' && request.purchaseLines && request.purchaseLines.length > 0 && <div className="mt-6"><div className="flex items-end justify-between gap-2 border-b border-slate-100 pb-3"><div><h3 className="text-sm font-extrabold text-slate-800">Requested items</h3><p className="mt-1 text-[0.65rem] text-slate-500">Item progress is tracked separately.</p></div><span className="text-[0.62rem] font-bold text-slate-400">{request.purchaseLines.length} item(s)</span></div><div className="mt-3 space-y-2">{request.purchaseLines.map((line) => <article key={line.id} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-extrabold text-slate-800">{line.itemName} <span className="font-semibold text-slate-500">× {line.requestedQuantity}</span></p><p className="mt-1 text-[0.65rem] text-slate-500">{line.category}</p></div><span className={`rounded-full px-2.5 py-1 text-[0.58rem] font-extrabold ${line.routeStatus === 'ISSUED' ? 'bg-emerald-50 text-emerald-700' : line.routeStatus === 'REJECTED' || line.routeStatus === 'CANCELLED' ? 'bg-rose-50 text-rose-700' : line.routeStatus === 'NEEDS_INFORMATION' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700'}`}>{purchaseLineStatus[line.routeStatus] || 'In progress'}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.62rem] text-slate-600"><span>Reserved: {line.reservedQuantity}</span>{line.financeQuantity > 0 && <span>Finance: {line.financeQuantity}</span>}{line.issuedQuantity > 0 && <span>Issued: {line.issuedQuantity}</span>}</div>{line.specifications && <p className="mt-2 whitespace-pre-wrap text-[0.65rem] leading-relaxed text-slate-600">{line.specifications}</p>}{line.reviewNote && ['REJECTED', 'NEEDS_INFORMATION'].includes(line.routeStatus) && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[0.65rem] leading-relaxed text-slate-700"><span className="font-extrabold">{line.routeStatus === 'REJECTED' ? 'Reason: ' : 'GSO question: '}</span>{line.reviewNote}</p>}</article>)}</div></div>}
          {request.assets.length > 0 && <div className="mt-6"><h3 className="text-sm font-extrabold text-slate-800">Borrowed items</h3><div className="mt-3 space-y-2">{request.assets.map((asset) => <div key={asset.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-slate-50 p-3"><div><p className="text-xs font-extrabold text-slate-800">{asset.itemName}</p><p className="mt-1 text-[0.65rem] text-slate-500">{asset.itemCode} · {asset.quantity} {asset.unitOfMeasure}</p></div><div className="text-right text-[0.65rem] text-slate-600">{asset.dueDate ? `Due ${asset.dueDate}` : 'Not yet issued'}{asset.conditionOut && <span className="block mt-1">Condition out: {asset.conditionOut}</span>}</div></div>)}</div></div>}
          {(request.formData.responseMessages?.length ?? 0) > 0 && <div className="mt-6"><h3 className="text-sm font-extrabold text-slate-800">Your responses</h3>{(request.formData.responseMessages ?? []).map((reply, index) => <p key={`${reply.createdAt}-${index}`} className="mt-2 rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-slate-700">{reply.message}</p>)}</div>}
        </section>
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6"><div className="border-b border-slate-100 pb-4"><h2 className="text-base font-black text-slate-900">Status timeline</h2><p className="mt-1 text-xs font-medium text-slate-500">Follow each review and handoff recorded for this request.</p></div><ol className="mt-5 space-y-0">{request.history.map((event, index) => <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0"><span className="relative mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50"><span className="h-2 w-2 rounded-full bg-blue-600" />{index < request.history.length - 1 && <span className="absolute left-1/2 top-5 h-full w-px -translate-x-1/2 bg-slate-200" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[0.6rem] font-extrabold ${statusTone(event.status)}`}>{event.status}</span><time className="text-[0.6rem] font-semibold text-slate-400">{new Date(event.changedAt).toLocaleString('en-PH')}</time></div>{event.note && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{event.note}</p>}{event.changedBy && <p className="mt-1 text-[0.62rem] font-bold text-slate-400">Updated by {event.changedBy}</p>}</div></li>)}</ol>
          <div className="mt-6 border-t border-slate-100 pt-4"><p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-400">Next step</p><p className="mt-1 text-xs leading-relaxed text-slate-600">{request.status === 'Needs Information' ? 'Reply to the GSO question above.' : request.requestType === 'PURCHASE_REQUISITION' && request.status === 'Submitted' ? 'GSO Staff will check stock for each item first.' : request.requestType === 'PURCHASE_REQUISITION' && request.status === 'Under Review' ? 'GSO Staff checked stock. Some items are waiting for GSO Head approval.' : request.requestType === 'PURCHASE_REQUISITION' && request.status === 'Approved' ? 'Your approved items are reserved. GSO Staff will prepare the issuance.' : request.requestType === 'PURCHASE_REQUISITION' && request.status === 'GSO Endorsed' ? 'The GSO Head approved buying the items not in stock. The purchase request goes to Finance next.' : request.requestType === 'PURCHASE_REQUISITION' && request.status === 'Finance Handoff Pending' ? 'The requisition PDF is being sent to Finance.' : request.requestType === 'PURCHASE_REQUISITION' && request.status === 'Finance Handoff Failed' ? 'The GSO Head can retry the Finance email.' : request.requestType === 'PURCHASE_REQUISITION' && request.status === 'Sent to Finance' ? 'GSO Staff is buying the items. You will be told when they are ready for release.' : request.status === 'Ready for Pickup' ? 'Coordinate pickup with GSO and bring your school ID.' : request.status === 'Issued' ? 'Keep the item safe and submit a return request when you bring it back to GSO.' : request.status === 'Return Requested' ? 'Wait for GSO to physically inspect and confirm the return.' : ['Rejected', 'Cancelled', 'Returned', 'Completed', 'Closed'].includes(request.status) ? 'This request is closed. Contact GSO if you need help.' : 'Wait for the next GSO status update.'}</p></div>
          <div className="mt-4 flex flex-wrap gap-2">{['Submitted', 'Needs Information'].includes(request.status) && <button disabled={busy} onClick={() => void act('cancel')} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-extrabold text-rose-600 hover:bg-rose-50 disabled:opacity-50">Cancel request</button>}{request.requestType === 'BORROWING' && request.status === 'Issued' && <button disabled={busy} onClick={() => void act('return')} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-blue-700 disabled:opacity-50">Request return</button>}</div>
        </section>
      </div>
    </>}
  </RequesterLayout>
}
