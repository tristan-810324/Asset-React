import { useCallback, useEffect, useMemo, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { listRequesterIdentityReviews, reviewRequesterIdentity, type RequesterIdentity, type RequesterIdentityStatus } from '../requesters/requesterApi'

const statuses: Array<'all' | RequesterIdentityStatus> = ['all', 'Pending', 'Needs Correction', 'Verified']
const statusStyle: Record<RequesterIdentityStatus, string> = {
  Incomplete: 'border-slate-200 bg-slate-100 text-slate-700',
  Pending: 'border-amber-200 bg-amber-50 text-amber-800',
  Verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Needs Correction': 'border-rose-200 bg-rose-50 text-rose-800',
}

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'

export default function RequesterVerification() {
  const [profiles, setProfiles] = useState<RequesterIdentity[]>([])
  const [filter, setFilter] = useState<'all' | RequesterIdentityStatus>('Pending')
  const [search, setSearch] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadProfiles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setProfiles(await listRequesterIdentityReviews())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang requester identity queue.')
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadProfiles() }, [loadProfiles])

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase()
    return profiles.filter((profile) => {
      if (filter !== 'all' && profile.status !== filter) return false
      if (!query) return true
      return [profile.accountName, profile.accountEmail, profile.employeeCode, profile.department, profile.position]
        .some((value) => value.toLowerCase().includes(query))
    })
  }, [filter, profiles, search])

  const counts = useMemo(() => ({
    pending: profiles.filter((profile) => profile.status === 'Pending').length,
    corrections: profiles.filter((profile) => profile.status === 'Needs Correction').length,
    verified: profiles.filter((profile) => profile.status === 'Verified').length,
  }), [profiles])

  async function decide(profile: RequesterIdentity, status: 'Verified' | 'Needs Correction') {
    const note = notes[String(profile.userId)] || ''
    if (status === 'Needs Correction' && !note.trim()) {
      setError(`Maglagay muna ng note para kay ${profile.accountName} kung ano ang dapat itama.`)
      return
    }
    if (status === 'Verified' && !profile.employeeRecordMatch && !note.trim()) {
      setError(`Maglagay ng review note bago mano-manong i-verify si ${profile.accountName}, dahil hindi eksaktong tugma ang Employee Master Data.`)
      return
    }
    setBusyId(profile.userId)
    setError('')
    setNotice('')
    try {
      await reviewRequesterIdentity(profile.userId, { status, note })
      setNotice(`${profile.accountName} — ${status === 'Verified' ? 'verified' : 'sent back for correction'}.`)
      await loadProfiles()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hindi na-save ang GSO review.')
    } finally {
      setBusyId(null)
    }
  }

  return <GsoPageFrame activePage="Requester Verification" searchPlaceholder="Search requester identity">
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-7 text-white shadow-xl shadow-blue-950/15 sm:px-8 sm:py-9">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative max-w-3xl"><span className="inline-flex rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">GSO identity checks</span><h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Requester verification</h1><p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">Suriin ang employee number at staff details laban sa Employee Master Data. Ang account ay makakapag-submit lamang ng request kapag minarkahang Verified.</p></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Verification summary">
        {[{ title: 'Pending review', value: counts.pending, tone: 'text-amber-800 bg-amber-50 border-amber-100' }, { title: 'Needs correction', value: counts.corrections, tone: 'text-rose-800 bg-rose-50 border-rose-100' }, { title: 'Verified staff', value: counts.verified, tone: 'text-emerald-800 bg-emerald-50 border-emerald-100' }].map((item) => <article key={item.title} className={`rounded-2xl border p-4 ${item.tone}`}><p className="text-xs font-bold opacity-80">{item.title}</p><p className="mt-2 text-3xl font-black">{item.value}</p></article>)}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
          <div><h2 className="text-base font-black text-slate-900">Staff identity queue</h2><p className="mt-1 text-xs text-slate-500">{filteredProfiles.length} requester{filteredProfiles.length === 1 ? '' : 's'} shown</p></div>
          <div className="grid gap-3 sm:grid-cols-[minmax(14rem,1fr)_12rem]">
            <label className="block"><span className="sr-only">Search requester details</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, or employee no." className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
            <label className="block"><span className="sr-only">Filter by verification status</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">{statuses.map((status) => <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>)}</select></label>
          </div>
        </div>

        {error && <p role="alert" className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700 sm:mx-5">{error}</p>}
        {notice && <p role="status" className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 sm:mx-5">{notice}</p>}
        {loading && <p className="p-8 text-center text-sm font-semibold text-slate-500">Loading requester profiles…</p>}
        {!loading && !filteredProfiles.length && <div className="p-10 text-center"><p className="text-sm font-extrabold text-slate-700">Walang matching requester profiles.</p><p className="mt-1 text-xs text-slate-500">Try another filter or search term.</p></div>}
        {!loading && <div className="divide-y divide-slate-100">{filteredProfiles.map((profile) => {
          const key = String(profile.userId)
          const isBusy = busyId === profile.userId
          return <article key={key} className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-black text-slate-900">{profile.accountName}</h3><span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-extrabold ${statusStyle[profile.status]}`}>{profile.status}</span></div>
                <p className="mt-1 break-all text-xs font-medium text-slate-500">{profile.accountEmail}</p>
                <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {[['Employee number', profile.employeeCode], ['Department / office', profile.department], ['Position', profile.position], ['Contact number', profile.contactNumber]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 px-3 py-2.5"><dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 wrap-break-word text-xs font-bold text-slate-800">{value}</dd></div>)}
                </dl>
                <div className={`mt-3 rounded-xl border p-3 ${profile.employeeRecordMatch ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <p className={`text-xs font-extrabold ${profile.employeeRecordMatch ? 'text-emerald-900' : 'text-amber-950'}`}>{profile.employeeRecordMatch ? 'Employee Master Data match found' : 'Employee Master Data needs manual review'}</p>
                  {profile.matchedEmployeeCode && <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-700">Record: {profile.matchedEmployeeCode} · {profile.matchedDepartment || 'No department'} · {profile.matchedPosition || 'No position'} · {profile.matchedEmail || 'No email'} · {profile.matchedEmployeeStatus || 'No status'}</p>}
                  {!profile.matchedEmployeeCode && <p className="mt-1 text-[0.68rem] leading-relaxed text-amber-900">Walang employee number na tumugma. Tingnan ang employee record bago mag-approve.</p>}
                </div>
                <p className="mt-2 text-[0.65rem] text-slate-400">Submitted {formatDate(profile.submittedAt)}{profile.reviewedAt ? ` · Last reviewed ${formatDate(profile.reviewedAt)}` : ''}</p>
                {profile.reviewNote && <p className="mt-2 text-xs font-semibold text-rose-700">Previous GSO note: {profile.reviewNote}</p>}
              </div>

              {profile.status !== 'Verified' && <div className="w-full xl:max-w-xs">
                <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-slate-600">Review note <span className="font-medium text-slate-400">(required for correction or manual verification)</span></span><textarea value={notes[key] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))} rows={3} maxLength={1000} placeholder="Tell the requester what to correct, or add the basis for a manual verification." className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => void decide(profile, 'Needs Correction')} disabled={isBusy} className="rounded-xl border border-rose-200 px-3 py-2.5 text-xs font-extrabold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50">Needs correction</button><button type="button" onClick={() => void decide(profile, 'Verified')} disabled={isBusy} className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-extrabold text-white transition hover:bg-emerald-700 disabled:opacity-50">{isBusy ? 'Saving…' : 'Verify requester'}</button></div>
              </div>}
            </div>
          </article>
        })}</div>}
      </section>
    </div>
  </GsoPageFrame>
}
