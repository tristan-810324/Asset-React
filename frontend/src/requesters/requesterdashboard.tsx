import { useEffect, useMemo, useState } from 'react'
import RequesterLayout from './requesterlayout'
import { useRequesterIdentity } from './requesteridentitycontext'
import { MetricIcon, RequestItemPreview } from './requesterrequestcard'
import { formatDate, formatDateTime, getRequestItems, requestStatusLabel, requestStatusTone } from './requesterrequestutils'
import {
  getMyDepartmentIssuanceSummary,
  listMyDepartmentReturns,
  listMyPendingIssuanceBatches,
  listMyRequests,
  REQUEST_TYPE_LABELS,
  type RequesterDepartmentReturn,
  type RequesterIssuanceApproval,
  type ServiceRequest,
} from './requesterApi'

function returnStatusTone(status: string) {
  if (status === 'Returned') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'Pending' || status === 'Email Failed') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (status === 'Rejected' || status === 'Lost') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function RequesterDashboardContent() {
  const { identity, user } = useRequesterIdentity()
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [pendingIssuances, setPendingIssuances] = useState<RequesterIssuanceApproval[]>([])
  const [departmentIssuedUnits, setDepartmentIssuedUnits] = useState<number | null>(null)
  const [departmentIssuanceLoading, setDepartmentIssuanceLoading] = useState(true)
  const [departmentIssuanceError, setDepartmentIssuanceError] = useState('')
  const [departmentReturns, setDepartmentReturns] = useState<RequesterDepartmentReturn[]>([])
  const [departmentReturnsLoading, setDepartmentReturnsLoading] = useState(true)
  const [departmentReturnsError, setDepartmentReturnsError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [issuanceLoading, setIssuanceLoading] = useState(true)
  const [issuanceError, setIssuanceError] = useState('')

  useEffect(() => {
    let active = true
    listMyRequests()
      .then((ownRequests) => {
        if (active) setRequests(ownRequests)
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang requester overview.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const refreshDepartmentIssuance = () => {
      getMyDepartmentIssuanceSummary()
        .then((summary) => {
          if (!active) return
          setDepartmentIssuedUnits(summary.totalIssuedUnits)
          setDepartmentIssuanceError('')
        })
        .catch((reason: unknown) => { if (active) setDepartmentIssuanceError(reason instanceof Error ? reason.message : 'Hindi ma-load ang department issuance total.') })
        .finally(() => { if (active) setDepartmentIssuanceLoading(false) })
    }
    refreshDepartmentIssuance()
    const timer = window.setInterval(refreshDepartmentIssuance, 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    let active = true
    const refreshDepartmentReturns = () => {
      listMyDepartmentReturns()
        .then((returns) => {
          if (!active) return
          setDepartmentReturns(returns)
          setDepartmentReturnsError('')
        })
        .catch((reason: unknown) => { if (active) setDepartmentReturnsError(reason instanceof Error ? reason.message : 'Hindi ma-load ang department returns.') })
        .finally(() => { if (active) setDepartmentReturnsLoading(false) })
    }
    refreshDepartmentReturns()
    const timer = window.setInterval(refreshDepartmentReturns, 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    let active = true
    listMyPendingIssuanceBatches()
      .then((batches) => {
        if (active) setPendingIssuances(batches)
      })
      .catch((reason: unknown) => {
        if (active) setIssuanceError(reason instanceof Error ? reason.message : 'Hindi ma-update ang pickup preparation.')
      })
      .finally(() => { if (active) setIssuanceLoading(false) })
    return () => { active = false }
  }, [])

  const inProgressStatuses = useMemo(() => new Set([
    'Submitted', 'Under Review', 'Needs Information', 'GSO Endorsed', 'Finance Handoff Pending',
    'Finance Handoff Failed', 'Sent to Finance', 'Approved',
    'Ready for Pickup', 'Issued', 'Return Requested', 'For Repair', 'In Progress',
  ]), [])
  const inProgressCount = useMemo(() => requests.filter((request) => inProgressStatuses.has(request.status)).length, [inProgressStatuses, requests])
  const recentRequests = useMemo(() => [...requests]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 8), [requests])
  const recentReturns = useMemo(() => [...departmentReturns]
    .sort((left, right) => new Date(right.decidedAt || right.requestedAt).getTime() - new Date(left.decidedAt || left.requestedAt).getTime())
    .slice(0, 8), [departmentReturns])

  return <div className="space-y-6">
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error}</p>}

    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.85fr)]" aria-label="Requester overview" aria-busy={loading || departmentIssuanceLoading}>
      <article className="relative isolate overflow-hidden rounded-2xl bg-linear-to-br from-[#092447] via-[#123c70] to-[#24558f] p-4 text-white shadow-xl shadow-blue-950/15 sm:p-5">
        <div className="absolute -right-12 -top-10 h-40 w-40 rounded-full border-16 border-white/5 sm:-right-16 sm:-top-14 sm:h-52 sm:w-52 sm:border-22" />
        <div className="absolute -bottom-24 right-16 h-36 w-36 rounded-full border-14 border-blue-300/10 sm:-bottom-28 sm:right-24 sm:h-48 sm:w-48 sm:border-18" />
        <div className="relative flex flex-col justify-between">
          <div>
            <div className="mb-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-2.5 py-1 text-[0.55rem] font-extrabold uppercase tracking-[0.12em] text-blue-100 sm:px-3 sm:text-[0.6rem] sm:tracking-[0.16em]">
                <span className={`h-1.5 w-1.5 rounded-full ${identity?.status === 'Verified' ? 'bg-emerald-300' : 'bg-amber-300'}`} /><span className="sm:hidden">Workspace</span><span className="hidden sm:inline">EmployeeHead workspace</span>
              </span>
              <h1 className="mt-2 text-lg font-black leading-tight tracking-tight sm:text-2xl">Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.</h1>
              <p className="mt-1 max-w-xl text-[0.62rem] font-medium leading-relaxed text-blue-100 sm:text-xs">Track requests, recipients, and returns.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-1.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-blue-100"><MetricIcon name="shield" className="h-4 w-4" /></span>
                  <span><span className="block text-[0.5rem] font-extrabold uppercase tracking-widest text-blue-200"><span className="sm:hidden">Status</span><span className="hidden sm:inline">Account status</span></span><span className="mt-0.5 block text-[0.68rem] font-black text-white sm:text-xs">{identity?.status || 'Checking'}</span></span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-1.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-blue-100"><MetricIcon name="id" className="h-4 w-4" /></span>
                  <span><span className="block text-[0.5rem] font-extrabold uppercase tracking-widest text-blue-200"><span className="sm:hidden">ID</span><span className="hidden sm:inline">Employee ID</span></span><span className="mt-0.5 block truncate text-[0.68rem] font-black text-white sm:text-xs">{identity?.employeeCode || 'Not linked yet'}</span></span>
                </div>
              </div>
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-blue-200/20 pt-3">
              <div>
                <p className="text-[0.55rem] font-extrabold uppercase tracking-[0.12em] text-blue-200 sm:text-[0.62rem] sm:tracking-[0.16em]"><span className="sm:hidden">Activity</span><span className="hidden sm:inline">Requester activity</span></p>
                <h2 className="mt-1 text-sm font-black tracking-tight text-white sm:text-base">Total requests</h2>
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-blue-100 sm:h-11 sm:w-11"><MetricIcon name="requests" className="h-4 w-4 sm:h-5 sm:w-5" /></span>
            </div>
            <p aria-live="polite" className="mt-3 text-4xl font-black leading-none tracking-tight">{loading ? '—' : requests.length.toLocaleString('en-PH')}</p>
            <p className="mt-1 text-xs font-medium text-blue-100 sm:mt-2 sm:text-sm"><span className="sm:hidden">Submitted to GSO</span><span className="hidden sm:inline">Forms submitted to GSO</span></p>
          </div>
        </div>
      </article>

      <div className="grid w-full grid-cols-2 gap-2 sm:gap-3 lg:h-full lg:grid-cols-1 lg:grid-rows-2 lg:gap-4">
        <article className="flex flex-col justify-between rounded-2xl border-2 border-slate-300/80 bg-linear-to-br from-blue-100/75 via-blue-50/25 to-white p-3 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 transition hover:border-blue-300 hover:shadow-lg hover:shadow-blue-950/15 sm:p-4 lg:h-full">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-bold text-slate-500 sm:text-xs">In review / process</p>
              <p aria-live="polite" className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:mt-2 sm:text-3xl">{loading ? '—' : inProgressCount.toLocaleString('en-PH')}</p>
            </div>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-blue-100 bg-white text-blue-700 shadow-sm shadow-blue-900/5 sm:h-10 sm:w-10"><MetricIcon name="progress" className="h-4 w-4 sm:h-5 sm:w-5" /></span>
          </div>
          <div className="mt-2 border-t border-blue-200/50 pt-2 text-[0.62rem] font-medium text-slate-500 sm:mt-4 sm:pt-3 sm:text-[0.68rem]">Open requests being handled</div>
        </article>

        <article className="flex flex-col justify-between rounded-2xl border-2 border-slate-300/80 bg-linear-to-br from-blue-100/75 via-blue-50/25 to-white p-3 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 transition hover:border-blue-300 hover:shadow-lg hover:shadow-blue-950/15 sm:p-4 lg:h-full">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-bold text-slate-500 sm:text-xs">Total issuance</p>
              <p aria-live="polite" className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:mt-2 sm:text-3xl">{departmentIssuanceLoading || Boolean(departmentIssuanceError) ? '—' : (departmentIssuedUnits ?? 0).toLocaleString('en-PH')}</p>
            </div>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-blue-100 bg-white text-blue-700 shadow-sm shadow-blue-900/5 sm:h-10 sm:w-10"><MetricIcon name="issuance" className="h-4 w-4 sm:h-5 sm:w-5" /></span>
          </div>
          <div className={`mt-2 border-t border-blue-200/50 pt-2 text-[0.62rem] font-medium sm:mt-4 sm:pt-3 sm:text-[0.68rem] ${departmentIssuanceError ? 'text-rose-700' : 'text-slate-500'}`}>{departmentIssuanceError || 'Units issued across active staff in your department'}</div>
        </article>
      </div>
    </section>

    <nav className="grid gap-2.5 sm:grid-cols-2 lg:hidden" aria-label="Requester activity navigation">
      <a href="/requester/my-requests" className="group flex min-h-16 items-center gap-3 rounded-2xl border-2 border-slate-300/80 bg-linear-to-r from-blue-50/70 to-white px-3.5 py-3 shadow-md shadow-slate-300/30 ring-1 ring-slate-900/5 transition hover:border-blue-300 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-white text-blue-700 shadow-sm"><MetricIcon name="document" className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">Request activity</span><span className="mt-0.5 block text-sm font-black text-slate-900">Recent requests</span><span className="mt-0.5 block text-[0.62rem] font-medium text-slate-500">{loading ? 'Loading' : `${requests.length} total`}</span></span>
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-blue-200 bg-white text-blue-700 shadow-sm transition group-hover:translate-x-0.5 group-hover:border-blue-400 group-hover:bg-blue-50 group-focus-visible:ring-4 group-focus-visible:ring-blue-100"><MetricIcon name="arrow-right" className="h-4 w-4" /></span>
      </a>
      <a href="/requester/return-items" className="group flex min-h-16 items-center gap-3 rounded-2xl border-2 border-slate-300/80 bg-linear-to-r from-sky-50/75 to-white px-3.5 py-3 shadow-md shadow-slate-300/30 ring-1 ring-slate-900/5 transition hover:border-sky-300 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sky-100 bg-white text-sky-700 shadow-sm"><MetricIcon name="return" className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-sky-700">Custody activity</span><span className="mt-0.5 block text-sm font-black text-slate-900">Recent returns</span><span className="mt-0.5 block text-[0.62rem] font-medium text-slate-500">{departmentReturnsLoading ? 'Loading' : `${departmentReturns.length} records`}</span></span>
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-sky-200 bg-white text-sky-700 shadow-sm transition group-hover:translate-x-0.5 group-hover:border-sky-400 group-hover:bg-sky-50 group-focus-visible:ring-4 group-focus-visible:ring-sky-100"><MetricIcon name="arrow-right" className="h-4 w-4" /></span>
      </a>
    </nav>

    <section className="hidden items-stretch gap-3 sm:gap-5 lg:grid lg:grid-cols-2" aria-label="Recent requests and department returns">
      <article className="h-auto min-h-0 min-w-0 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 lg:h-full lg:min-h-112" aria-labelledby="recent-requests-title">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 bg-slate-50/45 p-3 pb-2.5 sm:gap-3 sm:p-6 sm:pb-4">
          <div className="flex items-start gap-2 sm:gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 shadow-sm shadow-blue-900/10 sm:h-10 sm:w-10"><MetricIcon name="document" className="h-4 w-4 sm:h-5 sm:w-5" /></span>
            <div><span className="text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-blue-600 sm:text-[0.62rem]">Request activity</span><h2 id="recent-requests-title" className="mt-0.5 text-sm font-black tracking-tight text-slate-900 sm:mt-1 sm:text-lg">Recent requests</h2><p className="mt-0.5 text-[0.65rem] leading-relaxed text-slate-500 sm:mt-1 sm:text-xs">Status and planned recipients.</p></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3"><span className="rounded-lg bg-blue-50 px-2 py-1 text-[0.58rem] font-extrabold text-blue-700 sm:px-2.5 sm:py-1.5 sm:text-[0.62rem]">{loading ? 'Loading' : `${requests.length} total`}</span><a href="/requester/my-requests" className="text-[0.62rem] font-extrabold text-blue-600 hover:underline sm:text-[0.68rem]">View all</a></div>
        </div>

        {loading ? <div className="grid min-h-40 place-items-center text-xs font-semibold text-slate-500">Loading recent requests…</div>
          : recentRequests.length === 0 ? <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center"><div><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><MetricIcon name="requests" /></span><p className="mt-2 text-xs font-extrabold text-slate-700">No requests yet</p><p className="mt-1 text-[0.68rem] text-slate-500">Start a purchase requisition or another GSO request.</p><a href="/requester/request-center" className="mt-3 inline-flex text-[0.68rem] font-extrabold text-blue-600 hover:underline">Open Request Center →</a></div></div>
             : <ul className="max-h-[30rem] divide-y divide-slate-200 overflow-y-auto px-3 sm:px-6">{recentRequests.map((request) => {
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

        {(issuanceError || pendingIssuances.length > 0) && <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 sm:mx-6">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[0.61rem] font-extrabold uppercase tracking-wide text-amber-700">Pickup preparation</p><p className="mt-1 text-[0.68rem] font-bold text-slate-700">GSO prepares the barcode labels and pickup record automatically. No confirmation is needed from you.</p></div><span className="rounded-lg bg-white px-2 py-1 text-[0.58rem] font-extrabold text-amber-700">{issuanceLoading ? 'Loading' : `${pendingIssuances.length} updating`}</span></div>
          {issuanceError && <p role="alert" className="mt-2 text-[0.65rem] font-bold text-rose-700">{issuanceError}</p>}
          {pendingIssuances.map((batch) => <div key={batch.id} className="mt-3 rounded-lg border border-amber-100 bg-white p-3"><p className="text-xs font-extrabold text-slate-800">{batch.items.map((item) => `${item.quantity} ${item.unitOfMeasure} ${item.itemName}`).join(', ')}</p><p className="mt-1 text-[0.62rem] font-semibold text-slate-500">GSO is updating this legacy record for {batch.employeeName} · {batch.employeeCode}. Please refresh shortly.</p></div>)}
        </div>}
      </article>

      <article className="h-auto min-h-0 min-w-0 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 lg:h-full lg:min-h-112" aria-labelledby="recent-returns-title">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 bg-slate-50/45 p-3 pb-2.5 sm:gap-3 sm:p-6 sm:pb-4">
          <div className="flex items-start gap-2 sm:gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-sky-100 bg-sky-50 text-sky-700 shadow-sm shadow-sky-900/10 sm:h-10 sm:w-10"><MetricIcon name="return" className="h-4 w-4 sm:h-5 sm:w-5" /></span>
            <div><span className="text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-blue-600 sm:text-[0.62rem]">Custody activity</span><h2 id="recent-returns-title" className="mt-0.5 text-sm font-black tracking-tight text-slate-900 sm:mt-1 sm:text-lg">Recent returns</h2><p className="mt-0.5 text-[0.65rem] leading-relaxed text-slate-500 sm:mt-1 sm:text-xs">Assigned staff and the person who brought each item back to GSO.</p></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3"><span className="rounded-lg bg-blue-50 px-2 py-1 text-[0.58rem] font-extrabold text-blue-700 sm:px-2.5 sm:py-1.5 sm:text-[0.62rem]">{departmentReturnsLoading ? 'Loading' : `${departmentReturns.length} records`}</span><a href="/requester/return-items" className="text-[0.62rem] font-extrabold text-blue-600 hover:underline sm:text-[0.68rem]">View returns</a></div>
        </div>

        {departmentReturnsError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[0.68rem] font-bold text-rose-700">{departmentReturnsError}</p>}
        {departmentReturnsLoading ? <div className="grid min-h-40 place-items-center text-xs font-semibold text-slate-500">Loading department returns…</div>
            : recentReturns.length === 0 ? <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center"><div><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">↶</span><p className="mt-2 text-xs font-extrabold text-slate-700">No recent returns</p><p className="mt-1 max-w-xs text-[0.68rem] leading-relaxed text-slate-500">GSO return records for staff in your verified department will appear here.</p></div></div>
             : <ul className="grid gap-2 p-3 sm:grid-cols-2 sm:gap-3 sm:p-6">{recentReturns.map((returnRecord) => <li key={returnRecord.id} className="rounded-xl border border-slate-200 bg-white p-2.5 transition hover:border-sky-200 hover:bg-sky-50/50 sm:p-3">
              <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
                <div className="flex min-w-0 items-start gap-2 sm:gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700 sm:h-9 sm:w-9"><MetricIcon name="box" className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" /></span>
                  <div className="min-w-0"><p className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400 sm:text-[0.62rem]">{returnRecord.itemCode}{returnRecord.tagCode ? ` · ${returnRecord.tagCode}` : ''} · {formatDate(returnRecord.decidedAt || returnRecord.requestedAt)}</p><h3 className="mt-1 text-xs font-extrabold leading-relaxed text-slate-900 sm:text-sm">{returnRecord.itemName}{Number(returnRecord.quantity) > 1 ? ` · ${returnRecord.quantity} ${returnRecord.unitOfMeasure}` : ''}</h3></div>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.56rem] font-extrabold sm:px-2.5 sm:py-1 sm:text-[0.6rem] ${returnStatusTone(returnRecord.status)}`}>{returnRecord.status}</span>
              </div>
              <div className="mt-2 grid gap-y-1 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 sm:mt-2.5 sm:gap-y-1.5 sm:px-3 sm:py-2.5"><p className="text-[0.63rem] text-slate-600 sm:text-[0.68rem]"><span className="font-extrabold text-blue-700">Assigned staff:</span> {returnRecord.employeeName} · {returnRecord.employeeCode}</p><p className="text-[0.63rem] text-slate-600 sm:text-[0.68rem]"><span className="font-extrabold text-blue-700">Brought in by:</span> {returnRecord.returnedByName || 'Not recorded'}</p><p className="text-[0.63rem] text-slate-600 sm:text-[0.68rem]"><span className="font-extrabold text-blue-700">Condition:</span> {returnRecord.condition}</p><p className="text-[0.63rem] text-slate-600 sm:text-[0.68rem]"><span className="font-extrabold text-blue-700">Reason:</span> {returnRecord.reason}</p></div>
            </li>)}</ul>}
      </article>
    </section>
  </div>
}

export default function RequesterDashboard() {
  return <RequesterLayout title="Home" subtitle="Your department requests, issuance activity, and returns."><RequesterDashboardContent /></RequesterLayout>
}
