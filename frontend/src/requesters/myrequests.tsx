import { useEffect, useMemo, useState } from 'react'
import RequesterLayout from './requesterlayout'
import { MetricIcon } from './requesterrequestcard'
import { formatDateTime, getRequestItems, requestStatusLabel, requestStatusTone } from './requesterrequestutils'
import { listMyRequests, REQUEST_TYPE_LABELS, type ServiceRequest } from './requesterApi'

// Same status colors as the dashboard: Pending amber, Ready for Pickup green.
function myRequestTone(request: ServiceRequest) {
  const label = requestStatusLabel(request)
  if (label === 'Pending') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (label === 'Ready for Pickup') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return requestStatusTone(request)
}

export default function MyRequests() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [dateFilter, setDateFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    listMyRequests().then((data) => { if (active) setRequests(data) }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load requests.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const filtered = useMemo(() => requests.filter((request) => {
    // Local calendar day (YYYY-MM-DD) of when the request was submitted.
    const matchesDate = !dateFilter || new Date(request.createdAt).toLocaleDateString('en-CA') === dateFilter
    const matchesSearch = !search || `${request.referenceNo} ${request.title} ${REQUEST_TYPE_LABELS[request.requestType]}`.toLowerCase().includes(search.toLowerCase())
    return matchesDate && matchesSearch
  }), [requests, dateFilter, search])

  return (
    <RequesterLayout title="My Requests" subtitle="Search your submissions and see the latest status and next action.">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Request history</span><h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">My Requests</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Review your submissions, current status, and the next step from GSO.</p></div>
          <a href="/requester/request-center" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-blue-800 shadow-lg transition hover:bg-blue-50">+ New request</a>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 bg-slate-50/45 p-3 pb-2.5 sm:gap-3 sm:p-6 sm:pb-4">
          <div className="flex items-start gap-2 sm:gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 shadow-sm shadow-blue-900/10 sm:h-10 sm:w-10"><MetricIcon name="document" className="h-4 w-4 sm:h-5 sm:w-5" /></span>
            <div><span className="text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-blue-600 sm:text-[0.62rem]">Request history</span><h2 className="mt-0.5 text-sm font-black tracking-tight text-slate-900 sm:mt-1 sm:text-lg">Request activity</h2><p className="mt-0.5 text-[0.65rem] leading-relaxed text-slate-500 sm:mt-1 sm:text-xs">Filter by date or search by reference and title.</p></div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
          <label className="block w-full sm:w-72">
            <span className="mb-1.5 block text-xs font-extrabold text-slate-700">Search</span>
            <span className="relative block">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference or request" className="h-11 w-full rounded-xl border-2 border-slate-300 bg-white pl-10 pr-3.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
            </span>
          </label>
            <label className="block w-40">
              <span className="mb-1.5 block text-xs font-extrabold text-slate-700">Filter by date</span>
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Filter requests by submission date" className="h-11 w-full rounded-xl border-2 border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
            </label>
            {dateFilter && <button type="button" onClick={() => setDateFilter('')} className="h-11 rounded-xl border-2 border-slate-300 bg-white px-4 text-xs font-extrabold text-slate-700 shadow-sm hover:bg-slate-50">Clear</button>}
          <span className="self-center rounded-lg bg-blue-50 px-2 py-1 text-[0.58rem] font-extrabold text-blue-700 sm:px-2.5 sm:py-1.5 sm:text-[0.62rem]">{loading ? 'Loading' : `${filtered.length} shown`}</span></div>
        </div>


        {error && <p role="alert" className="mx-3 mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700 sm:mx-6">{error}</p>}

        {loading ? <div className="grid min-h-40 place-items-center text-xs font-semibold text-slate-500">Loading your requests…</div>
          : filtered.length === 0 ? <div className="m-3 grid min-h-40 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center sm:m-6"><div><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><MetricIcon name="requests" /></span><p className="mt-2 text-xs font-extrabold text-slate-700">{requests.length ? 'No requests match these filters' : 'You have not submitted a request yet'}</p><p className="mt-1 text-[0.68rem] text-slate-500">{requests.length ? 'Try another status or reference number.' : 'Start in the Request Center to create your first submission.'}</p>{!requests.length && <a href="/requester/request-center" className="mt-3 inline-flex text-[0.68rem] font-extrabold text-blue-600 hover:underline">Open Request Center →</a>}</div></div>
            : <ul className="inventory-list-scrollbar max-h-120 space-y-2.5 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4">{filtered.map((request) => {
              const items = getRequestItems(request)
              const [firstItem] = items
              return <li key={request.id}>
                <div className="rounded-xl border-2 border-slate-300/80 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-black text-slate-900">{request.referenceNo}</span>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[0.6rem] font-extrabold ${myRequestTone(request)}`}>{requestStatusLabel(request)}</span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-blue-700">{request.title}</p>
                  {firstItem && <p className="mt-1 text-xs text-slate-500">{firstItem.quantity} × {firstItem.itemName}{items.length > 1 ? ` · +${items.length - 1} more` : ''}</p>}
                  {request.status === 'Needs Information' && <p className="mt-2 text-xs font-bold text-amber-700">GSO needs more information.</p>}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <p className="text-[0.62rem] font-medium text-slate-400">Updated {formatDateTime(request.updatedAt)}</p>
                    <a href={`/requester/requests/${request.id}`} aria-label={`Request details for ${request.referenceNo}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[0.65rem] font-extrabold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
                      Request details
                      <MetricIcon name="arrow-right" className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </li>
            })}</ul>}
      </section>
    </RequesterLayout>
  )
}
