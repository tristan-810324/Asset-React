import { useState, type ReactNode } from 'react'
import GsoNavbar, { GsoPageHeader, type GsoNavigationItem } from '../components/navbars/gsonavbar'

type IconName =
  | 'archive'
  | 'arrow-right'
  | 'bell'
  | 'building'
  | 'calendar'
  | 'chart'
  | 'chevron-down'
  | 'clipboard'
  | 'close'
  | 'cube'
  | 'grid'
  | 'menu'
  | 'plus'
  | 'search'
  | 'settings'
  | 'tool'
  | 'truck'
  | 'user-check'
  | 'users'

const iconPaths: Record<IconName, ReactNode> = {
  archive: (
    <>
      <path d="M3 7.5h18" />
      <path d="M5.25 7.5 6.6 3.75h10.8l1.35 3.75" />
      <path d="M5.25 7.5v11.25A1.5 1.5 0 0 0 6.75 20.25h10.5a1.5 1.5 0 0 0 1.5-1.5V7.5" />
      <path d="M9.25 11.25h5.5" />
    </>
  ),
  'arrow-right': <path d="M5 12h14m-6-6 6 6-6 6" />,
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M7.5 3v4M16.5 3v4M3.5 10h17" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19.5V10m5.33 9.5V4.5m5.34 15V12m5.33 7.5V7.5" />
      <path d="M2.5 20.5h19" />
    </>
  ),
  'chevron-down': <path d="m7 10 5 5 5-5" />,
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.25V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v.75" />
      <path d="M8.5 10h7M8.5 14h7M8.5 18h4" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  cube: (
    <>
      <path d="m21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.27 6.96 8.73 5.05 8.73-5.05M12 22.08V12" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="14" width="6.5" height="6.5" rx="1" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.75" cy="10.75" r="5.75" />
      <path d="m15.1 15.1 4.15 4.15" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.01 2.01-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.09h-2.84v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06L7 16.94l.06-.06A1.7 1.7 0 0 0 7.4 15a1.7 1.7 0 0 0-1.56-1.03h-.09v-2.84h.09A1.7 1.7 0 0 0 7.4 10.1a1.7 1.7 0 0 0-.34-1.88L7 8.16l2.01-2.01.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56V4.9h2.84v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.01 2.01-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.09v2.84h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </>
  ),
  tool: (
    <>
      <path d="m14.7 6.3 3-3a5 5 0 0 1-6.43 6.43L5 16.02a2.12 2.12 0 0 1-3-3l6.28-6.29A5 5 0 0 1 14.7 6.3Z" />
      <path d="m13 16 3.5 3.5a2.12 2.12 0 0 0 3-3L16 13" />
    </>
  ),
  truck: (
    <>
      <path d="M3 5h11v11H3zM14 9h3l3 3v4h-6z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  'user-check': (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m16 11 2 2 4-4" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M20 21v-2a4 4 0 0 1 0 7.75" />
    </>
  ),
}

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  )
}

// Consistent Monochromatic Blue Palette for Department Asset Distribution
const departmentDistribution = [
  { dept: 'Registrar Office', count: 340, percentage: 27, color: 'bg-blue-900' },
  { dept: 'IT Services', count: 285, percentage: 23, color: 'bg-blue-700' },
  { dept: 'Science Department', count: 210, percentage: 17, color: 'bg-blue-500' },
  { dept: 'Finance Office', count: 180, percentage: 14, color: 'bg-sky-500' },
  { dept: 'GSO Storage (Unassigned)', count: 233, percentage: 19, color: 'bg-slate-400' },
]

const conditionBreakdown = [
  { condition: 'New / Good', count: 1040, percent: '83.3%', tone: 'bg-emerald-50 text-emerald-700' },
  { condition: 'Fair (Usable)', count: 120, percent: '9.6%', tone: 'bg-amber-50 text-amber-700' },
  { condition: 'Needs Repair', count: 62, percent: '5.0%', tone: 'bg-rose-50 text-rose-700' },
  { condition: 'Unserviceable', count: 26, percent: '2.1%', tone: 'bg-slate-100 text-slate-600' },
]

