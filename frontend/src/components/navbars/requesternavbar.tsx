import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AuthUser } from '../../auth/authApi'
import GsoNotif from '../notifbell/gsonotif'

export type RequesterPage = 'Home' | 'Request Center' | 'My Requests' | 'My Issued Items' | 'Notifications' | 'Return Items' | 'Profile' | 'My Activities'

type IconName = 'bell' | 'chevron-down' | 'clipboard' | 'close' | 'file' | 'grid' | 'logout' | 'menu' | 'package' | 'return' | 'user' | 'users'

const iconPaths: Record<IconName, ReactNode> = {
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  'chevron-down': <path d="m7 10 5 5 5-5" />,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V4M8.5 10h7M8.5 14h7M8.5 18h4" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  file: <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z" /><path d="M13 3v7h7M8 14h8M8 17h8" /></>,
  grid: <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><rect x="14" y="14" width="6.5" height="6.5" rx="1" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  package: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v9l9 5 9-5V8M12 13v9" /></>,
  return: <><path d="M9 14 4 9l5-5" /><path d="M4 9h9a7 7 0 0 1 0 14h-2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
}

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>
}

const navigation: Array<{ name: RequesterPage; label: string; icon: IconName; href: string }> = [
  { name: 'Home', label: 'Overview', icon: 'grid', href: '/requester' },
  { name: 'Request Center', label: 'Request Center', icon: 'file', href: '/requester/request-center' },
  { name: 'My Requests', label: 'My Requests', icon: 'clipboard', href: '/requester/my-requests' },
  { name: 'My Issued Items', label: 'My Issued Items', icon: 'package', href: '/requester/issued-items' },
  { name: 'Notifications', label: 'Notifications', icon: 'bell', href: '/requester/notifications' },
  { name: 'Return Items', label: 'Return Items', icon: 'return', href: '/requester/return-items' },
]

