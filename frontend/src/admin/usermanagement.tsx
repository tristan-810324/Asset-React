import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { clearAuthSession } from '../auth/authApi'
import AdminNavbar, { AdminPageHeader } from '../components/navbars/adminnavbar'
import {
  createSystemUser,
  listSystemUsers,
  listUserPositions,
  type SystemUserAccount,
  type UserAccountRole,
} from './userManagementApi'

type IconName = 'clock' | 'menu' | 'plus' | 'search' | 'shield' | 'users'

const iconPaths: Record<IconName, ReactNode> = {
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: <path d="M12 5v14m-7-7h14" />,
  search: <><circle cx="10.75" cy="10.75" r="5.75" /><path d="m15.1 15.1 4.15 4.15" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
}

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(value))
}

function roleLabel(role: string) {
  if (role === 'IT_ADMIN') return 'IT Admin'
  if (role === 'IT_STAFF') return 'IT Staff'
  if (role === 'GSO_STAFF') return 'GSO Staff'
  if (role === 'BORROWER') return 'Requester'
  return role.replaceAll('_', ' ')
}

export default function UserManagement() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [accounts, setAccounts] = useState<SystemUserAccount[]>([])
  const [positions, setPositions] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const loadAccounts = useCallback(async () => {
    try {
      const [nextAccounts, nextPositions] = await Promise.all([listSystemUsers(), listUserPositions()])
      setAccounts(nextAccounts)
      setPositions(nextPositions)
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load system users.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const activeCount = accounts.filter((account) => account.isActive).length
  const verifiedCount = accounts.filter((account) => Boolean(account.emailVerifiedAt)).length
  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return accounts
    return accounts.filter((account) => (
      `${account.name} ${account.email} ${account.position} ${account.roles.join(' ')}`.toLowerCase().includes(query)
    ))
  }, [accounts, search])

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    setIsCreating(true)

    const form = event.currentTarget
    const formData = new FormData(form)
    const name = String(formData.get('name') || '').trim()
    const email = String(formData.get('email') || '').trim()
    const roleKey = String(formData.get('roleKey') || 'GSO_STAFF') as UserAccountRole
    const position = String(formData.get('position') || '').trim()

    try {
      await createSystemUser({ name, email, roleKey, position })
      setSuccessMessage(`Created ${roleLabel(roleKey)} account for ${email}. Initial password: Admin123. Email verification is required on first sign-in.`)
      form.reset()
      await loadAccounts()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create the account. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleSignOut = () => {
    clearAuthSession()
    window.location.replace('/login')
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
      <AdminNavbar activePath="/admin/users" mobileMenuOpen={mobileMenuOpen} onMobileMenuClose={() => setMobileMenuOpen(false)} />
      <section className="min-h-screen lg:pl-72">
        <AdminPageHeader pageName="User management" subtitle="All system accounts, roles, and positions" onOpenMenu={() => setMobileMenuOpen(true)} onSignOut={handleSignOut} />

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
          <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
            <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-sky-300" />IT Admin workspace</div>
                <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">System user management</h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">View every account in the system and create requester, IT staff, or GSO staff accounts with a listed employee position.</p>
              </div>
              <div className="inline-flex w-fit items-center gap-3 rounded-2xl border border-white/10 bg-white/8 px-4 py-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-blue-100"><Icon name="shield" /></span><span><span className="block text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-blue-200">Manage access</span><span className="mt-1 block text-sm font-black text-white">All system roles</span></span></div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="System user summary">
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><p className="text-xs font-bold text-slate-500">Total system users</p><p className="mt-2 text-3xl font-black tracking-tight">{isLoading ? '—' : accounts.length}</p><p className="mt-3 text-[0.68rem] font-bold text-slate-400">Includes IT Admin, IT staff, GSO staff, and requesters</p></article>
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><p className="text-xs font-bold text-slate-500">Active accounts</p><p className="mt-2 text-3xl font-black tracking-tight text-blue-700">{isLoading ? '—' : activeCount}</p><p className="mt-3 text-[0.68rem] font-bold text-slate-400">Accounts currently allowed to sign in</p></article>
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><p className="text-xs font-bold text-slate-500">Email verified</p><p className="mt-2 text-3xl font-black tracking-tight text-emerald-700">{isLoading ? '—' : verifiedCount}</p><p className="mt-3 text-[0.68rem] font-bold text-slate-400">Ready for normal sign-in</p></article>
          </section>
          {errorMessage && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{errorMessage}</p>}

          <section className="mt-6 grid items-start gap-6 xl:grid-cols-[0.82fr_1.45fr]">
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-black tracking-tight">Create user account</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">Create a requester, IT staff, or GSO staff login.</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon name="plus" className="h-4 w-4" /></span></div>
              <form className="mt-5 space-y-4" onSubmit={handleCreateAccount}>
                <div><label htmlFor="user-name" className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-700">Full name</label><input id="user-name" name="name" type="text" autoComplete="name" maxLength={200} placeholder="e.g. Juan Dela Cruz" required className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-500/15" /></div>
                <div><label htmlFor="user-email" className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-700">Email address</label><input id="user-email" name="email" type="email" autoComplete="email" maxLength={254} placeholder="name@dyci.edu.ph" required className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-500/15" /></div>
                <div><label htmlFor="user-role" className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-700">Account type</label><select id="user-role" name="roleKey" defaultValue="GSO_STAFF" required className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-500/15"><option value="GSO_STAFF">GSO Staff</option><option value="IT_STAFF">IT Staff</option><option value="BORROWER">Requester / Staff</option></select></div>
                <div><label htmlFor="user-position" className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-700">Position</label><select id="user-position" name="position" defaultValue="" required disabled={!positions.length} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"><option value="" disabled>{positions.length ? 'Select a position' : 'No positions available'}</option>{positions.map((position) => <option key={position} value={position}>{position}</option>)}</select><p className="mt-1.5 text-[0.65rem] leading-relaxed text-slate-500">Position options come from active employee records and existing user accounts.</p></div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3"><p className="text-[0.65rem] font-extrabold uppercase tracking-wide text-amber-800">Initial password</p><p className="mt-1 text-lg font-black tracking-wide text-amber-950">Admin123</p><p className="mt-1 text-[0.68rem] leading-relaxed text-amber-800">The user must verify their email during the first successful sign-in.</p></div>
                {successMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold leading-relaxed text-emerald-800">{successMessage}</p>}
                <button type="submit" disabled={isCreating || !positions.length} aria-busy={isCreating} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-xs font-black uppercase tracking-[0.12em] text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"><Icon name="plus" className="h-4 w-4" />{isCreating ? 'Creating account…' : 'Create account'}</button>
              </form>
            </article>

            <article className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-black tracking-tight">All system users</h2><p className="mt-1 text-xs font-medium text-slate-500">Accounts across every role, including seeded and admin-created users.</p></div><label className="relative block sm:w-64"><span className="sr-only">Search system users</span><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, role, position…" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-medium outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10" /></label></div>
              <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-220 w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Position</th><th className="px-4 py-3">Role(s)</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Email verification</th><th className="px-4 py-3">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? <tr><td colSpan={6} className="px-4 py-10 text-center font-semibold text-slate-500">Loading system users…</td></tr> : filteredAccounts.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center font-semibold text-slate-500">{accounts.length ? 'No matching users.' : errorMessage ? 'Unable to load users. See the error above.' : 'No system users found.'}</td></tr> : filteredAccounts.map((account) => (
                      <tr key={account.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3.5"><p className="font-extrabold text-slate-800">{account.name}</p><p className="mt-1 text-[0.68rem] text-slate-500">{account.email}</p></td>
                        <td className="px-4 py-3.5 text-slate-600">{account.position || '—'}</td>
                        <td className="px-4 py-3.5"><div className="flex flex-wrap gap-1">{account.roles.length ? account.roles.map((role) => <span key={role} className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">{roleLabel(role)}</span>) : <span className="text-slate-400">No role assigned</span>}</div></td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">{formatDate(account.createdAt)}</td>
                        <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${account.emailVerifiedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><span className={`h-1.5 w-1.5 rounded-full ${account.emailVerifiedAt ? 'bg-emerald-500' : 'bg-amber-500'}`} />{account.emailVerifiedAt ? 'Verified' : 'Pending'}</span></td>
                        <td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${account.isActive ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{account.isActive ? 'Active' : 'Inactive'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 flex items-center gap-2 text-[0.68rem] leading-relaxed text-slate-400"><Icon name="clock" className="h-3.5 w-3.5 shrink-0" />Email is verified once on the first successful sign-in. Existing verified accounts continue to sign in directly.</p>
            </article>
          </section>
        </div>
      </section>
    </main>
  )
}
