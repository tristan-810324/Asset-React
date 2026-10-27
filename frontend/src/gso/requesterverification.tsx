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

const profileFullName = (profile: RequesterIdentity) => [profile.firstName, profile.middleName, profile.lastName, profile.suffix].filter(Boolean).join(' ') || profile.accountName

export default function RequesterVerification() {
  const [profiles, setProfiles] = useState<RequesterIdentity[]>([])
  const [filter, setFilter] = useState<'all' | RequesterIdentityStatus>('Pending')
  const [search, setSearch] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retryDecision, setRetryDecision] = useState<{ profile: RequesterIdentity; status: 'Verified' | 'Needs Correction' } | null>(null)

  const loadProfiles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setProfiles(await listRequesterIdentityReviews())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load the requester identity queue.')
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
      return [profile.accountName, profileFullName(profile), profile.accountEmail, profile.employeeCode, profile.department, profile.position, profile.contactNumber]
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
      setError(`Add a review note for ${profile.accountName} describing what needs to be corrected.`)
      return
    }
    if (status === 'Verified' && profile.matchedEmployeeCode && !profile.employeeRecordMatch && !note.trim()) {
      setError(`Add a review note before manually verifying ${profile.accountName} because the Employee Master Data record does not match exactly.`)
      return
    }
    setBusyId(profile.userId)
    setRetryDecision(null)
    setError('')
    setNotice('')
    try {
      const reviewedIdentity = await reviewRequesterIdentity(profile.userId, { status, note })
      setProfiles((current) => current.map((item) => String(item.userId) === String(reviewedIdentity.userId) ? reviewedIdentity : item))
      setNotice(status === 'Verified'
        ? profile.matchedEmployeeCode
          ? `${profile.accountName} — verified against the existing Employee Master Data record.`
          : `${profile.accountName} — verified and added to Employee Master Data.`
        : `${profile.accountName} — sent back for correction.`)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to save the GSO review.'
      setError(message)
      if (message.includes('Unable to connect to the backend')) {
        setRetryDecision({ profile, status })
      }
    } finally {
      setBusyId(null)
    }
  }

  return <GsoPageFrame activePage="Requester Verification" searchPlaceholder="Search requester identity">
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">GSO identity checks</span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Requester Verification</h1>
          <p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">Review employee codes and staff details. Newly approved requesters without an existing Employee Master Data record are added automatically and can then submit service requests.</p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Verification summary">
        {[
          { title: 'Pending Review', value: counts.pending, badge: 'Awaiting review', caption: 'requester accounts', icon: 'clock', tone: 'border-amber-100 bg-amber-50 text-amber-700 shadow-amber-900/5', badgeTone: 'bg-amber-50 text-amber-700' },
          { title: 'Corrections Needed', value: counts.corrections, badge: 'Action required', caption: 'requester updates', icon: 'alert', tone: 'border-rose-100 bg-rose-50 text-rose-700 shadow-rose-900/5', badgeTone: 'bg-rose-50 text-rose-700' },
          { title: 'Verified Staff', value: counts.verified, badge: 'GSO approved', caption: 'requester accounts', icon: 'check', tone: 'border-emerald-100 bg-emerald-50 text-emerald-700 shadow-emerald-900/5', badgeTone: 'bg-emerald-50 text-emerald-700' },
        ].map((item) => (
          <article key={item.title} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-500">{item.title}</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{item.value}</p>
              </div>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border shadow-sm ${item.tone}`}>
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {item.icon === 'clock' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> : item.icon === 'alert' ? <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></> : <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>}
              </svg>
              </span>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className={`rounded-lg px-2 py-0.5 text-[0.65rem] font-extrabold ${item.badgeTone}`}>{item.badge}</span>
              <span className="text-[0.68rem] font-medium text-slate-400">{item.caption}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Staff Identity Queue</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Review submitted staff details and verify requester accounts.</p>
          </div>
          <span className="rounded-lg bg-blue-50 px-3 py-2 text-[0.65rem] font-extrabold text-blue-700">
            {loading ? 'Loading requester profiles...' : `${filteredProfiles.length} requester${filteredProfiles.length === 1 ? '' : 's'} shown`}
          </span>
        </div>
        <div className="grid gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:grid-cols-2 sm:px-6">
          <label className="block"><span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Search requester</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, or employee code" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
          <label className="block"><span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Verification status</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">{statuses.map((status) => <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>)}</select></label>
        </div>

        {error && <div role="alert" className="mx-4 mt-4 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700 sm:mx-5 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><button type="button" onClick={() => retryDecision ? void decide(retryDecision.profile, retryDecision.status) : void loadProfiles()} disabled={loading || busyId !== null} className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-extrabold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60">{busyId !== null ? 'Retrying…' : retryDecision ? retryDecision.status === 'Verified' ? 'Retry approval' : 'Retry correction' : loading ? 'Checking connection…' : 'Retry connection'}</button></div>}
        {notice && <p role="status" className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 sm:mx-5">{notice}</p>}
        {loading && <p className="p-8 text-center text-sm font-semibold text-slate-500">Loading requester profiles…</p>}
        {!loading && !filteredProfiles.length && (
          <div className="px-5 py-12 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="8" r="3.5" />
                <path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h4a4.5 4.5 0 0 1 4.5 4.5V20M17 5.5a3.5 3.5 0 0 1 0 6.9M18 14.5a4.5 4.5 0 0 1 3.5 4.2V20" />
              </svg>
            </span>
            <p className="mt-3 text-sm font-extrabold text-slate-800">{profiles.length === 0 ? 'No requester profiles yet' : 'No matching requester profiles'}</p>
            <p className="mt-1 text-xs text-slate-500">{profiles.length === 0 ? 'New submissions will appear here after requesters complete their staff details.' : 'Try another status filter or search term.'}</p>
          </div>
        )}
        {!loading && <div className="divide-y divide-slate-100">{filteredProfiles.map((profile) => {
          const key = String(profile.userId)
          const isBusy = busyId === profile.userId
          return <article key={key} className="p-5 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  {profile.pictureData ? <img src={profile.pictureData} alt={`${profileFullName(profile)} profile`} className="h-14 w-14 shrink-0 rounded-2xl border border-slate-200 object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-50 text-sm font-black text-blue-700">{profileFullName(profile).split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>}
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-black text-slate-900">{profileFullName(profile)}</h3><span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-extrabold ${statusStyle[profile.status]}`}>{profile.status}</span></div><p className="mt-1 break-all text-xs font-medium text-slate-500">Account: {profile.accountName} · {profile.accountEmail}</p></div>
                </div>
                <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Employee code', profile.employeeCode],
                    ['First name', profile.firstName || 'Not provided'],
                    ['Middle name', profile.middleName || '—'],
                    ['Surname', profile.lastName || 'Not provided'],
                    ['Suffix', profile.suffix || '—'],
                    ['Department / office', profile.department],
                    ['Position', profile.position],
                    ['Contact number', profile.contactNumber],
                  ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 px-3 py-2.5"><dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 wrap-break-word text-xs font-bold text-slate-800">{value}</dd></div>)}
                </dl>
                <div className={`mt-3 rounded-xl border p-3 ${profile.employeeRecordMatch ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <p className={`text-xs font-extrabold ${profile.employeeRecordMatch ? 'text-emerald-900' : 'text-amber-950'}`}>{profile.employeeRecordMatch ? 'Employee Master Data match found' : profile.matchedEmployeeCode ? 'Employee Master Data record needs manual review' : 'New employee record will be created after approval'}</p>
                  {profile.matchedEmployeeCode && <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-700">Record: {profile.matchedEmployeeCode} · {profile.matchedDepartment || 'No department'} · {profile.matchedPosition || 'No position'} · {profile.matchedEmail || 'No email'} · {profile.matchedEmployeeStatus || 'No status'}</p>}
                  {!profile.matchedEmployeeCode && <p className="mt-1 text-[0.68rem] leading-relaxed text-amber-900">No existing employee code matched. If approved, the system will create an employee profile using the verified requester details.</p>}
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
