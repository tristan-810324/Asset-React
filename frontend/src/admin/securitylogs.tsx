import { useEffect, useState } from 'react'
import AdminNavbar, { AdminPageHeader } from '../components/navbars/adminnavbar'
import { clearAuthSession } from '../auth/authApi'
import { listSystemSecurityEvents, type SystemSecurityEvent } from './adminApi'

export default function SecurityLogs() {
  const [events, setEvents] = useState<SystemSecurityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    let active = true
    listSystemSecurityEvents().then((data) => { if (active) setEvents(data) }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang security events.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function signOut() { clearAuthSession(); window.location.replace('/login') }

  return <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900">
    <AdminNavbar activePath="/admin/security-logs" mobileMenuOpen={mobileMenuOpen} onMobileMenuClose={() => setMobileMenuOpen(false)} />
    <section className="min-h-screen lg:pl-72"><AdminPageHeader pageName="Security logs" subtitle="Login and permission change history" onOpenMenu={() => setMobileMenuOpen(true)} onSignOut={signOut} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
        <section className="rounded-3xl bg-[#09244a] p-6 text-white shadow-xl shadow-blue-950/15"><span className="rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">IT Admin</span><h1 className="mt-3 text-2xl font-black sm:text-3xl">Security Logs</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100">Recent login success/failure events and role-permission changes recorded by the backend.</p></section>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 sm:px-5"><div><h2 className="text-sm font-black text-slate-900">Recent security events</h2><p className="mt-1 text-xs text-slate-500">Newest events appear first. Login records include the submitted email and source IP where available.</p></div><a href="/admin/roles-permissions" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[0.62rem] font-extrabold text-blue-700">Manage permissions</a></div>
          <div className="divide-y divide-slate-100">
            {loading ? <div className="grid min-h-52 place-items-center text-xs font-bold text-slate-400">Loading security events…</div> : events.length === 0 ? <div className="grid min-h-52 place-items-center text-xs text-slate-500">No security events recorded.</div> : events.map((event) => {
              const loginFailure = event.eventType === 'login_failed'
              const label = event.eventType === 'login_succeeded' ? 'Login succeeded' : loginFailure ? 'Login failed' : `${event.targetRoleKey || 'System'} permissions updated`
              return <article key={event.id} className="flex flex-wrap items-start justify-between gap-3 p-4 sm:px-5"><div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[0.58rem] font-black ${loginFailure ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}`}>{loginFailure ? '!' : '✓'}</span><div className="min-w-0"><h3 className="text-xs font-extrabold text-slate-800">{label}</h3><p className="mt-1 text-[0.68rem] text-slate-600">{event.actorName || event.actorEmail || 'Unknown account'}{event.ipAddress ? ` · ${event.ipAddress}` : ''}</p>{Array.isArray(event.newValues.permissions) && <p className="mt-1 break-all text-[0.62rem] text-slate-400">Permissions: {event.newValues.permissions.join(', ')}</p>}</div></div><time className="shrink-0 text-[0.6rem] font-semibold text-slate-400">{new Date(event.createdAt).toLocaleString('en-PH')}</time></article>
            })}
          </div>
        </section>
      </div>
    </section>
  </main>
}
