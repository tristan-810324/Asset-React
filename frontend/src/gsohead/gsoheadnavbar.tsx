type GsoHeadPage = 'overview' | 'requests' | 'items'
type NavIconName = 'grid' | 'clipboard' | 'archive'

function NavIcon({ name }: { name: NavIconName }) {
  return <svg aria-hidden="true" className="h-[1.15rem] w-[1.15rem] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {name === 'grid' && <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><rect x="14" y="14" width="6.5" height="6.5" rx="1" /></>}
    {name === 'clipboard' && <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.25V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v.75M8.5 10h7M8.5 14h7M8.5 18h4" /></>}
    {name === 'archive' && <><path d="M3 7.5h18M5.25 7.5 6.6 3.75h10.8l1.35 3.75M5.25 7.5v11.25a1.5 1.5 0 0 0 1.5 1.5h10.5a1.5 1.5 0 0 0 1.5-1.5V7.5M9.25 11.25h5.5" /></>}
  </svg>
}

export default function GsoHeadNavbar({ activePage, mobileOpen = false, onClose }: {
  activePage: GsoHeadPage
  mobileOpen?: boolean
  onClose?: () => void
}) {
  const links: Array<{ page: GsoHeadPage; title: string; href: string; icon: NavIconName }> = [
    { page: 'overview', title: 'Overview', href: '/gso-head', icon: 'grid' },
    { page: 'requests', title: 'Request Requisition', href: '/gso-head/requests', icon: 'clipboard' },
    { page: 'items', title: 'Master Items', href: '/gso-head/items', icon: 'archive' },
  ]

  return <>
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto bg-[#071b35] px-5 py-6 text-slate-300 shadow-2xl shadow-slate-900/20 transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="GSO Head navigation">
      <a href="/gso-head" className="flex items-center gap-3 px-2">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-br from-indigo-500 to-blue-600 text-sm font-black text-white shadow-lg shadow-blue-950/30">GH</span>
        <span><span className="block text-sm font-black tracking-tight text-white">A.S.SET</span><span className="mt-0.5 block text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-indigo-200">GSO Head</span></span>
      </a>
      <p className="mt-9 px-3 text-[0.58rem] font-extrabold uppercase tracking-[0.16em] text-slate-500">Head workspace</p>
      <nav className="mt-2 space-y-1" aria-label="GSO Head pages">
        {links.map((link) => <a key={link.page} href={link.href} aria-current={activePage === link.page ? 'page' : undefined} onClick={onClose} className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition ${activePage === link.page ? 'bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-950/35' : 'text-slate-300 hover:bg-white/8 hover:text-white'}`}><NavIcon name={link.icon} />{link.title}</a>)}
      </nav>
      <div className="mt-auto rounded-2xl border border-indigo-300/15 bg-linear-to-br from-indigo-900/70 to-slate-900/70 p-4"><p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-indigo-200">Request flow</p><p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">GSO Staff checks stock first and issues in-stock items or asks you. Purchases always come to you; approved purchases go to Finance.</p></div>
    </aside>
    {mobileOpen && <button type="button" className="fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] lg:hidden" aria-label="Close navigation menu" onClick={onClose} />}
  </>
}
