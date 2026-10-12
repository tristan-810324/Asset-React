import { useState, type ReactNode } from 'react'

type IconName =
  | 'archive'
  | 'arrow-right'
  | 'bell'
  | 'calendar'
  | 'chart'
  | 'chevron-down'
  | 'clipboard'
  | 'close'
  | 'grid'
  | 'menu'
  | 'more'
  | 'plus'
  | 'search'
  | 'settings'
  | 'tool'
  | 'truck'

type NavigationItem = 'Overview' | 'Asset Inventory' | 'Assignments' | 'Maintenance' | 'Reports'

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
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M7.5 3v4M16.5 3v4M3.5 10h17" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
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
  grid: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="14" width="6.5" height="6.5" rx="1" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  more: <path d="M6.5 12h.01M12 12h.01M17.5 12h.01" strokeWidth="3" />,
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

const navigation: { name: NavigationItem; icon: IconName; badge?: string }[] = [
  { name: 'Overview', icon: 'grid' },
  { name: 'Asset Inventory', icon: 'archive', badge: '1,248' },
  { name: 'Assignments', icon: 'truck' },
  { name: 'Maintenance', icon: 'tool', badge: '8' },
  { name: 'Reports', icon: 'chart' },
]

const assetHealth = [
  { label: 'Available', value: '372', change: '+5.2%', color: 'bg-emerald-500', icon: 'archive' as IconName },
  { label: 'Deployed', value: '814', change: '+2.4%', color: 'bg-blue-500', icon: 'truck' as IconName },
  { label: 'In Maintenance', value: '62', change: '8 due soon', color: 'bg-amber-400', icon: 'tool' as IconName },
]

const chartData = [
  { label: 'Mon', value: 45 },
  { label: 'Tue', value: 62 },
  { label: 'Wed', value: 51 },
  { label: 'Thu', value: 77 },
  { label: 'Fri', value: 68 },
  { label: 'Sat', value: 31 },
  { label: 'Sun', value: 42 },
]

