import { useEffect, useMemo, useState } from 'react'
import RequesterLayout from './requesterlayout'
import { listMyRequests, REQUEST_TYPE_LABELS, type ServiceRequest } from './requesterApi'

export default function RequesterNotifications() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    listMyRequests().then((data) => { if (active) setRequests(data) }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang updates.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const events = useMemo(() => requests.flatMap((request) => request.history.map((event) => ({ request, event }))).sort((a, b) => new Date(b.event.changedAt).getTime() - new Date(a.event.changedAt).getTime()), [requests])

  return <RequesterLayout title="Updates" subtitle="Recent status changes and actions across your own requests.">
    <div className="mx-auto max-w-5xl"><section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7"><div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" /><div className="relative"><span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Request activity</span><h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Updates</h1><p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">Recent status changes and actions across your submitted school requests.</p></div></section>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/55 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-4"><div><h2 className="text-sm font-black text-slate-900">Status timeline</h2><p className="mt-1 text-[0.68rem] font-medium text-slate-500">Updates are linked to your saved request history.</p></div><span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">{loading ? 'Loading' : `${events.length} updates`}</span></div>
        {loading ? <div className="grid min-h-48 place-items-center text-sm font-bold text-slate-400">Loading updates…</div> : events.length === 0 ? <div className="grid min-h-48 place-items-center text-center"><div><span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-lg font-black text-blue-700">↻</span><h2 className="mt-3 text-sm font-extrabold text-slate-700">No request updates yet</h2><p className="mt-1 text-xs text-slate-500">When a request is submitted or its status changes, it will appear here.</p></div></div> : <ol className="space-y-0">{events.map(({ request, event }) => <li key={`${request.id}-${event.id}`} className="relative flex gap-3 border-b border-slate-100 py-4 first:pt-1 last:border-0"><span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-sm font-black text-blue-700">{event.status === 'Needs Information' ? '!' : event.status === 'Rejected' ? '×' : event.status === 'Approved' ? '✓' : '↻'}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-slate-800">{event.status}</p><time className="text-[0.62rem] font-semibold text-slate-400">{new Date(event.changedAt).toLocaleString('en-PH')}</time></div><p className="mt-1 text-xs leading-relaxed text-slate-600">{event.note || `Your request status is now ${event.status}.`}</p><p className="mt-1 text-[0.62rem] font-bold text-slate-400">{request.referenceNo} · {REQUEST_TYPE_LABELS[request.requestType]}</p><a href={`/borrower/requests/${request.id}`} className="mt-2 inline-block text-[0.65rem] font-extrabold text-blue-700 hover:underline">Open request →</a></div></li>)}</ol>}
      </section>
    </div>
  </RequesterLayout>
}
