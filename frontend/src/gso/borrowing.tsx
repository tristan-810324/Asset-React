import { useCallback, useEffect, useMemo, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { listGsoRequests, updateGsoRequestStatus, type ServiceRequest } from '../requesters/requesterApi'

type QueueView = 'incoming' | 'active'

const incomingStatuses = new Set(['Submitted', 'Under Review', 'Needs Information', 'Approved', 'Ready for Pickup'])
const activeStatuses = new Set(['Issued', 'Return Requested', 'For Repair'])

const statusTone = (status: string) => {
  if (['Approved', 'Ready for Pickup'].includes(status)) return 'bg-emerald-50 text-emerald-700'
  if (status === 'Issued') return 'bg-blue-50 text-blue-700'
  if (['Needs Information', 'Return Requested'].includes(status)) return 'bg-amber-50 text-amber-800'
  if (['Rejected', 'For Repair'].includes(status)) return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-700'
}

const textValue = (request: ServiceRequest, key: string) => {
  const value = request.formData[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(date)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(date)
}

function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function requestedPurpose(request: ServiceRequest) {
  const purpose = textValue(request, 'purpose')
  if (purpose !== 'Other') return purpose || 'Not provided'
  const otherPurpose = textValue(request, 'otherPurpose')
  return otherPurpose ? `Other: ${otherPurpose}` : 'Other'
}

function requestedLocation(request: ServiceRequest) {
  const location = textValue(request, 'useLocation')
  const specificLocation = textValue(request, 'specificLocation')
  return [location, specificLocation].filter(Boolean).join(' · ') || 'Not provided'
}

function actionsFor(request: ServiceRequest) {
  if (request.status === 'Submitted') return [
    { status: 'Under Review', label: 'Start review', tone: 'secondary' },
    { status: 'Needs Information', label: 'Request information', tone: 'secondary' },
    { status: 'Approved', label: 'Approve request', tone: 'primary' },
    { status: 'Rejected', label: 'Reject', tone: 'danger' },
  ]
  if (request.status === 'Under Review') return [
    { status: 'Needs Information', label: 'Request information', tone: 'secondary' },
    { status: 'Approved', label: 'Approve request', tone: 'primary' },
    { status: 'Rejected', label: 'Reject', tone: 'danger' },
  ]
  if (request.status === 'Needs Information') return [
    { status: 'Under Review', label: 'Resume review', tone: 'secondary' },
    { status: 'Approved', label: 'Approve request', tone: 'primary' },
    { status: 'Rejected', label: 'Reject', tone: 'danger' },
  ]
  if (request.status === 'Approved') return [{ status: 'Ready for Pickup', label: 'Mark ready for pickup', tone: 'primary' }]
  if (request.status === 'Ready for Pickup') return [{ status: 'Issued', label: 'Record handover', tone: 'primary' }]
  return []
}

const actionClass = (tone: string) => {
  if (tone === 'primary') return 'bg-blue-600 text-white shadow-md shadow-blue-600/20 hover:bg-blue-700'
  if (tone === 'danger') return 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
  return 'border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700'
}

export default function BorrowingPage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [view, setView] = useState<QueueView>('incoming')
  const [search, setSearch] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [conditionOut, setConditionOut] = useState('Good')
  const [loading, setLoading] = useState(true)
  const [busyStatus, setBusyStatus] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listGsoRequests({ type: 'BORROWING', search: search.trim() })
      setRequests(data)
      setSelectedId((current) => data.some((request) => request.id === current) ? current : data[0]?.id || '')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load borrowing requests.')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRequests() }, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [loadRequests, search])

  const incomingRequests = useMemo(() => requests.filter((request) => incomingStatuses.has(request.status)), [requests])
  const activeRequests = useMemo(() => requests.filter((request) => activeStatuses.has(request.status)), [requests])
  const readyForPickupCount = useMemo(() => requests.filter((request) => ['Approved', 'Ready for Pickup'].includes(request.status)).length, [requests])
  const activeUnitCount = useMemo(() => activeRequests.reduce((total, request) => total + request.assets.reduce((sum, asset) => sum + Number(asset.quantity || 0), 0), 0), [activeRequests])
  const visibleRequests = view === 'incoming' ? incomingRequests : activeRequests
  const selected = useMemo(
    () => visibleRequests.find((request) => request.id === selectedId) || visibleRequests[0] || null,
    [selectedId, visibleRequests],
  )
  const selectedActions = selected ? actionsFor(selected) : []
  const requiresReviewNote = selectedActions.some((action) => ['Needs Information', 'Rejected'].includes(action.status))

  function showView(next: QueueView) {
    setView(next)
    setReviewNote('')
    setError('')
    setMessage('')
  }

  function selectRequest(id: string) {
    setSelectedId(id)
    setReviewNote('')
    setDueDate('')
    setConditionOut('Good')
    setError('')
    setMessage('')
  }

  async function changeStatus(nextStatus: string) {
    if (!selected) return
    const note = reviewNote.trim()
    if (['Needs Information', 'Rejected'].includes(nextStatus) && !note) {
      setError('Add a review note before sending this decision.')
      return
    }

    const effectiveDueDate = dueDate || textValue(selected, 'returnDate')
    if (nextStatus === 'Issued' && (!effectiveDueDate || effectiveDueDate < today())) {
      setError('Choose a return date on or after today before recording the handover.')
      return
    }

    setBusyStatus(nextStatus)
    setError('')
    setMessage('')
    try {
      const updated = await updateGsoRequestStatus(selected.id, {
        status: nextStatus,
        note,
        ...(nextStatus === 'Issued' ? { dueDate: effectiveDueDate, conditionOut } : {}),
      })
      setRequests((current) => current.map((request) => request.id === updated.id ? updated : request))
      setSelectedId(updated.id)
      setReviewNote('')
      if (nextStatus === 'Issued') {
        setView('active')
        setDueDate('')
      }
      setMessage(`${updated.referenceNo} is now ${updated.status}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update this borrowing request.')
    } finally {
      setBusyStatus('')
    }
  }

  return (
    <GsoPageFrame activePage="Borrowing Requests" searchPlaceholder="Search borrowing requests...">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GSO borrowing desk
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Borrowing Requests</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
            Review reusable-item requests and monitor items that are currently out for return.
          </p>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Borrowing request summary">
        <button type="button" onClick={() => showView('incoming')} className={`rounded-2xl border-2 p-4 text-left shadow-md shadow-slate-300/35 transition ${view === 'incoming' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-300/80 bg-white ring-1 ring-slate-900/5 hover:border-blue-200'}`}>
          <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Incoming requests</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{incomingRequests.length}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Needs review or pickup preparation</p>
        </button>
        <button type="button" onClick={() => showView('incoming')} className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 text-left transition hover:border-blue-200 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
          <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Ready for pickup</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{readyForPickupCount}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Approved requests awaiting handover</p>
        </button>
        <button type="button" onClick={() => showView('active')} className={`rounded-2xl border-2 p-4 text-left shadow-md shadow-slate-300/35 transition ${view === 'active' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-300/80 bg-white ring-1 ring-slate-900/5 hover:border-blue-200'}`}>
          <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Active borrowings</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{activeRequests.length}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{activeUnitCount} unit{activeUnitCount === 1 ? '' : 's'} currently out</p>
        </button>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="borrowing-queue-title">
        <div className="border-b border-slate-100 bg-slate-50/65 px-4 py-4 sm:px-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Live request queue</p>
              <h2 id="borrowing-queue-title" className="mt-1 text-lg font-black tracking-tight text-slate-900">{view === 'incoming' ? 'Incoming borrowing requests' : 'Active borrowings'}</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{view === 'incoming' ? 'Review, approve, and record the handover of reusable items.' : 'Track borrowed items until the return is processed in Returns & Records.'}</p>
            </div>
            <button type="button" onClick={() => void loadRequests()} disabled={loading} className="self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60 lg:self-auto">
              {loading ? 'Refreshing…' : 'Refresh queue'}
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex w-full rounded-xl border border-slate-200 bg-white p-1 sm:w-auto">
              <button type="button" onClick={() => showView('incoming')} aria-pressed={view === 'incoming'} className={`flex-1 rounded-lg px-3 py-2 text-xs font-extrabold transition sm:flex-none ${view === 'incoming' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>Incoming</button>
              <button type="button" onClick={() => showView('active')} aria-pressed={view === 'active'} className={`flex-1 rounded-lg px-3 py-2 text-xs font-extrabold transition sm:flex-none ${view === 'active' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>Active borrowings</button>
            </div>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, requester, or item" aria-label="Search borrowing requests" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:max-w-xs" />
          </div>
        </div>

        {error && <p role="alert" className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-bold text-rose-700 sm:mx-5">{error}</p>}
        {message && <p role="status" className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-bold text-emerald-700 sm:mx-5">{message}</p>}

        <div className="grid min-w-0 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="min-w-0 border-b border-slate-100 p-4 sm:p-5 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{view === 'incoming' ? 'Requests to handle' : 'Items currently out'}</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.62rem] font-extrabold text-slate-700">{visibleRequests.length}</span>
            </div>
            <div className="inventory-list-scrollbar mt-3 max-h-160 overflow-y-auto rounded-xl border border-slate-100">
              {loading ? (
                <div className="grid min-h-48 place-items-center px-5 text-center text-xs font-semibold text-slate-400">Loading borrowing requests…</div>
              ) : visibleRequests.length === 0 ? (
                <div className="grid min-h-48 place-items-center px-5 text-center">
                  <div>
                    <p className="text-sm font-extrabold text-slate-700">No {view === 'incoming' ? 'incoming borrowing requests' : 'active borrowings'}.</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{view === 'incoming' ? 'New reusable-item requests will appear here.' : 'Issued reusable items will appear here until they are returned.'}</p>
                  </div>
                </div>
              ) : visibleRequests.map((request) => {
                const itemSummary = request.assets.map((asset) => `${asset.itemName} × ${asset.quantity}`).join(' · ')
                const returnDate = request.assets.find((asset) => asset.dueDate)?.dueDate || textValue(request, 'returnDate')
                const isSelected = selected?.id === request.id
                return (
                  <button key={request.id} type="button" onClick={() => selectRequest(request.id)} className={`block w-full border-b border-slate-100 p-3.5 text-left transition last:border-0 ${isSelected ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-500' : 'bg-white hover:bg-blue-50/50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-slate-900">{request.referenceNo}</p>
                        <p className="mt-1 truncate text-[0.7rem] font-bold text-slate-700">{request.requesterName}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[0.58rem] font-extrabold ${statusTone(request.status)}`}>{request.status}</span>
                    </div>
                    <p className="mt-2 truncate text-[0.64rem] font-semibold text-slate-500">{itemSummary || 'No linked items'}</p>
                    <p className="mt-1 text-[0.6rem] font-medium text-slate-400">{view === 'active' ? `Return by ${formatDate(returnDate)}` : `Submitted ${formatDate(request.createdAt)}`}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="min-w-0 p-4 sm:p-5">
            {!selected ? (
              <div className="grid min-h-96 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center">
                <div>
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-xl font-black text-blue-600">↗</span>
                  <p className="mt-3 text-sm font-extrabold text-slate-700">Select a borrowing request</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">The requester, item, schedule, and handover details will appear here.</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="min-w-0">
                    <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Borrowing request</p>
                    <h3 className="mt-1 text-lg font-black text-slate-900">{selected.referenceNo}</h3>
                    <p className="mt-1 wrap-break-word text-xs font-semibold text-slate-600">{selected.requesterName} · {selected.requesterEmail}</p>
                    <p className="mt-1 text-[0.62rem] text-slate-400">Submitted {formatDateTime(selected.createdAt)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1.5 text-[0.62rem] font-extrabold ${statusTone(selected.status)}`}>{selected.status}</span>
                </div>

                <section className="mt-4" aria-labelledby="borrow-plan-title">
                  <div className="flex items-center justify-between gap-3">
                    <h4 id="borrow-plan-title" className="text-xs font-extrabold text-slate-800">Borrowing plan</h4>
                    <span className="text-[0.62rem] font-semibold text-slate-400">{selected.assets.length} item{selected.assets.length === 1 ? '' : 's'}</span>
                  </div>
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      ['Date needed', formatDate(textValue(selected, 'neededDate'))],
                      ['Expected return', formatDate(textValue(selected, 'returnDate'))],
                      ['Purpose', requestedPurpose(selected)],
                      ['Place of use', requestedLocation(selected)],
                      ['Return contact', textValue(selected, 'returnResponsibleName') || selected.requesterName],
                      ['Contact number', textValue(selected, 'returnResponsibleContact') || 'Not provided'],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                        <dt className="text-[0.56rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
                        <dd className="mt-1 wrap-break-word text-xs font-semibold leading-relaxed text-slate-700">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {textValue(selected, 'remarks') && <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3"><p className="text-[0.56rem] font-extrabold uppercase tracking-wide text-slate-400">Additional details</p><p className="mt-1 wrap-break-word text-xs font-semibold leading-relaxed text-slate-700">{textValue(selected, 'remarks')}</p></div>}
                </section>

                <section className="mt-4 border-t border-slate-100 pt-4" aria-labelledby="borrowed-items-title">
                  <h4 id="borrowed-items-title" className="text-xs font-extrabold text-slate-800">Requested items</h4>
                  <div className="mt-3 space-y-2">
                    {selected.assets.map((asset) => (
                      <div key={asset.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3">
                        <div className="min-w-0">
                          <p className="wrap-break-word text-xs font-extrabold text-slate-800">{asset.itemName}</p>
                          <p className="mt-1 text-[0.64rem] font-semibold text-slate-500">{asset.itemCode} · {asset.quantity} {asset.unitOfMeasure}</p>
                        </div>
                        <div className="text-right text-[0.62rem] font-semibold text-slate-500">
                          {asset.issuedAt && <p>Issued {formatDate(asset.issuedAt)}</p>}
                          {(asset.dueDate || textValue(selected, 'returnDate')) && <p className="mt-1">Return by {formatDate(asset.dueDate || textValue(selected, 'returnDate'))}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {selected.status === 'Return Requested' && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><span className="font-extrabold">Return requested.</span> The borrower has asked to return these items. Continue the physical inspection in <a href="/gso/borrowing-returns" className="font-extrabold text-blue-700 underline">Borrowing Returns</a>.</div>}
                {selected.status === 'For Repair' && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-900"><span className="font-extrabold">Item for repair.</span> Review its repair status in <a href="/gso/to-be-repaired" className="font-extrabold text-blue-700 underline">Repair &amp; Maintenance</a>.</div>}

                {selected.history.length > 0 && <section className="mt-4 border-t border-slate-100 pt-4" aria-labelledby="borrow-history-title">
                  <h4 id="borrow-history-title" className="text-xs font-extrabold text-slate-800">Recent activity</h4>
                  <ul className="mt-3 space-y-2">
                    {[...selected.history].slice(-3).reverse().map((event) => <li key={event.id} className="rounded-xl bg-slate-50 px-3 py-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[0.68rem] font-extrabold text-slate-800">{event.status}</span><span className="text-[0.58rem] font-semibold text-slate-400">{formatDateTime(event.changedAt)}</span></div>{event.note && <p className="mt-1 text-[0.65rem] leading-relaxed text-slate-600">{event.note}</p>}</li>)}
                  </ul>
                </section>}

                {selectedActions.length > 0 && <section className="mt-4 border-t border-slate-100 pt-4" aria-labelledby="borrow-actions-title">
                  <h4 id="borrow-actions-title" className="text-xs font-extrabold text-slate-800">GSO action</h4>
                  <label className="mt-3 block"><span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Review note {requiresReviewNote ? '(required for information request or rejection)' : '(optional)'}</span><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} className="min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" placeholder="Add an approval note, question, or reason for the decision." /></label>

                  {selected.status === 'Ready for Pickup' && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Return date</span><input type="date" min={today()} value={dueDate || textValue(selected, 'returnDate')} onChange={(event) => setDueDate(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label><label><span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Condition on issue</span><select value={conditionOut} onChange={(event) => setConditionOut(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">{['New', 'Good', 'Fair'].map((condition) => <option key={condition}>{condition}</option>)}</select></label></div>}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedActions.map((action) => <button key={action.status} type="button" disabled={Boolean(busyStatus)} onClick={() => void changeStatus(action.status)} className={`rounded-xl px-3.5 py-2.5 text-xs font-extrabold transition disabled:cursor-wait disabled:opacity-60 ${actionClass(action.tone)}`}>{busyStatus === action.status ? 'Saving…' : action.label}</button>)}
                  </div>
                </section>}
              </div>
            )}
          </div>
        </div>
      </section>
    </GsoPageFrame>
  )
}
