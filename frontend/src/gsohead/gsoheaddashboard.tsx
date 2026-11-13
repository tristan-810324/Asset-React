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
    handoff: requests.filter((request) => ['GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed'].includes(request.status)).length,
    staff: requests.filter((request) => ['Submitted', 'Needs Information', 'Approved', 'Sent to Finance'].includes(request.status)).length,
  }), [requests])

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
      detail: 'For your approval',
      count: requestCounts.approval,
      href: '/gso-head/requests?tab=approval',
      icon: 'clock',
      iconTone: 'border-blue-100 bg-blue-50 text-blue-700',
      barTone: 'bg-blue-500',
      badgeTone: 'bg-blue-50 text-blue-800',
    },
    {
      label: 'Staff handoff queue',
      detail: 'Signed PDF ready',
      count: requestCounts.handoff,
      href: '/gso-head/requests?tab=staff',
      icon: 'check',
      iconTone: 'border-blue-100 bg-blue-50 text-blue-700',
      barTone: 'bg-blue-500',
      badgeTone: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'With GSO Staff',
      detail: 'In progress',
      count: requestCounts.staff,
      href: '/gso-head/requests?tab=staff',
      icon: 'check',
      iconTone: 'border-blue-100 bg-blue-50 text-blue-700',
      barTone: 'bg-blue-500',
      badgeTone: 'bg-blue-50 text-blue-700',
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
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> GSO Head Workspace
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{subPage ? subPage.title : 'Purchase control center'}</h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">
              {subPage ? subPage.detail : 'Decide, follow up, and track purchases.'}
            </p>
          </div>
        </div>
      </section>
      {subPage ? <GsoHeadItemMaster /> : <>
        <section className="mt-6" aria-label="Purchase request overview">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">Overview</p>
              <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900">Purchase requests</h2>
            </div>
            <p className={'text-xs font-semibold ' + (queueError ? 'text-rose-700' : 'text-slate-500')} role={queueError ? 'alert' : undefined}>
              {queueLoading
                ? 'Loading…'
                : queueError || (requests.length + ' total')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            {[
              {
                label: 'Awaiting decision',
                value: requestCounts.approval,
                detail: 'For your review',
                href: '/gso-head/requests?tab=approval',
                icon: 'clock' as HeadIconName,
                iconTone: 'border-blue-100 bg-blue-50 text-blue-700',
                badgeTone: 'bg-blue-50 text-blue-800',
              },
              {
                label: 'Staff handoff queue',
                value: requestCounts.handoff,
                detail: 'PDF ready',
                href: '/gso-head/requests?tab=staff',
                icon: 'check' as HeadIconName,
                iconTone: 'border-blue-100 bg-blue-50 text-blue-700',
                badgeTone: 'bg-blue-50 text-blue-700',
              },
              {
                label: 'Staff processing',
                value: requestCounts.staff,
                detail: 'With staff',
                href: '/gso-head/requests?tab=staff',
                icon: 'check' as HeadIconName,
                iconTone: 'border-blue-100 bg-blue-50 text-blue-700',
                badgeTone: 'bg-blue-50 text-blue-700',
              },
              {
                label: 'All requests',
                value: requests.length,
                detail: 'View all',
                href: '/gso-head/requests',
                icon: 'chart' as HeadIconName,
                iconTone: 'border-blue-100 bg-blue-50 text-blue-700',
                badgeTone: 'bg-blue-50 text-blue-700',
              },
            ].map((metric) => (
              <a key={metric.label} href={metric.href} className="group rounded-2xl border-2 border-slate-300/80 bg-white p-3.5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md sm:p-5">
                <div className="flex items-start justify-between gap-2 sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-[0.7rem] font-bold leading-tight text-slate-500 sm:text-xs">{metric.label}</p>
                    <p className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 sm:mt-2 sm:text-3xl">{queueLoading ? '—' : metric.value.toLocaleString('en-PH')}</p>
                  </div>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-blue-100 bg-white text-blue-700 shadow-sm sm:h-9 sm:w-9 sm:rounded-xl">
                    <Icon name={metric.icon} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 sm:mt-4">
                  <span className={'rounded-lg px-2 py-0.5 text-[0.65rem] font-extrabold ' + metric.badgeTone}>{queueLoading ? 'Loading' : metric.detail}</span>
                  <span className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700"><ArrowIcon /></span>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]" aria-label="Purchase workflow insight">
          <article className="hidden rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 md:block sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">Workflow snapshot</p>
                <h2 className="mt-1 text-base font-black tracking-tight text-slate-900">Needs attention</h2>
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-white text-blue-700 shadow-sm"><Icon name="chart" className="h-4 w-4" /></span>
            </div>

            <div className="mt-6 space-y-3">
              {queueLoading ? (
                <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm font-bold text-slate-400">Loading…</div>
              ) : queueError ? (
                <div role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-700">Could not load requests.</div>
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
            <h2 className="mt-1 text-base font-black tracking-tight text-slate-900">Next tasks</h2>

            <div className="mt-5 space-y-3">
              <a href="/gso-head/requests?tab=approval" className="group flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 transition hover:border-blue-300 hover:bg-blue-50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm"><Icon name="clipboard" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-slate-800">Review approvals</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{queueLoading ? 'Loading…' : requestCounts.approval + ' waiting'}</span>
                </span>
                <span className="text-blue-700 transition group-hover:translate-x-0.5"><ArrowIcon /></span>
              </a>
              <a href="/gso-head/requests?tab=staff" className="group flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 transition hover:border-blue-300 hover:bg-blue-50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm"><Icon name="check" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-slate-800">View staff handoff</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{queueLoading ? 'Loading…' : requestCounts.handoff + ' signed PDF(s) ready'}</span>
                </span>
                <span className="text-blue-700 transition group-hover:translate-x-0.5"><ArrowIcon /></span>
              </a>
              <a href="/gso-head/items" className="group flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 transition hover:border-blue-300 hover:bg-blue-50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm"><Icon name="archive" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-slate-800">Check master items</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Catalog and stock.</span>
                </span>
                <span className="text-blue-700 transition group-hover:translate-x-0.5"><ArrowIcon /></span>
              </a>
            </div>
          </article>
        </section>
          </>}
    </GsoHeadPageFrame>
  )
}
