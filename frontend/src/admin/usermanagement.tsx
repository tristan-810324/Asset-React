import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AdminPageFrame } from '../components/navbars/adminnavbar'
import { AdminGlyph, AdminMetricCard } from './adminui'
import {
  createSystemUser,
  listSystemUsers,
  listUserPositions,
  type SystemUserAccount,
  type UserAccountRole,
} from './userManagementApi'

const boxClass = 'min-w-0 rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-6'
const labelClass = 'mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500'
const fieldClass = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(value))
}

// IT Staff accounts created before the Account type list dropped IT Staff still show their role here.
function roleLabel(role: string) {
  if (role === 'IT_ADMIN') return 'IT Admin'
  if (role === 'IT_STAFF') return 'IT Staff'
  if (role === 'GSO_STAFF') return 'GSO Staff'
  if (role === 'GSO_HEAD') return 'GSO Head'
  if (role === 'BORROWER') return 'EmployeeHead / Requester'
  return role.replaceAll('_', ' ')
}

export default function UserManagement() {
  const [reloadKey, setReloadKey] = useState(0)
  const [accounts, setAccounts] = useState<SystemUserAccount[]>([])
  const [positions, setPositions] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    let active = true

    const loadAccounts = async () => {
      try {
        const [nextAccounts, nextPositions] = await Promise.all([listSystemUsers(), listUserPositions()])
        if (!active) return
        setAccounts(nextAccounts)
        setPositions(nextPositions)
        setErrorMessage('')
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Unable to load system users.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadAccounts()
    return () => { active = false }
  }, [reloadKey])

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
      setReloadKey((key) => key + 1)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create the account. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <AdminPageFrame activePath="/admin/users" pageName="User management" subtitle="All system accounts, roles, and positions">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> IT Admin workspace
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">User management</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">View every account and create requester, GSO Staff, or GSO Head accounts with a listed employee position.</p>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4" aria-label="System user summary">
        <AdminMetricCard label="Total users" value={isLoading ? undefined : accounts.length} detail="All roles" icon="users" />
        <AdminMetricCard label="Active accounts" value={isLoading ? undefined : activeCount} detail="Allowed to sign in" icon="check" badgeTone="bg-blue-50 text-blue-800" valueTone="text-blue-700" />
        <AdminMetricCard label="Email verified" value={isLoading ? undefined : verifiedCount} detail="Ready for sign-in" icon="check" badgeTone="bg-emerald-50 text-emerald-700" valueTone="text-emerald-700" />
      </section>

      {errorMessage && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{errorMessage}</p>}

      <section className="mt-6 grid items-start gap-6 xl:grid-cols-[0.82fr_1.45fr]">
        <article className={boxClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">New account</p>
              <h2 className="mt-1 text-base font-black tracking-tight text-slate-900">Create user account</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Create a requester, GSO Staff, or GSO Head login.</p>
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700"><AdminGlyph name="plus" /></span>
          </div>
          <form className="mt-5 space-y-4" onSubmit={handleCreateAccount}>
            <div>
              <label htmlFor="user-name" className={labelClass}>Full name</label>
              <input id="user-name" name="name" type="text" autoComplete="name" maxLength={200} placeholder="e.g. Juan Dela Cruz" required className={fieldClass} />
            </div>
            <div>
              <label htmlFor="user-email" className={labelClass}>Email address</label>
              <input id="user-email" name="email" type="email" autoComplete="email" maxLength={254} placeholder="name@dyci.edu.ph" required className={fieldClass} />
            </div>
            <div>
              <label htmlFor="user-role" className={labelClass}>Account type</label>
              <select id="user-role" name="roleKey" defaultValue="GSO_STAFF" required className={fieldClass}>
                <option value="GSO_STAFF">GSO Staff</option>
                <option value="GSO_HEAD">GSO Head</option>
                <option value="BORROWER">EmployeeHead / Requester</option>
              </select>
            </div>
            <div>
              <label htmlFor="user-position" className={labelClass}>Position</label>
              <select id="user-position" name="position" defaultValue="" required disabled={!positions.length} className={fieldClass}>
                <option value="" disabled>{positions.length ? 'Select a position' : 'No positions available'}</option>
                {positions.map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
              <p className="mt-1.5 text-[0.65rem] leading-relaxed text-slate-500">Position options come from active employee records and existing user accounts.</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-amber-800">Initial password</p>
              <p className="mt-1 text-lg font-black tracking-wide text-amber-950">Admin123</p>
              <p className="mt-1 text-[0.68rem] leading-relaxed text-amber-800">The user must verify their email during the first successful sign-in.</p>
            </div>
            {successMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold leading-relaxed text-emerald-800">{successMessage}</p>}
            <button type="submit" disabled={isCreating || !positions.length} aria-busy={isCreating} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              <AdminGlyph name="plus" />
              {isCreating ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </article>

        <article className={boxClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">Directory</p>
              <h2 className="mt-1 text-base font-black tracking-tight text-slate-900">All system users</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">Accounts across every role, including seeded and admin-created users.</p>
            </div>
            <label className="relative block sm:w-64">
              <span className="sr-only">Search system users</span>
              <AdminGlyph name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, role, position…" className={`${fieldClass} pl-9 pr-3`} />
            </label>
          </div>
          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-220 w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50/80 text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Position</th>
                  <th className="px-4 py-3">Role(s)</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Email verification</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center font-semibold text-slate-500">Loading system users…</td></tr>
                ) : filteredAccounts.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center font-semibold text-slate-500">{accounts.length ? 'No matching users.' : errorMessage ? 'Unable to load users. See the error above.' : 'No system users found.'}</td></tr>
                ) : filteredAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3.5">
                      <p className="font-extrabold text-slate-800">{account.name}</p>
                      <p className="mt-1 text-[0.68rem] text-slate-500">{account.email}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{account.position || '—'}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {account.roles.length
                          ? account.roles.map((role) => <span key={role} className="inline-flex rounded-lg bg-blue-50 px-2 py-0.5 text-[0.62rem] font-extrabold text-blue-700">{roleLabel(role)}</span>)
                          : <span className="text-slate-400">No role assigned</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">{formatDate(account.createdAt)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[0.62rem] font-extrabold ${account.emailVerifiedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${account.emailVerifiedAt ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {account.emailVerifiedAt ? 'Verified' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex rounded-lg px-2 py-0.5 text-[0.62rem] font-extrabold ${account.isActive ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{account.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 flex items-center gap-2 text-[0.68rem] leading-relaxed text-slate-400">
            <AdminGlyph name="clock" className="h-3.5 w-3.5 shrink-0" />
            Email is verified once on the first successful sign-in. Existing verified accounts continue to sign in directly.
          </p>
        </article>
      </section>
    </AdminPageFrame>
  )
}