export function RequesterSidebar({ currentPage, mobileMenuOpen, onClose }: { currentPage: RequesterPage; mobileMenuOpen: boolean; onClose: () => void }) {
  const currentPath = window.location.pathname.replace(/^\/borrower(?=\/|$)/, '/requester')
  return <>
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto bg-[#071b35] px-5 py-6 text-slate-300 shadow-2xl shadow-slate-900/20 transition-transform duration-300 lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Requester navigation">
      <div className="flex items-center justify-between px-2">
        <a href="/requester" className="flex items-center gap-3" aria-label="A.S.SET Requester Portal home">
          <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-lg shadow-blue-950/30"><img src="/dyci_img/A.sset.webp" alt="A.S.SET" className="h-full w-full object-contain" /></span>
          <span><span className="block text-sm font-black tracking-tight text-white">A.S.SET</span><span className="block text-[0.62rem] font-bold uppercase tracking-[0.17em] text-blue-200">Requester Portal</span></span>
        </a>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close navigation menu"><Icon name="close" /></button>
      </div>

      <div className="mt-9 px-3 text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-slate-500">Workspace</div>
      <nav className="mt-3 space-y-1.5" aria-label="Primary navigation">
        {navigation.map((item) => {
          const active = currentPage === item.name || (item.name === 'My Requests' && currentPath.startsWith('/requester/requests/') && currentPath !== '/requester/requests/new')
          return <a key={item.name} href={item.href} onClick={onClose} aria-current={active ? 'page' : undefined} className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition ${active ? 'bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-950/35' : 'text-slate-300 hover:bg-white/8 hover:text-white'}`}>
            <Icon name={item.icon} className={`h-[1.15rem] w-[1.15rem] ${active ? 'text-white' : 'text-blue-200 group-hover:text-white'}`} /><span className="flex-1">{item.label}</span>
          </a>
        })}
      </nav>

      <div className="mt-auto mb-2 overflow-hidden rounded-2xl border border-blue-300/15 bg-linear-to-br from-blue-900/50 via-slate-900/40 to-slate-950/60 px-4 py-4 text-center shadow-lg shadow-slate-950/40 sm:p-5">
        <img src="/dyci_img/dyci_logo.jpg" alt="Dr. Yanga's Colleges logo" className="mx-auto h-auto w-full max-w-34 object-contain sm:max-w-38" />
        <p className="mt-1 text-[0.6rem] font-semibold leading-relaxed text-blue-200/75">Asset management system for Dr. Yanga's Colleges</p>
      </div>
    </aside>
    {mobileMenuOpen && <button type="button" className="fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] lg:hidden" aria-label="Close navigation menu" onClick={onClose} />}
  </>
}

export function RequesterPageHeader({ pageName, today, user, onOpenMenu, onSignOut }: { pageName: RequesterPage; today: string; user: AuthUser | null; onOpenMenu: () => void; onSignOut: () => void }) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const initials = user?.name?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'BR'
  const onProfilePage = /\/profile$/.test(window.location.pathname)


  useEffect(() => {
    if (!accountMenuOpen) return
    const handlePointerDown = (event: PointerEvent) => { if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false) }
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setAccountMenuOpen(false) }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => { document.removeEventListener('pointerdown', handlePointerDown); document.removeEventListener('keydown', handleKeyDown) }
  }, [accountMenuOpen])

  return <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f4f7fb]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-9">
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onOpenMenu} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-blue-100 lg:hidden" aria-label="Open navigation menu"><Icon name="menu" /></button>
        <div className="min-w-0"><p className="truncate text-[0.65rem] font-bold text-slate-500 sm:text-xs">Requester Portal / <span className="text-slate-700">{pageName}</span></p><p className="mt-0.5 hidden text-[0.68rem] font-bold text-slate-400 sm:block">{today}</p></div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <GsoNotif open={notifOpen} onOpenChange={setNotifOpen} notificationCenterHref="/requester/notifications" notificationCenterLabel="Open all notifications" />
        <div ref={accountMenuRef} className="relative">
          <button type="button" onClick={() => setAccountMenuOpen((open) => !open)} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5 shadow-sm transition hover:border-blue-200 focus:outline-none focus:ring-4 focus:ring-blue-100" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={accountMenuOpen}>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-linear-to-br from-blue-600 to-indigo-700 text-[0.62rem] font-black text-white">{initials}</span>
            <span className="hidden max-w-44 text-left sm:block"><span className="block truncate text-[0.68rem] font-extrabold leading-none text-slate-800">{user?.name || 'Requester'}</span><span className="mt-1 block truncate text-[0.58rem] font-bold leading-none text-slate-400">{user?.email || 'School requester'}</span></span>
            <Icon name="chevron-down" className={`h-3.5 w-3.5 text-slate-400 transition ${accountMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {accountMenuOpen && <div role="menu" aria-label="Account options" className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/20">
            <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-blue-600 to-indigo-700 text-[0.62rem] font-black text-white">{initials}</span><div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-800">{user?.name || 'Requester'}</p><p className="mt-1 truncate text-[0.65rem] font-semibold text-slate-500">{user?.email || 'School account'}</p></div></div>
            <div className="px-1 py-2"><button type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"><Icon name="user" className="h-4 w-4 text-slate-400" />Settings<Icon name="chevron-down" className={`ml-auto h-3.5 w-3.5 text-slate-400 transition ${settingsOpen ? 'rotate-180' : ''}`} /></button>{settingsOpen && <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-blue-100 pl-2"><a href="/requester/profile" role="menuitem" aria-current={onProfilePage ? 'page' : undefined} onClick={() => setAccountMenuOpen(false)} className={`flex w-full items-center rounded-xl px-2.5 py-2 text-xs font-bold transition ${onProfilePage ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'}`}>Profile</a><a href="/requester/my-activities" role="menuitem" aria-current={pageName === 'My Activities' ? 'page' : undefined} onClick={() => setAccountMenuOpen(false)} className={`flex w-full items-center rounded-xl px-2.5 py-2 text-xs font-bold transition ${pageName === 'My Activities' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'}`}>My activities</a></div>}</div>
            <div className="border-t border-slate-100 px-1 pb-1 pt-1"><button type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); onSignOut() }} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-xs font-bold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"><Icon name="logout" className="h-4 w-4" />Logout</button></div>
          </div>}
        </div>
      </div>
    </div>
  </header>
}