const maintenanceItems = [
  { asset: 'HP LaserJet Pro M404dn', id: 'AST-PRN-0241', place: 'Registrar Office', due: 'Today', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  { asset: 'Lenovo ThinkCentre M70q', id: 'AST-PC-0198', place: 'Computer Lab 2', due: 'Tomorrow', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  { asset: 'Epson EB-X06 Projector', id: 'AST-PRJ-0084', place: 'Room 306', due: 'Oct 18', tone: 'bg-sky-50 text-sky-700 ring-sky-200' },
]

const activityItems = [
  { initials: 'MA', title: 'MacBook Air M2 assigned', detail: 'Assigned to the College of Engineering', time: '12 min ago', color: 'bg-violet-100 text-violet-700' },
  { initials: 'LT', title: 'Lab workstation returned', detail: 'AST-PC-0207 checked in from Computer Lab 1', time: '38 min ago', color: 'bg-sky-100 text-sky-700' },
  { initials: 'PM', title: 'Maintenance request completed', detail: 'Projector bulb replaced in Room 204', time: '1 hr ago', color: 'bg-emerald-100 text-emerald-700' },
]

export default function GsoDashboard() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activePage, setActivePage] = useState<NavigationItem>('Overview')
  const [notice, setNotice] = useState('')
  const today = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

  const handleNavigation = (item: NavigationItem) => {
    setActivePage(item)
    setMobileMenuOpen(false)
    if (item !== 'Overview') setNotice(`${item} is ready for its next screen.`)
  }

  const handleAction = (label: string) => {
    setNotice(`${label} action selected.`)
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto bg-[#071b35] px-5 py-6 text-slate-300 shadow-2xl shadow-slate-900/20 transition-transform duration-300 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="GSO navigation"
      >
        <div className="flex items-center justify-between px-2">
          <a href="/" className="flex items-center gap-3" aria-label="A.SSET home">
            <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-lg shadow-blue-950/30">
              <img src="/dyci_img/A.sset.webp" alt="A.SSET" className="h-full w-full object-contain" />
            </span>
            <span>
              <span className="block text-sm font-black tracking-tight text-white">A.SSET</span>
              <span className="block text-[0.62rem] font-bold uppercase tracking-[0.17em] text-blue-200">GSO Command Center</span>
            </span>
          </a>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation menu"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="mt-9 px-3 text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-slate-500">Workspace</div>
        <nav className="mt-3 space-y-1.5" aria-label="Primary navigation">
          {navigation.map((item) => {
            const isActive = activePage === item.name
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => handleNavigation(item.name)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-bold transition ${
                  isActive
                    ? 'bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-950/35'
                    : 'text-slate-300 hover:bg-white/8 hover:text-white'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon name={item.icon} className={`h-[1.15rem] w-[1.15rem] ${isActive ? 'text-white' : 'text-blue-200 group-hover:text-white'}`} />
                <span className="flex-1">{item.name}</span>
                {item.badge && (
                  <span className={`rounded-md px-1.5 py-0.5 text-[0.62rem] font-black ${isActive ? 'bg-white/18 text-white' : 'bg-white/10 text-blue-100'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/6 p-4">
          <div className="flex items-center gap-2 text-blue-200">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.1)]" />
            <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em]">System status</span>
          </div>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">All asset services are running normally.</p>
          <button
            type="button"
            onClick={() => handleAction('Support center')}
            className="mt-3 text-xs font-extrabold text-white transition hover:text-blue-200"
          >
            Contact support <span aria-hidden="true">→</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => handleAction('Settings')}
          className="mt-5 flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-bold text-slate-300 transition hover:bg-white/8 hover:text-white"
        >
          <Icon name="settings" className="h-[1.15rem] w-[1.15rem] text-blue-200" />
          Settings
        </button>
      </aside>

      {mobileMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] lg:hidden"
          aria-label="Close navigation menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <section className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f4f7fb]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-9">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden"
                aria-label="Open navigation menu"
              >
                <Icon name="menu" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-[0.65rem] font-bold text-slate-500 sm:text-xs">General Services Office / <span className="text-slate-700">{activePage}</span></p>
                <p className="mt-0.5 hidden text-[0.68rem] font-bold text-slate-400 sm:block">{today}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <label className="relative hidden md:block">
                <span className="sr-only">Search assets</span>
                <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  placeholder="Search assets, tags..."
                  className="h-10 w-56 rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-xs font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <button
                type="button"
                onClick={() => handleAction('Notifications')}
                className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-600"
                aria-label="View notifications"
              >
                <Icon name="bell" className="h-[1.1rem] w-[1.1rem]" />
                <span className="absolute right-2.5 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
              </button>
              <button
                type="button"
                onClick={() => handleAction('Profile')}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5 shadow-sm transition hover:border-blue-200"
                aria-label="Open profile menu"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-linear-to-br from-blue-600 to-indigo-700 text-[0.62rem] font-black text-white">GO</span>
                <span className="hidden text-left sm:block">
                  <span className="block text-[0.68rem] font-extrabold leading-none text-slate-800">GSO Officer</span>
                  <span className="mt-1 block text-[0.58rem] font-bold leading-none text-slate-400">Administrator</span>
                </span>
                <Icon name="chevron-down" className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
          <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
            <div className="absolute -right-9 top-1/2 h-44 w-44 -translate-y-1/2 rounded-full border-22 border-white/5" />
            <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Asset operations live
                </div>
                <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Good morning, GSO team.</h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Here&apos;s what needs your attention across the campus asset inventory today.</p>
              </div>
              <button
                type="button"
                onClick={() => handleAction('Add new asset')}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-blue-700 shadow-lg shadow-blue-950/20 transition hover:-translate-y-0.5 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Icon name="plus" className="h-4 w-4" />
                Add new asset
              </button>
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Asset summary">
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500">Total Assets</p>
                  <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">1,248</p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon name="archive" /></span>
              </div>
              <div className="mt-4 flex items-center gap-2 text-[0.68rem] font-bold"><span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-700">+7.8%</span><span className="text-slate-400">vs. last month</span></div>
            </article>
            {assetHealth.map((item) => (
              <article key={item.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-slate-500">{item.label}</p>
                    <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{item.value}</p>
                  </div>
                  <span className={`grid h-10 w-10 place-items-center rounded-xl text-white ${item.color}`}><Icon name={item.icon} /></span>
                </div>
                <div className="mt-4 flex items-center gap-2 text-[0.68rem] font-bold"><span className={item.label === 'In Maintenance' ? 'text-amber-600' : 'text-emerald-600'}>{item.change}</span><span className="text-slate-400">{item.label === 'In Maintenance' ? 'requires attention' : 'this month'}</span></div>
              </article>
            ))}
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-900">Asset movement</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">Check-ins and assignments this week</p>
                </div>
                <button type="button" onClick={() => handleAction('Movement report')} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[0.68rem] font-extrabold text-slate-600 transition hover:bg-slate-100">
                  This week <Icon name="chevron-down" className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-7 flex h-49 items-end gap-2 border-b border-slate-100 pb-1 sm:gap-4">
                {chartData.map((point) => (
                  <div key={point.label} className="group flex h-full flex-1 flex-col justify-end gap-2">
                    <div className="relative flex flex-1 items-end justify-center">
                      <span className="pointer-events-none absolute -top-5 rounded-md bg-slate-900 px-1.5 py-0.5 text-[0.6rem] font-bold text-white opacity-0 shadow-sm transition group-hover:opacity-100">{point.value}</span>
                      <div className="w-full max-w-8 rounded-t-lg bg-linear-to-t from-blue-600 to-sky-400 transition-all duration-300 group-hover:from-blue-700 group-hover:to-blue-400" style={{ height: `${point.value}%` }} />
                    </div>
                    <span className="text-center text-[0.62rem] font-bold text-slate-400">{point.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 font-semibold text-slate-500"><span className="h-2 w-2 rounded-full bg-blue-600" />Asset movements</span>
                <span className="font-black text-slate-800">376 <span className="font-semibold text-slate-400">total</span></span>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-900">Quick actions</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">Start a common GSO task</p>
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon name="clipboard" className="h-4 w-4" /></span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                {[
                  { label: 'Register asset', description: 'Add to inventory', icon: 'plus' as IconName, color: 'bg-blue-600 text-white hover:bg-blue-700' },
                  { label: 'Assign asset', description: 'Deploy to a unit', icon: 'truck' as IconName, color: 'bg-slate-50 text-slate-700 hover:bg-slate-100' },
                  { label: 'Log maintenance', description: 'Create service record', icon: 'tool' as IconName, color: 'bg-slate-50 text-slate-700 hover:bg-slate-100' },
                ].map((action) => (
                  <button key={action.label} type="button" onClick={() => handleAction(action.label)} className={`flex items-center gap-3 rounded-xl border border-slate-200/80 p-3 text-left transition ${action.color}`}>
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${action.label === 'Register asset' ? 'bg-white/18' : 'bg-white text-blue-600 shadow-sm'}`}><Icon name={action.icon} className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-xs font-extrabold">{action.label}</span><span className={`mt-0.5 block text-[0.62rem] font-semibold ${action.label === 'Register asset' ? 'text-blue-100' : 'text-slate-400'}`}>{action.description}</span></span>
                    <Icon name="arrow-right" className={`h-4 w-4 shrink-0 ${action.label === 'Register asset' ? 'text-white' : 'text-slate-400'}`} />
                  </button>
                ))}
              </div>
            </article>
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
            <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-900">Upcoming maintenance</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">Assets scheduled for inspection or service</p>
                </div>
                <button type="button" onClick={() => handleNavigation('Maintenance')} className="text-xs font-extrabold text-blue-600 transition hover:text-blue-800">View all</button>
              </div>
              <div className="overflow-x-auto border-t border-slate-100">
                <table className="min-w-155 w-full text-left">
                  <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                    <tr>
                      <th className="px-5 py-3.5 sm:px-6">Asset</th>
                      <th className="px-5 py-3.5">Location</th>
                      <th className="px-5 py-3.5">Due date</th>
                      <th className="px-5 py-3.5 text-right sm:px-6"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {maintenanceItems.map((item) => (
                      <tr key={item.id} className="transition hover:bg-slate-50/70">
                        <td className="px-5 py-4 sm:px-6">
                          <div className="font-extrabold text-slate-800">{item.asset}</div>
                          <div className="mt-1 text-[0.65rem] font-bold text-slate-400">{item.id}</div>
                        </td>
                        <td className="px-5 py-4 text-xs font-semibold text-slate-600">{item.place}</td>
                        <td className="px-5 py-4"><span className={`inline-flex rounded-md px-2 py-1 text-[0.65rem] font-extrabold ring-1 ring-inset ${item.tone}`}>{item.due}</span></td>
                        <td className="px-5 py-4 text-right sm:px-6">
                          <button type="button" onClick={() => handleAction(`Maintenance for ${item.id}`)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label={`Manage ${item.asset}`}><Icon name="more" className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-900">Recent activity</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">Latest inventory changes</p>
                </div>
                <button type="button" onClick={() => handleAction('Activity log')} className="text-xs font-extrabold text-blue-600 transition hover:text-blue-800">See log</button>
              </div>
              <ol className="mt-5 space-y-5">
                {activityItems.map((item, index) => (
                  <li key={item.title} className="relative flex gap-3">
                    {index < activityItems.length - 1 && <span className="absolute left-4 top-9 h-8 w-px bg-slate-200" />}
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.6rem] font-black ${item.color}`}>{item.initials}</span>
                    <div className="min-w-0 pb-0.5">
                      <p className="text-xs font-extrabold text-slate-800">{item.title}</p>
                      <p className="mt-1 text-[0.67rem] font-medium leading-relaxed text-slate-500">{item.detail}</p>
                      <p className="mt-1.5 text-[0.6rem] font-bold text-slate-400">{item.time}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </article>
          </section>
        </div>
      </section>

      {notice && (
        <div role="status" className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-xl border border-blue-100 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-xl shadow-slate-900/15">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-600 text-white"><Icon name="clipboard" className="h-3.5 w-3.5" /></span>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss message"><Icon name="close" className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </main>
  )
}
