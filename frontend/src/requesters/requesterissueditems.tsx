import { useEffect, useMemo, useState } from 'react'
import RequesterLayout from './requesterlayout'
import {
  listMyIssuanceActivity,
  listMyRequests,
  requestAssetReturn,
  REQUEST_TYPE_LABELS,
  type RequesterIssuanceApproval,
  type ServiceRequest,
} from './requesterApi'

type ItemFilter = 'All items' | 'Track each item separately' | 'Consumables' | 'Reusable stock'
type IssuedItem = RequesterIssuanceApproval['items'][number]

const filters: ItemFilter[] = ['All items', 'Track each item separately', 'Consumables', 'Reusable stock']

function itemCategory(item: IssuedItem): Exclude<ItemFilter, 'All items'> {
  if (item.trackingMode === 'individual') return 'Track each item separately'
  return item.issueBehavior === 'consumable' ? 'Consumables' : 'Reusable stock'
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const normalized = localDateTime ? `${value}:00+08:00` : dateOnly ? `${value}T00:00:00+08:00` : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    ...(localDateTime || !dateOnly ? { timeStyle: 'short' as const } : {}),
    timeZone: 'Asia/Manila',
  }).format(date)
}

function itemStatus(batch: RequesterIssuanceApproval, item: IssuedItem) {
  if (item.issueBehavior === 'returnable' && item.trackingMode === 'quantity'
    && Number(item.quantity) - Number(item.returnedQuantity || 0) <= 0) return 'Returned'
  if (item.status === 'Returned') return 'Returned'
  if (batch.status === 'Pending' && item.trackingMode === 'individual') return 'Awaiting acknowledgment'
  if (batch.status === 'Issued' && item.trackingMode === 'individual') return 'Issued to department'
  if (batch.status === 'Issued' && item.issueBehavior === 'consumable') return 'Distributed'
  if (batch.status === 'Issued' && item.issueBehavior === 'returnable') return 'Borrowed'
  return item.status || batch.status
}

function statusTone(status: string) {
  if (['Ready for pickup', 'Issued to department', 'Distributed', 'Borrowed', 'Returned', 'Issued'].includes(status)) return 'bg-emerald-50 text-emerald-700'
  if (['Pending', 'Approved', 'Awaiting acknowledgment', 'Return Requested'].includes(status)) return 'bg-amber-50 text-amber-800'
  if (['Rejected', 'Cancelled', 'For Repair'].includes(status)) return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-700'
}

type UiIconName = 'asset' | 'supplies' | 'return' | 'records' | 'archive' | 'calendar' | 'location' | 'arrow'

