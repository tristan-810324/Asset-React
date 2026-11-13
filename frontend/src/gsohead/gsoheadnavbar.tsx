import { useEffect, useRef, useState, type ReactNode } from 'react'
import { clearAuthSession, getCurrentUser, type AuthUser } from '../auth/authApi'
import GsoNotif from '../components/notifbell/gsonotif'

export type GsoHeadPage = 'overview' | 'requests' | 'notifications' | 'items' | 'issuance' | 'audit-logs' | 'esignature' | 'profile'

type NavIconName = 'archive' | 'audit' | 'bell' | 'chevron-down' | 'clipboard' | 'close' | 'grid' | 'history' | 'logout' | 'menu' | 'signature' | 'user'

type NavigationLink = {
  page: GsoHeadPage
  title: string
  href: string
  icon: NavIconName
}

const navigationLinks: NavigationLink[] = [
  { page: 'overview', title: 'Overview', href: '/gso-head', icon: 'grid' },
  { page: 'requests', title: 'Purchase Requisitions', href: '/gso-head/requests', icon: 'clipboard' },
  { page: 'notifications', title: 'Notifications', href: '/gso-head/notifications', icon: 'bell' },
  { page: 'items', title: 'Item Master Data', href: '/gso-head/items', icon: 'archive' },
  { page: 'issuance', title: 'Issuance History', href: '/gso-head/issuance-history', icon: 'history' },
  { page: 'audit-logs', title: 'Audit Logs', href: '/gso-head/audit-logs', icon: 'audit' },
  { page: 'esignature', title: 'E-Signature', href: '/gso-head/esignature', icon: 'signature' },
]

const pageTitles: Record<GsoHeadPage, string> = {
  overview: 'GSO Head Overview',
  requests: 'Purchase Requisitions',
  notifications: 'Notifications',
  items: 'Item Master Data',
  issuance: 'Issuance History',
  'audit-logs': 'Audit Logs',
  esignature: 'E-Signature',
  profile: 'My profile',
}

