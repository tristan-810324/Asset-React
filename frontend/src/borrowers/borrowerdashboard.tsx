import { useEffect, useMemo, useState } from 'react'
import RequesterLayout from './requesterlayout'
import { getCurrentUser, type AuthUser } from '../auth/authApi'
import { listMyRequests, REQUEST_TYPE_LABELS, type ServiceRequest } from './requesterApi'

const statusTone = (status: string) => ['Approved', 'Ready for Pickup', 'Returned', 'Completed', 'Closed'].includes(status) ? 'bg-emerald-50 text-emerald-700' : ['Rejected', 'Cancelled', 'For Repair'].includes(status) ? 'bg-rose-50 text-rose-700' : status === 'Needs Information' ? 'bg-amber-50 text-amber-800' : ['Issued', 'In Progress', 'Return Requested'].includes(status) ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'

export default function BorrowerDashboard() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([getCurrentUser(), listMyRequests()])
      .then(([currentUser, ownRequests]) => {
        if (!active) return
        setUser(currentUser)
        setRequests(ownRequests)
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang borrower overview.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const needsAction = useMemo(() => requests.filter((request) => request.status === 'Needs Information').length, [requests])
  const activeLoans = useMemo(() => requests.filter((request) => request.requestType === 'BORROWING' && ['Ready for Pickup', 'Issued', 'Return Requested', 'For Repair'].includes(request.status)).length, [requests])
  const inProgress = useMemo(() => requests.filter((request) => ['Submitted', 'Under Review', 'Approved', 'In Progress'].includes(request.status)).length, [requests])

  return <RequesterLayout title="Home" subtitle="Your school service requests and borrowing activity.">
    <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-7 text-white shadow-xl shadow-blue-950/15 sm:px-8 sm:py-9">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" /><div className="absolute -right-10 top-1/2 hidden h-56 w-56 -translate-y-1/2 rounded-full border-26 border-white/5 sm:block" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div className="max-w-3xl"><span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Borrower account verified</span><h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Start a school request, track GSO decisions, and keep your borrowing due dates in one place.</p></div><a href="/borrower/request-center" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-blue-800 shadow-lg transition hover:bg-blue-50">+ Start a request</a></div>
    </section>

    {error && <p role="alert" className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error}</p>}
    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Requester overview">
      {[
        { label: 'Total requests', value: requests.length, detail: 'All submitted forms', icon: '▤', tone: 'bg-blue-50 text-blue-700' },
        { label: 'Needs your action', value: needsAction, detail: 'Reply to GSO questions', icon: '!', tone: 'bg-amber-50 text-amber-700' },
        { label: 'In review / progress', value: inProgress, detail: 'Being handled by GSO', icon: '↻', tone: 'bg-violet-50 text-violet-700' },
        { label: 'Active borrowings', value: activeLoans, detail: 'Pick up, issued, or return', icon: '□', tone: 'bg-emerald-50 text-emerald-700' },
      ].map((item) => <article key={item.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/50"><div className="flex items-start justify-between"><div><p className="text-xs font-bold text-slate-500">{item.label}</p><p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{loading ? '—' : item.value}</p><p className="mt-1 text-[0.68rem] font-medium text-slate-400">{item.detail}</p></div><span className={`grid h-10 w-10 place-items-center rounded-xl text-lg font-black ${item.tone}`}>{item.icon}</span></div></article>)}
    </section>

    <section className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
      <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50">
        <div className="flex items-center justify-between gap-3 px-5 py-5 sm:px-6"><div><h2 className="text-base font-black tracking-tight text-slate-900">Recent requests</h2><p className="mt-1 text-xs font-medium text-slate-500">Current status and the latest submissions.</p></div><a href="/borrower/my-requests" className="text-xs font-extrabold text-blue-700 hover:underline">View all</a></div>
        {requests.length === 0 && !loading ? <div className="m-5 grid min-h-40 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center"><div><p className="text-sm font-extrabold text-slate-700">No requests yet</p><p className="mt-1 text-xs text-slate-500">Choose one of the available school forms to begin.</p><a href="/borrower/request-center" className="mt-3 inline-block text-xs font-extrabold text-blue-700 hover:underline">Open Request Center →</a></div></div> : <div className="divide-y divide-slate-100">{requests.slice(0, 5).map((request) => <a key={request.id} href={`/borrower/requests/${request.id}`} className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-blue-50/40 sm:px-6"><div className="min-w-0"><p className="text-[0.62rem] font-black text-slate-500">{request.referenceNo} · {REQUEST_TYPE_LABELS[request.requestType]}</p><p className="mt-1 truncate text-xs font-extrabold text-slate-800">{request.title}</p><p className="mt-1 text-[0.62rem] text-slate-400">{new Date(request.createdAt).toLocaleDateString('en-PH')}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1.5 text-[0.58rem] font-extrabold ${statusTone(request.status)}`}>{request.status}</span></a>)}</div>}
      </article>

      <aside className="space-y-4">
        <article className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5 sm:p-6"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg font-black text-blue-700 shadow-sm">✓</span><h2 className="mt-4 text-base font-black tracking-tight text-slate-900">Your account</h2><p className="mt-2 text-xs leading-relaxed text-slate-600">Your verified account identifies you on each request. Keep access to your school email for status updates.</p><div className="mt-4 rounded-xl border border-blue-100 bg-white/80 px-3 py-2.5"><p className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">Registered email</p><p className="mt-1 truncate text-xs font-bold text-slate-800">{user?.email || (loading ? 'Loading account…' : 'Account not available')}</p></div><a href="/borrower/profile" className="mt-4 inline-block text-xs font-extrabold text-blue-700 hover:underline">View profile →</a></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-black text-slate-900">Need help?</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">Contact the General Services Office if a request needs urgent follow-up or if your account details need correction.</p></article>
      </aside>
    </section>
  </RequesterLayout>
}
