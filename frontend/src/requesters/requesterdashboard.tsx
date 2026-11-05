import { useEffect, useMemo, useState } from 'react'
import RequesterLayout from './requesterlayout'
import { useRequesterIdentity } from './requesteridentitycontext'
import {
  decideMyIssuanceBatch,
  listMyPendingIssuanceBatches,
  listMyIssuanceActivity,
  listMyRequests,
  type RequesterIssuanceApproval,
  type ServiceRequest,
} from './requesterApi'

function formatScheduledDateTime(value: string | null | undefined) {
  if (!value) return 'Not set'
  const includesTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  const date = new Date(includesTime ? `${value}:00+08:00` : `${value}T00:00:00+08:00`)
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    ...(includesTime ? { timeStyle: 'short' as const } : {}),
    timeZone: 'Asia/Manila',
  }).format(date)
}

function MetricIcon({ name }: { name: 'requests' | 'action' | 'progress' | 'borrow' }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    {name === 'requests' && <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>}
    {name === 'action' && <><circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" /></>}
    {name === 'progress' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
    {name === 'borrow' && <><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" /><path d="m3 7 9 5 9-5M12 12v9" /></>}
  </svg>
}

function RequesterDashboardContent() {
  const { identity, openIdentityPrompt, user } = useRequesterIdentity()
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [pendingIssuances, setPendingIssuances] = useState<RequesterIssuanceApproval[]>([])
  const [gsoIssuanceActivity, setGsoIssuanceActivity] = useState<RequesterIssuanceApproval[]>([])
  const [gsoActivityLoading, setGsoActivityLoading] = useState(true)
  const [gsoActivityError, setGsoActivityError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [issuanceLoading, setIssuanceLoading] = useState(true)
  const [issuanceError, setIssuanceError] = useState('')
  const [issuanceDecisionMessage, setIssuanceDecisionMessage] = useState('')
  const [activeIssuanceDecision, setActiveIssuanceDecision] = useState('')

  useEffect(() => {
    let active = true
    listMyRequests()
      .then((ownRequests) => {
        if (!active) return
        setRequests(ownRequests)
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang requester overview.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const refreshGsoActivity = () => {
      listMyIssuanceActivity()
        .then((batches) => {
          if (!active) return
          setGsoIssuanceActivity(batches)
          setGsoActivityError('')
        })
        .catch((reason: unknown) => { if (active) setGsoActivityError(reason instanceof Error ? reason.message : 'Hindi ma-load ang GSO borrowing notices.') })
        .finally(() => { if (active) setGsoActivityLoading(false) })
    }
    refreshGsoActivity()
    const timer = window.setInterval(refreshGsoActivity, 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    let active = true
    listMyPendingIssuanceBatches()
      .then((batches) => {
        if (active) setPendingIssuances(batches)
      })
      .catch((reason: unknown) => {
        if (active) setIssuanceError(reason instanceof Error ? reason.message : 'Hindi ma-load ang pending issuance approvals.')
      })
      .finally(() => { if (active) setIssuanceLoading(false) })
    return () => { active = false }
  }, [])

  async function handleIssuanceDecision(batchId: string) {
    setActiveIssuanceDecision(batchId)
    setIssuanceError('')
    setIssuanceDecisionMessage('')
    try {
      const decision = await decideMyIssuanceBatch(batchId, 'acknowledge')
      setPendingIssuances((current) => current.filter((batch) => batch.id !== batchId))
      setIssuanceDecisionMessage(decision.status === 'Issued'
        ? `Receipt confirmed. Custody is active${decision.generatedTagCount ? ` and ${decision.generatedTagCount} unit barcode${decision.generatedTagCount === 1 ? '' : 's'} is now linked to your account` : ''}.`
        : 'Receipt status updated.')
    } catch (reason) {
      setIssuanceError(reason instanceof Error ? reason.message : 'Hindi ma-save ang issuance decision.')
    } finally {
      setActiveIssuanceDecision('')
    }
  }

  const needsAction = useMemo(() => requests.filter((request) => request.status === 'Needs Information').length, [requests])
  const activeGsoBorrowings = useMemo(() => gsoIssuanceActivity.filter((batch) => batch.status === 'Issued'
    && batch.items.some((item) => item.trackingMode === 'quantity'
      && item.issueBehavior === 'returnable'
      && item.status !== 'Returned'
      && Number(item.quantity) - Number(item.returnedQuantity || 0) > 0)), [gsoIssuanceActivity])
  const activeLoans = useMemo(() => requests.filter((request) => request.requestType === 'BORROWING' && ['Ready for Pickup', 'Issued', 'Return Requested', 'For Repair'].includes(request.status)).length + activeGsoBorrowings.length, [requests, activeGsoBorrowings])
  const inProgress = useMemo(() => requests.filter((request) => ['Submitted', 'Under Review', 'Approved', 'In Progress'].includes(request.status)).length, [requests])
  const identityLabel = identity?.status === 'Verified' ? 'GSO-verified staff account' : identity?.status === 'Pending' ? 'GSO verification pending' : identity?.status === 'Needs Correction' ? 'Identity details need correction' : 'Complete staff identity details'

  return <div className="space-y-6">
    <section className="relative isolate overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
      <div className="absolute -right-12 top-1/2 -z-10 hidden h-56 w-56 -translate-y-1/2 rounded-full border-24 border-white/5 lg:block" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
            <span className={`h-1.5 w-1.5 rounded-full ${identity?.status === 'Verified' ? 'bg-emerald-400' : 'bg-amber-300'}`} /> {identityLabel}
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Manage your school requests, confirm issued equipment, and keep track of return schedules.</p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <a href="/requester/request-center" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-blue-950 shadow-lg transition hover:bg-blue-50">Start a request <span aria-hidden="true">→</span></a>
            <a href="/requester/my-requests" className="inline-flex h-10 items-center justify-center rounded-xl border border-white/20 bg-white/8 px-4 text-xs font-extrabold text-white transition hover:bg-white/15">View my requests</a>
          </div>
        </div>
        <div className="grid gap-2 rounded-2xl border border-white/12 bg-slate-950/15 p-3 sm:grid-cols-2 lg:w-72 lg:grid-cols-1">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/6 px-3.5 py-3"><span className="text-[0.65rem] font-bold text-blue-100">Account status</span><span className={`rounded-lg px-2 py-1 text-[0.58rem] font-extrabold ${identity?.status === 'Verified' ? 'bg-emerald-300/15 text-emerald-100' : 'bg-amber-300/15 text-amber-100'}`}>{identity?.status || 'Checking'}</span></div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/6 px-3.5 py-3"><span className="text-[0.65rem] font-bold text-blue-100">Staff ID</span><span className="truncate text-[0.68rem] font-extrabold text-white">{identity?.employeeCode || 'Not linked yet'}</span></div>
        </div>
      </div>
    </section>

    {identity && identity.status !== 'Verified' && <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm shadow-slate-200/45 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><MetricIcon name="action" /></span><div><p className="text-sm font-extrabold text-slate-900">{identity.status === 'Pending' ? 'Identity review in progress' : identity.status === 'Needs Correction' ? 'Identity details need correction' : 'Complete your staff details'}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{identity.status === 'Pending' ? 'Your details are with GSO for review. Request submission opens after verification.' : identity.status === 'Needs Correction' ? 'Review the GSO note and update your profile before submitting a request.' : 'Finish your profile so GSO can verify your requester account.'}</p></div></div>
      <button type="button" onClick={openIdentityPrompt} className="shrink-0 rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-amber-800">{identity.status === 'Pending' ? 'View status' : 'Update profile'}</button>
    </section>}

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-xs font-bold text-rose-700 shadow-sm">{error}</p>}
    {issuanceDecisionMessage && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">{issuanceDecisionMessage}</p>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Requester overview" aria-busy={loading || issuanceLoading}>
      {[
        { label: 'Total requests', value: requests.length, detail: 'Forms submitted to GSO', icon: 'requests' as const, tone: 'border-blue-100 bg-blue-50 text-blue-700' },
        { label: 'Needs your action', value: needsAction + pendingIssuances.length, detail: 'Replies and handovers', icon: 'action' as const, tone: 'border-amber-100 bg-amber-50 text-amber-700' },
        { label: 'In review / progress', value: inProgress, detail: 'Currently handled by GSO', icon: 'progress' as const, tone: 'border-violet-100 bg-violet-50 text-violet-700' },
        { label: 'Active borrowings', value: activeLoans, detail: 'Check due dates and return items', icon: 'borrow' as const, tone: 'border-emerald-100 bg-emerald-50 text-emerald-700' },
      ].map((item) => <article key={item.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold text-slate-500">{item.label}</p><p aria-live="polite" className="mt-2 text-3xl font-black tracking-tight text-slate-900">{loading || item.label === 'Needs your action' && issuanceLoading ? '—' : item.value.toLocaleString('en-PH')}</p></div><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border shadow-sm shadow-slate-900/5 ${item.tone}`}><MetricIcon name={item.icon} /></span></div>
        <div className="mt-4 border-t border-slate-100 pt-3 text-[0.68rem] font-medium text-slate-400">{item.detail}</div>
      </article>)}
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      {identity?.status === 'Verified' && <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6" aria-labelledby="handover-title">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4"><div><span className="text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Employee action</span><h2 id="handover-title" className="mt-1 text-base font-black tracking-tight text-slate-900">Per-unit handover</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">Confirm receipt after you physically receive the assigned equipment.</p></div><span className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[0.62rem] font-extrabold text-blue-700">{issuanceLoading ? 'Loading' : `${pendingIssuances.length} waiting`}</span></div>
        {issuanceError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-bold text-rose-700">{issuanceError}</p>}
        {issuanceLoading ? <div className="mt-4 grid min-h-36 place-items-center rounded-xl bg-slate-50 text-xs font-semibold text-slate-500">Loading handovers...</div>
          : pendingIssuances.length === 0 ? <div className="mt-4 grid min-h-36 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center"><div><span className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-white text-emerald-600 shadow-sm">✓</span><p className="mt-2 text-xs font-extrabold text-slate-700">No handovers waiting</p><p className="mt-1 text-[0.68rem] text-slate-500">New equipment receipts will appear here for confirmation.</p></div></div>
            : <div className="mt-4 space-y-3">{pendingIssuances.map((batch) => {
              const isPerUnitHandover = batch.items.length > 0 && batch.items.every((item) => item.trackingMode === 'individual')
              const unitCount = batch.items.reduce((total, item) => total + item.quantity, 0)
              return <div key={batch.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-extrabold text-slate-900">{isPerUnitHandover ? 'Per-unit asset reserved' : 'Issuance needs GSO follow-up'}</p><p className="mt-1 text-[0.65rem] font-semibold text-slate-500">{new Date(batch.requestedAt).toLocaleString('en-PH')}</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[0.58rem] font-extrabold text-amber-800">Awaiting handover</span></div>
                <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">{batch.items.map((item) => <li key={item.issuanceId} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5"><div><p className="text-xs font-extrabold text-slate-800">{item.itemName}</p><p className="mt-0.5 text-[0.65rem] font-semibold text-slate-500">{item.itemCode} · {item.condition}</p>{item.notes && <p className="mt-1 text-[0.65rem] text-slate-500">{item.trackingMode === 'individual' ? 'Accessories' : 'Distribution note'}: {item.notes}</p>}</div><span className="text-xs font-extrabold text-slate-700">{item.quantity} {item.unitOfMeasure}</span></li>)}</ul>
                {isPerUnitHandover ? <button type="button" disabled={activeIssuanceDecision === batch.id} onClick={() => void handleIssuanceDecision(batch.id)} className="mt-3 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-50">{activeIssuanceDecision === batch.id ? 'Saving receipt...' : `Confirm receipt of ${unitCount} unit${unitCount === 1 ? '' : 's'}`}</button> : <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[0.68rem] font-semibold text-amber-800">For reusable stock, use the Request Center to submit a borrowing request.</p>}
              </div>
            })}</div>}
      </article>}

      {identity?.status === 'Verified' && <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6" aria-labelledby="borrowing-title">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4"><div><span className="text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-emerald-700">Return schedule</span><h2 id="borrowing-title" className="mt-1 text-base font-black tracking-tight text-slate-900">Reusable-stock borrowings</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">Face-to-face loans recorded by GSO, including their event and due date.</p></div><a href="/requester/return-items" className="shrink-0 text-xs font-extrabold text-blue-700 hover:underline">View returns →</a></div>
        {gsoActivityError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{gsoActivityError}</p>}
        {gsoActivityLoading ? <div className="mt-4 grid min-h-36 place-items-center rounded-xl bg-slate-50 text-xs font-semibold text-slate-500">Loading borrowing schedule...</div>
          : activeGsoBorrowings.length === 0 ? <div className="mt-4 grid min-h-36 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center"><div><span className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-white text-blue-600 shadow-sm">↻</span><p className="mt-2 text-xs font-extrabold text-slate-700">No active reusable-stock loans</p><p className="mt-1 text-[0.68rem] text-slate-500">GSO-recorded borrowings and return schedules will appear here.</p></div></div>
            : <div className="mt-4 space-y-3">{activeGsoBorrowings.slice(0, 3).map((batch) => {
              const reusableItems = batch.items.filter((item) => item.trackingMode === 'quantity' && item.issueBehavior === 'returnable' && Number(item.quantity) - Number(item.returnedQuantity || 0) > 0)
              return <div key={batch.id} className="rounded-xl border border-emerald-100 bg-emerald-50/35 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-extrabold text-slate-900">Borrowing recorded by GSO</p><p className="mt-1 text-[0.65rem] font-semibold text-slate-500">{new Date(batch.decidedAt || batch.requestedAt).toLocaleString('en-PH')}</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[0.58rem] font-extrabold text-amber-900">Returnable</span></div>
                <ul className="mt-3 space-y-1.5">{reusableItems.map((item) => <li key={item.issuanceId} className="flex items-start justify-between gap-3 text-xs"><span className="font-bold text-slate-800">{item.itemName}</span><span className="shrink-0 font-semibold text-slate-500">{Math.max(Number(item.quantity) - Number(item.returnedQuantity || 0), 0)} / {item.quantity} {item.unitOfMeasure}</span></li>)}</ul>
                <div className="mt-3 grid gap-x-4 gap-y-1.5 border-t border-emerald-100 pt-3 text-[0.65rem] sm:grid-cols-2"><p><span className="font-bold text-slate-500">Return by:</span> <span className="font-semibold text-slate-800">{formatScheduledDateTime(batch.expectedReturnAt || batch.expectedReturnDate)}</span></p><p><span className="font-bold text-slate-500">Borrowed:</span> <span className="font-semibold text-slate-800">{formatScheduledDateTime(batch.borrowUseAt || batch.borrowUseDate)}</span></p><p><span className="font-bold text-slate-500">Event:</span> <span className="font-semibold text-slate-800">{batch.usePurpose || '—'}</span></p><p><span className="font-bold text-slate-500">Location:</span> <span className="font-semibold text-slate-800">{batch.useLocation || '—'}</span></p></div>
              </div>
            })}</div>}
      </article>}
    </section>

    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-4"><div><span className="text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Requester workspace</span><h2 className="mt-1 text-base font-black tracking-tight text-slate-900">Quick access</h2><p className="mt-1 text-xs text-slate-500">Go directly to the tools you use most.</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { title: 'Request Center', description: 'Browse and submit a school request.', href: '/requester/request-center', tone: 'bg-blue-50 text-blue-700', mark: '+' },
          { title: 'My Requests', description: 'Review status and respond to GSO.', href: '/requester/my-requests', tone: 'bg-violet-50 text-violet-700', mark: '≡' },
          { title: 'My Issued Items', description: 'View assets, supplies, and borrowed stock.', href: '/requester/issued-items', tone: 'bg-indigo-50 text-indigo-700', mark: '▣' },
          { title: 'Notifications', description: 'See request and item updates.', href: '/requester/notifications', tone: 'bg-sky-50 text-sky-700', mark: '!' },
          { title: 'Return Items', description: 'Check return schedules and active loans.', href: '/requester/return-items', tone: 'bg-emerald-50 text-emerald-700', mark: '↶' },
        ].map((link) => <a key={link.title} href={link.href} className="group rounded-xl border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50/35 hover:shadow-sm"><div className="flex items-start justify-between gap-3"><span className={`grid h-9 w-9 place-items-center rounded-xl text-lg font-black ${link.tone}`}>{link.mark}</span><span className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden="true">→</span></div><h3 className="mt-3 text-xs font-extrabold text-slate-900">{link.title}</h3><p className="mt-1 text-[0.68rem] leading-relaxed text-slate-500">{link.description}</p></a>)}
      </div>
    </section>
  </div>
}

export default function RequesterDashboard() {
  return <RequesterLayout title="Home" subtitle="Your school service requests and borrowing activity."><RequesterDashboardContent /></RequesterLayout>
}