function NavIcon({ name, className = 'h-[1.15rem] w-[1.15rem] shrink-0' }: { name: NavIconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {name === 'grid' && <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><rect x="14" y="14" width="6.5" height="6.5" rx="1" /></>}
    {name === 'clipboard' && <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.25V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v.75M8.5 10h7M8.5 14h7M8.5 18h4" /></>}
    {name === 'archive' && <><path d="M3 7.5h18M5.25 7.5 6.6 3.75h10.8l1.35 3.75M5.25 7.5v11.25a1.5 1.5 0 0 0 1.5 1.5h10.5a1.5 1.5 0 0 0 1.5-1.5V7.5M9.25 11.25h5.5" /></>}
    {name === 'history' && <><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>}
    {name === 'audit' && <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.25V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v.75M8.5 10h7M8.5 14h4" /><path d="m14 16 1.5 1.5L19 14" /></>}
    {name === 'bell' && <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>}
    {name === 'menu' && <path d="M4 7h16M4 12h16M4 17h16" />}
    {name === 'close' && <path d="m6 6 12 12M18 6 6 18" />}
    {name === 'chevron-down' && <path d="m7 10 5 5 5-5" />}
    {name === 'logout' && <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>}
    {name === 'user' && <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>}
    {name === 'signature' && <><path d="M15.5 5.5 18.5 8.5 9 18l-4 1 1-4z" /><path d="M3.5 21.5h17" /></>}
  </svg>
}

function initialsFor(name: string) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  return initials || 'GH'
}

export default function GsoHeadNavbar({ activePage, mobileOpen = false, onClose }: {
  activePage: GsoHeadPage
  mobileOpen?: boolean
  onClose?: () => void
}) {
  return <>
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto bg-[#071b35] px-5 py-6 text-slate-300 shadow-2xl shadow-slate-900/20 transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="GSO Head navigation">
      <div className="flex items-center justify-between px-2">
        <a href="/gso-head" className="flex items-center gap-3" aria-label="A.S.SET GSO Head home">
          <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-lg shadow-blue-950/30">
            <img src="/dyci_img/A.sset.webp" alt="A.S.SET" className="h-full w-full object-contain" />
          </span>
          <span>
            <span className="block text-sm font-black tracking-tight text-white">A.S.SET</span>
            <span className="block text-[0.62rem] font-bold uppercase tracking-[0.17em] text-blue-200">GSO Head Workspace</span>
          </span>
        </a>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close navigation menu">
          <NavIcon name="close" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-9 px-3 text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-slate-500">Workspace</div>
      <nav className="mt-3 space-y-1.5" aria-label="GSO Head pages">
        {navigationLinks.map((link) => {
          const isActive = activePage === link.page
          return <a key={link.page} href={link.href} aria-current={isActive ? 'page' : undefined} onClick={onClose} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition ${isActive ? 'bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-950/35' : 'text-slate-300 hover:bg-white/8 hover:text-white'}`}>
            <NavIcon name={link.icon} className={`h-[1.15rem] w-[1.15rem] ${isActive ? 'text-white' : 'text-blue-200 group-hover:text-white'}`} />
            <span className="flex-1">{link.title}</span>
          </a>
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-blue-300/15 bg-linear-to-br from-blue-900/80 to-slate-900/70 p-4">
        <div className="flex items-center gap-2 text-blue-200">
          <NavIcon name="clipboard" className="h-4 w-4" />
          <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em]">Decision workspace</span>
        </div>
        <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">Review staff-routed items, approve purchase requisitions, and keep each decision traceable.</p>
        <a href="/gso-head/requests?tab=approval" className="mt-3 inline-block text-xs font-extrabold text-white transition hover:text-blue-200">Review pending decisions <span aria-hidden="true">→</span></a>
      </div>
    </aside>
    {mobileOpen && <button type="button" className="fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] lg:hidden" aria-label="Close navigation menu" onClick={onClose} />}
  </>
}

export function GsoHeadPageHeader({ pageName, today, onOpenMenu }: { pageName: string; today: string; onOpenMenu: () => void }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    getCurrentUser().then((currentUser) => {
      if (active) setUser(currentUser)
    }).catch(() => undefined)
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

  const accountName = user?.name || 'GSO Head'
  const accountEmail = user?.email || 'Head workspace account'
  const onProfilePage = window.location.pathname === '/gso-head/profile'

  function signOut() {
    clearAuthSession()
    window.location.replace('/login')
  }

  return <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f4f7fb]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-9">
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onOpenMenu} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden" aria-label="Open navigation menu">
          <NavIcon name="menu" className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-[0.65rem] font-bold text-slate-500 sm:text-xs">General Services Office / <span className="text-slate-700">{pageName}</span></p>
          <p className="mt-0.5 hidden text-[0.68rem] font-bold text-slate-400 sm:block">{today}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <GsoNotif
          open={notificationsOpen}
          onOpenChange={(open) => {
            setAccountMenuOpen(false)
            setNotificationsOpen(open)
          }}
          notificationCenterHref="/gso-head/notifications"
          notificationCenterLabel="Open all notifications"
        />
        <div ref={accountMenuRef} className="relative">
          <button type="button" onClick={() => { setAccountMenuOpen((isOpen) => !isOpen); setNotificationsOpen(false) }} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5 shadow-sm transition hover:border-blue-200 focus:outline-none focus:ring-4 focus:ring-blue-100" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={accountMenuOpen}>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-linear-to-br from-blue-600 to-indigo-700 text-[0.62rem] font-black text-white">{initialsFor(accountName)}</span>
            <span className="hidden max-w-36 text-left sm:block">
              <span className="block truncate text-[0.68rem] font-extrabold leading-none text-slate-800">{accountName}</span>
              <span className="mt-1 block text-[0.58rem] font-bold leading-none text-slate-400">GSO Head</span>
            </span>
            <NavIcon name="chevron-down" className={`h-3.5 w-3.5 text-slate-400 transition ${accountMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {accountMenuOpen && <div role="menu" aria-label="Account options" className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/20">
            <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-blue-600 to-indigo-700 text-[0.62rem] font-black text-white">{initialsFor(accountName)}</span>
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
                <NavIcon name="user" className="h-4 w-4 text-slate-400" />
                Settings
                <NavIcon name="chevron-down" className={`ml-auto h-3.5 w-3.5 text-slate-400 transition ${settingsOpen ? 'rotate-180' : ''}`} />
              </button>
              {settingsOpen && (
                <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-blue-100 pl-2">
                  <a
                    href="/gso-head/profile"
                    role="menuitem"
                    aria-current={onProfilePage ? 'page' : undefined}
                    onClick={() => setAccountMenuOpen(false)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-xs font-bold transition ${onProfilePage ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'}`}
                  >
                    Profile
                  </a>
                  <a
                    href="/gso-head/audit-logs"
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
              <button type="button" role="menuitem" onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-xs font-bold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"><NavIcon name="logout" className="h-4 w-4" />Logout</button>
            </div>
          </div>}
        </div>
      </div>
    </div>
  </header>
}

export function GsoHeadPageFrame({ activePage, children, contentWidth = 'standard' }: { activePage: GsoHeadPage; children: ReactNode; contentWidth?: 'standard' | 'wide' }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const today = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())

  return <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
    <GsoHeadNavbar activePage={activePage} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    <section className="min-h-screen lg:pl-72">
      <GsoHeadPageHeader pageName={pageTitles[activePage]} today={today} onOpenMenu={() => setMobileOpen(true)} />
      <div className={`mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-9 ${contentWidth === 'wide' ? 'max-w-screen-2xl' : 'max-w-7xl'}`}>{children}</div>
    </section>
  </main>
}
