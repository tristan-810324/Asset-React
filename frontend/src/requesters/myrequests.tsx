import { useEffect, useMemo, useState } from 'react'
import RequesterLayout from './requesterlayout'
import { MetricIcon, RequestItemPreview } from './requesterrequestcard'
import { formatDate, formatDateTime, getRequestItems, requestStatusLabel, requestStatusTone } from './requesterrequestutils'
import { listMyRequests, REQUEST_TYPE_LABELS, type ServiceRequest } from './requesterApi'

export default function MyRequests() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    listMyRequests().then((data) => { if (active) setRequests(data) }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang requests.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const filtered = useMemo(() => requests.filter((request) => {
    const matchesFilter = filter === 'All' || (filter === 'Needs my action' ? request.status === 'Needs Information' : filter === 'In review' ? ['Submitted', 'Under Review', 'GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed', 'Sent to Finance'].includes(request.status) : filter === 'Active' ? ['Approved', 'Ready for Pickup', 'Issued', 'Return Requested', 'In Progress', 'For Repair'].includes(request.status) : ['Rejected', 'Returned', 'Completed', 'Closed', 'Cancelled'].includes(request.status))
    const matchesSearch = !search || `${request.referenceNo} ${request.title} ${REQUEST_TYPE_LABELS[request.requestType]}`.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  }), [requests, filter, search])

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
            <div><span className="text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-blue-600 sm:text-[0.62rem]">Request history</span><h2 className="mt-0.5 text-sm font-black tracking-tight text-slate-900 sm:mt-1 sm:text-lg">Request activity</h2><p className="mt-0.5 text-[0.65rem] leading-relaxed text-slate-500 sm:mt-1 sm:text-xs">Filter by status or search by reference and title.</p></div>
          </div>
          <span className="rounded-lg bg-blue-50 px-2 py-1 text-[0.58rem] font-extrabold text-blue-700 sm:px-2.5 sm:py-1.5 sm:text-[0.62rem]">{loading ? 'Loading' : `${filtered.length} shown`}</span>
        </div>

        <div className="grid gap-3 p-3 sm:grid-cols-[1fr_15rem] sm:p-6 sm:pb-0">
          <div className="flex flex-wrap gap-2">{['All', 'Needs my action', 'In review', 'Active', 'Completed'].map((option) => <button key={option} type="button" onClick={() => setFilter(option)} className={`rounded-xl px-3 py-2 text-[0.68rem] font-extrabold transition ${filter === option ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{option}</button>)}</div>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference or request" className="h-10 rounded-xl border border-slate-200 bg-slate-50/60 px-3 text-xs font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
        </div>

        {error && <p role="alert" className="mx-3 mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700 sm:mx-6">{error}</p>}

        {loading ? <div className="grid min-h-40 place-items-center text-xs font-semibold text-slate-500">Loading your requests…</div>
          : filtered.length === 0 ? <div className="m-3 grid min-h-40 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center sm:m-6"><div><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><MetricIcon name="requests" /></span><p className="mt-2 text-xs font-extrabold text-slate-700">{requests.length ? 'No requests match these filters' : 'You have not submitted a request yet'}</p><p className="mt-1 text-[0.68rem] text-slate-500">{requests.length ? 'Try another status or reference number.' : 'Start in the Request Center to create your first submission.'}</p>{!requests.length && <a href="/requester/request-center" className="mt-3 inline-flex text-[0.68rem] font-extrabold text-blue-600 hover:underline">Open Request Center →</a>}</div></div>
            : <ul className="divide-y divide-slate-200 px-3 sm:px-6">{filtered.map((request) => {
              const items = getRequestItems(request)
              const [firstItem] = items
              return <li key={request.id} className="py-2.5 first:pt-1 last:pb-1 sm:py-4">
                <a href={`/requester/requests/${request.id}`} className="block rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-blue-200 hover:bg-blue-50/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
                    <div className="flex min-w-0 items-start gap-2 sm:gap-3">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 sm:h-9 sm:w-9"><MetricIcon name="document" className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" /></span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400 sm:gap-x-2 sm:text-[0.63rem]">
                          <span>{request.referenceNo}</span>
                          <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-blue-700">{REQUEST_TYPE_LABELS[request.requestType]}</span>
                          <span>{formatDate(request.createdAt)}</span>
                        </p>
                        <h3 className="mt-1 text-xs font-extrabold leading-relaxed text-slate-900 sm:mt-1.5 sm:text-sm">{request.title}</h3>
                        <p className="mt-0.5 text-[0.58rem] font-medium text-slate-400 sm:text-[0.63rem]">Last updated {formatDateTime(request.updatedAt)}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.56rem] font-extrabold sm:px-2.5 sm:py-1 sm:text-[0.6rem] ${requestStatusTone(request)}`}>{requestStatusLabel(request)}</span>
                  </div>
                  {firstItem && <div className="mt-3">
                    <RequestItemPreview item={firstItem} index={0} requestType={request.requestType} />
                    {items.length > 1 && <p className="mt-1.5 text-[0.6rem] font-bold text-blue-600">+{items.length - 1} more item{items.length - 1 === 1 ? '' : 's'} · view full request</p>}
                  </div>}
                  {request.status === 'Needs Information' && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[0.62rem] font-bold text-amber-800 sm:mt-3 sm:px-3 sm:py-2 sm:text-[0.65rem]">May hinihinging dagdag na impormasyon ang GSO.</p>}
                </a>
              </li>
            })}</ul>}
      </section>
    </RequesterLayout>
  )
}
