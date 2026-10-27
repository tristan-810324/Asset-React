import { useEffect, useMemo, useState } from 'react'
import RequesterLayout from './requesterlayout'
import { listMyRequests, REQUEST_TYPE_LABELS, type ServiceRequest } from './requesterApi'

const statusTone = (status: string) => {
  if (['Approved', 'Ready for Pickup', 'Returned', 'Completed', 'Closed'].includes(status)) return 'bg-emerald-50 text-emerald-700'
  if (['Rejected', 'Cancelled', 'For Repair'].includes(status)) return 'bg-rose-50 text-rose-700'
  if (status === 'Needs Information') return 'bg-amber-50 text-amber-800'
  if (['Issued', 'In Progress', 'Return Requested'].includes(status)) return 'bg-blue-50 text-blue-700'
  return 'bg-slate-100 text-slate-700'
}

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
    const matchesFilter = filter === 'All' || (filter === 'Needs my action' ? request.status === 'Needs Information' : filter === 'In review' ? ['Submitted', 'Under Review'].includes(request.status) : filter === 'Active' ? ['Approved', 'Ready for Pickup', 'Issued', 'Return Requested', 'In Progress', 'For Repair'].includes(request.status) : ['Rejected', 'Returned', 'Completed', 'Closed', 'Cancelled'].includes(request.status))
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
      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4"><div><h2 className="text-sm font-black text-slate-900">Request activity</h2><p className="mt-1 text-[0.68rem] font-medium text-slate-500">Filter by status or search by reference and title.</p></div><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[0.62rem] font-extrabold text-slate-600">{loading ? 'Loading' : `${filtered.length} shown`}</span></div>
        <div className="grid gap-3 sm:grid-cols-[1fr_15rem]">
          <div className="flex flex-wrap gap-2">{['All', 'Needs my action', 'In review', 'Active', 'Completed'].map((option) => <button key={option} type="button" onClick={() => setFilter(option)} className={`rounded-xl px-3 py-2 text-[0.68rem] font-extrabold transition ${filter === option ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{option}</button>)}</div>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference or request" className="h-10 rounded-xl border border-slate-200 bg-slate-50/60 px-3 text-xs font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
        {loading ? <div className="grid min-h-56 place-items-center text-sm font-bold text-slate-400">Loading your requests…</div> : filtered.length === 0 ? <div className="mt-4 grid min-h-56 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 text-center"><div><span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-white text-xl text-slate-400 shadow-sm">⌕</span><p className="mt-3 text-sm font-extrabold text-slate-700">{requests.length ? 'No requests match these filters' : 'You have not submitted a request yet'}</p><p className="mt-1 text-xs text-slate-500">{requests.length ? 'Try another status or reference number.' : 'Start in the Request Center to create your first submission.'}</p>{!requests.length && <a href="/requester/request-center" className="mt-3 inline-block text-xs font-extrabold text-blue-700 hover:underline">Open Request Center →</a>}</div></div> : <div className="mt-4 divide-y divide-slate-100">{filtered.map((request) => <a key={request.id} href={`/requester/requests/${request.id}`} className="flex flex-col gap-3 py-4 transition first:pt-2 hover:bg-blue-50/40 sm:flex-row sm:items-center sm:justify-between sm:px-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black text-slate-900">{request.referenceNo}</span><span className="rounded-lg bg-slate-100 px-2 py-1 text-[0.58rem] font-extrabold text-slate-600">{REQUEST_TYPE_LABELS[request.requestType]}</span></div><p className="mt-1 truncate text-sm font-bold text-slate-700">{request.title}</p><p className="mt-1 text-[0.65rem] font-medium text-slate-400">Submitted {new Date(request.createdAt).toLocaleString('en-PH')}</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><span className={`rounded-full px-2.5 py-1.5 text-[0.62rem] font-extrabold ${statusTone(request.status)}`}>{request.status}</span><span className="text-slate-400" aria-hidden="true">→</span></div></a>)}</div>}
      </section>
    </RequesterLayout>
  )
}
