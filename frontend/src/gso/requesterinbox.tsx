import { useEffect, useMemo, useState } from 'react'
import { listGsoRequests, REQUEST_TYPE_LABELS, updateGsoRequestStatus, type ServiceRequest } from '../borrowers/requesterApi'

const typeOptions = [
  ['BORROWING', 'Borrowing'],
  ['FACILITY_USE', 'Facility use'],
  ['JOB_REQUEST', 'Job / service'],
  ['PURCHASE_REQUISITION', 'Purchase'],
  ['LOSS_DAMAGE_REPORT', 'Loss / damage'],
]

const actionsFor = (request: ServiceRequest) => {
  const common = ['Submitted', 'Under Review', 'Needs Information'].includes(request.status)
    ? ['Under Review', 'Needs Information', 'Approved', 'Rejected']
    : []
  if (request.requestType === 'BORROWING') {
    if (request.status === 'Approved') return ['Ready for Pickup']
    if (request.status === 'Ready for Pickup') return ['Issued']
    if (request.status === 'Return Requested') return ['Returned', 'For Repair']
    if (request.status === 'For Repair') return ['Returned']
    if (request.status === 'Returned') return ['Closed']
  } else if (request.requestType === 'JOB_REQUEST') {
    if (request.status === 'Approved') return ['In Progress']
    if (request.status === 'In Progress') return ['Completed']
    if (request.status === 'Completed') return ['Closed']
  } else if (request.status === 'Approved') {
    return request.requestType === 'LOSS_DAMAGE_REPORT' ? ['In Progress', 'Completed', 'Closed'] : ['Completed', 'Closed']
  } else if (request.status === 'In Progress' || request.status === 'Completed') {
    return request.status === 'In Progress' ? ['Completed'] : ['Closed']
  }
  return common
}

