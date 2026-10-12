import { useState, type ReactNode } from 'react'

export type GsoNavigationItem =
  | 'Overview'
  | 'Item Master Data'
  | 'Employee Master Data'
  | 'Issuance Records'
  | 'Requests & Borrowing'
  | 'Maintenance'

type VisibleNavigationItem = Exclude<GsoNavigationItem, 'Maintenance'>
type NavigationIconName = 'archive' | 'bell' | 'chevron-down' | 'clipboard' | 'close' | 'grid' | 'menu' | 'search' | 'settings' | 'truck' | 'users'

const iconPaths: Record<NavigationIconName, ReactNode> = {
  archive: (
    <>
      <path d="M3 7.5h18" />
      <path d="M5.25 7.5 6.6 3.75h10.8l1.35 3.75" />
      <path d="M5.25 7.5v11.25A1.5 1.5 0 0 0 6.75 20.25h10.5a1.5 1.5 0 0 0 1.5-1.5V7.5" />
      <path d="M9.25 11.25h5.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
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
  truck: (
    <>
      <path d="M3 5h11v11H3zM14 9h3l3 3v4h-6z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
}

function NavigationIcon({ name, className = 'h-5 w-5' }: { name: NavigationIconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {iconPaths[name]}
    </svg>
  )
}

const navigation: { name: VisibleNavigationItem; icon: NavigationIconName; href: string; badge?: string }[] = [
  { name: 'Overview', icon: 'grid', href: '/gso' },
  { name: 'Item Master Data', icon: 'archive', href: '/gso/items', badge: '1,248' },
  { name: 'Employee Master Data', icon: 'users', href: '/gso/employees' },
  { name: 'Issuance Records', icon: 'truck', href: '/gso/issuance' },
  { name: 'Requests & Borrowing', icon: 'clipboard', href: '/gso/requests-borrowing' },
]

type GsoNavbarProps = {
  currentPage: GsoNavigationItem
  mobileMenuOpen: boolean
  onClose: () => void
  onAction: (label: string) => void
}

export default function GsoNavbar({ currentPage, mobileMenuOpen, onClose, onAction }: GsoNavbarProps) {
  return (
    <>
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
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation menu"
          >
            <NavigationIcon name="close" />
          </button>
        </div>

        <div className="mt-9 px-3 text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-slate-500">Workspace</div>
        <nav className="mt-3 space-y-1.5" aria-label="Primary navigation">
          {navigation.map((item) => {
            const isActive = currentPage === item.name
            return (
              <a
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-bold transition ${
                  isActive
                    ? 'bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-950/35'
                    : 'text-slate-300 hover:bg-white/8 hover:text-white'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <NavigationIcon name={item.icon} className={`h-[1.15rem] w-[1.15rem] ${isActive ? 'text-white' : 'text-blue-200 group-hover:text-white'}`} />
                <span className="flex-1">{item.name}</span>
                {item.badge && (
                  <span className={`rounded-md px-1.5 py-0.5 text-[0.62rem] font-black ${isActive ? 'bg-white/18 text-white' : 'bg-white/10 text-blue-100'}`}>
                    {item.badge}
                  </span>
                )}
              </a>
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
            onClick={() => onAction('Support center')}
            className="mt-3 text-xs font-extrabold text-white transition hover:text-blue-200"
          >
            Contact support <span aria-hidden="true">→</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onAction('Settings')}
          className="mt-5 flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-bold text-slate-300 transition hover:bg-white/8 hover:text-white"
        >
          <NavigationIcon name="settings" className="h-[1.15rem] w-[1.15rem] text-blue-200" />
          Settings
        </button>
      </aside>

      {mobileMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] lg:hidden"
          aria-label="Close navigation menu"
          onClick={onClose}
        />
      )}
    </>
  )
}

export function GsoMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden"
      aria-label="Open navigation menu"
    >
      <NavigationIcon name="menu" />
    </button>
  )
}

export function GsoPageHeader({
  pageName,
  today,
  searchPlaceholder,
  onOpenMenu,
  onAction,
}: {
  pageName: string
  today: string
  searchPlaceholder: string
  onOpenMenu: () => void
  onAction: (label: string) => void
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f4f7fb]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-9">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <GsoMenuButton onClick={onOpenMenu} />
          <div className="min-w-0">
            <p className="truncate text-[0.65rem] font-bold text-slate-500 sm:text-xs">General Services Office / <span className="text-slate-700">{pageName}</span></p>
            <p className="mt-0.5 hidden text-[0.68rem] font-bold text-slate-400 sm:block">{today}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <label className="relative hidden md:block">
            <span className="sr-only">{searchPlaceholder}</span>
            <NavigationIcon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder={searchPlaceholder}
              className="h-10 w-56 rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-xs font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <button
            type="button"
            onClick={() => onAction('Notifications')}
            className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-600"
            aria-label="View notifications"
          >
            <NavigationIcon name="bell" className="h-[1.1rem] w-[1.1rem]" />
            <span className="absolute right-2.5 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
          </button>
          <button
            type="button"
            onClick={() => onAction('Profile')}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5 shadow-sm transition hover:border-blue-200"
            aria-label="Open profile menu"
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-linear-to-br from-blue-600 to-indigo-700 text-[0.62rem] font-black text-white">GO</span>
            <span className="hidden text-left sm:block">
              <span className="block text-[0.68rem] font-extrabold leading-none text-slate-800">GSO Officer</span>
              <span className="mt-1 block text-[0.58rem] font-bold leading-none text-slate-400">Administrator</span>
            </span>
            <NavigationIcon name="chevron-down" className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
          </button>
        </div>
      </div>
    </header>
  )
}

export function GsoPageFrame({
  activePage,
  searchPlaceholder,
  children,
}: {
  activePage: VisibleNavigationItem
  searchPlaceholder: string
  children: ReactNode
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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
        onClose={() => setMobileMenuOpen(false)}
        onAction={handleAction}
      />
      <section className="min-h-screen lg:pl-72">
        <GsoPageHeader
          pageName={activePage}
          today={today}
          searchPlaceholder={searchPlaceholder}
          onOpenMenu={() => setMobileMenuOpen(true)}
          onAction={handleAction}
        />
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">{children}</div>
      </section>
      {notice && (
        <div role="status" className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-xl border border-blue-100 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-xl shadow-slate-900/15">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-600 text-white"><NavigationIcon name="clipboard" className="h-3.5 w-3.5" /></span>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss message"><NavigationIcon name="close" className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </main>
  )
}
