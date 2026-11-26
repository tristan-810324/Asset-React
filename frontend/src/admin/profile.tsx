import { useEffect, useState } from 'react'
import { getCurrentUser, type AuthUser } from '../auth/authApi'
import { AdminPageFrame } from '../components/navbars/adminnavbar'

// Read-only account details for the signed-in IT Admin.
export default function AdminProfile() {
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    let active = true
    getCurrentUser()
      .then((currentUser) => { if (active) setUser(currentUser) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  const details: Array<[string, string]> = [
    ['Name', user?.name || '—'],
    ['Email', user?.email || '—'],
    ['Role', 'IT Admin'],
  ]

  return (
    <AdminPageFrame activePath="" pageName="Profile">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" /><div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border-18 border-white/4" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-[40%] h-64 w-64 rounded-full border-22 border-white/3" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> IT Admin workspace
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">My profile</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">The account you use to sign in to the IT Admin console.</p>
        </div>
      </section>

      <section className="mt-6 max-w-2xl rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-6" aria-labelledby="admin-profile-title">
        <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">Account</p>
        <h2 id="admin-profile-title" className="mt-1 text-base font-black tracking-tight text-slate-900">Account details</h2>
        <dl className="mt-5 divide-y divide-slate-100">
          {details.map(([label, value]) => (
            <div key={label} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="break-all text-sm font-bold text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </AdminPageFrame>
  )
}
