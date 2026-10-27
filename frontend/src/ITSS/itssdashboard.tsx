import { useEffect, useState } from 'react'
import { clearAuthSession, getCurrentUser, type AuthUser } from '../auth/authApi'

export default function ITSSDashboard() {
  const [user, setUser] = useState<AuthUser | null>(null)

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

  return (
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col bg-[#071b35] px-6 py-7 text-white shadow-2xl shadow-slate-900/20 lg:flex">
        <a href="/itss" className="flex items-center gap-3" aria-label="A.S.SET IT Staff dashboard">
          <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-white p-1.5"><img src="/dyci_img/A.sset.webp" alt="A.S.SET" className="h-full w-full object-contain" /></span>
          <span><span className="block text-sm font-black tracking-tight">A.S.SET</span><span className="mt-0.5 block text-[0.62rem] font-bold uppercase tracking-[0.17em] text-blue-200">IT Staff Portal</span></span>
        </a>
        <div className="mt-10 px-3 text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-slate-500">Workspace</div>
        <nav className="mt-3" aria-label="IT Staff navigation">
          <a href="/itss" aria-current="page" className="flex items-center gap-3 rounded-xl bg-linear-to-r from-blue-600 to-blue-500 px-3.5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-950/35">
            <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-md bg-white/15 text-xs">▦</span> Overview
          </a>
        </nav>
        <div className="mt-auto rounded-2xl border border-blue-300/15 bg-linear-to-br from-blue-900/80 to-slate-900/70 p-4">
          <div className="flex items-center gap-2 text-blue-200"><span className="h-2 w-2 rounded-full bg-emerald-400" /><span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em]">IT Staff workspace</span></div>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">Signed in with an IT Staff account.</p>
        </div>
      </aside>

      <section className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f4f7fb]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-9">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div><p className="text-[0.65rem] font-bold text-slate-500 sm:text-xs">IT Staff / <span className="text-slate-700">Overview</span></p><p className="mt-0.5 hidden text-[0.68rem] font-bold text-slate-400 sm:block">{new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())}</p></div>
            <div className="flex items-center gap-3"><span className="hidden text-right sm:block"><span className="block text-xs font-extrabold text-slate-800">{user?.name || 'IT Staff'}</span><span className="block text-[0.62rem] font-semibold text-slate-500">{user?.email || 'Staff account'}</span></span><button type="button" onClick={signOut} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700">Sign out</button></div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
          <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-7 text-white shadow-xl shadow-blue-950/15 sm:px-8 sm:py-9">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
            <div className="relative max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> IT Staff workspace</span>
              <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.</h1>
              <p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">You are signed in to the IT Staff dashboard.</p>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
