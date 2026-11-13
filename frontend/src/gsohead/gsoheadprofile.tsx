import { useEffect, useState } from 'react'
import { getCurrentUser, type AuthUser } from '../auth/authApi'
import { GsoHeadPageFrame } from './gsoheadnavbar'

// The signed-in GSO Head's account. The IT Admin manages name and email, so this page only shows them.
export default function GsoHeadProfile() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    getCurrentUser()
      .then((currentUser) => { if (active) setUser(currentUser) })
      .catch(() => undefined)
      .finally(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [])

  const name = user?.name || '—'
  const initials = (user?.name || 'GH').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()
  const fields: Array<[string, string]> = [
    ['Full name', name],
    ['Email', user?.email || '—'],
    ['Role', 'GSO Head'],
  ]

  return (
    <GsoHeadPageFrame activePage="profile">
      <div className="mx-auto max-w-3xl">
        <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">GSO Head workspace</span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">My profile</h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">Your account for the GSO Head workspace.</p>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="profile-details-title">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-100 text-lg font-black text-blue-700">{loaded ? initials : '…'}</span>
              <div>
                <h2 id="profile-details-title" className="text-base font-black text-slate-900">{loaded ? name : 'Loading…'}</h2>
                <p className="mt-1 break-all text-xs font-semibold text-slate-500">{loaded ? (user?.email || '—') : ''}</p>
              </div>
            </div>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-extrabold text-blue-800">GSO Head</span>
          </div>

          <dl className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
            {fields.map(([label, value]) => (
              <div key={label} className="rounded-xl border-2 border-slate-300/80 bg-white p-4 shadow-sm">
                <dt className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
                <dd className="mt-2 wrap-break-word text-sm font-bold text-slate-800">{loaded ? value : 'Loading…'}</dd>
              </div>
            ))}
          </dl>

          <p className="border-t border-slate-100 px-5 py-4 text-xs font-medium text-slate-500 sm:px-6">Need a change? Ask the IT Admin.</p>
        </section>
      </div>
    </GsoHeadPageFrame>
  )
}
