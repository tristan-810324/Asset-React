import { useEffect, useMemo, useState } from 'react'
import RequesterLayout from './requesterlayout'
import {
  listMyDepartmentReturns,
  listMyIssuanceActivity,
  listMyRequests,
  requestAssetReturn,
  type RequesterDepartmentReturn,
  type RequesterIssuanceApproval,
  type ServiceRequest,
} from './requesterApi'
import { formatDateTime } from './requesterrequestutils'

function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return 'Not scheduled'
  const hasTime = includeTime || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
  const date = new Date(hasTime && value.length === 16 ? `${value}:00+08:00` : value.length === 10 ? `${value}T00:00:00+08:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    ...(hasTime ? { timeStyle: 'short' as const } : {}),
    timeZone: 'Asia/Manila',
  }).format(date)
}

const statusTone = (status: string) => status === 'Return Requested'
  ? 'bg-amber-50 text-amber-800'
  : status === 'For Repair'
    ? 'bg-rose-50 text-rose-700'
    : 'bg-blue-50 text-blue-700'

export default function RequesterReturnItems() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [batches, setBatches] = useState<RequesterIssuanceApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [returningRequest, setReturningRequest] = useState('')
  const [view, setView] = useState<'returns' | 'borrowing' | 'reusable'>('returns')
  const [departmentReturns, setDepartmentReturns] = useState<RequesterDepartmentReturn[]>([])
  const [departmentReturnsError, setDepartmentReturnsError] = useState('')

  // Same source and refresh rate as the dashboard's Recent returns, so both pages show the same records.
  useEffect(() => {
    let active = true
    const refresh = () => {
      listMyDepartmentReturns()
        .then((rows) => { if (active) { setDepartmentReturns(rows); setDepartmentReturnsError('') } })
        .catch((reason: unknown) => { if (active) setDepartmentReturnsError(reason instanceof Error ? reason.message : 'Hindi ma-load ang returns.') })
    }
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([listMyRequests(), listMyIssuanceActivity()])
      .then(([requestRows, issuanceRows]) => {
        if (!active) return
        setRequests(requestRows)
        setBatches(issuanceRows)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang mga item na kailangang isauli.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const borrowingRequests = useMemo(() => requests.filter((request) =>
    request.requestType === 'BORROWING'
    && ['Issued', 'Return Requested', 'For Repair'].includes(request.status)
    && request.assets.some((asset) => !asset.returnedAt)), [requests])

  const gsoBorrowings = useMemo(() => batches.filter((batch) => batch.status === 'Issued'
    && batch.items.some((item) => item.trackingMode === 'quantity'
      && item.issueBehavior === 'returnable'
      && Number(item.quantity) - Number(item.returnedQuantity || 0) > 0)), [batches])

  async function submitReturnRequest(request: ServiceRequest) {
    setReturningRequest(request.id)
    setError('')
    setNotice('')
    try {
      const updated = await requestAssetReturn(request.id)
      setRequests((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
      setNotice(`Naipadala na sa GSO ang return request para sa ${request.referenceNo}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hindi naipadala ang return request. Subukan ulit.')
    } finally {
      setReturningRequest('')
    }
  }

  return <RequesterLayout title="Return Items" subtitle="Review active borrowings and request a return inspection from GSO.">
    <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">Borrowing follow-up</span><h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Return Items</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Check due dates and send a return request for issued borrowing requests.</p></div>
        <div className="flex gap-2 text-xs font-extrabold"><span className="rounded-xl border border-white/15 bg-white/10 px-3 py-2">{loading ? '—' : borrowingRequests.length} requests</span><span className="rounded-xl border border-white/15 bg-white/10 px-3 py-2">{loading ? '—' : gsoBorrowings.length} GSO borrowings</span></div>
      </div>
    </section>

    {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">{notice}</p>}

    <div className="mt-6 inline-flex max-w-full flex-wrap gap-1 rounded-2xl bg-slate-100 p-1" role="group" aria-label="Choose what to show">
      {([['returns', 'Recent returns'], ['borrowing', 'Borrowing requests'], ['reusable', 'GSO reusable stock']] as const).map(([key, label]) => (
        <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`rounded-xl border px-3.5 py-2 text-xs font-extrabold transition ${view === key ? 'border-blue-100 bg-white text-blue-700 shadow-sm' : 'border-transparent text-slate-600 hover:text-blue-700'}`}>{label}</button>
      ))}
    </div>

    {view === 'returns' && <section id="return-records" className="mt-6 scroll-mt-6 rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="return-records-title">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
        <div>
          <h2 id="return-records-title" className="text-base font-black tracking-tight text-slate-900">Recent returns</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">Items your department returned to GSO.</p>
        </div>
        <span className="text-xs font-bold text-slate-500">{departmentReturns.length} record{departmentReturns.length === 1 ? '' : 's'}</span>
      </div>
      {departmentReturnsError && <p role="alert" className="mx-5 mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 sm:mx-6">{departmentReturnsError}</p>}
      {departmentReturns.length === 0
        ? <div className="grid min-h-28 place-items-center px-4 text-center"><p className="text-sm font-bold text-slate-700">No recent returns</p></div>
        : <div className="max-h-[28rem] space-y-2.5 overflow-y-auto p-4 sm:px-5">{departmentReturns.map((row) => <div key={row.id} className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/80 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900">{row.itemName}{Number(row.quantity) > 1 ? <span className="font-semibold text-slate-500"> · {row.quantity} {row.unitOfMeasure}</span> : null}</p>
                  <p className="mt-1 text-xs font-bold text-blue-700">Assigned to {row.employeeName} · {row.employeeCode}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{row.recipientLocation || 'Location not recorded'}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[0.6rem] font-extrabold ${row.status === 'Returned' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{row.status}</span>
              </div>
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[0.68rem] font-bold text-emerald-800">Surrendered to GSO{row.decidedAt || row.requestedAt ? ` · ${formatDateTime(row.decidedAt || row.requestedAt)}` : ''}{row.returnedByName ? ` · brought in by ${row.returnedByName}` : ''}{row.condition ? ` · ${row.condition}` : ''}</p>
            </div>)}</div>}
    </section>
}

    {view === 'borrowing' && <section className="mt-6 rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4"><div><h2 className="text-sm font-black text-slate-900">Borrowing requests</h2><p className="mt-1 text-[0.68rem] font-medium text-slate-500">Send a return request when you are ready to bring an issued item to GSO.</p></div><span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">{loading ? 'Loading' : `${borrowingRequests.length} active`}</span></div>
      {loading ? <div className="grid min-h-36 place-items-center text-sm font-bold text-slate-400">Loading return items...</div>
        : borrowingRequests.length === 0 ? <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 text-center"><div><p className="text-sm font-extrabold text-slate-700">No active borrowing requests</p><p className="mt-1 text-xs text-slate-500">Issued borrowing items that need to be returned will appear here.</p></div></div>
          : <div className="space-y-3">{borrowingRequests.map((request) => {
            const dueDate = request.assets.find((asset) => asset.dueDate && !asset.returnedAt)?.dueDate || request.formData.returnDate || null
            const canRequestReturn = request.status === 'Issued'
            return <article key={request.id} className="rounded-xl border-2 border-slate-300/80 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-extrabold text-slate-900">{request.title}</p><p className="mt-1 text-[0.68rem] font-semibold text-slate-500">{request.referenceNo} · {dueDate ? `Due ${formatDate(dueDate)}` : 'No due date recorded'}</p></div><span className={`rounded-full px-2.5 py-1.5 text-[0.62rem] font-extrabold ${statusTone(request.status)}`}>{request.status}</span></div>
              <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">{request.assets.filter((asset) => !asset.returnedAt).map((asset) => <li key={asset.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-3"><div><p className="text-xs font-extrabold text-slate-800">{asset.itemName}</p><p className="mt-0.5 text-[0.68rem] font-semibold text-slate-500">{asset.itemCode} · {asset.quantity} {asset.unitOfMeasure}</p></div>{asset.conditionOut && <span className="text-[0.68rem] font-semibold text-slate-500">Condition out: {asset.conditionOut}</span>}</li>)}</ul>
              {canRequestReturn ? <button type="button" disabled={returningRequest === request.id} onClick={() => void submitReturnRequest(request)} className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-50">{returningRequest === request.id ? 'Sending...' : 'Request return inspection'}</button>
                : <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Nasa GSO na ang return request. Hintayin ang inspection at confirmation.</p>}
            </article>
          })}</div>}
    </section>
}

    {view === 'reusable' && <section className="mt-6 rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4"><div><h2 className="text-sm font-black text-slate-900">GSO-recorded reusable stock</h2><p className="mt-1 text-[0.68rem] font-medium text-slate-500">Face-to-face borrowings must be returned to GSO for quantity and condition recording.</p></div><span className="rounded-lg bg-amber-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-amber-800">{loading ? 'Loading' : `${gsoBorrowings.length} active`}</span></div>
      {!loading && (gsoBorrowings.length === 0 ? <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 text-center"><p className="text-xs font-semibold text-slate-500">No active face-to-face reusable-stock borrowing.</p></div>
        : <div className="space-y-3">{gsoBorrowings.map((batch) => {
          const reusableItems = batch.items.filter((item) => item.trackingMode === 'quantity' && item.issueBehavior === 'returnable' && Number(item.quantity) - Number(item.returnedQuantity || 0) > 0)
          return <article key={batch.id} className="rounded-xl border-2 border-slate-300/80 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-extrabold text-slate-900">Borrowing recorded by GSO</p><p className="mt-1 text-[0.68rem] font-semibold text-slate-500">Request #{batch.id} · {formatDate(batch.decidedAt || batch.requestedAt, true)}</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1.5 text-[0.62rem] font-extrabold text-amber-900">Return to GSO</span></div>
            <ul className="mt-3 divide-y divide-amber-100 rounded-lg border border-amber-100 bg-white">{reusableItems.map((item) => <li key={item.issuanceId} className="flex flex-wrap items-start justify-between gap-2 px-3 py-3"><div><p className="text-xs font-extrabold text-slate-800">{item.itemName}</p><p className="mt-0.5 text-[0.68rem] font-semibold text-slate-500">{item.itemCode} · {Math.max(Number(item.quantity) - Number(item.returnedQuantity || 0), 0)} of {item.quantity} {item.unitOfMeasure} remaining</p></div><span className="text-[0.68rem] font-semibold text-slate-500">{item.condition}</span></li>)}</ul>
            <div className="mt-3 grid gap-2 rounded-lg border border-amber-100 bg-white p-3 text-xs sm:grid-cols-2"><p><span className="font-bold text-slate-500">Borrowed:</span> <span className="font-semibold text-slate-800">{formatDate(batch.borrowUseAt || batch.borrowUseDate, true)}</span></p><p><span className="font-bold text-slate-500">Return by:</span> <span className="font-semibold text-slate-800">{formatDate(batch.expectedReturnAt || batch.expectedReturnDate, true)}</span></p><p><span className="font-bold text-slate-500">Event:</span> <span className="font-semibold text-slate-800">{batch.usePurpose || '—'}</span></p><p><span className="font-bold text-slate-500">Location:</span> <span className="font-semibold text-slate-800">{batch.useLocation || '—'}</span></p></div>
            <p className="mt-3 text-xs font-semibold text-amber-900">Dalhin ang hiniram na stock sa GSO sa nakatakdang oras para maitala ang ibinalik na quantity at condition.</p>
          </article>
        })}</div>)}
    </section>
}
  </RequesterLayout>
}