const tone = (status: string) => ['Approved', 'Ready for Pickup', 'Returned', 'Completed', 'Closed'].includes(status) ? 'bg-emerald-50 text-emerald-700' : ['Rejected', 'Cancelled', 'For Repair'].includes(status) ? 'bg-rose-50 text-rose-700' : status === 'Needs Information' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700'
const dateInputToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function RequesterRequestInbox() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [conditionOut, setConditionOut] = useState('Good')
  const [conditionIn, setConditionIn] = useState('Good')
  const [busyStatus, setBusyStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  async function loadRequests() {
    try {
      const data = await listGsoRequests({ type, status, search })
      setRequests(data)
      setSelectedId((current) => data.some((request) => request.id === current) ? current : data[0]?.id || '')
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang GSO request inbox.')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRequests() }, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [type, status, search, loadRequests])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewNote('')
    setDueDate('')
    setConditionOut('Good')
    setConditionIn('Good')
  }, [selectedId])

  const selected = useMemo(() => requests.find((request) => request.id === selectedId) || null, [requests, selectedId])

  async function updateStatus(nextStatus: string) {
    if (!selected) return
    const issueDueDate = dueDate || selected.formData.returnDate || ''
    if (nextStatus === 'Issued' && issueDueDate < dateInputToday()) {
      setDueDate('')
      setError('Pumili ng due date na ngayon o sa hinaharap bago i-record ang issuance.')
      return
    }
    setBusyStatus(nextStatus); setError(''); setMessage('')
    try {
      const updated = await updateGsoRequestStatus(selected.id, {
        status: nextStatus,
        note: reviewNote,
        ...(nextStatus === 'Issued' ? { dueDate: issueDueDate, conditionOut } : {}),
        ...(nextStatus === 'Returned' || nextStatus === 'For Repair' ? { conditionIn: nextStatus === 'For Repair' && conditionIn === 'Good' ? 'Needs Repair' : conditionIn } : {}),
      })
      setRequests((current) => current.map((request) => request.id === updated.id ? updated : request))
      setReviewNote('')
      setMessage(`${updated.referenceNo} updated to ${updated.status}.`)
      if (nextStatus === 'Issued') setDueDate('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hindi na-update ang request.') }
    finally { setBusyStatus('') }
  }

  const summary = [
    { label: 'New / in review', count: requests.filter((request) => ['Submitted', 'Under Review'].includes(request.status)).length, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Needs requester info', count: requests.filter((request) => request.status === 'Needs Information').length, tone: 'bg-amber-50 text-amber-800' },
    { label: 'Approved / active', count: requests.filter((request) => ['Approved', 'Ready for Pickup', 'Issued', 'Return Requested', 'In Progress'].includes(request.status)).length, tone: 'bg-emerald-50 text-emerald-700' },
  ]

  return <section className="mt-6 overflow-hidden rounded-2xl border border-blue-200/70 bg-white shadow-md shadow-blue-950/5" aria-label="Live requester submissions">
    <div className="border-b border-slate-100 bg-linear-to-r from-blue-50/90 via-white to-white px-5 py-5 sm:px-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-blue-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live database queue</span><h2 className="mt-2 text-lg font-black tracking-tight text-slate-900">Requester submissions</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">Review borrower and school-service forms submitted from the browser portal.</p></div><button type="button" onClick={() => { setLoading(true); void loadRequests() }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 shadow-sm hover:bg-slate-50">Refresh queue</button></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">{summary.map((item) => <div key={item.label} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2.5"><span className="text-[0.66rem] font-bold text-slate-500">{item.label}</span><span className={`grid h-7 min-w-7 place-items-center rounded-lg px-1 text-xs font-black ${item.tone}`}>{item.count}</span></div>)}</div>
    </div>
    <div className="grid xl:grid-cols-[0.95fr_1.05fr]">
      <div className="border-b border-slate-100 p-4 sm:p-5 xl:border-b-0 xl:border-r">
        <div className="grid gap-2 sm:grid-cols-3"><select aria-label="Filter by request type" value={type} onChange={(event) => setType(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-[0.68rem] font-bold text-slate-600 outline-none focus:border-blue-400"><option value="">All request types</option>{typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-[0.68rem] font-bold text-slate-600 outline-none focus:border-blue-400"><option value="">All statuses</option>{['Submitted','Under Review','Needs Information','Approved','Rejected','Ready for Pickup','Issued','Return Requested','Returned','For Repair','In Progress','Completed','Closed','Cancelled'].map((item) => <option key={item}>{item}</option>)}</select><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference / requester" className="h-10 min-w-0 rounded-xl border border-slate-200 px-3 text-[0.68rem] font-semibold outline-none focus:border-blue-400" /></div>
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-[0.68rem] font-bold text-rose-700">{error}</p>}
        {message && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-[0.68rem] font-bold text-emerald-700">{message}</p>}
        <div className="mt-3 max-h-144 overflow-y-auto rounded-xl border border-slate-100">
          {loading ? <div className="grid min-h-40 place-items-center text-xs font-bold text-slate-400">Loading submissions…</div> : requests.length === 0 ? <div className="grid min-h-40 place-items-center px-5 text-center text-xs font-semibold text-slate-500">No persisted requester submissions match these filters.</div> : requests.map((request) => <button key={request.id} type="button" onClick={() => { setSelectedId(request.id); setReviewNote('') }} className={`block w-full border-b border-slate-100 p-3.5 text-left last:border-0 hover:bg-blue-50/50 ${selectedId === request.id ? 'bg-blue-50/70' : 'bg-white'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{request.referenceNo}</p><p className="mt-1 truncate text-[0.66rem] font-bold text-slate-600">{request.title}</p><p className="mt-1 truncate text-[0.6rem] text-slate-400">{request.requesterName} · {request.requesterEmail}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[0.56rem] font-extrabold ${tone(request.status)}`}>{request.status}</span></div><p className="mt-2 text-[0.58rem] font-semibold text-slate-400">{REQUEST_TYPE_LABELS[request.requestType]} · {new Date(request.createdAt).toLocaleDateString('en-PH')}</p></button>)}
        </div>
      </div>
      <div className="p-4 sm:p-5">
        {!selected ? <div className="grid min-h-80 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-500">Select a persisted request to review its details.</div> : <>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">{REQUEST_TYPE_LABELS[selected.requestType]}</p><h3 className="mt-1 text-base font-black text-slate-900">{selected.referenceNo}</h3><p className="mt-1 text-xs font-semibold text-slate-600">{selected.requesterName} · {selected.requesterEmail}</p><p className="mt-1 text-[0.62rem] text-slate-400">Submitted {new Date(selected.createdAt).toLocaleString('en-PH')}</p></div><span className={`rounded-full px-2.5 py-1.5 text-[0.62rem] font-extrabold ${tone(selected.status)}`}>{selected.status}</span></div>
          <dl className="mt-4 grid max-h-52 grid-cols-1 gap-2 overflow-y-auto rounded-xl bg-slate-50 p-3 sm:grid-cols-2">{Object.entries(selected.formData).filter(([key]) => key !== 'responseMessages').map(([key, value]) => <div key={key} className="min-w-0 rounded-lg bg-white p-2.5"><dt className="text-[0.55rem] font-extrabold uppercase tracking-wide text-slate-400">{key.replace(/([A-Z])/g, ' $1')}</dt><dd className="mt-1 wrap-break-word text-[0.65rem] font-semibold leading-relaxed text-slate-700">{Array.isArray(value) ? value.map((entry) => typeof entry === 'object' ? Object.values(entry).join(' · ') : String(entry)).join('; ') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '—')}</dd></div>)}</dl>
          {selected.assets.length > 0 && <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3"><p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-700">Linked inventory</p>{selected.assets.map((asset) => <p key={asset.id} className="mt-1 text-[0.68rem] font-bold text-slate-700">{asset.itemName} ({asset.itemCode}) · {asset.quantity} {asset.unitOfMeasure}{asset.dueDate ? ` · Due ${asset.dueDate}` : ''}</p>)}</div>}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className="block"><span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Review note / decision reason</span><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} className="min-h-20 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" placeholder="Required for Needs Information and Rejected; otherwise optional." /></label>
            {actionsFor(selected).includes('Issued') && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Due date</span><input type="date" min={dateInputToday()} value={dueDate || (selected.formData.returnDate >= dateInputToday() ? selected.formData.returnDate : '')} onChange={(event) => setDueDate(event.target.value)} required className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold outline-none focus:border-blue-400" /></label><label><span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Condition on issue</span><select value={conditionOut} onChange={(event) => setConditionOut(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-blue-400">{['New','Good','Fair'].map((item) => <option key={item}>{item}</option>)}</select></label></div>}
            {actionsFor(selected).some((action) => ['Returned', 'For Repair'].includes(action)) && <label className="mt-3 block"><span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Condition on return</span><select value={conditionIn} onChange={(event) => setConditionIn(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-blue-400">{['New','Good','Fair','Needs Repair','Under Maintenance','Unserviceable'].map((item) => <option key={item}>{item}</option>)}</select></label>}
            <div className="mt-3 flex flex-wrap gap-2">{actionsFor(selected).map((action) => <button key={action} type="button" disabled={Boolean(busyStatus)} onClick={() => void updateStatus(action)} className={`rounded-xl px-3 py-2.5 text-[0.65rem] font-extrabold disabled:cursor-wait disabled:opacity-50 ${action === 'Rejected' ? 'border border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100' : action === 'Needs Information' ? 'border border-amber-100 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>{busyStatus === action ? 'Saving…' : action}</button>)}</div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">History</p><div className="mt-2 max-h-28 space-y-2 overflow-y-auto">{selected.history.map((event) => <div key={event.id} className="flex flex-wrap items-center gap-2 text-[0.6rem]"><span className={`rounded-full px-2 py-1 font-extrabold ${tone(event.status)}`}>{event.status}</span><span className="text-slate-500">{event.note}</span><span className="ml-auto text-slate-400">{new Date(event.changedAt).toLocaleDateString('en-PH')}</span></div>)}</div></div>
        </>}
      </div>
    </div>
  </section>
}
