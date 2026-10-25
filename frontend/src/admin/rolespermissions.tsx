import { useEffect, useState } from 'react'
import AdminNavbar, { AdminPageHeader } from '../components/navbars/adminnavbar'
import { clearAuthSession } from '../auth/authApi'
import { listSystemPermissionCatalog, listSystemRoles, listSystemSecurityEvents, updateSystemRolePermissions, type SystemPermission, type SystemRole, type SystemSecurityEvent } from './adminApi'

const requiredAdminPermissions = new Set(['auth.login', 'users.manage', 'system.roles.view', 'system.security.view'])

export default function AdminRoles() {
  const [roles, setRoles] = useState<SystemRole[]>([])
  const [permissionCatalog, setPermissionCatalog] = useState<SystemPermission[]>([])
  const [securityEvents, setSecurityEvents] = useState<SystemSecurityEvent[]>([])
  const [drafts, setDrafts] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [savingRole, setSavingRole] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([listSystemRoles(), listSystemPermissionCatalog()]).then(([data, permissions]) => {
      if (!active) return
      setRoles(data)
      setPermissionCatalog(permissions)
      setDrafts(Object.fromEntries(data.map((role) => [role.roleKey, role.permissions.map((permission) => permission.key)])))
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang roles and permissions.')
    }).finally(() => { if (active) setLoading(false) })
    listSystemSecurityEvents().then((events) => { if (active) setSecurityEvents(events) }).catch(() => { if (active) setSecurityEvents([]) })
    return () => { active = false }
  }, [])

  function toggle(roleKey: string, permissionKey: string, checked: boolean) {
    setDrafts((current) => {
      const existing = current[roleKey] || []
      const next = checked ? [...new Set([...existing, permissionKey])] : existing.filter((key) => key !== permissionKey)
      return { ...current, [roleKey]: next }
    })
  }

  async function save(roleKey: string) {
    setSavingRole(roleKey); setError(''); setNotice('')
    try {
      const updated = await updateSystemRolePermissions(roleKey, drafts[roleKey] || [])
      setRoles(updated)
      setDrafts(Object.fromEntries(updated.map((role) => [role.roleKey, role.permissions.map((permission) => permission.key)])))
      setNotice(`${roleKey} permissions saved. API access changes immediately.`)
      try { setSecurityEvents(await listSystemSecurityEvents()) } catch { /* The permission change succeeded; leave the current log list visible. */ }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hindi na-save ang permission assignments.') }
    finally { setSavingRole('') }
  }

  function signOut() { clearAuthSession(); window.location.replace('/login') }

  return <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900">
    <AdminNavbar activePath="/admin/roles-permissions" mobileMenuOpen={mobileMenuOpen} onMobileMenuClose={() => setMobileMenuOpen(false)} />
    <section className="min-h-screen lg:pl-72"><AdminPageHeader pageName="Roles & permissions" subtitle="Database-backed access policy" onOpenMenu={() => setMobileMenuOpen(true)} onSignOut={signOut} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
        <section className="rounded-3xl bg-[#09244a] p-6 text-white shadow-xl shadow-blue-950/15"><span className="rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">Security administration</span><h1 className="mt-3 text-2xl font-black sm:text-3xl">Roles &amp; Permissions</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100">Changes are stored in role_permissions and checked by backend routes. The IT Admin role keeps the minimum permissions needed to manage users and this screen.</p></section>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}{notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700">{notice}</p>}
        <section className="mt-5 grid gap-4 xl:grid-cols-3">
          {loading ? <div className="grid min-h-56 place-items-center rounded-2xl bg-white text-xs font-bold text-slate-400">Loading roles…</div> : roles.map((role) => <article key={role.roleKey} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-black text-slate-900">{role.displayName}</h2><p className="mt-1 text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-400">{role.roleKey}</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[0.58rem] font-extrabold text-blue-700">{(drafts[role.roleKey] || []).length} permissions</span></div>
            <div className="mt-4 max-h-120 space-y-2 overflow-y-auto pr-1">{permissionCatalog.map((permission) => {
              const checked = (drafts[role.roleKey] || []).includes(permission.key)
              const locked = permission.key === 'auth.login' || (role.roleKey === 'IT_ADMIN' && requiredAdminPermissions.has(permission.key))
              return <label key={permission.key} className={`flex items-start gap-2.5 rounded-xl border p-3 ${checked ? 'border-blue-100 bg-blue-50/40' : 'border-slate-100 bg-white'}`}><input type="checkbox" checked={checked} disabled={locked || savingRole === role.roleKey} onChange={(event) => toggle(role.roleKey, permission.key, event.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" /><span className="min-w-0"><span className="block break-all text-[0.65rem] font-extrabold text-slate-800">{permission.key}{locked && <span className="ml-1 text-[0.55rem] text-blue-700">required</span>}</span><span className="mt-1 block text-[0.6rem] leading-relaxed text-slate-500">{permission.description}</span></span></label>
            })}</div>
            <button type="button" onClick={() => void save(role.roleKey)} disabled={savingRole === role.roleKey || loading} className="mt-4 h-10 w-full rounded-xl bg-blue-600 text-xs font-extrabold text-white hover:bg-blue-700 disabled:opacity-50">{savingRole === role.roleKey ? 'Saving…' : `Save ${role.displayName} access`}</button>
          </article>)}
        </section>
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-black text-slate-900">Security change history</h2><p className="mt-1 text-xs text-slate-500">Recent permission changes are recorded with the administrator who made them.</p></div><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[0.6rem] font-extrabold text-slate-600">{securityEvents.length} events</span></div>
          <div className="mt-3 space-y-2">{securityEvents.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">No security changes recorded.</p> : securityEvents.map((event) => <article key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3"><div><p className="text-xs font-extrabold text-slate-800">{event.eventType === 'login_succeeded' ? 'Successful login' : event.eventType === 'login_failed' ? 'Failed login' : `${event.targetRoleKey || 'System'} permissions updated`}</p><p className="mt-1 text-[0.62rem] text-slate-500">By {event.actorName || event.actorEmail || 'IT Admin'}{event.ipAddress ? ` · IP ${event.ipAddress}` : ''}{Array.isArray(event.newValues.permissions) ? ` · ${event.newValues.permissions.length} permissions` : ''}</p></div><time className="text-[0.6rem] font-semibold text-slate-400">{new Date(event.createdAt).toLocaleString('en-PH')}</time></article>)}</div>
        </section>
        <p className="mt-4 text-[0.65rem] leading-relaxed text-slate-500">Keep borrower permissions limited to requester actions. GSO access should cover operational modules only. Every permission change is applied to API authorization immediately.</p>
      </div>
    </section>
  </main>
}
