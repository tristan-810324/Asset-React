import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearAuthSession } from '../auth/authApi'
import { listPurchaseRequisitions } from './gsoheadApi'
import type { ServiceRequest } from '../requesters/requesterApi'
import GsoHeadItemMaster from './itemmaster'
import GsoHeadNavbar from './gsoheadnavbar'

type HeadIconName = 'menu' | 'grid' | 'clipboard' | 'archive' | 'logout' | 'chevron'

function ArrowIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
}

const iconPaths: Record<HeadIconName, ReactNode> = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  grid: <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><rect x="14" y="14" width="6.5" height="6.5" rx="1" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.25V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v.75M8.5 10h7M8.5 14h7M8.5 18h4" /></>,
  archive: <><path d="M3 7.5h18M5.25 7.5 6.6 3.75h10.8l1.35 3.75M5.25 7.5v11.25a1.5 1.5 0 0 0 1.5 1.5h10.5a1.5 1.5 0 0 0 1.5-1.5V7.5M9.25 11.25h5.5" /></>,
  logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  chevron: <path d="m7 10 5 5 5-5" />,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const subPage = pages[window.location.pathname as keyof typeof pages]
  const isSubPage = Boolean(subPage)
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueError, setQueueError] = useState('')
  const today = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

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

  function signOut() {
    clearAuthSession()
    window.location.replace('/login')
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">

      <GsoHeadNavbar activePage={subPage ? subPage.nav : 'overview'} mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <section className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f4f7fb]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-9">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={() => setMobileMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden" aria-label="Open navigation menu" aria-expanded={mobileMenuOpen}>
                <Icon name="menu" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-[0.65rem] font-bold text-slate-500 sm:text-xs">General Services Office / <span className="text-slate-700">{subPage ? subPage.title : 'GSO Head Overview'}</span></p>
                <p className="mt-0.5 hidden text-[0.68rem] font-bold text-slate-400 sm:block">{today}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden rounded-xl border border-indigo-100 bg-white px-3 py-2 text-[0.65rem] font-extrabold text-indigo-700 sm:inline-flex">GSO Head account</span>
              <button type="button" onClick={signOut} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-rose-200 hover:text-rose-700" aria-label="Sign out">
                <Icon name="logout" /> <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
          <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(129,140,248,0.4),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(59,130,246,0.2),transparent_36%)]" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-indigo-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" /> GSO Head Workspace
                </span>
                <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{subPage ? subPage.title : 'GSO Head Overview'}</h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">{subPage ? subPage.detail : 'GSO Staff checks stock first. You decide the items they ask you about and purchases, then send approved purchases to Finance.'}</p>
              </div>
            </div>
          </section>
          {subPage ? <GsoHeadItemMaster /> : <>
          <section className="mt-6" aria-label="Purchase request status containers">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div><h2 className="text-base font-black tracking-tight text-slate-900">Purchase request status</h2><p className="mt-1 text-xs text-slate-500">Piliin ang kahon para buksan ang kaukulang request list.</p></div>
              {queueError && <p role="alert" className="text-xs font-semibold text-rose-700">{queueError}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { title: 'For your approval', detail: 'Items GSO Staff sent to you', count: requestCounts.approval, tab: 'approval', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
                { title: 'Send to Finance', detail: 'Approved purchases to email', count: requestCounts.finance, tab: 'finance', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
                { title: 'With GSO Staff', detail: 'Stock check, buying, delivery, issuance', count: requestCounts.staff, tab: 'staff', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
              ].map((box) => <a key={box.title} href={`/gso-head/requests?tab=${box.tab}`} className="rounded-2xl border-2 border-slate-300/80 bg-white p-3.5 shadow-md shadow-slate-300/30 ring-1 ring-slate-900/5 transition hover:border-indigo-300 hover:shadow-lg sm:p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="text-xs font-bold text-slate-600 sm:text-sm">{box.title}</h3><p className="mt-1 text-[0.62rem] leading-relaxed text-slate-500">{box.detail}</p></div><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border px-1 text-base font-black ${box.tone}`}>{queueLoading ? '...' : box.count}</span></div></a>)}
            </div>
          </section>
          <section className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4" aria-label="Recent purchase request activity">
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
        </div>
      </section>
    </main>
  )
}