export default function GsoDashboard() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activePage] = useState<GsoNavigationItem>('Overview')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const today = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

  const handleAction = (label: string) => {
    setNotice(`${label} action selected.`)
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
      <GsoNavbar
        currentPage={activePage}
        mobileMenuOpen={mobileMenuOpen}
        notificationsOpen={notificationsOpen}
        onClose={() => setMobileMenuOpen(false)}
        onAction={handleAction}
        onOpenNotifications={() => setNotificationsOpen(true)}
      />

      <section className="min-h-screen lg:pl-72">
        <GsoPageHeader
          pageName="Executive Analytics"
          today={today}
          notificationsOpen={notificationsOpen}
          onNotificationsOpenChange={setNotificationsOpen}
          onOpenMenu={() => setMobileMenuOpen(true)}
          onAction={handleAction}
        />

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
          {/* DASHBOARD HERO BANNER */}
          <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Executive Analytics
                </span>
                <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">GSO Executive Overview</h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
                  High-level breakdown of institutional asset custody, campus allocation, and active lifecycle logs.
                </p>
              </div>
              <span className="rounded-xl border border-white/10 bg-white/8 px-3.5 py-2 text-xs font-bold text-blue-100">
                System Command Center
              </span>
            </div>
          </section>

          {/* KPI CARDS */}
          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key Performance Metrics">
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500">Total Cataloged Assets</p>
                  <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">1,268</p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <Icon name="cube" className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-extrabold text-emerald-700">
                  97.9% Operational
                </span>
                <span className="text-[0.68rem] text-slate-400 font-medium">· 26 unserviceable</span>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500">Currently Issued</p>
                  <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">1,015</p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
                  <Icon name="user-check" className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[0.65rem] font-extrabold text-blue-700">
                  80.1% Deployed
                </span>
                <span className="text-[0.68rem] text-slate-400 font-medium">to active personnel</span>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500">Storage Inventory</p>
                  <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">233</p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-500/20">
                  <Icon name="building" className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-extrabold text-emerald-700">
                  Available Stock
                </span>
                <span className="text-[0.68rem] text-slate-400 font-medium">ready for issuance</span>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500">Maintenance Queue</p>
                  <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">20</p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
                  <Icon name="tool" className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-[0.65rem] font-extrabold text-amber-700">
                  In Repair Stream
                </span>
                <span className="text-[0.68rem] text-slate-400 font-medium">· needs technician</span>
              </div>
            </article>
          </section>

          {/* ANALYTICS CHARTS & DISTRIBUTION SECTION */}
          <section className="mt-6 grid gap-6 xl:grid-cols-2">
            {/* DEPARTMENT ASSET DISTRIBUTION (CLEAN TOUCH OF BLUE PALETTE) */}
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-900">Asset Distribution by Department</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">Proportion of campus equipment per office</p>
                </div>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
                  <Icon name="chart" className="h-4 w-4" />
                </span>
              </div>

              <div className="mt-6 space-y-4">
                {departmentDistribution.map((item) => (
                  <div key={item.dept}>
                    <div className="flex justify-between text-xs font-extrabold">
                      <span className="text-slate-800">{item.dept}</span>
                      <span className="text-slate-500 font-semibold">{item.count} items ({item.percentage}%)</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            {/* ASSET CONDITION & HEALTH BREAKDOWN */}
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-900">Condition &amp; Health Status</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">Physical evaluation of cataloged inventory</p>
                </div>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
                  <Icon name="clipboard" className="h-4 w-4" />
                </span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {conditionBreakdown.map((item) => (
                  <div key={item.condition} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <span className="block text-[0.62rem] font-extrabold uppercase tracking-wider text-slate-400">{item.condition}</span>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-2xl font-black text-slate-800">{item.count}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[0.62rem] font-extrabold ${item.tone}`}>
                        {item.percent}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/45 p-3.5 text-xs font-medium text-slate-600">
                 <span className="font-extrabold text-blue-900">GSO System Summary:</span> 83% of physical assets are fully functional. Maintenance records are tracked under Issuances module.
              </div>
            </article>
          </section>
        </div>
      </section>

      {/* NOTIFICATION TOAST */}
      {notice && (
        <div role="status" className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-blue-100 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-xl shadow-slate-900/15">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-600 text-white">
            <Icon name="clipboard" className="h-3.5 w-3.5" />
          </span>
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </main>
  )
}
