import { useEffect, useMemo, useState } from 'react'
import RequesterLayout from './requesterlayout'
import { listMyActivity, type RequesterActivity } from './requesterApi'
import { formatDateTime } from './requesterrequestutils'

const actionLabels: Record<string, string> = {
  created: 'Submitted a request',
  cancelled: 'Cancelled a request',
  updated: 'Updated a request',
}

export default function MyActivities() {
  const [rows, setRows] = useState<RequesterActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  useEffect(() => {
    let active = true
    listMyActivity()
      .then((data) => { if (active) setRows(data) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load activities.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => (!dateFilter || new Date(row.changedAt).toLocaleDateString('en-CA') === dateFilter)
      && (!query || [row.entityName, row.entityKey, row.reason, actionLabels[row.action] || row.action].join(' ').toLowerCase().includes(query)))
  }, [rows, search, dateFilter])

  return <RequesterLayout title="My Activities" subtitle="Everything you did in the requester portal.">
    <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Activity log</span>
        <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">My Activities</h1>
        <p className="mt-2 text-sm font-medium text-blue-100">Your actions in the portal, newest first.</p>
      </div>
    </section>

    <section className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 bg-slate-50/45 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-black tracking-tight text-slate-900">Activity</h2>
          <p className="mt-1 text-xs text-slate-500">{loading ? 'Loading' : `${visible.length} shown`}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block w-full sm:w-64">
            <span className="mb-1 block text-[0.62rem] font-extrabold text-slate-700">Search</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Item, reference, or action" className="h-10 w-full rounded-xl border-2 border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-900 shadow-sm outline-none transition hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.62rem] font-extrabold text-slate-700">Filter by date</span>
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Filter activities by date" className="h-10 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 shadow-sm outline-none transition hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
          </label>
          {(search || dateFilter) && <button type="button" onClick={() => { setSearch(''); setDateFilter('') }} className="h-10 rounded-xl border-2 border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 shadow-sm hover:bg-slate-50">Clear</button>}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {error && <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
        {loading ? <div className="grid min-h-40 place-items-center text-sm font-semibold text-slate-400">Loading activities...</div>
          : visible.length === 0 ? <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center"><div><p className="text-sm font-bold text-slate-700">No activity yet</p><p className="mt-1 text-xs text-slate-400">Your actions in the portal will show here.</p></div></div>
          : <ul className="max-h-128 space-y-2.5 overflow-y-auto pr-1">{visible.map((row) => (
            <li key={row.id} className="rounded-xl border-2 border-slate-300/80 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-black text-slate-900">{actionLabels[row.action] || row.action}</p>
                {row.flag && <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[0.6rem] font-extrabold text-amber-800">Flagged</span>}
              </div>
              <p className="mt-1 text-xs font-bold text-blue-700">{row.entityName}{row.entityKey ? ` · ${row.entityKey}` : ''}</p>
              {row.reason && <p title={row.reason} className="mt-1 line-clamp-2 text-xs text-slate-500">{row.reason}</p>}
              <p className="mt-3 border-t border-slate-100 pt-3 text-[0.62rem] font-medium text-slate-400">{formatDateTime(row.changedAt)}</p>
            </li>
          ))}</ul>}
      </div>
    </section>
  </RequesterLayout>
}
