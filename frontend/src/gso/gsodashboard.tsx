import { useState, type ReactNode } from 'react'
import GsoNavbar, { GsoPageHeader, type GsoNavigationItem } from '../components/navbars/gsonavbar'

type IconName =
  | 'archive'
  | 'arrow-right'
  | 'bell'
  | 'building'
  | 'calendar'
  | 'chart'
  | 'chart-pie'
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
      <path d="M3.5 19.5h17" />
      <path d="m5.5 15.5 4-4 3.25 2.75 5.75-6.5" />
      <path d="M14.75 7.75h3.75v3.75" />
    </>
  ),
  'chart-pie': (
    <>
      <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" />
      <path d="M14 3.23A9 9 0 0 1 20.77 10H14V3.23Z" />
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
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z" />
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

// Chart segment colors are intentionally muted to keep the dashboard calm.
const departmentDistribution = [
  { dept: 'Registrar Office', count: 340, percentage: 27, color: '#1e3a8a' },
  { dept: 'IT Services', count: 285, percentage: 23, color: '#1d4ed8' },
  { dept: 'Science Department', count: 210, percentage: 17, color: '#3b82f6' },
  { dept: 'Finance Office', count: 180, percentage: 14, color: '#0ea5e9' },
  { dept: 'GSO Storage (Unassigned)', count: 233, percentage: 19, color: '#94a3b8' },
]

const conditionBreakdown = [
  { condition: 'New / Good', count: 1040, percent: '83.3%', tone: 'bg-emerald-50 text-emerald-700', color: '#10b981' },
  { condition: 'Fair (Usable)', count: 120, percent: '9.6%', tone: 'bg-amber-50 text-amber-700', color: '#f59e0b' },
  { condition: 'Needs Repair', count: 62, percent: '5.0%', tone: 'bg-rose-50 text-rose-700', color: '#f43f5e' },
  { condition: 'Unserviceable', count: 26, percent: '2.1%', tone: 'bg-slate-100 text-slate-600', color: '#94a3b8' },
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

  const departmentChartGradient = `conic-gradient(${departmentDistribution.reduce<{ end: number; stops: string[] }>(
    (gradient, item) => {
      const nextEnd = gradient.end + item.percentage
      gradient.stops.push(`${item.color} ${gradient.end}% ${nextEnd}%`)
      gradient.end = nextEnd
      return gradient
    },
    { end: 0, stops: [] },
  ).stops.join(', ')})`

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
                  System Command Center
                </p>
              </div>
             
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
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 shadow-sm shadow-blue-900/5">
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
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-sky-100 bg-sky-50 text-sky-700 shadow-sm shadow-sky-900/5">
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
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-900/5">
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
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-amber-100 bg-amber-50 text-amber-700 shadow-sm shadow-amber-900/5">
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
            <article className="min-h-88 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-900">Asset Distribution by Department</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">Proportion of campus equipment per office</p>
                </div>
              </div>

              <div className="mt-6 flex min-h-60 flex-col items-center justify-center gap-3 sm:flex-row sm:gap-5">
                <div
                  role="img"
                  aria-label="Doughnut chart showing asset distribution by department"
                  className="relative h-40 w-40 shrink-0 rounded-full sm:h-40 sm:w-40"
                  style={{ background: departmentChartGradient }}
                >
                  <div className="absolute inset-[23%] flex flex-col items-center justify-center rounded-full bg-white text-center shadow-inner shadow-slate-200/60">
                    <span className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-slate-400">Department</span>
                    <span className="mt-0.5 text-lg font-black leading-none text-slate-800">100%</span>
                  </div>
                </div>

                <div className="w-full space-y-1 sm:min-w-0">
                  {departmentDistribution.map((item) => (
                    <div key={item.dept} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg px-2 py-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} />
                        <span className="truncate text-xs font-semibold text-slate-700" title={item.dept}>{item.dept}</span>
                      </div>
                      <span className="text-xs font-medium tabular-nums text-slate-500">{item.count}</span>
                      <span className="min-w-[2.65rem] text-right text-xs font-extrabold tabular-nums text-slate-700">{item.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            {/* ASSET CONDITION & HEALTH BREAKDOWN */}
            <article className="min-h-88 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-900">Condition Status</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">Physical evaluation of cataloged inventory</p>
                </div>
              </div>

              <div className="mt-6 min-h-60 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 sm:p-5">
                <div
                  role="img"
                  aria-label="Stacked bar chart showing physical asset condition percentages"
                  className="flex h-4 w-full overflow-hidden rounded-full bg-slate-200"
                >
                  {conditionBreakdown.map((item) => (
                    <span
                      key={item.condition}
                      title={`${item.condition}: ${item.percent}`}
                      style={{ width: item.percent, backgroundColor: item.color }}
                    />
                  ))}
                </div>

                <div className="mt-7 grid grid-cols-2 gap-x-5 gap-y-6">
                  {conditionBreakdown.map((item) => (
                    <div key={item.condition} className="min-w-0">
                      <div className="flex min-h-8 items-start gap-2">
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} />
                        <span className="text-[0.62rem] font-extrabold uppercase leading-snug tracking-wider text-slate-400">{item.condition}</span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="text-2xl font-black leading-none tabular-nums text-slate-800">{item.count}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-extrabold ${item.tone}`}>
                          {item.percent}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
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
