import { useState, type ReactNode } from 'react'
import { clearAuthSession } from '../auth/authApi'

type AdminIconName = 'activity' | 'alert' | 'bell' | 'chevron-down' | 'close' | 'database' | 'grid' | 'mail' | 'menu' | 'search' | 'settings' | 'shield' | 'users' | 'logout'

const iconPaths: Record<AdminIconName, ReactNode> = {
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  alert: (
    <>
      <path d="m10.3 3.86-8.4 14.1A2 2 0 0 0 3.62 21h16.76a2 2 0 0 0 1.72-3.04l-8.4-14.1a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4m0 3h.01" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  'chevron-down': <path d="m7 10 5 5 5-5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
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
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
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
  shield: (
    <>
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  logout: <path d="M10 17l5-5-5-5m5 5H3m9-9h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />,
}

function Icon({ name, className = 'h-5 w-5' }: { name: AdminIconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {iconPaths[name]}
    </svg>
  )
}

const navigation: { name: string; icon: AdminIconName }[] = [
  { name: 'Overview', icon: 'grid' },
  { name: 'User management', icon: 'users' },
  { name: 'Roles & permissions', icon: 'shield' },
  { name: 'Audit logs', icon: 'activity' },
  { name: 'Security logs', icon: 'shield' },
  { name: 'System configuration', icon: 'settings' },
  { name: 'Email monitoring', icon: 'mail' },
  { name: 'Backup & recovery', icon: 'database' },
]

const summaryCards = [
  { label: 'System accounts', detail: 'Account totals not connected', icon: 'users' as AdminIconName, color: 'bg-blue-50 text-blue-600' },
  { label: 'Recent activity', detail: 'Activity feed not connected', icon: 'activity' as AdminIconName, color: 'bg-violet-50 text-violet-600' },
  { label: 'Security events', detail: 'Security feed not connected', icon: 'shield' as AdminIconName, color: 'bg-amber-50 text-amber-600' },
  { label: 'System alerts', detail: 'Alert feed not connected', icon: 'alert' as AdminIconName, color: 'bg-rose-50 text-rose-600' },
]

export default function AdminDashboard() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const today = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

  const handleSignOut = () => {
    clearAuthSession()
    window.location.replace('/login')
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto bg-[#071b35] px-5 py-6 text-slate-300 shadow-2xl shadow-slate-900/20 transition-transform duration-300 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="IT Admin navigation"
      >
        <div className="flex items-center justify-between px-2">
          <a href="/" className="flex items-center gap-3" aria-label="A.SSET home">
            <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-lg shadow-blue-950/30">
              <img src="/dyci_img/A.sset.webp" alt="A.SSET" className="h-full w-full object-contain" />
            </span>
            <span>
              <span className="block text-sm font-black tracking-tight text-white">A.SSET</span>
              <span className="block text-[0.62rem] font-bold uppercase tracking-[0.17em] text-blue-200">IT Admin Console</span>
            </span>
          </a>
          <button type="button" onClick={() => setMobileMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close navigation menu">
            <Icon name="close" />
          </button>
        </div>

        <div className="mt-9 px-3 text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-slate-500">Workspace</div>
        <nav className="mt-3 space-y-1.5" aria-label="Admin modules">
          {navigation.map((item) => {
            const isActive = item.name === 'Overview'
            return (
              <button
                key={item.name}
                type="button"
                disabled={!isActive}
                onClick={() => setMobileMenuOpen(false)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-bold transition disabled:cursor-not-allowed ${
                  isActive
                    ? 'bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-950/35'
                    : 'text-slate-400 opacity-75'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon name={item.icon} className={`h-[1.15rem] w-[1.15rem] ${isActive ? 'text-white' : 'text-blue-200'}`} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {!isActive && <span className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-500">Soon</span>}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/6 p-4">
          <div className="flex items-center gap-2 text-blue-200">
            <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_0_4px_rgba(56,189,248,0.1)]" />
            <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em]">Admin workspace</span>
          </div>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">Account, audit, and monitoring data will appear here when connected.</p>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button type="button" className="fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] lg:hidden" aria-label="Close navigation menu" onClick={() => setMobileMenuOpen(false)} />
      )}

      <section className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f4f7fb]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-9">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={() => setMobileMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden" aria-label="Open navigation menu">
                <Icon name="menu" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-[0.65rem] font-bold text-slate-500 sm:text-xs">IT Administration / <span className="text-slate-700">Overview</span></p>
                <p className="mt-0.5 hidden text-[0.68rem] font-bold text-slate-400 sm:block">{today}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <label className="relative hidden md:block">
                <span className="sr-only">Search admin modules</span>
                <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="search" placeholder="Search accounts, activity..." disabled className="h-10 w-56 rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-xs font-medium text-slate-700 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-70" />
              </label>
              <button type="button" disabled className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-sm" aria-label="Notifications not connected">
                <Icon name="bell" className="h-[1.1rem] w-[1.1rem]" />
              </button>
              <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5 shadow-sm sm:flex">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-linear-to-br from-blue-600 to-indigo-700 text-[0.62rem] font-black text-white">IT</span>
                <span className="text-left">
                  <span className="block text-[0.68rem] font-extrabold leading-none text-slate-800">IT Admin</span>
                  <span className="mt-1 block text-[0.58rem] font-bold leading-none text-slate-400">System administrator</span>
                </span>
                <Icon name="chevron-down" className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <button type="button" onClick={handleSignOut} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 sm:px-3.5" aria-label="Sign out">
                <Icon name="logout" className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
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
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
                  IT Admin workspace
                </div>
                <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Admin dashboard</h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Account access, audit visibility, and system alerts in one place. Live admin data is not connected yet.</p>
              </div>
              <div className="inline-flex w-fit items-center gap-3 rounded-2xl border border-white/10 bg-white/8 px-4 py-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-blue-100"><Icon name="shield" /></span>
                <span>
                  <span className="block text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-blue-200">Access level</span>
                  <span className="mt-1 block text-sm font-black text-white">IT ADMIN</span>
                </span>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Admin summary">
            {summaryCards.map((card) => (
              <article key={card.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-slate-500">{card.label}</p>
                    <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">—</p>
                  </div>
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${card.color}`}><Icon name={card.icon} /></span>
                </div>
                <p className="mt-4 text-[0.68rem] font-bold text-slate-400">{card.detail}</p>
              </article>
            ))}
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-2" aria-label="Admin activity and alerts">
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-900">Recent activity</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">Latest account and administrator events</p>
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600"><Icon name="activity" className="h-4 w-4" /></span>
              </div>
              <div className="mt-5 flex min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 text-center">
                <div className="max-w-xs">
                  <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-400 shadow-sm"><Icon name="activity" /></span>
                  <p className="mt-3 text-sm font-extrabold text-slate-700">No activity data yet</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">Activity will appear here when the admin audit feed is connected.</p>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-900">System alerts</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">Security and service notices</p>
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-50 text-rose-600"><Icon name="alert" className="h-4 w-4" /></span>
              </div>
              <div className="mt-5 flex min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 text-center">
                <div className="max-w-xs">
                  <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-400 shadow-sm"><Icon name="shield" /></span>
                  <p className="mt-3 text-sm font-extrabold text-slate-700">Alert feed not connected</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">System and security notices will appear here when monitoring data is available.</p>
                </div>
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  )
}
