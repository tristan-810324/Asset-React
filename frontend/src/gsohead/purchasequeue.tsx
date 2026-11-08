import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ServiceRequest } from '../requesters/requesterApi'
import {
  listPurchaseRequisitions,
  recordFinanceResponse,
  reviewPurchaseRequisition,
  sendPurchaseRequisitionToFinance,
  type FinanceDecision,
} from './gsoheadApi'

const statuses = [
  'Submitted', 'Under Review', 'Needs Information', 'Rejected', 'GSO Endorsed',
  'Finance Handoff Pending', 'Finance Handoff Failed', 'Sent to Finance', 'Finance Response Recorded',
]

const statusTone = (status: string) => {
  if (['GSO Endorsed', 'Finance Response Recorded'].includes(status)) return 'bg-emerald-50 text-emerald-700'
  if (status === 'Sent to Finance') return 'bg-indigo-50 text-indigo-700'
  if (status === 'Finance Handoff Pending') return 'bg-blue-50 text-blue-700'
  if (['Rejected', 'Finance Handoff Failed'].includes(status)) return 'bg-rose-50 text-rose-700'
  if (status === 'Needs Information') return 'bg-amber-50 text-amber-800'
  return 'bg-slate-100 text-slate-700'
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.map((item) => {
    if (typeof item === 'object' && item !== null) {
      const row = item as Record<string, unknown>
      const intendedStaff = Array.isArray(row.intendedStaff)
        ? row.intendedStaff.flatMap((person) => {
          if (typeof person !== 'object' || person === null) return []
          const name = (person as Record<string, unknown>).employeeName
          return typeof name === 'string' && name.trim() ? [name] : []
        })
        : []
      const category = typeof row.category === 'string' ? row.category.replace(/_/g, ' ') : ''
      const itemName = typeof row.itemName === 'string' ? row.itemName : ''
      const catalogItemCode = typeof row.catalogItemCode === 'string' ? row.catalogItemCode : ''
      return [
        itemName ? `Item: ${itemName}${catalogItemCode ? ` (${catalogItemCode})` : ''}` : '',
        category ? `Category: ${category}` : '',
        [row.quantity ? `${row.quantity} ×` : '', row.description || row.name || ''].filter(Boolean).join(' '),
        intendedStaff.length ? `Planned staff: ${intendedStaff.join(', ')}` : 'Planned staff: To be assigned during Main Issuance',
      ].filter(Boolean).join(' · ')
    }
    return String(item)
  }).join('; ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const financeEmailFor = (request: ServiceRequest | null) => request?.financeEmail || ''

export default function PurchaseRequisitionQueue() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [financeEmail, setFinanceEmail] = useState('')
  const [financeDecision, setFinanceDecision] = useState<FinanceDecision>('Approved')
  const [financeReference, setFinanceReference] = useState('')
  const [financeNote, setFinanceNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadQueue = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await listPurchaseRequisitions({ status: statusFilter, search })
      setRequests(rows)
      setSelectedId((current) => rows.some((request) => request.id === current) ? current : rows[0]?.id || '')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load purchase requisitions.')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadQueue() }, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [loadQueue, search])

  const selected = useMemo(() => requests.find((request) => request.id === selectedId) || null, [requests, selectedId])
  const counts = useMemo(() => ({
    new: requests.filter((request) => ['Submitted', 'Under Review'].includes(request.status)).length,
    needsInfo: requests.filter((request) => request.status === 'Needs Information').length,
    endorsed: requests.filter((request) => ['GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed'].includes(request.status)).length,
    sent: requests.filter((request) => ['Sent to Finance', 'Finance Response Recorded'].includes(request.status)).length,
  }), [requests])

  function chooseRequest(request: ServiceRequest) {
    setSelectedId(request.id)
    setReviewNote('')
    setFinanceEmail(financeEmailFor(request))
    setFinanceDecision('Approved')
    setFinanceReference('')
    setFinanceNote('')
    setError('')
    setNotice('')
  }

  function applyUpdate(updated: ServiceRequest, message: string) {
    setRequests((current) => current.map((request) => request.id === updated.id ? updated : request))
    setSelectedId(statusFilter && updated.status !== statusFilter ? '' : updated.id)
    setReviewNote('')
    setFinanceEmail(financeEmailFor(updated))
    setNotice(message)
    setError('')
    if (statusFilter && updated.status !== statusFilter) void loadQueue()
  }

  async function review(status: 'Under Review' | 'Needs Information' | 'Rejected' | 'GSO Endorsed') {
    if (!selected) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await reviewPurchaseRequisition(selected.id, status, reviewNote.trim())
      const message = result.requesterNotified === false
        ? `${result.request.referenceNo} updated to ${result.request.status}, but the requester email could not be sent. Check SMTP configuration.`
        : `${result.request.referenceNo} updated to ${result.request.status}.${result.requesterNotified ? ' Requester notified by email.' : ''}`
      applyUpdate(result.request, message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update the purchase requisition.')
    } finally {
      setBusy(false)
    }
  }

  async function sendToFinance() {
    if (!selected) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await sendPurchaseRequisitionToFinance(selected.id, financeEmail.trim())
      const message = result.requesterNotified === false
        ? `Email sent to Finance for ${result.request.referenceNo}, but the requester update email could not be sent.`
        : `Email sent to Finance for ${result.request.referenceNo}.${result.requesterNotified ? ' The requester was also notified.' : ''}`
      applyUpdate(result.request, message)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to send the requisition to Finance.'
      await loadQueue()
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  async function saveFinanceResponse() {
    if (!selected) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await recordFinanceResponse(selected.id, {
        decision: financeDecision,
        reference: financeReference.trim(),
        note: financeNote.trim(),
      })
      const message = result.requesterNotified === false
        ? `Finance response recorded for ${result.request.referenceNo}, but the requester email could not be sent.`
        : `Finance response recorded for ${result.request.referenceNo}.${result.requesterNotified ? ' The requester was notified.' : ''}`
      applyUpdate(result.request, message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to record the Finance response.')
    } finally {
      setBusy(false)
    }
  }

  const visibleFormData = selected ? Object.entries(selected.formData).filter(([key]) => !['requesterAttestedAt'].includes(key)) : []

  return (
    <section id="purchase-requisition-queue" className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div><h2 className="text-base font-black tracking-tight text-slate-900">EmployeeHead submissions</h2><p className="mt-1 text-xs text-slate-500">Review, endorse, and send purchase requisitions to Finance.</p></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:w-136">
            <label className="relative"><span className="sr-only">Search requisitions</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, requester, item" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label>
            <select aria-label="Filter purchase requisitions by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"><option value="">All PR statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-2 xl:grid-cols-4 sm:p-4" aria-label="Purchase requisition summary">
        {[
          { label: 'New / in review', count: counts.new, tone: 'bg-blue-50 text-blue-700' },
          { label: 'Needs requester info', count: counts.needsInfo, tone: 'bg-amber-50 text-amber-800' },
          { label: 'GSO endorsed', count: counts.endorsed, tone: 'bg-emerald-50 text-emerald-700' },
          { label: 'With Finance', count: counts.sent, tone: 'bg-indigo-50 text-indigo-700' },
        ].map((item) => <article key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5"><span className="text-[0.68rem] font-bold text-slate-500">{item.label}</span><span className={`grid h-7 min-w-7 place-items-center rounded-lg px-1 text-xs font-black ${item.tone}`}>{item.count}</span></article>)}
      </div>

      {error && <p role="alert" className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 sm:mx-5">{error}</p>}
      {notice && <p role="status" className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700 sm:mx-5">{notice}</p>}

      <div className="grid min-w-0 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="min-w-0 border-b border-slate-100 p-3 sm:p-4 lg:border-b-0 lg:border-r">
          <div className="max-h-168 overflow-y-auto rounded-xl border border-slate-100">
            {loading ? <div className="grid min-h-44 place-items-center text-xs font-semibold text-slate-400">Loading requisitions…</div>
              : requests.length === 0 ? <div className="grid min-h-44 place-items-center px-4 text-center"><div><p className="text-sm font-extrabold text-slate-700">No purchase requisitions found</p><p className="mt-1 text-xs text-slate-500">Submitted EmployeeHead requests will appear here.</p></div></div>
                : requests.map((request) => (
                  <button key={request.id} type="button" onClick={() => chooseRequest(request)} className={`block w-full border-b border-slate-100 p-3.5 text-left transition last:border-0 hover:bg-indigo-50/50 ${selectedId === request.id ? 'bg-indigo-50/70' : 'bg-white'}`}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{request.referenceNo}</p><p className="mt-1 truncate text-[0.68rem] font-bold text-slate-600">{request.title}</p><p className="mt-1 truncate text-[0.62rem] text-slate-400">{request.requesterName} · {request.formData.departmentOrganization || request.requesterEmail}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[0.56rem] font-extrabold ${statusTone(request.status)}`}>{request.status}</span></div>
                    <p className="mt-2 text-[0.6rem] font-semibold text-slate-400">Submitted {new Date(request.createdAt).toLocaleDateString('en-PH')}</p>
                  </button>
                ))}
          </div>
        </div>

        <div className="min-w-0 p-4 sm:p-5">
          {!selected ? <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center"><div><p className="text-sm font-extrabold text-slate-700">Select a requisition to review</p><p className="mt-1 text-xs text-slate-500">Requester, department, requested items, endorsement, and Finance handoff details will appear here.</p></div></div> : <>
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-indigo-700">Purchase Requisition</p><h3 className="mt-1 text-base font-black text-slate-900">{selected.referenceNo}</h3><p className="mt-1 text-xs font-semibold text-slate-600">{selected.requesterName} · {selected.formData.requesterEmployeeCode || selected.requesterEmail}</p><p className="mt-1 text-[0.62rem] text-slate-500">{selected.formData.departmentOrganization || 'Department unavailable'}{selected.formData.requesterPosition ? ` · ${selected.formData.requesterPosition}` : ''}</p></div><span className={`rounded-full px-2.5 py-1.5 text-[0.62rem] font-extrabold ${statusTone(selected.status)}`}>{selected.status}</span></div>

            <div className="mt-4 border-t border-slate-100 pt-4"><div className="flex items-center justify-between gap-3"><h4 className="text-xs font-extrabold text-slate-800">Submitted requisition</h4><span className="text-[0.62rem] font-semibold text-slate-400">{visibleFormData.length} fields</span></div><dl className="mt-3 grid max-h-64 grid-cols-1 gap-2 overflow-y-auto rounded-xl bg-slate-50 p-3 sm:grid-cols-2">{visibleFormData.map(([key, value]) => <div key={key} className="min-w-0 rounded-lg border border-slate-100 bg-white p-2.5"><dt className="text-[0.56rem] font-extrabold uppercase tracking-wide text-slate-400">{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</dt><dd className="mt-1 wrap-break-word text-[0.68rem] font-semibold leading-relaxed text-slate-700">{displayValue(value)}</dd></div>)}</dl></div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              {selected.status === 'Submitted' && <button type="button" disabled={busy} onClick={() => void review('Under Review')} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-indigo-700 disabled:opacity-50">{busy ? 'Saving…' : 'Start review'}</button>}
              {selected.status === 'Under Review' && <div className="space-y-3"><label className="block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Review note / reason</span><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} className="min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Required when requesting more information or rejecting; optional for endorsement." /></label><div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !reviewNote.trim()} onClick={() => void review('Needs Information')} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-extrabold text-amber-800 disabled:opacity-50">Request information</button><button type="button" disabled={busy || !reviewNote.trim()} onClick={() => void review('Rejected')} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-extrabold text-rose-700 disabled:opacity-50">Reject</button><button type="button" disabled={busy} onClick={() => void review('GSO Endorsed')} className="rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50">Endorse requisition</button></div></div>}
              {selected.status === 'Needs Information' && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Waiting for the EmployeeHead/requester to respond. The request returns to the review queue after they reply.</p>}
              {['GSO Endorsed', 'Finance Handoff Failed'].includes(selected.status) && <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4"><p className="text-xs font-extrabold text-indigo-900">Send endorsed requisition to Finance</p><p className="mt-1 text-[0.68rem] leading-relaxed text-indigo-800">Finance has no dashboard. This sends the requisition details by email and records the handoff in its history.</p>{selected.status === 'Finance Handoff Failed' && <p className="mt-2 text-[0.68rem] font-bold text-rose-700">The last email attempt failed. Correct the email or retry below.</p>}<label className="mt-3 block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Finance email</span><input type="email" value={financeEmail} onChange={(event) => setFinanceEmail(event.target.value)} maxLength={254} required className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="finance@school.edu.ph" /></label><button type="button" disabled={busy || !financeEmail.trim()} onClick={() => void sendToFinance()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50"><svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>{busy ? 'Sending…' : 'Send to Finance'}</button></div>}
              {selected.status === 'Finance Handoff Pending' && <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-800">Sending the requisition to {selected.financeEmail}. If it remains pending, contact the system administrator before retrying to avoid a duplicate email.</p>}
              {selected.status === 'Sent to Finance' && <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4"><p className="text-xs font-extrabold text-indigo-900">Sent to Finance</p><p className="mt-1 text-[0.68rem] text-indigo-800">{selected.financeEmail} · {selected.financeSentAt ? new Date(selected.financeSentAt).toLocaleString('en-PH') : 'time recorded'}</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Finance decision</span><select value={financeDecision} onChange={(event) => setFinanceDecision(event.target.value as FinanceDecision)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-indigo-400"><option>Approved</option><option>Needs Changes</option><option>Rejected</option></select></label><label className="block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Finance reference</span><input value={financeReference} onChange={(event) => setFinanceReference(event.target.value)} maxLength={200} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-indigo-400" placeholder="Optional memo / email reference" /></label></div><label className="mt-3 block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Response notes</span><textarea value={financeNote} onChange={(event) => setFinanceNote(event.target.value)} maxLength={2000} className="min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium outline-none focus:border-indigo-400" placeholder="Required for Needs Changes or Rejected" /></label><button type="button" disabled={busy || (financeDecision !== 'Approved' && !financeNote.trim())} onClick={() => void saveFinanceResponse()} className="mt-3 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? 'Saving…' : 'Record Finance response'}</button></div>}
              {selected.status === 'Finance Response Recorded' && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-extrabold text-emerald-900">Finance response recorded: {selected.financeDecision}</p><p className="mt-1 text-[0.68rem] text-emerald-800">{selected.financeReference || 'No Finance reference recorded'} · {selected.financeResponseAt ? new Date(selected.financeResponseAt).toLocaleString('en-PH') : ''}</p>{selected.financeResponseNote && <p className="mt-2 text-xs leading-relaxed text-emerald-900">{selected.financeResponseNote}</p>}</div>}
              {selected.status === 'Rejected' && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">This purchase requisition was rejected by the GSO Head.</p>}
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">History</p><div className="mt-2 max-h-36 space-y-2 overflow-y-auto">{selected.history.length ? selected.history.map((event) => <div key={event.id} className="flex flex-wrap items-center gap-2 text-[0.6rem]"><span className={`rounded-full px-2 py-1 font-extrabold ${statusTone(event.status)}`}>{event.status}</span><span className="text-slate-500">{event.note}</span><span className="ml-auto text-slate-400">{new Date(event.changedAt).toLocaleDateString('en-PH')}</span></div>) : <p className="text-xs text-slate-400">No status history yet.</p>}</div></div>
          </>}
        </div>
      </div>
    </section>
  )
}
