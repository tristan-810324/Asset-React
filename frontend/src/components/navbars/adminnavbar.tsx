import { useEffect, useRef, useState, type ReactNode } from 'react'
import { clearAuthSession, getCurrentUser, type AuthUser } from '../../auth/authApi'
import GsoNotif from '../notifbell/gsonotif'

// Same sidebar, header, and account menu as the GSO pages, so both consoles look like one system.
type AdminIconName = 'chevron-down' | 'clock' | 'close' | 'grid' | 'history' | 'logout' | 'menu' | 'shield' | 'user' | 'users' | 'wrench'

const iconPaths: Record<AdminIconName, ReactNode> = {
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  'chevron-down': <path d="m7 10 5 5 5-5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="14" width="6.5" height="6.5" rx="1" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  shield: (
    <>
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  wrench: <path d="M14.7 6.3a5.3 5.3 0 0 0-7.4 7.4l-5.1 5.1a2.1 2.1 0 0 0 3 3l5.1-5.1a5.3 5.3 0 0 0 7.4-7.4l-3.1 3.1-3-3z" />,
}

function AdminIcon({ name, className = 'h-5 w-5' }: { name: AdminIconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {iconPaths[name]}
    </svg>
  )
}

const navigation: Array<{ name: string; icon: AdminIconName; href: string }> = [
  { name: 'Overview', icon: 'grid', href: '/admin' },
  { name: 'User management', icon: 'users', href: '/admin/users' },
  { name: 'Audit logs', icon: 'history', href: '/admin/audit-logs' },
  { name: 'History', icon: 'clock', href: '/admin/history' },
  { name: 'Support Queue', icon: 'wrench', href: '/admin/support-queue' },
  { name: 'Repair & Maintenance', icon: 'wrench', href: '/admin/repair' },
]

type AdminNavbarProps = {
  activePath: string
  mobileMenuOpen: boolean
  onMobileMenuClose: () => void
}

export default function AdminNavbar({ activePath, mobileMenuOpen, onMobileMenuClose }: AdminNavbarProps) {
  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto bg-[#071b35] px-5 py-6 text-slate-300 shadow-2xl shadow-slate-900/20 transition-transform duration-300 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="IT Admin navigation"
      >
        <div className="flex items-center justify-between px-2">
          <a href="/admin" className="flex items-center gap-3" aria-label="A.SSET admin overview">
            <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-lg shadow-blue-950/30">
              <img src="/dyci_img/A.sset.webp" alt="A.SSET" className="h-full w-full object-contain" />
            </span>
            <span>
              <span className="block text-sm font-black tracking-tight text-white">A.SSET</span>
              <span className="block text-[0.62rem] font-bold uppercase tracking-[0.17em] text-blue-200">IT Admin Console</span>
            </span>
          </a>
          <button
            type="button"
            onClick={onMobileMenuClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation menu"
          >
            <AdminIcon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-9 px-3 text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-slate-500">Workspace</div>
        <nav className="mt-3 space-y-1.5" aria-label="Admin modules">
          {navigation.map((item) => {
            const isActive = activePath === item.href
            return (
              <a
                key={item.name}
                href={item.href}
                onClick={onMobileMenuClose}
                className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-bold transition ${
                  isActive
                    ? 'bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-950/35'
                    : 'text-slate-300 hover:bg-white/8 hover:text-white'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <AdminIcon name={item.icon} className={`h-[1.15rem] w-[1.15rem] ${isActive ? 'text-white' : 'text-blue-200 group-hover:text-white'}`} />
                <span className="flex-1">{item.name}</span>
              </a>
            )
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-blue-300/15 bg-linear-to-br from-blue-900/80 to-slate-900/70 p-4">
          <div className="flex items-center gap-2 text-blue-200">
            <AdminIcon name="shield" className="h-4 w-4" />
            <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em]">IT Administration</span>
          </div>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">Accounts, computer lab support, and the audit trail from one console.</p>
          <a href="/admin" className="mt-3 inline-block text-xs font-extrabold text-white transition hover:text-blue-200">
            Open workspace overview <span aria-hidden="true">→</span>
          </a>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button type="button" className="fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] lg:hidden" aria-label="Close navigation menu" onClick={onMobileMenuClose} />
      )}
    </>
  )
}

function AdminMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden"
      aria-label="Open navigation menu"
    >
      <AdminIcon name="menu" className="h-5 w-5" />
    </button>
  )
}

