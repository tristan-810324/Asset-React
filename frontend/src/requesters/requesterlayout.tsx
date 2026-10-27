import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { clearAuthSession, getCurrentUser, type AuthUser } from '../auth/authApi'
import { RequesterPageHeader, RequesterSidebar, type RequesterPage } from '../components/navbars/requesternavbar'
import { RequesterIdentityContext, type RequesterIdentityContextValue } from './requesteridentitycontext'
import { getMyRequesterIdentity, listRequesterDepartments, submitRequesterIdentity, type RequesterIdentity, type RequesterIdentityInput } from './requesterApi'

const identityInputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100'
const maxIdentityPictureSize = 1024 * 1024
const identityPictureTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function readIdentityPicture(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Hindi mabasa ang napiling picture.'))
    reader.onerror = () => reject(new Error('Hindi mabasa ang napiling picture.'))
    reader.readAsDataURL(file)
  })
}

export function RequesterIdentityForm({ profile, onSaved, onCancel, accountName = '', accountEmail = '' }: {
  profile: RequesterIdentity | null
  onSaved: (identity: RequesterIdentity) => void
  onCancel?: () => void
  accountName?: string
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
      pictureData: profile?.pictureData || null,
    }
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [departments, setDepartments] = useState<string[]>([])
  const [departmentLoadError, setDepartmentLoadError] = useState('')
  const [pictureName, setPictureName] = useState(profile?.pictureData ? 'Existing profile picture' : '')
  const pictureInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    void listRequesterDepartments()
      .then(({ departments: records }) => {
        if (active) setDepartments(records.map((department) => department.name))
      })
      .catch(() => {
        if (active) setDepartmentLoadError('Hindi ma-load ang department list. Ilagay ang department/office ayon sa opisyal na pangalan nito.')
      })
    return () => { active = false }
  }, [])

  const setField = (key: Exclude<keyof RequesterIdentityInput, 'pictureData'>, value: string) => setForm((current) => ({ ...current, [key]: value }))

  async function handlePictureChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    if (!identityPictureTypes.includes(file.type)) {
      setError('Pumili ng JPG, PNG, WebP, o GIF na picture.')
      input.value = ''
      return
    }
    if (file.size > maxIdentityPictureSize) {
      setError('Hindi dapat lumampas sa 1 MB ang picture.')
      input.value = ''
      return
    }
    try {
      const pictureData = await readIdentityPicture(file)
      setForm((current) => ({ ...current, pictureData }))
      setPictureName(file.name)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hindi mabasa ang napiling picture.')
      input.value = ''
    }
  }

  function removePicture() {
    setForm((current) => ({ ...current, pictureData: null }))
    setPictureName('')
    if (pictureInput.current) pictureInput.current.value = ''
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      const identity = await submitRequesterIdentity(form)
      onSaved(identity)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hindi naipadala ang impormasyon. Subukan ulit.')
    } finally {
      setSaving(false)
    }
  }

  return <form onSubmit={handleSubmit} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-slate-600">First name</span><input className={identityInputClass} autoComplete="given-name" value={form.firstName} onChange={(event) => setField('firstName', event.target.value)} placeholder="Enter first name" required maxLength={100} /></label>
      <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-slate-600">Surname</span><input className={identityInputClass} autoComplete="family-name" value={form.lastName} onChange={(event) => setField('lastName', event.target.value)} placeholder="Enter surname" required maxLength={100} /></label>
      <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-slate-600">Middle name <span className="font-medium text-slate-400">(optional)</span></span><input className={identityInputClass} autoComplete="additional-name" value={form.middleName} onChange={(event) => setField('middleName', event.target.value)} placeholder="Enter middle name" maxLength={100} /></label>
      <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-slate-600">Suffix <span className="font-medium text-slate-400">(optional)</span></span><input className={identityInputClass} value={form.suffix} onChange={(event) => setField('suffix', event.target.value)} placeholder="e.g. Jr., III" maxLength={40} /></label>
      <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-slate-600">Employee code</span><input className={identityInputClass} autoComplete="off" value={form.employeeCode} onChange={(event) => setField('employeeCode', event.target.value)} placeholder="e.g. 2024-00123" required maxLength={40} /></label>
      <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-slate-600">Department / office</span>{departments.length > 0 ? <select className={identityInputClass} value={form.department} onChange={(event) => setField('department', event.target.value)} required><option value="" disabled>Select department / office</option>{form.department && !departments.includes(form.department) && <option value={form.department}>{form.department} (current)</option>}{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select> : <input className={identityInputClass} value={form.department} onChange={(event) => setField('department', event.target.value)} placeholder="e.g. Information Technology" required maxLength={120} />}{departmentLoadError && <span className="mt-1 block text-[0.68rem] text-amber-700">{departmentLoadError}</span>}</label>
      <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-slate-600">Position</span><input className={identityInputClass} value={form.position} onChange={(event) => setField('position', event.target.value)} placeholder="e.g. Administrative Assistant" required maxLength={120} /></label>
      <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-slate-600">Contact number</span><input className={identityInputClass} type="tel" autoComplete="tel" value={form.contactNumber} onChange={(event) => setField('contactNumber', event.target.value)} placeholder="e.g. 09XX XXX XXXX" required maxLength={30} /></label>
      <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-extrabold text-slate-600">Account email</span><input className={`${identityInputClass} cursor-not-allowed bg-slate-50 text-slate-500`} type="email" value={profile?.accountEmail || accountEmail} readOnly aria-readonly="true" /><span className="mt-1 block text-[0.68rem] text-slate-400">Gagamitin ang email na ito bilang login at employee email.</span></label>
      <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-extrabold text-slate-600">Registered account name</span><input className={`${identityInputClass} cursor-not-allowed bg-slate-50 text-slate-500`} value={profile?.accountName || accountName} readOnly aria-readonly="true" /><span className="mt-1 block text-[0.68rem] text-slate-400">Ilagay sa mga name field sa itaas ang pangalan ayon sa iyong official record.</span></label>
      <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-extrabold text-slate-600">Picture <span className="font-medium text-slate-400">(optional)</span></span><input ref={pictureInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void handlePictureChange(event)} className="block h-11 w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-600 file:mr-3 file:h-full file:border-0 file:bg-slate-50 file:px-3 file:font-bold" /><span className="mt-1 block text-[0.68rem] text-slate-400">JPG, PNG, WebP, or GIF up to 1 MB{pictureName ? ` · ${pictureName}` : ''}</span></label>
      {form.pictureData && <div className="flex items-center gap-3 sm:col-span-2"><img src={form.pictureData} alt="Requester profile preview" className="h-16 w-16 rounded-xl border border-slate-200 object-cover" /><button type="button" onClick={removePicture} className="text-xs font-bold text-rose-600 hover:text-rose-700">Remove picture</button></div>}
    </div>
    <div className="rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3 text-xs leading-relaxed text-blue-900"><p>Rerepasuhin ng GSO ang pangalan at staff details mo. Kapag naaprubahan at wala pa sa Employee Master Data ang employee code mo, idaragdag doon ang profile na ito.</p><p className="mt-1.5 font-semibold">Kapag naaprubahan, magiging Active ang employee record. GSO lang ang puwedeng magbago ng status nito sa Employee Master Data.</p></div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2 pt-1">
      {onCancel && <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>}
      <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{saving ? 'Sending for review…' : 'Submit for GSO verification'}</button>
    </div>
  </form>
}