function UiIcon({ name, className = 'h-5 w-5' }: { name: UiIconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {name === 'asset' && <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.5 7.5 4.25 7.5-4.25M12 12v9" /></>}
    {name === 'supplies' && <><path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z" /><path d="M4 12l8 4.5 8-4.5M4 16.5 12 21l8-4.5" /></>}
    {name === 'return' && <><path d="M3 11a9 9 0 1 1 2.6 6.4" /><path d="M3 4v7h7M12 7v5l3 2" /></>}
    {name === 'records' && <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 18h4" /></>}
    {name === 'archive' && <><path d="M3 7h18v13H3zM2 4h20v3H2zM9 11h6" /></>}
    {name === 'calendar' && <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M7.5 3v4M16.5 3v4M3.5 10h17" /></>}
    {name === 'location' && <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>}
    {name === 'arrow' && <><path d="M5 12h14M13 6l6 6-6 6" /></>}
  </svg>
}

export default function RequesterIssuedItems() {
  const [batches, setBatches] = useState<RequesterIssuanceApproval[]>([])
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [filter, setFilter] = useState<ItemFilter>('All items')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [returningRequest, setReturningRequest] = useState('')
  const [returnNotice, setReturnNotice] = useState('')
  const [returnError, setReturnError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([listMyIssuanceActivity(), listMyRequests()])
      .then(([issuanceRows, requestRows]) => {
        if (!active) return
        setBatches(issuanceRows)
        setRequests(requestRows)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang iyong issuance records.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const issuanceItems = useMemo(() => batches.flatMap((batch) => batch.items.map((item) => ({ batch, item }))), [batches])
  const visibleBatches = useMemo(() => batches.map((batch) => ({
    ...batch,
    items: filter === 'All items' ? batch.items : batch.items.filter((item) => itemCategory(item) === filter),
  })).filter((batch) => batch.items.length > 0), [batches, filter])
  const activePerUnitCount = issuanceItems.reduce((count, { batch, item }) =>
    count + (batch.status === 'Issued' && item.trackingMode === 'individual' && item.status !== 'Returned' ? Number(item.quantity) : 0), 0)
  const distributedConsumableCount = issuanceItems.reduce((count, { batch, item }) =>
    count + (batch.status === 'Issued' && item.trackingMode === 'quantity' && item.issueBehavior === 'consumable' ? Number(item.quantity) : 0), 0)
  const reusableOutstandingCount = issuanceItems.reduce((count, { batch, item }) => {
    if (batch.status !== 'Issued' || item.trackingMode !== 'quantity' || item.issueBehavior !== 'returnable') return count
    return count + Math.max(Number(item.quantity) - Number(item.returnedQuantity || 0), 0)
  }, 0)
  const requestBorrowings = useMemo(() => requests.filter((request) => request.requestType === 'BORROWING' && request.assets.length > 0), [requests])
  const totalRecords = issuanceItems.length + requestBorrowings.reduce((count, request) => count + request.assets.length, 0)

  async function submitReturnRequest(request: ServiceRequest) {
    setReturningRequest(request.id)
    setReturnError('')
    setReturnNotice('')
    try {
      const updated = await requestAssetReturn(request.id)
      setRequests((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
      setReturnNotice('Naipadala na sa GSO ang return request para sa ' + request.referenceNo + '.')
    } catch (reason) {
      setReturnError(reason instanceof Error ? reason.message : 'Hindi naipadala ang return request. Subukan ulit.')
    } finally {
      setReturningRequest('')
    }
  }

  return <RequesterLayout title="My Issued Items" subtitle="View items issued to your department, staff recipient assignments, supplies, and borrowings.">
    <div className="space-y-6">
      <section className="relative isolate overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="absolute -right-12 top-1/2 -z-10 hidden h-52 w-52 -translate-y-1/2 rounded-full border-22 border-white/5 lg:block" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/10 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Requester workspace
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">My Issued Items</h1>
            <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-blue-100">Equipment issued to your department, actual staff recipients, distributed supplies, and reusable-stock loans.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/requester/my-requests" className="inline-flex h-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 text-xs font-extrabold text-white transition hover:bg-white/15">My requests</a>
            <a href="/requester/return-items" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-blue-950 shadow-lg transition hover:bg-blue-50">
              Return items <UiIcon name="arrow" className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}
      {returnError && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{returnError}</p>}
      {returnNotice && <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{returnNotice}</p>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Issued items summary" aria-busy={loading}>
        {[
          { label: 'Assigned items', value: activePerUnitCount, detail: 'Individually tracked equipment assigned across your department', tone: 'border-blue-100 bg-blue-50 text-blue-700', icon: 'asset' as const },
          { label: 'Consumables issued', value: distributedConsumableCount, detail: 'Units distributed for your department', tone: 'border-violet-100 bg-violet-50 text-violet-700', icon: 'supplies' as const },
          { label: 'Reusable stock to return', value: reusableOutstandingCount, detail: 'Outstanding quantity from GSO', tone: 'border-amber-100 bg-amber-50 text-amber-700', icon: 'return' as const },
          { label: 'Records', value: totalRecords, detail: 'Issuance and borrowing line items', tone: 'border-emerald-100 bg-emerald-50 text-emerald-700', icon: 'records' as const },
        ].map((metric) => <article key={metric.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold text-slate-500">{metric.label}</p><p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{loading ? '—' : metric.value.toLocaleString('en-PH')}</p></div>
            <span className={'grid h-11 w-11 place-items-center rounded-xl border shadow-sm shadow-slate-900/5 ' + metric.tone}><UiIcon name={metric.icon} /></span>
          </div>
          <p className="mt-4 border-t border-slate-100 pt-3 text-[0.68rem] font-medium text-slate-500">{metric.detail}</p>
        </article>)}
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/55 sm:p-5">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">GSO issuance</span>
            <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900">Issuance history</h2>
            <p className="mt-1 text-xs text-slate-500">Item details, quantities, status, and return schedule.</p>
          </div>
          <span className="w-fit rounded-lg bg-blue-50 px-3 py-2 text-[0.68rem] font-extrabold text-blue-700">{loading ? 'Loading records' : issuanceItems.length + ' item records'}</span>
        </div>

        <div className="mt-4 inline-flex max-w-full flex-wrap gap-1 rounded-2xl bg-slate-100 p-1" role="group" aria-label="Filter issuance items">
          {filters.map((option) => <button key={option} type="button" onClick={() => setFilter(option)} aria-pressed={filter === option} className={'rounded-xl border px-3 py-2 text-[0.68rem] font-extrabold transition ' + (filter === option ? 'border-blue-100 bg-blue-600 text-white shadow-sm' : 'border-transparent text-slate-600 hover:bg-white hover:text-slate-900')}>{option}</button>)}
        </div>

        {loading ? <div className="grid min-h-48 place-items-center text-sm font-bold text-slate-400">Loading your issuance history...</div>
          : visibleBatches.length === 0 ? <div className="mt-4 grid min-h-52 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 text-center">
            <div>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm"><UiIcon name="archive" /></span>
              <h3 className="mt-3 text-sm font-extrabold text-slate-800">No issued item records yet</h3>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">Items recorded for your requester account by GSO will appear here.</p>
            </div>
          </div>
            : <div className="mt-4 space-y-4">{visibleBatches.map((batch) => <article key={batch.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3.5 sm:px-5">
                <div>
                  <p className="text-sm font-extrabold text-slate-900">Issuance record <span className="text-blue-700">#{batch.id}</span></p>
                  <p className="mt-1 text-[0.68rem] font-semibold text-slate-500">{formatDate(batch.decidedAt || batch.requestedAt)}{batch.requestedBy ? <> <span className="px-1 text-slate-300">·</span> Recorded by {batch.requestedBy}</> : null}</p>
                </div>
                <span className={'rounded-full px-3 py-1.5 text-[0.62rem] font-extrabold ' + statusTone(batch.status)}>{batch.status}</span>
              </div>

              <div className="space-y-3 p-4 sm:p-5">{batch.items.map((item) => {
                const category = itemCategory(item)
                const currentStatus = itemStatus(batch, item)
                const remaining = Math.max(Number(item.quantity) - Number(item.returnedQuantity || 0), 0)
                return <div key={item.issuanceId} className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-extrabold text-slate-900">{item.itemName}</h3>
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[0.58rem] font-extrabold text-slate-600">{category}</span>
                      </div>
                      <p className="mt-1.5 text-xs font-semibold text-slate-600">{item.itemCode}<span className="px-1.5 text-slate-300">·</span>{item.quantity} {item.unitOfMeasure}{item.issueBehavior === 'returnable' && item.trackingMode === 'quantity' ? <span className="text-amber-700"><span className="px-1.5 text-slate-300">·</span>{remaining} remaining</span> : null}</p>
                      <p className="mt-1 text-xs font-bold text-blue-700">Assigned to {item.recipientEmployeeName} · {item.recipientEmployeeCode}</p>
                      {(item.recipientLocation || item.recipientPurpose) && <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-500">{[item.recipientLocation, item.recipientPurpose].filter(Boolean).join(' · ')}</p>}
                    </div>
                    <span className={'shrink-0 rounded-full px-3 py-1.5 text-[0.62rem] font-extrabold ' + statusTone(currentStatus)}>{currentStatus}</span>
                  </div>
                  {(item.condition || item.notes) && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-[0.68rem] text-slate-500">
                    {item.condition && <p>Condition: <span className="font-bold text-slate-700">{item.condition}</span></p>}
                    {item.notes && <p className="leading-relaxed">Note: <span className="font-medium text-slate-700">{item.notes}</span></p>}
                  </div>}
                  {item.tags && item.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Assigned unit barcodes">{item.tags.map((tag) => <span key={item.issuanceId + '-' + tag.tagCode} className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[0.62rem] font-bold text-blue-800">Unit {tag.unitNumber}<span className="px-1 text-blue-300">·</span>{tag.tagCode}</span>)}</div>}
                </div>
              })}</div>

              {batch.items.some((item) => item.trackingMode === 'quantity' && item.issueBehavior === 'returnable') && <div className="mx-4 mb-4 grid gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 sm:mx-5 sm:mb-5 sm:grid-cols-2 sm:p-4">
                <p className="flex items-start gap-2 text-xs"><UiIcon name="calendar" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span><span className="font-bold text-slate-500">Borrowed</span><br /><span className="mt-0.5 inline-block font-semibold text-slate-800">{formatDate(batch.borrowUseAt || batch.borrowUseDate)}</span></span></p>
                <p className="flex items-start gap-2 text-xs"><UiIcon name="return" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span><span className="font-bold text-slate-500">Return by</span><br /><span className="mt-0.5 inline-block font-semibold text-slate-800">{formatDate(batch.expectedReturnAt || batch.expectedReturnDate)}</span></span></p>
                <p className="flex items-start gap-2 text-xs"><UiIcon name="records" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span><span className="font-bold text-slate-500">Event / purpose</span><br /><span className="mt-0.5 inline-block font-semibold text-slate-800">{batch.usePurpose || 'Not recorded'}</span></span></p>
                <p className="flex items-start gap-2 text-xs"><UiIcon name="location" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span><span className="font-bold text-slate-500">Location</span><br /><span className="mt-0.5 inline-block font-semibold text-slate-800">{batch.useLocation || 'Not recorded'}</span></span></p>
              </div>}
              {batch.decisionNote && <p className="mx-4 mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-600 sm:mx-5 sm:mb-5">GSO note: <span className="font-semibold text-slate-800">{batch.decisionNote}</span></p>}
            </article>)}</div>}
      </section>

      {requestBorrowings.length > 0 && <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/55 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div><span className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-emerald-700">Request Center</span><h2 className="mt-1 text-lg font-black tracking-tight text-slate-900">Borrowing request records</h2><p className="mt-1 text-xs text-slate-500">Requests, item quantities, and return dates.</p></div>
          <a href="/requester/my-requests" className="inline-flex items-center gap-1 text-xs font-extrabold text-blue-700 hover:underline">My requests <UiIcon name="arrow" className="h-3.5 w-3.5" /></a>
        </div>
        <div className="mt-4 space-y-3">{requestBorrowings.map((request) => {
          const hasOutstandingItems = request.assets.some((asset) => !asset.returnedAt)
          const canRequestReturn = request.status === 'Issued' && hasOutstandingItems
          return <article key={request.id} className="rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-slate-900">{request.title}</p>
                <p className="mt-1 text-[0.68rem] font-semibold text-slate-500">{request.referenceNo}<span className="px-1.5 text-slate-300">·</span>{REQUEST_TYPE_LABELS[request.requestType]}</p>
              </div>
              <span className={'rounded-full px-3 py-1.5 text-[0.62rem] font-extrabold ' + statusTone(request.status)}>{request.status}</span>
            </div>
            <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-white">{request.assets.map((asset) => <li key={asset.id} className="flex flex-wrap items-start justify-between gap-3 px-3.5 py-3">
              <div><p className="text-xs font-bold text-slate-800">{asset.itemName}</p><p className="mt-1 text-[0.68rem] font-semibold text-slate-500">{asset.itemCode}<span className="px-1.5 text-slate-300">·</span>{asset.quantity} {asset.unitOfMeasure}</p></div>
              <span className="text-[0.68rem] font-semibold text-slate-500">{asset.returnedAt ? 'Returned ' + formatDate(asset.returnedAt) : asset.dueDate ? 'Due ' + formatDate(asset.dueDate) : asset.issuedAt ? 'Issued ' + formatDate(asset.issuedAt) : 'See request details'}</span>
            </li>)}</ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <a href={'/requester/requests/' + request.id} className="text-xs font-extrabold text-blue-700 hover:underline">View request details</a>
              {canRequestReturn
                ? <button type="button" disabled={returningRequest === request.id} onClick={() => void submitReturnRequest(request)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
                    <UiIcon name="return" className="h-4 w-4" />{returningRequest === request.id ? 'Sending request...' : 'Request return inspection'}
                  </button>
                : request.status === 'Return Requested'
                  ? <span className="text-xs font-semibold text-amber-800">Naipadala na sa GSO ang return request. Hintayin ang inspection.</span>
                  : null}
            </div>
          </article>
        })}</div>
      </section>}
    </div>
  </RequesterLayout>
}
