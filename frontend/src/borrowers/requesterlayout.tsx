import { useEffect, useState, type ReactNode } from 'react'
import { clearAuthSession, getCurrentUser, type AuthUser } from '../auth/authApi'
import { BorrowerPageHeader, BorrowerSidebar, type BorrowerPage } from '../components/navbars/borrowernavbar'

function pageFromPath(path: string): BorrowerPage {
  if (path === '/borrower/request-center' || path === '/borrower/requests/new') return 'Request Center'
  if (path === '/borrower/my-requests' || path.startsWith('/borrower/requests/')) return 'My Requests'
  if (path === '/borrower/notifications') return 'Updates'
  if (path === '/borrower/profile') return 'Profile'
  return 'Home'
}

export default function RequesterLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const currentPage = pageFromPath(window.location.pathname)
  const today = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())

  useEffect(() => {
    let active = true
    getCurrentUser().then((current) => { if (active) setUser(current) }).catch(() => { if (active) setUser(null) })
    return () => { active = false }
  }, [])

  const signOut = () => {
    clearAuthSession()
    window.location.replace('/login')
  }

  return <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
    <BorrowerSidebar currentPage={currentPage} mobileMenuOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    <section className="min-h-screen lg:pl-72">
      <BorrowerPageHeader pageName={currentPage} today={today} user={user} onOpenMenu={() => setMobileMenuOpen(true)} onSignOut={signOut} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
        <div className="mb-5 hidden border-b border-slate-200/80 pb-4 sm:block">
          <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-700">{title}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>
        </div>
        {children}
      </div>
    </section>
  </main>
}
