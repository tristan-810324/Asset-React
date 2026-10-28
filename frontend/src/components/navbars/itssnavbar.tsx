import { useEffect, useState, type ReactNode } from 'react'
import { clearAuthSession, getCurrentUser, type AuthUser } from '../../auth/authApi'
import { ITSSUserContext } from '../../ITSS/itssUserContext'

export type ITSSPage = 'Overview' | 'User management'
type ITSSIconName = 'grid' | 'menu' | 'users'

const iconPaths: Record<ITSSIconName, ReactNode> = {
  grid: <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><rect x="14" y="14" width="6.5" height="6.5" rx="1" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
}

function Icon({ name }: { name: ITSSIconName }) {
  return <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>
}

const navigation: Array<{ name: ITSSPage; href: string; icon: ITSSIconName }> = [
  { name: 'Overview', href: '/itss', icon: 'grid' },
  { name: 'User management', href: '/itss/users', icon: 'users' },
]

export default function ITSSNavbar({ currentPage, title, subtitle, children }: {
  currentPage: ITSSPage
  title: string
  subtitle: string
  children: ReactNode
}) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    let active = true
    getCurrentUser()
      .then((currentUser) => { if (active) setUser(currentUser) })
      .catch(() => { if (active) setUser(null) })
    return () => { active = false }
  }, [])

  const signOut = () => {
    clearAuthSession()
    window.location.replace('/login')
  }
  const today = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

  return (
    <ITSSUserContext.Provider value={user}>
      <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
        <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto bg-[#071b35] px-6 py-7 text-white shadow-2xl shadow-slate-900/20 transition-transform duration-300 lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="IT Staff navigation">
          <div className="flex items-center justify-between">
            <a href="/itss" className="flex items-center gap-3" aria-label="A.S.SET IT Staff dashboard">
              <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-white p-1.5"><img src="/dyci_img/A.sset.webp" alt="A.S.SET" className="h-full w-full object-contain" /></span>
              <span><span className="block text-sm font-black tracking-tight">A.S.SET</span><span className="mt-0.5 block text-[0.62rem] font-bold uppercase tracking-[0.17em] text-blue-200">IT Staff Portal</span></span>
            </a>
            <button type="button" onClick={() => setMobileMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close IT Staff navigation">
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className="mt-10 px-3 text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-slate-500">Workspace</div>
          <nav className="mt-3 space-y-1.5" aria-label="IT Staff modules">
            {navigation.map((item) => {
              const active = currentPage === item.name
              return <a key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} aria-current={active ? 'page' : undefined} className={`group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition ${active ? 'bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-950/35' : 'text-slate-300 hover:bg-white/8 hover:text-white'}`}><Icon name={item.icon} /><span>{item.name}</span></a>
            })}
          </nav>
          <div className="mt-auto rounded-2xl border border-blue-300/15 bg-linear-to-br from-blue-900/80 to-slate-900/70 p-4">
            <div className="flex items-center gap-2 text-blue-200"><span className="h-2 w-2 rounded-full bg-emerald-400" /><span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em]">IT Staff workspace</span></div>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">Manage staff accounts and access for the A.S.SET system.</p>
          </div>
        </aside>

        {mobileMenuOpen && <button type="button" className="fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] lg:hidden" aria-label="Close IT Staff navigation" onClick={() => setMobileMenuOpen(false)} />}

        <section className="min-h-screen lg:pl-72">
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f4f7fb]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-9">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" onClick={() => setMobileMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden" aria-label="Open IT Staff navigation"><Icon name="menu" /></button>
                <div className="min-w-0"><p className="truncate text-[0.65rem] font-bold text-slate-500 sm:text-xs">IT Staff <span className="text-slate-300">/</span> <span className="text-slate-700">{currentPage}</span></p><p className="mt-0.5 hidden text-[0.68rem] font-bold text-slate-400 sm:block">{today}</p></div>
              </div>
              <div className="flex items-center gap-3"><span className="hidden text-right sm:block"><span className="block text-xs font-extrabold text-slate-800">{user?.name || 'IT Staff'}</span><span className="block text-[0.62rem] font-semibold text-slate-500">{user?.email || 'Staff account'}</span></span><button type="button" onClick={signOut} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700">Sign out</button></div>
            </div>
          </header>

          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
            <div className="mb-5 border-b border-slate-200/80 pb-4">
              <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-700">{title}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>
            </div>
            {children}
          </div>
        </section>
      </main>
    </ITSSUserContext.Provider>
  )
}
