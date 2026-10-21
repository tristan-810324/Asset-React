import { useEffect, useState } from 'react'
import { clearAuthSession, getCurrentUser, type AuthUser } from '../auth/authApi'

export default function BorrowerDashboard() {
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    let active = true
    getCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser)
      })
      .catch(() => {
        if (active) setUser(null)
      })

    return () => { active = false }
  }, [])

  const signOut = () => {
    clearAuthSession()
    window.location.replace('/login')
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-9">
          <a href="/borrower" className="flex items-center gap-3" aria-label="A.SSET Borrower Portal home">
            <img src="/dyci_img/A.sset.webp" alt="A.SSET logo" className="h-10 w-10 object-contain" />
            <span className="border-l border-slate-200 pl-3">
              <span className="block text-sm font-black tracking-tight text-slate-900">A.SSET</span>
              <span className="mt-0.5 block text-[0.62rem] font-bold uppercase tracking-[0.13em] text-slate-500">Borrower portal</span>
            </span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden text-right sm:block">
              <span className="block max-w-48 truncate text-xs font-extrabold text-slate-800">{user?.name || 'Borrower'}</span>
              <span className="mt-0.5 block max-w-48 truncate text-[0.65rem] font-semibold text-slate-500">{user?.email || 'Account'}</span>
            </span>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-extrabold text-slate-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 17l5-5-5-5m5 5H3m9-9h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-9 lg:px-9">
        <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-7 text-white shadow-xl shadow-blue-950/15 sm:px-8 sm:py-9">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
          <div className="absolute -right-10 top-1/2 hidden h-56 w-56 -translate-y-1/2 rounded-full border-26 border-white/5 sm:block" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Borrower account verified
            </span>
            <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
              Your A.SSET borrower account is ready. Use this portal to keep your account details and borrowing activity in one place.
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3" aria-label="Account overview">
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/50">
            <p className="text-xs font-bold text-slate-500">Account type</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" />
                </svg>
              </span>
              <span className="text-base font-black text-slate-900">Borrower</span>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/50">
            <p className="text-xs font-bold text-slate-500">Email verification</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span className="text-base font-black text-slate-900">Verified</span>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/50">
            <p className="text-xs font-bold text-slate-500">Registered email</p>
            <div className="mt-3 flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
                </svg>
              </span>
              <span className="truncate text-sm font-extrabold text-slate-900">{user?.email || 'Loading account...'}</span>
            </div>
          </article>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/50 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-black tracking-tight text-slate-900">Borrowing activity</h2>
                <p className="mt-1 text-xs font-medium text-slate-500">Your requests and issued items will appear here.</p>
              </div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.25V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v.75M8.5 10h7M8.5 14h7M8.5 18h4" />
                </svg>
              </span>
            </div>
            <div className="mt-5 flex min-h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-white text-slate-400 shadow-sm">
                  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7.5h18M5.25 7.5 6.6 3.75h10.8l1.35 3.75M5.25 7.5v11.25a1.5 1.5 0 0 0 1.5 1.5h10.5a1.5 1.5 0 0 0 1.5-1.5V7.5M9.25 11.25h5.5" />
                  </svg>
                </span>
                <p className="mt-3 text-sm font-extrabold text-slate-700">No borrowing activity yet</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Once a borrowing request is recorded for your account, its status will be shown here.</p>
              </div>
            </div>
          </article>

          <aside className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5 sm:p-6">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-blue-700 shadow-sm">
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" />
              </svg>
            </div>
            <h2 className="mt-4 text-base font-black tracking-tight text-slate-900">Your borrower account</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Keep access to this email account so you can receive verification and borrowing updates. For help with an item request, contact the General Services Office.
            </p>
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-blue-100 bg-white/80 px-3 py-2.5 text-[0.68rem] font-bold text-blue-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Email verified and ready to use
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
