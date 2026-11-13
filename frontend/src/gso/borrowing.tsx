import { useCallback, useEffect, useMemo, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { listGsoRequests, updateGsoRequestStatus, type RequestAsset, type ServiceRequest } from '../requesters/requesterApi'
import { BorrowingPath } from '../components/requestpath'

type QueueView = 'incoming' | 'active'
type Action = { status: string; label: string; tone: 'primary' | 'secondary' | 'danger' }

// Approved and Ready for Pickup only appear on borrowings made before approval started the loan.
const incomingStatuses = new Set(['Submitted', 'Under Review', 'Needs Information', 'Approved', 'Ready for Pickup'])
const activeStatuses = new Set(['Issued', 'Return Requested', 'For Repair'])
const outStatuses = new Set(['Issued', 'Return Requested'])
const returnConditionOptions = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable']
const repairConditions = new Set(['Needs Repair', 'Under Maintenance', 'Unserviceable'])

const statusTone = (status: string) => {
  if (['Approved', 'Ready for Pickup'].includes(status)) return 'bg-emerald-50 text-emerald-700'
  if (status === 'Issued') return 'bg-blue-50 text-blue-700'
  if (['Return Requested', 'Needs Information'].includes(status)) return 'bg-amber-50 text-amber-800'
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

function dueDateOf(request: ServiceRequest) {
  return request.assets.find((asset) => asset.dueDate)?.dueDate || textValue(request, 'returnDate')
}

const isOverdue = (request: ServiceRequest) => outStatuses.has(request.status) && Boolean(dueDateOf(request)) && dueDateOf(request) < today()

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

const reviewAction: Action = { status: 'Under Review', label: 'Start review', tone: 'secondary' }
const infoAction: Action = { status: 'Needs Information', label: 'Request information', tone: 'secondary' }
const approveAction: Action = { status: 'Approved', label: 'Approve and release', tone: 'primary' }
const rejectAction: Action = { status: 'Rejected', label: 'Reject', tone: 'danger' }

function actionsFor(request: ServiceRequest): Action[] {
  if (request.status === 'Submitted') return [reviewAction, infoAction, approveAction, rejectAction]
  if (request.status === 'Under Review') return [infoAction, approveAction, rejectAction]
  if (request.status === 'Needs Information') return [{ status: 'Under Review', label: 'Resume review', tone: 'secondary' }, approveAction, rejectAction]
  // Older borrowings waiting for a pickup step: starting them releases the item.
  if (['Approved', 'Ready for Pickup'].includes(request.status)) return [{ status: 'Issued', label: 'Start borrowing', tone: 'primary' }]
  return []
}

const actionClass = (tone: Action['tone']) => {
  if (tone === 'primary') return 'bg-blue-600 text-white shadow-md shadow-blue-600/20 hover:bg-blue-700'
  if (tone === 'danger') return 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
  return 'border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700'
}

function InspectReturnDialog({ request, assets, busy, error, onCancel, onConfirm }: {
  request: ServiceRequest
  assets: RequestAsset[]
  busy: boolean
  error: string
  onCancel: () => void
  onConfirm: (conditions: Record<string, string>, note: string) => void
}) {
  const [conditions, setConditions] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [localError, setLocalError] = useState('')
  const damaged = assets.some((asset) => repairConditions.has(conditions[String(asset.id)] || ''))
  const allChosen = assets.every((asset) => Boolean(conditions[String(asset.id)]))

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onCancel])

  function submit() {
    if (!allChosen) return setLocalError('Choose the returned condition for every item.')
    if (damaged && !note.trim()) return setLocalError('Describe the damage in the note.')
    setLocalError('')
    onConfirm(conditions, note.trim())
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="inspect-return-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-2xl sm:p-6">
        <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Inspect return</p>
        <h2 id="inspect-return-title" className="mt-1 text-lg font-black text-slate-900">{request.referenceNo}</h2>
        <p className="mt-1 text-xs font-semibold text-slate-600">{request.requesterName}</p>

        <div className="mt-4 space-y-2">
          {assets.map((asset) => (
            <div key={asset.id} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-[1fr_11rem] sm:items-center">
              <div className="min-w-0">
                <p className="wrap-break-word text-xs font-extrabold text-slate-800">{asset.itemName}</p>
                <p className="mt-1 text-[0.64rem] font-semibold text-slate-500">{asset.itemCode} · {asset.quantity} {asset.unitOfMeasure}</p>
              </div>
              <label>
                <span className="sr-only">Returned condition of {asset.itemName}</span>
                <select value={conditions[String(asset.id)] || ''} onChange={(event) => setConditions((current) => ({ ...current, [String(asset.id)]: event.target.value }))} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                  <option value="">Select condition</option>
                  {returnConditionOptions.map((condition) => <option key={condition}>{condition}</option>)}
                </select>
              </label>
            </div>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Note {damaged ? '(required)' : '(optional)'}</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder={damaged ? 'Describe the damage or missing part.' : 'Add a note if needed.'} className="min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
        </label>

        {(localError || error) && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-bold text-rose-700">{localError || error}</p>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-600 transition hover:border-slate-300 disabled:cursor-wait disabled:opacity-60">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className={`rounded-xl px-4 py-2.5 text-xs font-extrabold text-white shadow-md transition disabled:cursor-wait disabled:opacity-60 ${damaged ? 'bg-rose-600 shadow-rose-600/20 hover:bg-rose-700' : 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700'}`}>
            {busy ? 'Saving…' : damaged ? 'Send to repair' : 'Confirm return'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BorrowingPage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [view, setView] = useState<QueueView>('incoming')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [conditionOut, setConditionOut] = useState('Good')
  const [inspecting, setInspecting] = useState(false)
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
  const overdueCount = useMemo(() => activeRequests.filter(isOverdue).length, [activeRequests])
  const activeUnitCount = useMemo(() => activeRequests.reduce((total, request) => total + request.assets.reduce((sum, asset) => sum + Number(asset.quantity || 0), 0), 0), [activeRequests])
  const visibleRequests = view === 'incoming' ? incomingRequests : activeRequests.filter((request) => !overdueOnly || isOverdue(request))
  const selected = useMemo(
    () => visibleRequests.find((request) => request.id === selectedId) || visibleRequests[0] || null,
    [selectedId, visibleRequests],
  )
  const selectedActions = selected ? actionsFor(selected) : []
  const needsNote = selectedActions.some((action) => ['Needs Information', 'Rejected'].includes(action.status))
  const needsRelease = selectedActions.some((action) => ['Approved', 'Issued'].includes(action.status))
  const canInspect = Boolean(selected && outStatuses.has(selected.status))
  const openAssets = selected?.assets.filter((asset) => !asset.returnedAt) || []

  function showView(next: QueueView) {
    setView(next)
    setOverdueOnly(false)
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
      setError('Add a note before sending this decision.')
      return
    }

    const effectiveDueDate = dueDate || dueDateOf(selected)
    if (['Approved', 'Issued'].includes(nextStatus) && (!effectiveDueDate || effectiveDueDate < today())) {
      setError('Choose a return date from today onward.')
      return
    }

    setBusyStatus(nextStatus)
    setError('')
    setMessage('')
    try {
      const updated = await updateGsoRequestStatus(selected.id, {
        status: nextStatus,
        note,
        ...(['Approved', 'Issued'].includes(nextStatus) ? { dueDate: effectiveDueDate, conditionOut } : {}),
      })
      setRequests((current) => current.map((request) => request.id === updated.id ? updated : request))
      setSelectedId(updated.id)
      setReviewNote('')
      setDueDate('')
      if (updated.status === 'Issued') {
        setView('active')
        setOverdueOnly(false)
        setMessage(`${updated.referenceNo} was approved and released. Return by ${formatDate(dueDateOf(updated))}.`)
      } else {
        setMessage(`${updated.referenceNo} is now ${updated.status}.`)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update this borrowing request.')
    } finally {
      setBusyStatus('')
    }
  }

  async function confirmInspection(conditionsIn: Record<string, string>, note: string) {
    if (!selected) return
    const status = Object.values(conditionsIn).some((condition) => repairConditions.has(condition)) ? 'For Repair' : 'Returned'
    setBusyStatus(status)
    setError('')
    setMessage('')
    try {
      const updated = await updateGsoRequestStatus(selected.id, { status, note, conditionsIn })
      setRequests((current) => current.map((request) => request.id === updated.id ? updated : request))
      setInspecting(false)
      setSelectedId('')
      setMessage(`${updated.referenceNo} is now ${updated.status}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save this inspection.')
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
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Approve to release items. Inspect them when they come back.</p>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Borrowing summary">
        <button type="button" onClick={() => showView('incoming')} aria-pressed={view === 'incoming'} className={`rounded-2xl border-2 p-4 text-left shadow-md shadow-slate-300/35 transition ${view === 'incoming' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-300/80 bg-white ring-1 ring-slate-900/5 hover:border-blue-200'}`}>
          <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Incoming</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{incomingRequests.length}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Waiting for a decision</p>
        </button>
        <button type="button" onClick={() => { showView('active'); setOverdueOnly(true) }} className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 text-left shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 transition hover:border-rose-200">
          <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Overdue</p>
          <p className={`mt-1 text-2xl font-black ${overdueCount > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{overdueCount}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Past the return date</p>
        </button>
        <button type="button" onClick={() => showView('active')} aria-pressed={view === 'active' && !overdueOnly} className={`rounded-2xl border-2 p-4 text-left shadow-md shadow-slate-300/35 transition ${view === 'active' && !overdueOnly ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-300/80 bg-white ring-1 ring-slate-900/5 hover:border-blue-200'}`}>
          <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Out now</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{activeRequests.length}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{activeUnitCount} unit{activeUnitCount === 1 ? '' : 's'} borrowed</p>
        </button>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="borrowing-queue-title">
        <div className="border-b border-slate-100 bg-slate-50/65 px-4 py-4 sm:px-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <h2 id="borrowing-queue-title" className="text-lg font-black tracking-tight text-slate-900">{view === 'incoming' ? 'Incoming requests' : overdueOnly ? 'Overdue borrowings' : 'Items out now'}</h2>
              <p className="mt-1 text-xs text-slate-500">{view === 'incoming' ? 'Approve a request to release the item.' : 'Inspect each item when it is returned.'}</p>
            </div>
            <button type="button" onClick={() => void loadRequests()} disabled={loading} className="self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60 lg:self-auto">
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                <button type="button" onClick={() => showView('incoming')} aria-pressed={view === 'incoming'} className={`rounded-lg px-3 py-2 text-xs font-extrabold transition ${view === 'incoming' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>Incoming</button>
                <button type="button" onClick={() => showView('active')} aria-pressed={view === 'active'} className={`rounded-lg px-3 py-2 text-xs font-extrabold transition ${view === 'active' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>Active</button>
              </div>
              {view === 'active' && <button type="button" onClick={() => setOverdueOnly((current) => !current)} aria-pressed={overdueOnly} className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition ${overdueOnly ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200'}`}>Overdue only</button>}
            </div>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, requester, or item" aria-label="Search borrowing requests" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:max-w-xs" />
          </div>
        </div>

        {error && !inspecting && <p role="alert" className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-bold text-rose-700 sm:mx-5">{error}</p>}
        {message && <p role="status" className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-bold text-emerald-700 sm:mx-5">{message}</p>}

        <div className="grid min-w-0 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="min-w-0 border-b border-slate-100 p-4 sm:p-5 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{view === 'incoming' ? 'Requests' : 'Borrowed items'}</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.62rem] font-extrabold text-slate-700">{visibleRequests.length}</span>
            </div>
            <div className="inventory-list-scrollbar mt-3 max-h-160 overflow-y-auto rounded-xl border border-slate-100">
              {loading ? (
                <div className="grid min-h-48 place-items-center px-5 text-center text-xs font-semibold text-slate-400">Loading…</div>
              ) : visibleRequests.length === 0 ? (
                <div className="grid min-h-48 place-items-center px-5 text-center">
                  <div>
                    <p className="text-sm font-extrabold text-slate-700">Nothing here yet</p>
                    <p className="mt-1 text-xs text-slate-500">{view === 'incoming' ? 'New borrowing requests appear here.' : overdueOnly ? 'No overdue borrowings.' : 'Released items appear here until they are returned.'}</p>
                  </div>
                </div>
              ) : visibleRequests.map((request) => {
                const itemSummary = request.assets.map((asset) => `${asset.itemName} × ${asset.quantity}`).join(' · ')
                const isSelected = selected?.id === request.id
                const overdue = isOverdue(request)
                return (
                  <button key={request.id} type="button" onClick={() => selectRequest(request.id)} aria-pressed={isSelected} className={`block w-full border-b border-slate-100 p-3.5 text-left transition last:border-0 ${isSelected ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-500' : 'bg-white hover:bg-blue-50/50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-slate-900">{request.referenceNo}</p>
                        <p className="mt-1 truncate text-[0.7rem] font-bold text-slate-700">{request.requesterName}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[0.58rem] font-extrabold ${overdue ? 'bg-rose-50 text-rose-700' : statusTone(request.status)}`}>{overdue ? 'Overdue' : request.status}</span>
                    </div>
                    <p className="mt-2 truncate text-[0.64rem] font-semibold text-slate-500">{itemSummary || 'No items'}</p>
                    <p className="mt-1 text-[0.6rem] font-medium text-slate-400">{view === 'active' ? `Return by ${formatDate(dueDateOf(request))}` : `Submitted ${formatDate(request.createdAt)}`}</p>
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
                  <p className="mt-3 text-sm font-extrabold text-slate-700">Select a borrowing</p>
                  <p className="mt-1 text-xs text-slate-500">Details and actions appear here.</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="min-w-0">
                    <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Borrowing</p>
                    <h3 className="mt-1 text-lg font-black text-slate-900">{selected.referenceNo}</h3>
                    <p className="mt-1 wrap-break-word text-xs font-semibold text-slate-600">{selected.requesterName} · {selected.requesterEmail}</p>
                    <p className="mt-1 text-[0.62rem] text-slate-400">Submitted {formatDateTime(selected.createdAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isOverdue(selected) && <span className="rounded-full bg-rose-50 px-2.5 py-1.5 text-[0.62rem] font-extrabold text-rose-700">Overdue</span>}
                    <span className={`rounded-full px-2.5 py-1.5 text-[0.62rem] font-extrabold ${statusTone(selected.status)}`}>{selected.status}</span>
                  </div>
                </div>

                <BorrowingPath status={selected.status} />

                <section className="mt-4" aria-labelledby="borrow-plan-title">
                  <h4 id="borrow-plan-title" className="text-xs font-extrabold text-slate-800">Details</h4>
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      ['Date needed', formatDate(textValue(selected, 'neededDate'))],
                      ['Return by', formatDate(dueDateOf(selected))],
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
                  <h4 id="borrowed-items-title" className="text-xs font-extrabold text-slate-800">Items</h4>
                  <div className="mt-3 space-y-2">
                    {selected.assets.map((asset) => (
                      <div key={asset.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3">
                        <div className="min-w-0">
                          <p className="wrap-break-word text-xs font-extrabold text-slate-800">{asset.itemName}</p>
                          <p className="mt-1 text-[0.64rem] font-semibold text-slate-500">{asset.itemCode} · {asset.quantity} {asset.unitOfMeasure}</p>
                        </div>
                        <div className="text-right text-[0.62rem] font-semibold text-slate-500">
                          {asset.issuedAt && <p>Released {formatDate(asset.issuedAt)}</p>}
                          {asset.returnedAt ? <p className="mt-1 text-emerald-700">Returned {formatDate(asset.returnedAt)}</p> : asset.conditionOut && <p className="mt-1">Out in {asset.conditionOut} condition</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {selected.status === 'For Repair' && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-900"><span className="font-extrabold">Sent for repair.</span> Track it in <a href="/gso/to-be-repaired" className="font-extrabold text-blue-700 underline">Repair &amp; Maintenance</a>.</div>}

                {selected.history.length > 0 && <section className="mt-4 border-t border-slate-100 pt-4" aria-labelledby="borrow-history-title">
                  <h4 id="borrow-history-title" className="text-xs font-extrabold text-slate-800">Recent activity</h4>
                  <ul className="mt-3 space-y-2">
                    {[...selected.history].slice(-3).reverse().map((event) => <li key={event.id} className="rounded-xl bg-slate-50 px-3 py-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[0.68rem] font-extrabold text-slate-800">{event.status}</span><span className="text-[0.58rem] font-semibold text-slate-400">{formatDateTime(event.changedAt)}</span></div>{event.note && <p className="mt-1 text-[0.65rem] leading-relaxed text-slate-600">{event.note}</p>}</li>)}
                  </ul>
                </section>}

                {canInspect && <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                  <p className="text-xs font-semibold text-slate-700">Item back from the borrower?</p>
                  <button type="button" onClick={() => setInspecting(true)} disabled={Boolean(busyStatus) || openAssets.length === 0} className="rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-extrabold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">Inspect return</button>
                </section>}

                {selectedActions.length > 0 && <section className="mt-4 border-t border-slate-100 pt-4" aria-labelledby="borrow-actions-title">
                  <h4 id="borrow-actions-title" className="text-xs font-extrabold text-slate-800">Decision</h4>
                  <label className="mt-3 block"><span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Note {needsNote ? '(required)' : '(optional)'}</span><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} className="min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" placeholder={needsNote ? 'Explain what is needed or why it is declined.' : 'Add a note if needed.'} /></label>

                  {needsRelease && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Return by</span><input type="date" min={today()} value={dueDate || dueDateOf(selected)} onChange={(event) => setDueDate(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label><label><span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Condition on release</span><select value={conditionOut} onChange={(event) => setConditionOut(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">{['New', 'Good', 'Fair'].map((condition) => <option key={condition}>{condition}</option>)}</select></label></div>}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedActions.filter((action) => action.tone !== 'secondary').map((action) => <button key={action.status} type="button" disabled={Boolean(busyStatus)} onClick={() => void changeStatus(action.status)} className={`rounded-xl px-3.5 py-2.5 text-xs font-extrabold transition disabled:cursor-wait disabled:opacity-60 ${actionClass(action.tone)}`}>{busyStatus === action.status ? 'Saving…' : action.label}</button>)}
                  </div>
                  {selectedActions.some((action) => action.tone === 'secondary') && <details className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <summary className="cursor-pointer text-xs font-extrabold text-slate-600">More options</summary>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedActions.filter((action) => action.tone === 'secondary').map((action) => <button key={action.status} type="button" disabled={Boolean(busyStatus)} onClick={() => void changeStatus(action.status)} className={`rounded-xl px-3.5 py-2.5 text-xs font-extrabold transition disabled:cursor-wait disabled:opacity-60 ${actionClass(action.tone)}`}>{busyStatus === action.status ? 'Saving…' : action.label}</button>)}
                    </div>
                  </details>}
                </section>}
              </div>
            )}
          </div>
        </div>
      </section>

      {inspecting && selected && canInspect && (
        <InspectReturnDialog
          key={selected.id}
          request={selected}
          assets={openAssets}
          busy={Boolean(busyStatus)}
          error={error}
          onCancel={() => { if (!busyStatus) setInspecting(false) }}
          onConfirm={(conditions, note) => void confirmInspection(conditions, note)}
        />
      )}
    </GsoPageFrame>
  )
}
