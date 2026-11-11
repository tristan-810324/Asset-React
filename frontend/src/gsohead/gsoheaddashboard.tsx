import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { listPurchaseRequisitions } from './gsoheadApi'
import type { ServiceRequest } from '../requesters/requesterApi'
import GsoHeadItemMaster from './itemsmasterdata'
import { GsoHeadPageFrame } from './gsoheadnavbar'

type HeadIconName = 'clipboard' | 'archive' | 'chart' | 'check' | 'clock' | 'mail'

function ArrowIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
}

const iconPaths: Record<HeadIconName, ReactNode> = {
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.25V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v.75M8.5 10h7M8.5 14h7M8.5 18h4" /></>,
  archive: <><path d="M3 7.5h18M5.25 7.5 6.6 3.75h10.8l1.35 3.75M5.25 7.5v11.25a1.5 1.5 0 0 0 1.5 1.5h10.5a1.5 1.5 0 0 0 1.5-1.5V7.5M9.25 11.25h5.5" /></>,
  chart: <><path d="M4 19.5h16" /><path d="M6.5 16v-4M12 16V7M17.5 16v-7" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.25 2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
}

function Icon({ name, className = 'h-4 w-4' }: { name: HeadIconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>
}

function requestHasLineState(request: ServiceRequest, states: string[]) {
  return request.purchaseLines?.some((line) => states.includes(line.routeStatus)) || false
}

const pages = {
  '/gso-head/items': { nav: 'items', title: 'Item Master Data', detail: 'Inventory catalog, availability, condition, and current assignment.' },
} as const

export default function GsoHeadDashboard() {
  const subPage = pages[window.location.pathname as keyof typeof pages]
  const isSubPage = Boolean(subPage)
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueError, setQueueError] = useState('')

  useEffect(() => {
    if (isSubPage) return
    let active = true
    listPurchaseRequisitions().then((rows) => {
      if (active) setRequests(rows)
    }).catch((error: unknown) => {
      if (active) setQueueError(error instanceof Error ? error.message : 'Unable to load request counts.')
    }).finally(() => {
      if (active) setQueueLoading(false)
    })
    return () => { active = false }
  }, [isSubPage])

  // Same stages as the tabs on the Request Requisition page.
  const requestCounts = useMemo(() => ({
    approval: requests.filter((request) => request.status === 'Under Review' && requestHasLineState(request, ['WAITING_GSO_HEAD'])).length,
    finance: requests.filter((request) => ['GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed'].includes(request.status)).length,
    staff: requests.filter((request) => ['Submitted', 'Needs Information', 'Approved', 'Sent to Finance'].includes(request.status)).length,
  }), [requests])
  const recentApprovalRequests = useMemo(() => requests
    .filter((request) => request.status === 'Under Review' && requestHasLineState(request, ['WAITING_GSO_HEAD']))
    .slice(0, 4), [requests])
  const recentFinanceEmails = useMemo(() => requests
    .filter((request) => request.financeSentAt)
    .sort((a, b) => new Date(b.financeSentAt || '').getTime() - new Date(a.financeSentAt || '').getTime())
    .slice(0, 4), [requests])

  const workflowStages: Array<{
    label: string
    detail: string
    count: number
    href: string
    icon: HeadIconName
    iconTone: string
    barTone: string
    badgeTone: string
  }> = [
    {
      label: 'Awaiting your decision',
      detail: 'Items GSO Staff sent for approval',
      count: requestCounts.approval,
      href: '/gso-head/requests?tab=approval',
      icon: 'clock',
      iconTone: 'border-amber-100 bg-amber-50 text-amber-700',
      barTone: 'bg-amber-500',
      badgeTone: 'bg-amber-50 text-amber-800',
    },
    {
      label: 'Finance handoff',
      detail: 'Approved purchases ready to send or follow up',
      count: requestCounts.finance,
      href: '/gso-head/requests?tab=finance',
      icon: 'mail',
      iconTone: 'border-indigo-100 bg-indigo-50 text-indigo-700',
      barTone: 'bg-indigo-500',
      badgeTone: 'bg-indigo-50 text-indigo-700',
    },
    {
      label: 'With GSO Staff',
      detail: 'Stock checking, purchasing, delivery, or issuance',
      count: requestCounts.staff,
      href: '/gso-head/requests?tab=staff',
      icon: 'check',
      iconTone: 'border-emerald-100 bg-emerald-50 text-emerald-700',
      barTone: 'bg-emerald-500',
      badgeTone: 'bg-emerald-50 text-emerald-700',
    },
  ]
  const workflowMaxCount = Math.max(...workflowStages.map((stage) => stage.count), 1)

  return (
    <GsoHeadPageFrame activePage={subPage ? subPage.nav : 'overview'}>
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GSO Head Workspace
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{subPage ? subPage.title : 'Purchase control center'}</h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">
              {subPage ? subPage.detail : 'Review requests that need a decision, follow Finance handoff, and see where GSO Staff is working.'}
            </p>
            {!subPage && (
              <div className="mt-5 flex flex-wrap gap-2">
                <a href="/gso-head/requests?tab=approval" className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-xs font-extrabold text-blue-800 shadow-sm transition hover:bg-blue-50">
                  Review approval queue <ArrowIcon />
                </a>
                <a href="/gso-head/items" className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/8 px-3.5 py-2.5 text-xs font-extrabold text-white transition hover:bg-white/15">
                  Open master items <Icon name="archive" className="h-4 w-4" />
                </a>
              </div>
            )}
          </div>
          {!subPage && (
            <a href="/gso-head/requests?tab=approval" className="group rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm transition hover:bg-white/15 lg:min-w-56">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-bold text-blue-100">Needs your review</span>
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-400/20 text-amber-100"><Icon name="clock" /></span>
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight">{queueLoading ? '...' : requestCounts.approval}</p>
              <span className="mt-1 inline-flex items-center gap-1 text-[0.68rem] font-bold text-blue-100">Open decision queue <span className="transition group-hover:translate-x-0.5">→</span></span>
            </a>
          )}
        </div>
      </section>
      {subPage ? <GsoHeadItemMaster /> : <>
        <section className="mt-6" aria-label="Purchase request overview">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">Overview</p>
              <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900">Purchase request activity</h2>
            </div>
            <p className={'text-xs font-semibold ' + (queueError ? 'text-rose-700' : 'text-slate-500')} role={queueError ? 'alert' : undefined}>
              {queueLoading
                ? 'Loading live request data…'
                : queueError || (requests.length + ' purchase request' + (requests.length === 1 ? '' : 's') + ' in the system')}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'Awaiting decision',
                value: requestCounts.approval,
                detail: 'Ready for Head review',
                href: '/gso-head/requests?tab=approval',
                icon: 'clock' as HeadIconName,
                iconTone: 'border-amber-100 bg-amber-50 text-amber-700',
                badgeTone: 'bg-amber-50 text-amber-800',
              },
              {
                label: 'Finance handoff',
                value: requestCounts.finance,
                detail: 'Needs sending or follow-up',
                href: '/gso-head/requests?tab=finance',
                icon: 'mail' as HeadIconName,
                iconTone: 'border-indigo-100 bg-indigo-50 text-indigo-700',
                badgeTone: 'bg-indigo-50 text-indigo-700',
              },
              {
                label: 'Staff processing',
                value: requestCounts.staff,
                detail: 'Being handled by GSO Staff',
                href: '/gso-head/requests?tab=staff',
                icon: 'check' as HeadIconName,
                iconTone: 'border-emerald-100 bg-emerald-50 text-emerald-700',
                badgeTone: 'bg-emerald-50 text-emerald-700',
              },
              {
                label: 'All purchase requests',
                value: requests.length,
                detail: 'View the full request register',
                href: '/gso-head/requests',
                icon: 'chart' as HeadIconName,
                iconTone: 'border-blue-100 bg-blue-50 text-blue-700',
                badgeTone: 'bg-blue-50 text-blue-700',
              },
            ].map((metric) => (
              <a key={metric.label} href={metric.href} className="group rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-slate-500">{metric.label}</p>
                    <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{queueLoading ? '—' : metric.value.toLocaleString('en-PH')}</p>
                  </div>
                  <span className={'grid h-10 w-10 place-items-center rounded-xl border shadow-sm shadow-slate-900/5 ' + metric.iconTone}>
                    <Icon name={metric.icon} className="h-5 w-5" />
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className={'rounded-lg px-2 py-0.5 text-[0.65rem] font-extrabold ' + metric.badgeTone}>{queueLoading ? 'Loading' : metric.detail}</span>
                  <span className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700"><ArrowIcon /></span>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]" aria-label="Purchase workflow insight">
          <article className="rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">Workflow snapshot</p>
                <h2 className="mt-1 text-base font-black tracking-tight text-slate-900">Where requests need attention</h2>
                <p className="mt-1 text-xs font-medium text-slate-500">Open a stage to work with only the requests at that point.</p>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700"><Icon name="chart" className="h-5 w-5" /></span>
            </div>

            <div className="mt-6 space-y-3">
              {queueLoading ? (
                <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm font-bold text-slate-400">Loading workflow data…</div>
              ) : queueError ? (
                <div role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-700">Request data could not be loaded. Open the request list to try again.</div>
              ) : workflowStages.map((stage) => (
                <a key={stage.label} href={stage.href} className="group block rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 transition hover:border-blue-200 hover:bg-blue-50/50">
                  <div className="flex items-start gap-3">
                    <span className={'grid h-9 w-9 shrink-0 place-items-center rounded-xl border ' + stage.iconTone}><Icon name={stage.icon} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-extrabold text-slate-800">{stage.label}</span>
                        <span className={'rounded-lg px-2 py-0.5 text-xs font-black tabular-nums ' + stage.badgeTone}>{stage.count}</span>
                      </span>
                      <span className="mt-1 block text-xs font-medium text-slate-500">{stage.detail}</span>
                      <span className="mt-3 block h-2 overflow-hidden rounded-full bg-slate-200/80">
                        <span className={'block h-full rounded-full transition-all ' + stage.barTone} style={{ width: stage.count ? ((stage.count / workflowMaxCount) * 100) + '%' : '0%' }} />
                      </span>
                    </span>
                    <span className="mt-2 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700"><ArrowIcon /></span>
                  </div>
                </a>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-6">
            <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">Quick actions</p>
            <h2 className="mt-1 text-base font-black tracking-tight text-slate-900">Start with the next task</h2>
            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">These shortcuts keep the approval and purchasing flow moving.</p>

            <div className="mt-5 space-y-3">
              <a href="/gso-head/requests?tab=approval" className="group flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-3.5 transition hover:border-amber-300 hover:bg-amber-50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-amber-700 shadow-sm"><Icon name="clipboard" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-slate-800">Review pending approvals</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{queueLoading ? 'Loading queue…' : requestCounts.approval + ' request' + (requestCounts.approval === 1 ? '' : 's') + ' waiting for you'}</span>
                </span>
                <span className="text-amber-700 transition group-hover:translate-x-0.5"><ArrowIcon /></span>
              </a>
              <a href="/gso-head/requests?tab=finance" className="group flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3.5 transition hover:border-indigo-300 hover:bg-indigo-50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm"><Icon name="mail" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-slate-800">Follow up with Finance</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{queueLoading ? 'Loading handoff…' : requestCounts.finance + ' purchase' + (requestCounts.finance === 1 ? '' : 's') + ' in handoff'}</span>
                </span>
                <span className="text-indigo-700 transition group-hover:translate-x-0.5"><ArrowIcon /></span>
              </a>
              <a href="/gso-head/items" className="group flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3.5 transition hover:border-emerald-300 hover:bg-emerald-50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm"><Icon name="archive" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-slate-800">Check master items</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Review catalog details and availability.</span>
                </span>
                <span className="text-emerald-700 transition group-hover:translate-x-0.5"><ArrowIcon /></span>
              </a>
            </div>
          </article>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2" aria-label="Recent purchase request activity">
            <article className="overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
              <a href="/gso-head/requests?tab=approval" className="group flex items-center gap-3 border-b border-slate-200 bg-linear-to-r from-blue-50/80 to-white p-3 transition hover:from-blue-100/70 sm:p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-white text-blue-700 shadow-sm"><Icon name="clipboard" /></span><span className="min-w-0 flex-1"><span className="block text-[0.56rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">Request activity</span><span className="mt-0.5 block text-sm font-black text-slate-900">Recent requests for approval</span><span className="mt-0.5 block text-[0.62rem] font-medium text-slate-500">{queueLoading ? 'Loading' : `${recentApprovalRequests.length} recent · ${requestCounts.approval} total`}</span></span><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-blue-200 bg-white text-blue-700 shadow-sm transition group-hover:translate-x-0.5 group-hover:border-blue-400 group-hover:bg-blue-50"><ArrowIcon /></span></a>
              <div className="divide-y divide-slate-100 px-3 sm:px-4">{queueLoading ? <p className="py-6 text-center text-xs font-semibold text-slate-400">Loading requests...</p> : recentApprovalRequests.length === 0 ? <p className="py-6 text-center text-xs font-semibold text-slate-400">No requests waiting for approval.</p> : recentApprovalRequests.map((request) => <a key={request.id} href={`/gso-head/requests?request=${encodeURIComponent(request.id)}`} className="flex items-center justify-between gap-3 py-3 transition hover:bg-blue-50/40"><span className="min-w-0"><span className="block truncate text-xs font-extrabold text-slate-800">{request.referenceNo} · {request.title}</span><span className="mt-1 block truncate text-[0.63rem] text-slate-500">{request.requesterName} · {request.formData.departmentOrganization || request.requesterEmail}</span></span><span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[0.56rem] font-extrabold text-amber-800">{request.purchaseLines?.filter((line) => line.routeStatus === 'WAITING_GSO_HEAD').length || 0} to decide</span></a>)}</div>
              <a href="/gso-head/requests?tab=approval" className="block border-t border-slate-100 px-4 py-2.5 text-center text-[0.62rem] font-extrabold text-blue-700 transition hover:bg-blue-50/60">View all requests</a>
            </article>
            <article className="overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
              <a href="/gso-head/requests?tab=staff" className="group flex items-center gap-3 border-b border-slate-200 bg-linear-to-r from-indigo-50/80 to-white p-3 transition hover:from-indigo-100/70 sm:p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-indigo-100 bg-white text-indigo-700 shadow-sm"><svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span><span className="min-w-0 flex-1"><span className="block text-[0.56rem] font-extrabold uppercase tracking-[0.14em] text-indigo-700">Finance activity</span><span className="mt-0.5 block text-sm font-black text-slate-900">Recent emails to Finance</span><span className="mt-0.5 block text-[0.62rem] font-medium text-slate-500">{queueLoading ? 'Loading' : `${recentFinanceEmails.length} recent · ${requests.filter((request) => request.financeSentAt).length} sent`}</span></span><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-indigo-200 bg-white text-indigo-700 shadow-sm transition group-hover:translate-x-0.5 group-hover:border-indigo-400 group-hover:bg-indigo-50"><ArrowIcon /></span></a>
              <div className="divide-y divide-slate-100 px-3 sm:px-4">{queueLoading ? <p className="py-6 text-center text-xs font-semibold text-slate-400">Loading Finance emails...</p> : recentFinanceEmails.length === 0 ? <p className="py-6 text-center text-xs font-semibold text-slate-400">No Finance emails sent yet.</p> : recentFinanceEmails.map((request) => <a key={request.id} href={`/gso-head/requests?request=${encodeURIComponent(request.id)}`} className="flex items-center justify-between gap-3 py-3 transition hover:bg-indigo-50/40"><span className="min-w-0"><span className="block truncate text-xs font-extrabold text-slate-800">{request.referenceNo} · {request.title}</span><span className="mt-1 block truncate text-[0.63rem] text-slate-500">{request.financeEmail || 'Finance'} · {request.financeSentAt ? new Date(request.financeSentAt).toLocaleString('en-PH') : ''}</span></span><span className="shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-[0.56rem] font-extrabold text-indigo-700">{request.status === 'Sent to Finance' ? 'Staff buying' : ['GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed'].includes(request.status) ? 'To resend' : 'Delivered'}</span></a>)}</div>
              <a href="/gso-head/requests?tab=staff" className="block border-t border-slate-100 px-4 py-2.5 text-center text-[0.62rem] font-extrabold text-indigo-700 transition hover:bg-indigo-50/60">View purchases with GSO Staff</a>
            </article>
          </section>
          </>}
    </GsoHeadPageFrame>
  )
}
