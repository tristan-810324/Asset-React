import { useEffect, useMemo, useState } from 'react'
import RequesterLayout from './requesterlayout'
import { useRequesterIdentity } from './requesteridentitycontext'
import { MetricIcon } from './requesterrequestcard'
import { formatDateTime, getRequestItems, requestStatusLabel, requestStatusTone } from './requesterrequestutils'
import {
  getMyDepartmentIssuanceSummary,
  listMyDepartmentReturns,
  listMyPendingIssuanceBatches,
  listMyRequests,
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
  const [departmentRemainingUnits, setDepartmentRemainingUnits] = useState<number | null>(null)
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
          setDepartmentRemainingUnits(summary.remainingUnits ?? 0)
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
    .slice(0, 2), [requests])
  const recentReturns = useMemo(() => [...departmentReturns]
    .sort((left, right) => new Date(right.decidedAt || right.requestedAt).getTime() - new Date(left.decidedAt || left.requestedAt).getTime())
    .slice(0, 8), [departmentReturns])

  return <div className="space-y-6">
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error}</p>}

    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.85fr)]" aria-label="Requester overview" aria-busy={loading || departmentIssuanceLoading}>
      <article className="relative isolate overflow-hidden rounded-2xl bg-[#09244a] p-4 text-white shadow-xl shadow-blue-950/15 sm:p-5">
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
                <p className="text-[0.55rem] font-extrabold uppercase tracking-[0.12em] text-blue-200 sm:text-[0.62rem] sm:tracking-[0.16em]"><span className="sm:hidden">Assigned</span><span className="hidden sm:inline">Department assignment</span></p>
                <h2 className="mt-1 text-sm font-black tracking-tight text-white sm:text-base">Total assigned</h2>
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-blue-100 sm:h-11 sm:w-11"><MetricIcon name="requests" className="h-4 w-4 sm:h-5 sm:w-5" /></span>
            </div>
            <p aria-live="polite" className="mt-3 text-4xl font-black leading-none tracking-tight">{departmentIssuanceLoading || Boolean(departmentIssuanceError) ? '—' : (departmentIssuedUnits ?? 0).toLocaleString('en-PH')}</p>
            <p className="mt-1 text-xs font-medium text-blue-100 sm:mt-2 sm:text-sm">units assigned to your staff</p>
            <p className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-bold text-white">Still assigned <span className="text-sm font-black">{departmentIssuanceLoading || Boolean(departmentIssuanceError) ? '—' : (departmentRemainingUnits ?? 0).toLocaleString('en-PH')}</span></p>
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
      <a href="/requester/my-requests" className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 border-slate-300/80 bg-white px-4 py-3 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 transition hover:border-blue-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
        <span className="min-w-0"><span className="block text-sm font-black text-slate-900">Recent requests</span><span className="mt-0.5 block text-xs font-medium text-slate-500">{loading ? 'Loading' : `${requests.length} total`}</span></span>
        <MetricIcon name="arrow-right" className="h-4 w-4 shrink-0 text-blue-700" />
      </a>
      <a href="/requester/return-items" className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 border-slate-300/80 bg-white px-4 py-3 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 transition hover:border-blue-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
        <span className="min-w-0"><span className="block text-sm font-black text-slate-900">Recent returns</span><span className="mt-0.5 block text-xs font-medium text-slate-500">{departmentReturnsLoading ? 'Loading' : `${departmentReturns.length} records`}</span></span>
        <MetricIcon name="arrow-right" className="h-4 w-4 shrink-0 text-blue-700" />
      </a>
    </nav>

    <section className="hidden items-stretch gap-5 lg:grid lg:grid-cols-2" aria-label="Recent requests and department returns">
      <article className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="recent-requests-title">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 id="recent-requests-title" className="text-base font-black tracking-tight text-slate-900">Recent requests</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Status and planned recipients.</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
            <span>{loading ? 'Loading' : `${requests.length} total`}</span>
            <a href="/requester/my-requests" className="font-extrabold text-blue-600 hover:underline">View all</a>
          </div>
        </div>

        {loading ? <div className="grid min-h-40 place-items-center text-sm font-semibold text-slate-400">Loading recent requests…</div>
          : recentRequests.length === 0 ? <div className="grid min-h-40 place-items-center px-4 text-center"><div><p className="text-sm font-bold text-slate-700">No requests yet</p><p className="mt-1 text-xs text-slate-400">Start a purchase requisition or another GSO request.</p><a href="/requester/request-center" className="mt-3 inline-flex text-xs font-extrabold text-blue-600 hover:underline">Open Request Center →</a></div></div>
             : <ul className="max-h-120 space-y-2.5 overflow-y-auto p-4 sm:px-5">{recentRequests.map((request) => {
              const items = getRequestItems(request)
              const [firstItem] = items
              return <li key={request.id}>
                <div className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:bg-blue-50/40">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-black text-slate-900">{request.referenceNo}</span>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[0.6rem] font-extrabold ${dashboardRequestTone(request)}`}>{requestStatusLabel(request)}</span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-blue-700">{request.title}</p>
                  {firstItem && <p className="mt-1 text-xs text-slate-500">{firstItem.quantity} × {firstItem.itemName}{items.length > 1 ? ` · +${items.length - 1} more` : ''}</p>}
                  {request.status === 'Needs Information' && <p className="mt-2 text-xs font-bold text-amber-700">May hinihinging dagdag na impormasyon ang GSO.</p>}
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

        {(issuanceError || pendingIssuances.length > 0) && <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:mx-6">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-amber-700">Pickup preparation</p><p className="mt-1 text-xs font-bold text-slate-700">GSO prepares the barcode labels and pickup record automatically. No confirmation is needed from you.</p></div><span className="rounded-lg bg-white px-2 py-1 text-[0.6rem] font-extrabold text-amber-700">{issuanceLoading ? 'Loading' : `${pendingIssuances.length} updating`}</span></div>
          {issuanceError && <p role="alert" className="mt-2 text-xs font-bold text-rose-700">{issuanceError}</p>}
          {pendingIssuances.map((batch) => <div key={batch.id} className="mt-3 rounded-lg border border-amber-100 bg-white p-3"><p className="text-xs font-extrabold text-slate-800">{batch.items.map((item) => `${item.quantity} ${item.unitOfMeasure} ${item.itemName}`).join(', ')}</p><p className="mt-1 text-[0.62rem] font-semibold text-slate-500">GSO is updating this legacy record for {batch.employeeName} · {batch.employeeCode}. Please refresh shortly.</p></div>)}
        </div>}
      </article>

      <article className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="recent-returns-title">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 id="recent-returns-title" className="text-base font-black tracking-tight text-slate-900">Recent returns</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Assigned staff and who brought each item back.</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
            <span>{departmentReturnsLoading ? 'Loading' : `${departmentReturns.length} records`}</span>
            <a href="/requester/return-items" className="font-extrabold text-blue-600 hover:underline">View returns</a>
          </div>
        </div>

        {departmentReturnsError && <p role="alert" className="mx-5 mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 sm:mx-6">{departmentReturnsError}</p>}
        {departmentReturnsLoading ? <div className="grid min-h-40 place-items-center text-sm font-semibold text-slate-400">Loading department returns…</div>
            : recentReturns.length === 0 ? <div className="grid min-h-40 place-items-center px-4 text-center"><div><p className="text-sm font-bold text-slate-700">No recent returns</p><p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">GSO return records for staff in your verified department will appear here.</p></div></div>
             : <ul className="max-h-120 space-y-2.5 overflow-y-auto p-4 sm:px-5">{recentReturns.map((returnRecord) => <li key={returnRecord.id} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-200">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900">{returnRecord.tagCode || returnRecord.itemCode}</p>
                  <p className="mt-1 text-xs font-bold text-blue-700">{returnRecord.itemName}{Number(returnRecord.quantity) > 1 ? ` · ${returnRecord.quantity} ${returnRecord.unitOfMeasure}` : ''}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[0.6rem] font-extrabold ${returnStatusTone(returnRecord.status)}`}>{returnRecord.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{returnRecord.recipientLocation || 'Location not recorded'} · {returnRecord.employeeName}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <p className="text-[0.62rem] font-medium text-slate-400">Brought in by {returnRecord.returnedByName || 'Not recorded'} · {formatDateTime(returnRecord.decidedAt || returnRecord.requestedAt)}</p>
                <a href="/requester/return-items#return-records" aria-label={`View details for ${returnRecord.tagCode || returnRecord.itemCode}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[0.65rem] font-extrabold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">View details</a>
              </div>

            </li>)}</ul>}
      </article>
    </section>
  </div>
}

// Dashboard-only status colors: "Pending" and "Ready for Pickup" get their own tone instead of the shared gray default.
function dashboardRequestTone(request: ServiceRequest) {
  const label = requestStatusLabel(request)
  if (label === 'Pending') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (label === 'Ready for Pickup') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return requestStatusTone(request)
}

export default function RequesterDashboard() {
  return <RequesterLayout title="Home" subtitle="Your department requests, issuance activity, and returns."><RequesterDashboardContent /></RequesterLayout>
}
