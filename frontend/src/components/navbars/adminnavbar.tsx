import { useEffect, useRef, useState, type ReactNode } from 'react'

type AdminNavIcon = 'activity' | 'bell' | 'chevron-down' | 'close' | 'database' | 'grid' | 'history' | 'logout' | 'mail' | 'menu' | 'search' | 'settings' | 'shield' | 'user'

const iconPaths: Record<AdminNavIcon, ReactNode> = {
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
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
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  logout: <path d="M10 17l5-5-5-5m5 5H3m9-9h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />,
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
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
}

function Icon({ name, className = 'h-[1.15rem] w-[1.15rem]' }: { name: AdminNavIcon; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>
}

const navigation: { name: string; icon: AdminNavIcon; href?: string }[] = [
  { name: 'Overview', icon: 'grid', href: '/admin' },
  { name: 'Roles & permissions', icon: 'shield' },
  { name: 'Audit logs', icon: 'activity', href: '/admin/audit-logs' },
  { name: 'Security logs', icon: 'shield' },
  { name: 'System configuration', icon: 'settings' },
  { name: 'Email monitoring', icon: 'mail' },
  { name: 'Backup & recovery', icon: 'database' },
]

type AdminNavbarProps = {
  activePath: string;
  mobileMenuOpen: boolean;
  onMobileMenuClose: () => void;
}

export default function AdminNavbar({ activePath, mobileMenuOpen, onMobileMenuClose }: AdminNavbarProps) {
  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto bg-[#071b35] px-5 py-6 text-slate-300 shadow-2xl shadow-slate-900/20 transition-transform duration-300 lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
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
          <button type="button" onClick={onMobileMenuClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close navigation menu">
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="mt-9 px-3 text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-slate-500">Workspace</div>
        <nav className="mt-3 space-y-1.5" aria-label="Admin modules">
          {navigation.map((item) => {
            const isActive = activePath === item.href
            const itemClassName = `group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-bold transition ${isActive ? 'bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-950/35' : item.href ? 'text-slate-300 hover:bg-white/8 hover:text-white' : 'cursor-not-allowed text-slate-400 opacity-75'}`
            const contents = <><Icon name={item.icon} /><span className="min-w-0 flex-1 truncate">{item.name}</span>{!item.href && <span className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-500">Soon</span>}</>

            return item.href ? (
              <a key={item.name} href={item.href} onClick={onMobileMenuClose} className={itemClassName} aria-current={isActive ? 'page' : undefined}>{contents}</a>
            ) : (
              <div key={item.name} className={itemClassName} aria-disabled="true">{contents}</div>
            )
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/6 p-4">
          <div className="flex items-center gap-2 text-blue-200">
            <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_0_4px_rgba(56,189,248,0.1)]" />
            <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em]">Admin workspace</span>
          </div>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">Account, audit, and monitoring modules.</p>
        </div>
      </aside>

      {mobileMenuOpen && <button type="button" className="fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] lg:hidden" aria-label="Close navigation menu" onClick={onMobileMenuClose} />}
    </>
  )
}

type AdminPageHeaderProps = {
  pageName: string
  subtitle?: string
  today?: string
  onOpenMenu: () => void
  onSignOut: () => void
}

export function AdminPageHeader({ pageName, subtitle, today, onOpenMenu, onSignOut }: AdminPageHeaderProps) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const headerDate = today ?? new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

  useEffect(() => {
    if (!accountMenuOpen && !notificationsOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false)
      if (!notificationsRef.current?.contains(event.target as Node)) setNotificationsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false)
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [accountMenuOpen, notificationsOpen])

  const handleAction = (label: string) => {
    setNotice(`${label} action selected.`)
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f4f7fb]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-9">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onOpenMenu} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden" aria-label="Open admin navigation">
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[0.65rem] font-bold text-slate-500 sm:text-xs">IT Administration / <span className="text-slate-700">{pageName}</span></p>
            <p className="mt-0.5 hidden truncate text-[0.68rem] font-bold text-slate-400 sm:block">{headerDate}{subtitle && <><span className="px-1.5">·</span>{subtitle}</>}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div ref={notificationsRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen((isOpen) => !isOpen)
                setAccountMenuOpen(false)
              }}
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100"
              aria-label="View admin notifications"
              aria-haspopup="dialog"
              aria-expanded={notificationsOpen}
              aria-controls="admin-notifications-panel"
            >
              <Icon name="bell" className="h-[1.1rem] w-[1.1rem]" />
            </button>

            {notificationsOpen && (
              <section id="admin-notifications-panel" role="dialog" aria-label="Admin notifications" className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-900/20 sm:w-96">
                <div className="flex items-start justify-between border-b border-slate-100 px-4 py-4">
                  <div>
                    <h2 className="text-sm font-black">Notifications</h2>
                    <p className="mt-1 text-xs font-medium text-slate-500">You are all caught up.</p>
                  </div>
                  <button type="button" onClick={() => setNotificationsOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close notifications">
                    <Icon name="close" className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto px-6 py-10 text-center">
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Icon name="bell" className="h-5 w-5" /></span>
                  <p className="mt-3 text-xs font-extrabold text-slate-700">No notifications yet</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">System, account, and security updates will appear here.</p>
                </div>
              </section>
            )}
          </div>
          <div ref={accountMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen((isOpen) => !isOpen)
                setNotificationsOpen(false)
              }}
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5 shadow-sm transition hover:border-blue-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
              aria-label="Open admin account menu"
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-linear-to-br from-blue-600 to-indigo-700 text-[0.62rem] font-black text-white">IT</span>
              <span className="hidden text-left sm:block">
                <span className="block text-[0.68rem] font-extrabold leading-none text-slate-800">IT Admin</span>
                <span className="mt-1 block text-[0.58rem] font-bold leading-none text-slate-400">System administrator</span>
              </span>
              <Icon name="chevron-down" className={`h-3.5 w-3.5 text-slate-400 transition ${accountMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {accountMenuOpen && (
              <div role="menu" aria-label="Admin account options" className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/20">
                <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-blue-600 to-indigo-700 text-[0.62rem] font-black text-white">IT</span>
                  <div>
                    <p className="text-xs font-extrabold text-slate-800">IT Admin</p>
                    <p className="mt-1 text-[0.65rem] font-semibold text-slate-500">System administrator</p>
                  </div>
                </div>
                <div className="border-b border-slate-100 px-1 py-2">
                  <p className="px-2.5 pb-1.5 pt-1 text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-slate-400">Settings</p>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false)
                      handleAction('Profile')
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-xs font-bold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                  >
                    <Icon name="user" className="h-4 w-4 text-slate-400" /> Profile
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false)
                      handleAction('Audit Trail')
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-xs font-bold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                  >
                    <Icon name="history" className="h-4 w-4 text-slate-400" /> Audit Trail
                  </button>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false)
                    onSignOut()
                  }}
                  className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
                >
                  <Icon name="logout" className="h-4 w-4" /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {notice && (
        <div role="status" className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-xl border border-blue-100 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-xl shadow-slate-900/15">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-600 text-white"><Icon name="history" className="h-3.5 w-3.5" /></span>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss message"><Icon name="close" className="h-3.5 w-3.5" /></button>
        </div>
      )}
      </header>
  )
}
