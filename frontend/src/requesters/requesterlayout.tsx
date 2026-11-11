import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { clearAuthSession, getCurrentUser, type AuthUser } from '../auth/authApi'
import { RequesterPageHeader, RequesterSidebar, type RequesterPage } from '../components/navbars/requesternavbar'
import { RequesterIdentityContext, type RequesterIdentityContextValue } from './requesteridentitycontext'
import { getMyRequesterIdentity, listRequesterDepartments, listRequesterPositions, submitRequesterIdentity, type RequesterIdentity, type RequesterIdentityInput } from './requesterApi'

const identityInputClass = 'h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-medium text-slate-900 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100'
const OTHER_MASTER_VALUE = '__requester_master_data_other__'

const findMasterValue = (values: string[], value: string) => values.find((item) => item.trim().toLowerCase() === value.trim().toLowerCase())

export function RequesterIdentityForm({ profile, onSaved, onCancel, accountEmail = '' }: {
  profile: RequesterIdentity | null
  onSaved: (identity: RequesterIdentity) => void
  onCancel?: () => void
  accountEmail?: string
}) {
  const [form, setForm] = useState<RequesterIdentityInput>(() => {
    return {
      employeeCode: profile?.employeeCode || '',
      firstName: profile?.firstName || '',
      middleName: profile?.middleName || '',
      lastName: profile?.lastName || '',
      suffix: profile?.suffix || '',
      department: profile?.department || '',
      position: profile?.position || '',
      contactNumber: profile?.contactNumber || '',
    }
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [departments, setDepartments] = useState<string[]>([])
  const [positions, setPositions] = useState<string[]>([])
  const [departmentOtherSelected, setDepartmentOtherSelected] = useState(false)
  const [positionOtherSelected, setPositionOtherSelected] = useState(false)
  const [departmentLoadError, setDepartmentLoadError] = useState('')
  const [positionLoadError, setPositionLoadError] = useState('')

  useEffect(() => {
    let active = true
    void listRequesterDepartments()
      .then(({ departments: records }) => {
        if (active) setDepartments(records.map((department) => department.name))
      })
      .catch(() => {
        if (active) setDepartmentLoadError('Could not load saved departments. You can suggest the official name for GSO to review.')
      })
    void listRequesterPositions()
      .then((records) => {
        if (active) setPositions(records.map((position) => position.name))
      })
      .catch(() => {
        if (active) setPositionLoadError('Could not load saved positions. You can suggest the official title for GSO to review.')
      })
    return () => { active = false }
  }, [])

  const setField = (key: keyof RequesterIdentityInput, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const savedDepartment = findMasterValue(departments, form.department)
  const savedPosition = findMasterValue(positions, form.position)
  const departmentChoice = savedDepartment || (departmentOtherSelected || form.department ? OTHER_MASTER_VALUE : '')
  const positionChoice = savedPosition || (positionOtherSelected || form.position ? OTHER_MASTER_VALUE : '')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      const identity = await submitRequesterIdentity(form)
      onSaved(identity)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to submit your information. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
      <label className="block"><span className="mb-2 block text-sm font-extrabold text-slate-900">First name</span><input className={identityInputClass} autoComplete="given-name" value={form.firstName} onChange={(event) => setField('firstName', event.target.value)} placeholder="Enter first name" required maxLength={100} /></label>
      <label className="block"><span className="mb-2 block text-sm font-extrabold text-slate-900">Surname</span><input className={identityInputClass} autoComplete="family-name" value={form.lastName} onChange={(event) => setField('lastName', event.target.value)} placeholder="Enter surname" required maxLength={100} /></label>
      <label className="block"><span className="mb-2 block text-sm font-extrabold text-slate-900">Middle name <span className="font-medium text-slate-500">(optional)</span></span><input className={identityInputClass} autoComplete="additional-name" value={form.middleName} onChange={(event) => setField('middleName', event.target.value)} placeholder="Enter middle name" maxLength={100} /></label>
      <label className="block"><span className="mb-2 block text-sm font-extrabold text-slate-900">Suffix <span className="font-medium text-slate-500">(optional)</span></span><input className={identityInputClass} value={form.suffix} onChange={(event) => setField('suffix', event.target.value)} placeholder="e.g. Jr., III" maxLength={40} /></label>
      <label className="block"><span className="mb-2 block text-sm font-extrabold text-slate-900">Employee code</span><input className={identityInputClass} autoComplete="off" value={form.employeeCode} onChange={(event) => setField('employeeCode', event.target.value)} placeholder="e.g. 2024-00123" required maxLength={40} /></label>
      <label className="block"><span className="mb-2 block text-sm font-extrabold text-slate-900">Department / office</span><select className={identityInputClass} value={departmentChoice} onChange={(event) => { const value = event.target.value; setDepartmentOtherSelected(value === OTHER_MASTER_VALUE); setField('department', value === OTHER_MASTER_VALUE ? (savedDepartment ? '' : form.department) : value) }} required><option value="" disabled>Select department / office</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}<option value={OTHER_MASTER_VALUE}>Wala sa listahan — suggest a department / office</option></select>{departmentChoice === OTHER_MASTER_VALUE && <input className={`${identityInputClass} mt-2`} value={form.department} onChange={(event) => setField('department', event.target.value)} placeholder="Enter the official department / office name" required maxLength={120} />}{departmentLoadError && <span className="mt-1 block text-xs text-amber-700">{departmentLoadError}</span>}{departmentChoice === OTHER_MASTER_VALUE && !departmentLoadError && <span className="mt-1 block text-xs text-slate-500">GSO will review this suggestion before adding it to the list.</span>}</label>
      <label className="block"><span className="mb-2 block text-sm font-extrabold text-slate-900">Position</span><select className={identityInputClass} value={positionChoice} onChange={(event) => { const value = event.target.value; setPositionOtherSelected(value === OTHER_MASTER_VALUE); setField('position', value === OTHER_MASTER_VALUE ? (savedPosition ? '' : form.position) : value) }} required><option value="" disabled>Select position</option>{positions.map((position) => <option key={position} value={position}>{position}</option>)}<option value={OTHER_MASTER_VALUE}>Wala sa listahan — suggest a position</option></select>{positionChoice === OTHER_MASTER_VALUE && <input className={`${identityInputClass} mt-2`} value={form.position} onChange={(event) => setField('position', event.target.value)} placeholder="Enter your official position / title" required maxLength={120} />}{positionLoadError && <span className="mt-1 block text-xs text-amber-700">{positionLoadError}</span>}{positionChoice === OTHER_MASTER_VALUE && !positionLoadError && <span className="mt-1 block text-xs text-slate-500">GSO will review this suggestion before adding it to the list.</span>}</label>
      <label className="block"><span className="mb-2 block text-sm font-extrabold text-slate-900">Contact number</span><input className={identityInputClass} type="tel" autoComplete="tel" value={form.contactNumber} onChange={(event) => setField('contactNumber', event.target.value)} placeholder="e.g. 09XX XXX XXXX" required maxLength={30} /></label>
      <label className="block sm:col-span-2"><span className="mb-2 block text-sm font-extrabold text-slate-900">Account email</span><input className={`${identityInputClass} cursor-not-allowed bg-slate-100 text-slate-700`} type="email" value={profile?.accountEmail || accountEmail} readOnly aria-readonly="true" /><span className="mt-1.5 block text-xs text-slate-500">This email is used for login and employee records.</span></label>
    </div>
    <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3.5 text-sm leading-relaxed text-blue-900"><p>GSO will verify these details against Employee Master Data.</p><p className="mt-1.5 font-semibold">A suggested department or position is added to the shared list only after GSO approves it. GSO can also match it to an existing option.</p><p className="mt-1.5 font-semibold">If your employee code is new, GSO can add it after verification.</p></div>
    {error && <p role="alert" className="rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2 pt-1">
      {onCancel && <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>}
      <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-extrabold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{saving ? 'Submitting...' : 'Submit for GSO verification'}</button>
    </div>
  </form>
}

function pageFromPath(path: string): RequesterPage {
  const requesterPath = path.replace(/^\/borrower(?=\/|$)/, '/requester')
  if (requesterPath === '/requester/request-center' || requesterPath === '/requester/requests/new') return 'Request Center'
  if (requesterPath === '/requester/my-requests' || requesterPath.startsWith('/requester/requests/')) return 'My Requests'
  if (requesterPath === '/requester/issued-items') return 'My Issued Items'
  if (requesterPath === '/requester/notifications') return 'Notifications'
  if (requesterPath === '/requester/return-items') return 'Return Items'
  if (requesterPath === '/requester/profile') return 'Profile'
  return 'Home'
}

function IdentityPrompt({ identity, onSaved, onClose }: { identity: RequesterIdentity; onSaved: (next: RequesterIdentity) => void; onClose: () => void }) {
  const canEdit = identity.status === 'Incomplete' || identity.status === 'Needs Correction'
  return <div className="fixed inset-0 z-100 grid place-items-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation">
        <section role="dialog" aria-modal="true" aria-labelledby="requester-identity-title" className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-2xl shadow-slate-950/30">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-7 sm:py-5">
        <div className="min-w-0"><p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-700">Requester identity</p><h2 id="requester-identity-title" className="mt-1 text-lg font-black tracking-tight text-slate-900 sm:text-xl">{canEdit ? 'Complete your staff details' : 'GSO verification in progress'}</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">{canEdit ? 'Enter your official staff details before submitting requests.' : 'Your details are with GSO for verification.'}</p></div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50" aria-label="Close identity verification">Close</button>
      </header>
      <div className="min-h-0 space-y-3 overflow-y-auto bg-slate-50/70 p-4 sm:p-6">
        {identity.status === 'Pending' && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-extrabold text-amber-900">GSO review pending</p><p className="mt-1 text-xs leading-relaxed text-amber-800">Requests remain locked while GSO checks your employee code and Employee Master Data details.</p>{identity.reviewNote && <p className="mt-2 rounded-lg bg-white/80 p-2.5 text-xs font-semibold text-slate-700">GSO note: {identity.reviewNote}</p>}</div>}
        {identity.status === 'Needs Correction' && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3"><p className="text-xs font-extrabold text-rose-900">Correction needed</p><p className="mt-1 text-xs leading-relaxed text-rose-800">{identity.reviewNote || 'Review and correct the staff details below before resubmitting.'}</p></div>}
        {canEdit && <section className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-md sm:p-6"><RequesterIdentityForm profile={identity} onSaved={onSaved} /></section>}
        {!canEdit && <div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-blue-700">Close for now</button></div>}
      </div>
    </section>
  </div>
}

export default function RequesterLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [identity, setIdentity] = useState<RequesterIdentity | null>(null)
  const [identityLoading, setIdentityLoading] = useState(true)
  const [identityError, setIdentityError] = useState('')
  const [identityPromptMode, setIdentityPromptMode] = useState<'open' | 'closed' | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const currentPage = pageFromPath(window.location.pathname)
  const today = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())

  useEffect(() => {
    let active = true
    const userRequest = getCurrentUser()
      .then((current) => { if (active) setUser(current) })
      .catch(() => { if (active) setUser(null) })
    const identityRequest = getMyRequesterIdentity()
      .then((requesterIdentity) => { if (active) { setIdentity(requesterIdentity); setIdentityError('') } })
      .catch((reason: unknown) => { if (active) setIdentityError(reason instanceof Error ? reason.message : 'Unable to load requester identity.') })
    Promise.all([userRequest, identityRequest]).finally(() => { if (active) setIdentityLoading(false) })
    return () => { active = false }
  }, [])

  const refreshIdentity = async () => {
    setIdentityLoading(true)
    try {
      const next = await getMyRequesterIdentity()
      setIdentity(next)
      setIdentityError('')
      return next
    } catch (reason) {
      setIdentityError(reason instanceof Error ? reason.message : 'Unable to refresh requester identity.')
      return null
    } finally {
      setIdentityLoading(false)
    }
  }

  const openIdentityPrompt = () => {
    setIdentityPromptMode('open')
    void refreshIdentity()
  }
  const dismissIdentityPrompt = () => {
    if (user) sessionStorage.setItem(`requesterIdentityPromptDismissed:${user.id}`, 'true')
    setIdentityPromptMode('closed')
  }

  const signOut = () => {
    clearAuthSession()
    window.location.replace('/login')
  }

  const contextValue: RequesterIdentityContextValue = { user, identity, identityLoading, identityError, refreshIdentity, openIdentityPrompt, dismissIdentityPrompt }
  const autoPromptOpen = Boolean(user && !identityLoading && identity?.status !== 'Verified' && sessionStorage.getItem(`requesterIdentityPromptDismissed:${user.id}`) !== 'true')
  const identityPromptOpen = identityPromptMode === 'open' || (identityPromptMode === null && autoPromptOpen)
  const promptIdentity: RequesterIdentity | null = identity ?? (user ? {
    userId: user.id,
    accountName: user.name,
    accountEmail: user.email,
    employeeCode: '',
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    department: '',
    position: '',
    contactNumber: '',
    pictureData: null,
    status: 'Incomplete',
    reviewNote: '',
    submittedAt: null,
    reviewedAt: null,
    matchedEmployeeCode: null,
    matchedDepartment: null,
    matchedPosition: null,
    matchedEmail: null,
    matchedEmployeeStatus: null,
    employeeRecordMatch: false,
  } : null)

  return <RequesterIdentityContext.Provider value={contextValue}>
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
      <RequesterSidebar currentPage={currentPage} mobileMenuOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <section className="min-h-screen lg:pl-72">
        <RequesterPageHeader pageName={currentPage} today={today} user={user} onOpenMenu={() => setMobileMenuOpen(true)} onSignOut={signOut} />
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
          <div className="mb-5 hidden border-b border-slate-200/80 pb-4 sm:block">
            <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-700">{title}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
    {!identityLoading && identityError && !identity && <div role="alert" className="fixed bottom-4 right-4 z-40 max-w-md rounded-xl border border-rose-200 bg-white p-4 text-sm font-semibold text-rose-700 shadow-xl">{identityError}</div>}
    {identityPromptOpen && promptIdentity && <IdentityPrompt identity={promptIdentity} onSaved={(next) => setIdentity(next)} onClose={dismissIdentityPrompt} />}
  </RequesterIdentityContext.Provider>
}
