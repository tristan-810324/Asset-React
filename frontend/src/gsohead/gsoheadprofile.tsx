import { useEffect, useState } from 'react'
import { getCurrentUser, type AuthUser } from '../auth/authApi'
import { GsoHeadPageFrame } from './gsoheadnavbar'

// Read-only account details for the signed-in GSO Head.
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

  const details: Array<[string, string]> = [
    ['Name', user?.name || '—'],
    ['Email', user?.email || '—'],
    ['Role', 'GSO Head'],
  ]

  return (
    <GsoHeadPageFrame activePage="profile">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">GSO Head Workspace</span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">My profile</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">The account you use to sign in to the GSO Head workspace.</p>
        </div>
      </section>

      <section className="mt-6 max-w-2xl rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-6" aria-labelledby="profile-details-title">
        <h2 id="profile-details-title" className="text-base font-black tracking-tight text-slate-900">Account details</h2>
        <p className="mt-1 text-xs font-medium text-slate-500">Need one of these changed? Ask the IT Admin.</p>
        <dl className="mt-5 divide-y divide-slate-100">
          {details.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <dt className="text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="break-words text-sm font-bold text-slate-800">{loaded ? value : 'Loading…'}</dd>
            </div>
          ))}
        </dl>
      </section>
    </GsoHeadPageFrame>
  )
}
