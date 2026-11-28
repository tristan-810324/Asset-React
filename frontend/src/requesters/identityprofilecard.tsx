import { useState } from 'react'
import type { AuthUser } from '../auth/authApi'
import { RequesterIdentityForm } from './requesterlayout'
import type { RequesterIdentity } from './requesterApi'

const statusStyles = {
  Incomplete: 'border-amber-200 bg-amber-50 text-amber-800',
  Pending: 'border-blue-200 bg-blue-50 text-blue-800',
  Verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Needs Correction': 'border-rose-200 bg-rose-50 text-rose-800',
  Rejected: 'border-rose-300 bg-rose-600 text-white',
}

// The staff identity card. The requester and GSO Head profiles both show it, so the details, form, and actions match.
export function IdentityProfileCard({ user, identity, identityLoading, identityError, refreshIdentity, openVerificationStatus, verifier = 'IT Admin' }: {
  user: AuthUser | null
  identity: RequesterIdentity | null
  identityLoading: boolean
  identityError: string
  refreshIdentity: () => Promise<unknown>
  openVerificationStatus: () => void
  verifier?: string
}) {
  const [editing, setEditing] = useState(false)
  const needsDetails = !identity || identity.status === 'Incomplete' || identity.status === 'Needs Correction' || identity.status === 'Rejected'
  const showForm = editing || needsDetails
  const identityName = identity
    ? [identity.firstName, identity.middleName, identity.lastName, identity.suffix].filter(Boolean).join(' ') || identity.accountName
    : ''

  return <>
    <section className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          {identity?.pictureData ? <img src={identity.pictureData} alt="Profile photo" className="h-14 w-14 rounded-2xl object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-100 text-lg font-black text-blue-700">{user?.name?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'AC'}</span>}
          <div><h2 className="text-base font-black text-slate-900">{user?.name || 'Your account'}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{user?.email || 'Signed-in account'}</p></div>
        </div>
        {identity && <span className={`rounded-full border px-3 py-1.5 text-xs font-extrabold ${statusStyles[identity.status]}`}>{identity.status === 'Incomplete' ? 'Details needed' : identity.status}</span>}
      </div>
      {identityError && <p role="alert" className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{identityError}</p>}
      {identityLoading && <p className="p-6 text-sm font-semibold text-slate-500">Loading identity details…</p>}
      {!identityLoading && identity && <>
        {identity.status === 'Pending' && <div className="mx-5 mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:mx-6"><p className="text-sm font-extrabold text-blue-900">{verifier} is validating your details.</p><p className="mt-1 text-xs leading-relaxed text-blue-800">You can send requests once you are verified.</p>{identity.reviewNote && <p className="mt-3 text-xs font-semibold text-slate-700">{verifier} note: {identity.reviewNote}</p>}</div>}
        {identity.status === 'Needs Correction' && <div role="alert" className="mx-5 mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:mx-6">{identity.reviewNote || 'Check and fix your details, then submit again.'}</div>}
        {identity.status === 'Rejected' && <div role="alert" className="mx-5 mt-5 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 sm:mx-6"><p className="font-extrabold text-rose-900">Your account was not approved.</p><p className="mt-1">{identity.reviewNote || 'You can fix your details and submit again.'}</p></div>}
        {!showForm && <dl className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
          {[
            ['Full name', identityName],
            ['Employee code', identity.employeeCode],
            ['First name', identity.firstName || '—'],
            ['Middle name', identity.middleName || '—'],
            ['Surname', identity.lastName || '—'],
            ['Suffix', identity.suffix || '—'],
            ['Department / office', identity.department],
            ['Position', identity.position],
            ['Contact number', identity.contactNumber],
          ].map(([label, value]) => <div key={label} className="rounded-xl border-2 border-slate-300/80 bg-white p-4 shadow-sm"><dt className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-2 text-sm font-bold text-slate-800">{value}</dd></div>)}
        </dl>}
        {identity.status === 'Verified' && !showForm && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6"><button type="button" onClick={() => setEditing(true)} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700">Update identity details</button><button type="button" onClick={openVerificationStatus} className="rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 shadow-sm transition hover:bg-slate-50">Verification status</button></div>}
      </>}
    </section>

    {!identityLoading && showForm && <section className="mt-4 rounded-2xl border-2 border-slate-300/80 bg-white p-5 sm:p-6 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
      <div className="mb-5"><h2 className="text-lg font-black text-slate-900">{identity?.status === 'Needs Correction' ? 'Update staff details' : 'Complete staff details'}</h2><p className="mt-1 text-xs text-slate-500">{verifier} will verify these details.</p></div>
      <RequesterIdentityForm profile={identity} accountEmail={user?.email || ''} verifier={verifier} onSaved={async () => { await refreshIdentity(); setEditing(false) }} onCancel={identity?.status === 'Verified' ? () => setEditing(false) : undefined} />
    </section>}
  </>
}
