import { useCallback, useEffect, useMemo, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { listGsoRequests, updateGsoRequestStatus, type RequestAsset, type ServiceRequest } from '../requesters/requesterApi'
import { BorrowingPath } from '../components/requestpath'

type ReturnView = 'pending' | 'records'

const returnConditionOptions = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable']
const repairConditions = new Set(['Needs Repair', 'Under Maintenance', 'Unserviceable'])
const returnRecordStatuses = new Set(['Returned', 'For Repair'])

const statusTone = (status: string) => {
  if (status === 'Returned') return 'bg-emerald-50 text-emerald-700'
  if (status === 'For Repair') return 'bg-rose-50 text-rose-700'
  return 'bg-amber-50 text-amber-800'
}

const conditionTone = (condition: string | null) => {
  if (['New', 'Good'].includes(condition || '')) return 'bg-emerald-50 text-emerald-700'
  if (condition === 'Fair') return 'bg-amber-50 text-amber-800'
  if (condition) return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-600'
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

function returnerName(request: ServiceRequest) {
  return textValue(request, 'returnResponsibleName') || request.requesterName
}

function requestedPurpose(request: ServiceRequest) {
  const purpose = textValue(request, 'purpose')
  if (purpose !== 'Other') return purpose || 'Not provided'
  const otherPurpose = textValue(request, 'otherPurpose')
  return otherPurpose ? `Other: ${otherPurpose}` : 'Other'
}

function requestedLocation(request: ServiceRequest) {
  return [textValue(request, 'useLocation'), textValue(request, 'specificLocation')].filter(Boolean).join(' · ') || 'Not provided'
}

function latestReturnAt(request: ServiceRequest) {
  return request.assets.map((asset) => asset.returnedAt).filter(Boolean).sort().at(-1) || null
}

function itemSummary(request: ServiceRequest) {
  return request.assets.map((asset) => `${asset.itemName} × ${asset.quantity}`).join(' · ')
}

export default function BorrowingReturns() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [view, setView] = useState<ReturnView>('pending')
  const [search, setSearch] = useState('')
  const [assetConditions, setAssetConditions] = useState<Record<string, string>>({})
  const [reviewNote, setReviewNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyStatus, setBusyStatus] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadReturns = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listGsoRequests({ type: 'BORROWING', search: search.trim() })
      const returnRequests = data.filter((request) => request.status === 'Return Requested' || returnRecordStatuses.has(request.status))
      setRequests(returnRequests)
      setSelectedId((current) => returnRequests.some((request) => request.id === current) ? current : returnRequests[0]?.id || '')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load borrowing returns.')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadReturns() }, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [loadReturns, search])

  const pendingReturns = useMemo(() => requests.filter((request) => request.status === 'Return Requested'), [requests])
  const returnRecords = useMemo(() => requests.filter((request) => returnRecordStatuses.has(request.status)), [requests])
  const returnedCount = useMemo(() => returnRecords.filter((request) => request.status === 'Returned').length, [returnRecords])
  const repairCount = useMemo(() => returnRecords.filter((request) => request.status === 'For Repair').length, [returnRecords])
  const visibleRequests = view === 'pending' ? pendingReturns : returnRecords
  const selected = useMemo(
    () => visibleRequests.find((request) => request.id === selectedId) || visibleRequests[0] || null,
    [selectedId, visibleRequests],
  )
  const openAssets = selected?.assets.filter((asset) => !asset.returnedAt) || []

  function showView(next: ReturnView) {
    setView(next)
    setError('')
    setMessage('')
    setReviewNote('')
  }

  function selectReturn(id: string) {
    setSelectedId(id)
    setAssetConditions({})
    setReviewNote('')
    setError('')
    setMessage('')
  }

  function setAssetCondition(assetId: string, condition: string) {
    setAssetConditions((current) => ({ ...current, [assetId]: condition }))
  }

  async function recordReturn(nextStatus: 'Returned' | 'For Repair') {
    if (!selected) return
    if (openAssets.length === 0) {
      setError('There are no open borrowed items to inspect.')
      return
    }

    if (openAssets.some((asset) => !assetConditions[asset.id])) {
      setError('Choose the returned condition for every item first.')
      return
    }

    const conditionsIn = Object.fromEntries(openAssets.map((asset) => [asset.id, assetConditions[asset.id]]))
    const damaged = Object.values(conditionsIn).some((condition) => repairConditions.has(condition))
    if (damaged && nextStatus === 'Returned') {
      setError('At least one item needs repair. Use Send for repair instead.')
      return
    }
    if (!damaged && nextStatus === 'For Repair') {
      setError('No item needs repair. Confirm the return instead.')
      return
    }
    if (damaged && !reviewNote.trim()) {
      setError('Describe the damage or repair concern in the return note.')
      return
    }

    setBusyStatus(nextStatus)
    setError('')
    setMessage('')
    try {
      const updated = await updateGsoRequestStatus(selected.id, {
        status: nextStatus,
        note: reviewNote.trim(),
        conditionsIn,
      })
      setRequests((current) => current.map((request) => request.id === updated.id ? updated : request))
      setSelectedId(updated.id)
      setView('records')
      setAssetConditions({})
      setReviewNote('')
      setMessage(`${updated.referenceNo} was marked as ${updated.status}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to record this borrowing return.')
    } finally {
      setBusyStatus('')
    }
  }

  return (
    <GsoPageFrame activePage="Borrowing Returns" searchPlaceholder="Search borrowing returns...">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Asset custody &amp; tracking
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Borrowing Returns</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
            Review return requests, record every item condition, and keep a clear history of reusable items.
          </p>
        </div>
        <nav className="relative mt-6 flex flex-wrap gap-2 border-t border-blue-400/20 pt-4" aria-label="Returns and records pages">
          <a href="/gso/return-items" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-extrabold text-blue-100 transition hover:bg-white/12">
            + Return Items
          </a>
          <a href="/gso/issuance" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-extrabold text-blue-100 transition hover:bg-white/12">
            + Issuances Records
          </a>
          <a href="/gso/borrowing-returns" aria-current="page" className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-blue-950 shadow-md">
            + Borrowing Returns
          </a>
        </nav>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Borrowing return summary">
        <button type="button" onClick={() => showView('pending')} className={`rounded-2xl border-2 p-4 text-left shadow-md shadow-slate-300/35 transition ${view === 'pending' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-300/80 bg-white ring-1 ring-slate-900/5 hover:border-blue-200'}`}>
          <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Awaiting inspection</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{pendingReturns.length}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Borrowers who requested a return</p>
        </button>
        <button type="button" onClick={() => showView('records')} className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 text-left transition hover:border-blue-200 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
          <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Returned</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{returnedCount}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Returns confirmed by GSO</p>
        </button>
        <button type="button" onClick={() => showView('records')} className={`rounded-2xl border-2 p-4 text-left shadow-md shadow-slate-300/35 transition ${view === 'records' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-300/80 bg-white ring-1 ring-slate-900/5 hover:border-blue-200'}`}>
          <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">For repair</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{repairCount}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Returned items needing attention</p>
        </button>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="borrowing-returns-title">
        <div className="border-b border-slate-100 bg-slate-50/65 px-4 py-4 sm:px-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Live return queue</p>
              <h2 id="borrowing-returns-title" className="mt-1 text-lg font-black tracking-tight text-slate-900">{view === 'pending' ? 'Borrowing returns to inspect' : 'Borrowing return records'}</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{view === 'pending' ? 'Inspect every returned item before placing it back in stock or sending it for repair.' : 'Review completed returns, conditions, and the person responsible for the return.'}</p>
            </div>
            <button type="button" onClick={() => void loadReturns()} disabled={loading} className="self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60 lg:self-auto">
              {loading ? 'Refreshing…' : 'Refresh queue'}
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex w-full rounded-xl border border-slate-200 bg-white p-1 sm:w-auto">
              <button type="button" onClick={() => showView('pending')} aria-pressed={view === 'pending'} className={`flex-1 rounded-lg px-3 py-2 text-xs font-extrabold transition sm:flex-none ${view === 'pending' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>To inspect</button>
              <button type="button" onClick={() => showView('records')} aria-pressed={view === 'records'} className={`flex-1 rounded-lg px-3 py-2 text-xs font-extrabold transition sm:flex-none ${view === 'records' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>Return records</button>
            </div>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, borrower, or item" aria-label="Search borrowing returns" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:max-w-xs" />
          </div>
        </div>

        {error && <p role="alert" className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-bold text-rose-700 sm:mx-5">{error}</p>}
        {message && <p role="status" className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-bold text-emerald-700 sm:mx-5">{message}</p>}

        <div className="grid min-w-0 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="min-w-0 border-b border-slate-100 p-4 sm:p-5 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{view === 'pending' ? 'Return requests' : 'Completed records'}</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.62rem] font-extrabold text-slate-700">{visibleRequests.length}</span>
            </div>
            <div className="inventory-list-scrollbar mt-3 max-h-160 overflow-y-auto rounded-xl border border-slate-100">
              {loading ? (
                <div className="grid min-h-48 place-items-center px-5 text-center text-xs font-semibold text-slate-400">Loading borrowing returns…</div>
              ) : visibleRequests.length === 0 ? (
                <div className="grid min-h-48 place-items-center px-5 text-center">
                  <div>
                    <p className="text-sm font-extrabold text-slate-700">No {view === 'pending' ? 'returns waiting for inspection' : 'completed borrowing returns'}.</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{view === 'pending' ? 'A request appears here when a borrower asks to return an item.' : 'Confirmed returns and repair referrals appear here.'}</p>
                  </div>
                </div>
              ) : visibleRequests.map((request) => {
                const isSelected = selected?.id === request.id
                const returnedAt = latestReturnAt(request)
                return (
                  <button key={request.id} type="button" onClick={() => selectReturn(request.id)} className={`block w-full border-b border-slate-100 p-3.5 text-left transition last:border-0 ${isSelected ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-500' : 'bg-white hover:bg-blue-50/50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-slate-900">{request.referenceNo}</p>
                        <p className="mt-1 truncate text-[0.7rem] font-bold text-slate-700">{returnerName(request)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[0.58rem] font-extrabold ${statusTone(request.status)}`}>{request.status}</span>
                    </div>
                    <p className="mt-2 truncate text-[0.64rem] font-semibold text-slate-500">{itemSummary(request) || 'No linked items'}</p>
                    <p className="mt-1 text-[0.6rem] font-medium text-slate-400">{view === 'pending' ? `Requested ${formatDate(request.updatedAt)}` : `Recorded ${formatDate(returnedAt)}`}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="min-w-0 p-4 sm:p-5">
            {!selected ? (
              <div className="grid min-h-96 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center">
                <div>
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-xl font-black text-blue-600">↩</span>
                  <p className="mt-3 text-sm font-extrabold text-slate-700">Select a borrowing return</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">Borrower, item, condition, and return details will appear here.</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="min-w-0">
                    <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Borrowing return</p>
                    <h3 className="mt-1 text-lg font-black text-slate-900">{selected.referenceNo}</h3>
                    <p className="mt-1 wrap-break-word text-xs font-semibold text-slate-600">Borrower: {selected.requesterName} · {selected.requesterEmail}</p>
                    <p className="mt-1 text-[0.62rem] text-slate-400">Return request updated {formatDateTime(selected.updatedAt)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1.5 text-[0.62rem] font-extrabold ${statusTone(selected.status)}`}>{selected.status}</span>
                </div>

                <BorrowingPath status={selected.status} />

                <section className="mt-4" aria-labelledby="returner-details-title">
                  <div className="flex items-center justify-between gap-3">
                    <h4 id="returner-details-title" className="text-xs font-extrabold text-slate-800">Returner and borrowing details</h4>
                    <span className="text-[0.62rem] font-semibold text-slate-400">{selected.assets.length} item{selected.assets.length === 1 ? '' : 's'}</span>
                  </div>
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      ['Return contact', returnerName(selected)],
                      ['Contact number', textValue(selected, 'returnResponsibleContact') || 'Not provided'],
                      ['Date needed', formatDate(textValue(selected, 'neededDate'))],
                      ['Expected return', formatDate(textValue(selected, 'returnDate'))],
                      ['Purpose', requestedPurpose(selected)],
                      ['Place of use', requestedLocation(selected)],
                    ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 p-3"><dt className="text-[0.56rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 wrap-break-word text-xs font-semibold leading-relaxed text-slate-700">{value}</dd></div>)}
                  </dl>
                  {textValue(selected, 'remarks') && <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3"><p className="text-[0.56rem] font-extrabold uppercase tracking-wide text-slate-400">Additional details</p><p className="mt-1 wrap-break-word text-xs font-semibold leading-relaxed text-slate-700">{textValue(selected, 'remarks')}</p></div>}
                </section>

                <section className="mt-4 border-t border-slate-100 pt-4" aria-labelledby="returned-assets-title">
                  <h4 id="returned-assets-title" className="text-xs font-extrabold text-slate-800">Borrowed items</h4>
                  <div className="mt-3 space-y-2">
                    {selected.assets.map((asset: RequestAsset) => (
                      <div key={asset.id} className="rounded-xl border border-slate-100 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="wrap-break-word text-xs font-extrabold text-slate-800">{asset.itemName}</p>
                            <p className="mt-1 text-[0.64rem] font-semibold text-slate-500">{asset.itemCode} · {asset.quantity} {asset.unitOfMeasure}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[0.58rem] font-extrabold ${conditionTone(asset.conditionIn)}`}>{asset.conditionIn || (asset.returnedAt ? 'Condition not recorded' : 'Awaiting inspection')}</span>
                        </div>
                        <div className="mt-3 grid gap-2 text-[0.62rem] font-semibold text-slate-500 sm:grid-cols-3">
                          <p><span className="block text-[0.54rem] font-extrabold uppercase tracking-wide text-slate-400">Issued</span>{formatDate(asset.issuedAt)}</p>
                          <p><span className="block text-[0.54rem] font-extrabold uppercase tracking-wide text-slate-400">Condition out</span>{asset.conditionOut || 'Not recorded'}</p>
                          <p><span className="block text-[0.54rem] font-extrabold uppercase tracking-wide text-slate-400">Returned</span>{asset.returnedAt ? formatDate(asset.returnedAt) : 'Not yet'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {selected.history.length > 0 && <section className="mt-4 border-t border-slate-100 pt-4" aria-labelledby="return-history-title">
                  <h4 id="return-history-title" className="text-xs font-extrabold text-slate-800">Return history</h4>
                  <ul className="mt-3 space-y-2">
                    {[...selected.history].slice(-4).reverse().map((event) => <li key={event.id} className="rounded-xl bg-slate-50 px-3 py-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[0.68rem] font-extrabold text-slate-800">{event.status}</span><span className="text-[0.58rem] font-semibold text-slate-400">{formatDateTime(event.changedAt)}</span></div>{event.note && <p className="mt-1 text-[0.65rem] leading-relaxed text-slate-600">{event.note}</p>}</li>)}
                  </ul>
                </section>}

                {selected.status === 'Return Requested' && <section className="mt-4 border-t border-slate-100 pt-4" aria-labelledby="return-inspection-title">
                  <h4 id="return-inspection-title" className="text-xs font-extrabold text-slate-800">Return inspection</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">Inspect each item physically, then record its condition. Any damaged item must be sent for repair.</p>
                  <div className="mt-3 space-y-3">
                    {openAssets.map((asset) => <div key={asset.id} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-[1fr_12rem] sm:items-end"><div className="min-w-0"><p className="wrap-break-word text-xs font-extrabold text-slate-800">{asset.itemName}</p><p className="mt-1 text-[0.64rem] font-semibold text-slate-500">{asset.itemCode} · {asset.quantity} {asset.unitOfMeasure}</p></div><label><span className="mb-1 block text-[0.56rem] font-extrabold uppercase tracking-wide text-slate-400">Returned condition</span><select value={assetConditions[asset.id] || ''} onChange={(event) => setAssetCondition(asset.id, event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"><option value="">Select condition</option>{returnConditionOptions.map((condition) => <option key={condition}>{condition}</option>)}</select></label></div>)}
                  </div>
                  <label className="mt-3 block"><span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Return note <span className="normal-case tracking-normal text-slate-400">(required if an item needs repair)</span></span><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} placeholder="Describe any damage, missing part, or inspection note." className="min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={Boolean(busyStatus)} onClick={() => void recordReturn('Returned')} className="rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-extrabold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60">{busyStatus === 'Returned' ? 'Saving…' : 'Confirm returned'}</button><button type="button" disabled={Boolean(busyStatus)} onClick={() => void recordReturn('For Repair')} className="rounded-xl border border-rose-200 bg-white px-3.5 py-2.5 text-xs font-extrabold text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60">{busyStatus === 'For Repair' ? 'Saving…' : 'Send for repair'}</button></div>
                </section>}
              </div>
            )}
          </div>
        </div>
      </section>
    </GsoPageFrame>
  )
}
