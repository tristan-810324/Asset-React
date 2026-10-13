import type { ReactNode } from 'react'

type AdminNavIcon = 'activity' | 'database' | 'grid' | 'mail' | 'settings' | 'shield' | 'users'

const iconPaths: Record<AdminNavIcon, ReactNode> = {
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
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
}

function Icon({ name }: { name: AdminNavIcon }) {
  return <svg aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>
}

const navigation: { name: string; icon: AdminNavIcon; href?: string }[] = [
  { name: 'Overview', icon: 'grid', href: '/admin' },
  { name: 'User management', icon: 'users', href: '/admin/users' },
  { name: 'Roles & permissions', icon: 'shield' },
  { name: 'Audit logs', icon: 'activity' },
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