function pageFromPath(path: string): RequesterPage {
  const requesterPath = path.replace(/^\/borrower(?=\/|$)/, '/requester')
  if (requesterPath === '/requester/request-center' || requesterPath === '/requester/requests/new') return 'Request Center'
  if (requesterPath === '/requester/my-requests' || requesterPath.startsWith('/requester/requests/')) return 'My Requests'
  if (requesterPath === '/requester/notifications') return 'Updates'
  if (requesterPath === '/requester/profile') return 'Profile'
  return 'Home'
}

function IdentityPrompt({ identity, onSaved, onClose }: { identity: RequesterIdentity; onSaved: (next: RequesterIdentity) => void; onClose: () => void }) {
  const canEdit = identity.status === 'Incomplete' || identity.status === 'Needs Correction'
  return <div className="fixed inset-0 z-100 grid place-items-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="requester-identity-title" className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl shadow-slate-950/30">
      <div className="relative shrink-0 overflow-hidden bg-[#09244a] px-6 py-6 text-white sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%)]" />
        <button type="button" onClick={onClose} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-white/20 bg-white/10 text-lg text-white transition hover:bg-white/20" aria-label="Close identity verification">×</button>
        <p className="relative text-[0.65rem] font-extrabold uppercase tracking-[0.16em] text-blue-200">Requester identity</p>
        <h2 id="requester-identity-title" className="relative mt-2 pr-10 text-2xl font-black tracking-tight">{canEdit ? 'Complete your staff details' : 'GSO verification in progress'}</h2>
        <p className="relative mt-2 max-w-xl text-sm leading-relaxed text-blue-100">{canEdit ? 'Punan ang staff information. Maaari mong isara muna ito at bumalik bago magpadala ng request.' : 'Natanggap na ng GSO ang iyong details. Makakagawa ka ng request kapag na-verify na ang account mo.'}</p>
      </div>
      <div className="min-h-0 space-y-4 overflow-y-auto p-5 sm:p-8">
        {identity.status === 'Pending' && <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-extrabold text-amber-900">Pending GSO review</p><p className="mt-1 text-sm leading-relaxed text-amber-800">Naka-lock muna ang pagpapadala ng request habang sinusuri ng GSO ang employee number mo at ang detalye sa Employee Master Data.</p>{identity.reviewNote && <p className="mt-3 rounded-xl bg-white/80 p-3 text-sm font-semibold text-slate-700">GSO note: {identity.reviewNote}</p>}</div>}
        {identity.status === 'Needs Correction' && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><p className="text-sm font-extrabold text-rose-900">May kailangang itama</p><p className="mt-1 text-sm leading-relaxed text-rose-800">{identity.reviewNote || 'Pakitingnan at itama ang staff details sa ibaba bago muling isumite.'}</p></div>}
        {canEdit && <RequesterIdentityForm profile={identity} onSaved={onSaved} />}
        {!canEdit && <div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-blue-700">Close for now</button></div>}
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
      .catch((reason: unknown) => { if (active) setIdentityError(reason instanceof Error ? reason.message : 'Hindi ma-load ang requester identity.') })
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
      setIdentityError(reason instanceof Error ? reason.message : 'Hindi ma-refresh ang requester identity.')
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