type AdminPageHeaderProps = {
  pageName: string
  subtitle?: string
  onOpenMenu: () => void
  onSignOut: () => void
}

export function AdminPageHeader({ pageName, subtitle, onOpenMenu, onSignOut }: AdminPageHeaderProps) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const today = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

  useEffect(() => {
    let active = true
    getCurrentUser().then((currentUser) => { if (active) setUser(currentUser) }).catch(() => undefined)
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!accountMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [accountMenuOpen])

  const accountName = user?.name || 'IT Admin'
  const accountEmail = user?.email || 'IT administrator account'
  const initials = accountName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'IT'
  const onProfilePage = window.location.pathname === '/admin/profile'

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f4f7fb]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-9">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AdminMenuButton onClick={onOpenMenu} />
          <div className="min-w-0">
            <p className="truncate text-[0.65rem] font-bold text-slate-500 sm:text-xs">IT Administration / <span className="text-slate-700">{pageName}</span></p>
            <p className="mt-0.5 hidden truncate text-[0.68rem] font-bold text-slate-400 sm:block">
              {today}
              {subtitle && <><span className="px-1.5">·</span>{subtitle}</>}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <GsoNotif
            open={notificationsOpen}
            onOpenChange={(open) => {
              setAccountMenuOpen(false)
              setNotificationsOpen(open)
            }}
            notificationCenterHref="/admin/notifications"
            notificationCenterLabel="Open all notifications"
          />
          <div ref={accountMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen((isOpen) => !isOpen)
                setNotificationsOpen(false)
              }}
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5 shadow-sm transition hover:border-blue-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
              aria-label="Open account menu"
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-linear-to-br from-blue-600 to-indigo-700 text-[0.62rem] font-black text-white">{initials}</span>
              <span className="hidden text-left sm:block">
                <span className="block text-[0.68rem] font-extrabold leading-none text-slate-800">{accountName}</span>
                <span className="mt-1 block text-[0.58rem] font-bold leading-none text-slate-400">IT Admin</span>
              </span>
              <AdminIcon name="chevron-down" className={`h-3.5 w-3.5 text-slate-400 transition ${accountMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {accountMenuOpen && (
              <div role="menu" aria-label="Account options" className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/20">
                <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-blue-600 to-indigo-700 text-[0.62rem] font-black text-white">{initials}</span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold text-slate-800">{accountName}</p>
                    <p className="mt-1 truncate text-[0.65rem] font-semibold text-slate-500">{accountEmail}</p>
                  </div>
                </div>
                <div className="px-1 py-2">
                  <button
                    type="button"
                    aria-expanded={settingsOpen}
                    onClick={() => setSettingsOpen((open) => !open)}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                  >
                    <AdminIcon name="user" className="h-4 w-4 text-slate-400" />
                    Settings
                    <AdminIcon name="chevron-down" className={`ml-auto h-3.5 w-3.5 text-slate-400 transition ${settingsOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {settingsOpen && (
                    <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-blue-100 pl-2">
                      <a
                        href="/admin/profile"
                        role="menuitem"
                        aria-current={onProfilePage ? 'page' : undefined}
                        onClick={() => setAccountMenuOpen(false)}
                        className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-xs font-bold transition ${onProfilePage ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'}`}
                      >
                        Profile
                      </a>
                      <a
                        href="/admin/audit-logs"
                        role="menuitem"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
                      >
                        Audit Trail
                      </a>
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-100 px-1 pb-1 pt-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false)
                      onSignOut()
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-xs font-bold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
                  >
                    <AdminIcon name="logout" className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

// The shell every IT Admin page uses: sidebar, header, and the content column.
export function AdminPageFrame({ activePath, pageName, subtitle, children }: { activePath: string; pageName: string; subtitle?: string; children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleSignOut = () => {
    clearAuthSession()
    window.location.replace('/login')
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
      <AdminNavbar activePath={activePath} mobileMenuOpen={mobileMenuOpen} onMobileMenuClose={() => setMobileMenuOpen(false)} />
      <section className="min-h-screen lg:pl-72">
        <AdminPageHeader pageName={pageName} subtitle={subtitle} onOpenMenu={() => setMobileMenuOpen(true)} onSignOut={handleSignOut} />
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">{children}</div>
      </section>
    </main>
  )
}
