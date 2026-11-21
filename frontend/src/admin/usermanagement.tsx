import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AdminPageFrame } from '../components/navbars/adminnavbar'
import { AdminGlyph, AdminMetricCard } from './adminui'
import { listRequesterDepartments } from '../requesters/requesterApi'
import {
  createSystemUser,
  deleteSystemUser,
  listSystemUsers,
  listUserPositions,
  setSystemUserActive,
  type SystemUserAccount,
  type UserAccountRole,
} from './userManagementApi'

const fieldClass = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'
const editFieldLabelClass = 'mb-2 block text-sm font-extrabold text-slate-900'
const editControlClass = 'h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100'

const OTHER_DEPARTMENT = '__other_department__'
type AccountType = 'IT' | 'GSO' | 'REQUESTER'
type SubPosition = 'Head' | 'Staff' | 'Others'

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
  const [showAddModal, setShowAddModal] = useState(false)
  const [createError, setCreateError] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [departments, setDepartments] = useState<string[]>([])
  const [accountType, setAccountType] = useState<AccountType>('GSO')
  const [subPosition, setSubPosition] = useState<SubPosition>('Staff')
  const [departmentChoice, setDepartmentChoice] = useState('')

  useEffect(() => {
    let active = true
    // Saved departments only. A department typed in the form is saved when the account is created.
    void listRequesterDepartments()
      .then(({ departments: records }) => { if (active) setDepartments(records.map((department) => department.name)) })
      .catch(() => { if (active) setDepartments([]) })
    return () => { active = false }
  }, [])

  async function toggleActive(account: SystemUserAccount) {
    const nextActive = !account.isActive
    if (!window.confirm(`${nextActive ? 'I-activate' : 'I-deactivate'} ang account ni ${account.name}?`)) return
    setBusyUserId(account.id)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      await setSystemUserActive(account.id, nextActive)
      setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, isActive: nextActive } : item))
      setSuccessMessage(`${account.name} is now ${nextActive ? 'active' : 'inactive'}.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update the account.')
    } finally {
      setBusyUserId(null)
    }
  }

  async function removeAccount(account: SystemUserAccount) {
    if (!window.confirm(`Burahin nang tuluyan ang account ni ${account.name}? Hindi ito na-undo. Kung may requests o issuance ang account, i-deactivate na lang.`)) return
    setBusyUserId(account.id)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      await deleteSystemUser(account.id)
      setAccounts((current) => current.filter((item) => item.id !== account.id))
      setSuccessMessage(`${account.name} was deleted.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete the account.')
    } finally {
      setBusyUserId(null)
    }
  }

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

  // Escape closes the add-account dialog, except while an account is being saved.
  useEffect(() => {
    if (!showAddModal) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isCreating) setShowAddModal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAddModal, isCreating])

  const activeCount = accounts.filter((account) => account.isActive).length
  const verifiedCount = accounts.filter((account) => Boolean(account.emailVerifiedAt)).length
  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return accounts
    return accounts.filter((account) => (
      `${account.name} ${account.email} ${account.position} ${account.roles.join(' ')}`.toLowerCase().includes(query)
    ))
  }, [accounts, search])

  const resetFormChoices = () => {
    setAccountType('GSO')
    setSubPosition('Staff')
    setDepartmentChoice('')
  }

  const openAddModal = () => {
    setCreateError('')
    resetFormChoices()
    setShowAddModal(true)
  }

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError('')
    setErrorMessage('')
    setSuccessMessage('')
    setIsCreating(true)

    const form = event.currentTarget
    const formData = new FormData(form)
    const text = (key: string) => String(formData.get(key) || '').trim()
    const email = text('email')
    const roleKey: UserAccountRole = accountType === 'IT' ? 'IT_STAFF' : accountType === 'REQUESTER' ? 'BORROWER' : subPosition === 'Head' ? 'GSO_HEAD' : 'GSO_STAFF'
    const position = accountType === 'IT' ? 'IT Staff' : subPosition === 'Others' ? text('positionOther') : subPosition
    const department = departmentChoice === OTHER_DEPARTMENT ? text('departmentOther') : departmentChoice

    try {
      await createSystemUser({
        firstName: text('firstName'),
        middleName: text('middleName'),
        lastName: text('lastName'),
        suffix: text('suffix'),
        employeeCode: text('employeeCode'),
        department,
        position,
        contactNumber: text('contactNumber'),
        email,
        roleKey,
      })
      setSuccessMessage(`Created ${roleLabel(roleKey)} account for ${email}. It is approved right away. Initial password: Admin123. Email verification is required on first sign-in.`)
      form.reset()
      setShowAddModal(false)
      setReloadKey((key) => key + 1)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Unable to create the account. Please try again.')
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
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">View every account, add IT Staff, GSO Staff, GSO Head, or requester logins, and deactivate or delete accounts.</p>
        </div>
        <div className="relative mt-6 flex gap-2 border-t border-blue-400/20 pt-4">
          <button
            type="button"
            onClick={openAddModal}
            className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-blue-950 shadow-md transition hover:bg-blue-50"
          >
            + Add user account
          </button>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4" aria-label="System user summary">
        <AdminMetricCard label="Total users" value={isLoading ? undefined : accounts.length} detail="All roles" icon="users" />
        <AdminMetricCard label="Active accounts" value={isLoading ? undefined : activeCount} detail="Allowed to sign in" icon="check" badgeTone="bg-blue-50 text-blue-800" valueTone="text-blue-700" />
        <AdminMetricCard label="Email verified" value={isLoading ? undefined : verifiedCount} detail="Ready for sign-in" icon="check" badgeTone="bg-emerald-50 text-emerald-700" valueTone="text-emerald-700" />
      </section>

      {errorMessage && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{errorMessage}</p>}
      {successMessage && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold leading-relaxed text-emerald-800">{successMessage}</p>}

      <section className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
        <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">All system users</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Accounts across every role, including seeded and admin-created users.</p>
            <span className="mt-2 inline-flex rounded-lg bg-blue-50 px-3 py-2 text-[0.65rem] font-extrabold text-blue-700">
              {isLoading ? 'Loading…' : `${filteredAccounts.length} user(s) found`}
            </span>
          </div>
          <label className="relative block sm:w-72">
            <span className="sr-only">Search system users</span>
            <AdminGlyph name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, role, position…" className={`${fieldClass} pl-9 pr-3`} />
          </label>
        </div>
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="min-w-220 w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50/80 text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role(s)</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Email verification</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
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
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => void toggleActive(account)} disabled={busyUserId !== null} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[0.65rem] font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">{account.isActive ? 'Deactivate' : 'Activate'}</button>
                      <button type="button" onClick={() => void removeAccount(account)} disabled={busyUserId !== null} className="rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-[0.65rem] font-extrabold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50">{busyUserId === account.id ? 'Working…' : 'Delete'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-2 px-5 py-4 text-[0.68rem] leading-relaxed text-slate-400 sm:px-6">
          <AdminGlyph name="clock" className="h-3.5 w-3.5 shrink-0" />
          Email is verified once on the first successful sign-in. Existing verified accounts continue to sign in directly.
        </p>
      </section>

      {showAddModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5"
          onClick={() => { if (!isCreating) setShowAddModal(false) }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-user-modal-title"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[94vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-8 sm:py-5">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[#d6b333] bg-[#17377f] text-sm font-black text-white shadow-sm">
                  +
                </span>
                <div className="min-w-0">
                  <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">User management</p>
                  <h2 id="add-user-modal-title" className="mt-0.5 text-base font-black text-slate-900 sm:text-lg">Add a user account</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Fields marked * are required. The account is approved as soon as it is created.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                disabled={isCreating}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:opacity-50"
              >
                Close
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-5 sm:px-7 sm:py-6">
              <form id="create-user-form" className="mx-auto max-w-4xl space-y-4" onSubmit={handleCreateAccount} onReset={resetFormChoices}>
                {createError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold leading-relaxed text-rose-700">{createError}</p>}

                <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                  <div className="mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900">Staff details</h3>
                    <p className="mt-1 text-sm text-slate-600">Same details the requester form asks for. Details are checked against Employee Master Data.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className={editFieldLabelClass}>First name <span className="text-rose-600">*</span></span>
                      <input name="firstName" type="text" autoComplete="off" placeholder="Enter first name" required maxLength={100} className={editControlClass} />
                    </label>
                    <label className="block">
                      <span className={editFieldLabelClass}>Surname <span className="text-rose-600">*</span></span>
                      <input name="lastName" type="text" autoComplete="off" placeholder="Enter surname" required maxLength={100} className={editControlClass} />
                    </label>
                    <label className="block">
                      <span className={editFieldLabelClass}>Middle name <span className="font-medium text-slate-500">(optional)</span></span>
                      <input name="middleName" type="text" autoComplete="off" placeholder="Enter middle name" maxLength={100} className={editControlClass} />
                    </label>
                    <label className="block">
                      <span className={editFieldLabelClass}>Suffix <span className="font-medium text-slate-500">(optional)</span></span>
                      <input name="suffix" type="text" autoComplete="off" placeholder="e.g. Jr., III" maxLength={40} className={editControlClass} />
                    </label>
                    <label className="block">
                      <span className={editFieldLabelClass}>Employee code <span className="text-rose-600">*</span></span>
                      <input name="employeeCode" type="text" autoComplete="off" placeholder="e.g. 2024-00123" required maxLength={40} className={editControlClass} />
                    </label>
                    <div className="block">
                      <span className={editFieldLabelClass}>Department / office <span className="text-rose-600">*</span></span>
                      <select value={departmentChoice} onChange={(event) => setDepartmentChoice(event.target.value)} required className={editControlClass}>
                        <option value="" disabled>Select department / office</option>
                        {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                        <option value={OTHER_DEPARTMENT}>Not listed — type it</option>
                      </select>
                      {departmentChoice === OTHER_DEPARTMENT && (
                        <input name="departmentOther" type="text" placeholder="Enter the official department / office name" required maxLength={120} className={`${editControlClass} mt-2`} />
                      )}
                    </div>
                    <label className="block">
                      <span className={editFieldLabelClass}>Contact number <span className="text-rose-600">*</span></span>
                      <input name="contactNumber" type="tel" autoComplete="off" placeholder="e.g. 09XX XXX XXXX" required maxLength={30} className={editControlClass} />
                    </label>
                    <label className="block">
                      <span className={editFieldLabelClass}>Account email <span className="text-rose-600">*</span></span>
                      <input name="email" type="email" autoComplete="off" maxLength={254} placeholder="e.g. name@gmail.com" required className={editControlClass} />
                      <span className="mt-1.5 block text-xs text-slate-500">Used for login.</span>
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                  <div className="mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900">Access and position</h3>
                    <p className="mt-1 text-sm text-slate-600">Pick the account type. For GSO and Requester, pick Head, Staff, or Others. Others lets you type the position.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className={editFieldLabelClass}>Account type <span className="text-rose-600">*</span></span>
                      <select value={accountType} onChange={(event) => setAccountType(event.target.value as AccountType)} required className={editControlClass}>
                        <option value="GSO">GSO</option>
                        <option value="IT">IT</option>
                        <option value="REQUESTER">Requester</option>
                      </select>
                    </label>
                    {accountType === 'IT' ? (
                      <div className="block">
                        <span className={editFieldLabelClass}>Position</span>
                        <input value="IT Staff" readOnly aria-readonly="true" className={`${editControlClass} cursor-not-allowed bg-slate-100 text-slate-700`} />
                        <span className="mt-1.5 block text-xs text-slate-500">IT accounts are always IT Staff.</span>
                      </div>
                    ) : (
                      <label className="block">
                        <span className={editFieldLabelClass}>Position <span className="text-rose-600">*</span></span>
                        <select value={subPosition} onChange={(event) => setSubPosition(event.target.value as SubPosition)} required className={editControlClass}>
                          <option value="Head">Head</option>
                          <option value="Staff">Staff</option>
                          <option value="Others">Others (type it)</option>
                        </select>
                      </label>
                    )}
                    {accountType !== 'IT' && subPosition === 'Others' && (
                      <label className="block sm:col-span-2">
                        <span className={editFieldLabelClass}>Other position <span className="text-rose-600">*</span></span>
                        <input name="positionOther" list="user-position-options" autoComplete="off" required maxLength={120} placeholder="Type the position, e.g. Accounting Clerk" className={editControlClass} />
                        <datalist id="user-position-options">
                          {positions.map((position) => <option key={position} value={position} />)}
                        </datalist>
                      </label>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 sm:p-5 shadow-sm">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-amber-800">Initial password</p>
                  <p className="mt-1 text-lg font-black tracking-wide text-amber-950">Admin123</p>
                  <p className="mt-1 text-sm leading-relaxed text-amber-900">The user must verify their email during the first successful sign-in.</p>
                </section>
              </form>
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-between sm:px-7">
              <button
                type="reset"
                form="create-user-form"
                disabled={isCreating}
                className="rounded-xl border-2 border-slate-300 bg-white px-6 py-3.5 text-base font-extrabold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100 disabled:opacity-50"
              >
                Clear form
              </button>
              <button
                type="submit"
                form="create-user-form"
                disabled={isCreating}
                aria-busy={isCreating}
                className="rounded-xl bg-blue-600 px-6 py-3.5 text-base font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreating ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </section>
        </div>
      )}
    </AdminPageFrame>
  )
}
