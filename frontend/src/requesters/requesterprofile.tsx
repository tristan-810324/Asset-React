import { useState } from 'react'
import RequesterLayout, { RequesterIdentityForm } from './requesterlayout'
import { useRequesterIdentity } from './requesteridentitycontext'

const statusStyles = {
  Incomplete: 'border-amber-200 bg-amber-50 text-amber-800',
  Pending: 'border-blue-200 bg-blue-50 text-blue-800',
  Verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Needs Correction': 'border-rose-200 bg-rose-50 text-rose-800',
}

function RequesterProfileContent() {
  const { user, identity, identityLoading, identityError, refreshIdentity, openIdentityPrompt } = useRequesterIdentity()
  const [editing, setEditing] = useState(false)
  const needsDetails = !identity || identity.status === 'Incomplete' || identity.status === 'Needs Correction'
  const showForm = editing || needsDetails

  return <div className="mx-auto max-w-3xl">
    <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
      <div className="relative"><span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">Staff identity</span><h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Your requester profile</h1><p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">I-verify ang staff details mo sa GSO para makapagpadala ng service request.</p></div>
    </section>

    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-5 sm:p-6">
        <div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-100 text-lg font-black text-blue-700">{user?.name?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'RQ'}</span><div><h2 className="text-base font-black text-slate-900">{user?.name || 'Requester'}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{user?.email || 'Signed-in requester account'}</p></div></div>
        {identity && <span className={`rounded-full border px-3 py-1.5 text-xs font-extrabold ${statusStyles[identity.status]}`}>{identity.status === 'Incomplete' ? 'Details needed' : identity.status}</span>}
      </div>
      {identityError && <p role="alert" className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{identityError}</p>}
      {identityLoading && <p className="p-6 text-sm font-semibold text-slate-500">Loading identity details…</p>}
      {!identityLoading && identity && <>
        {identity.status === 'Pending' && <div className="mx-5 mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:mx-6"><p className="text-sm font-extrabold text-blue-900">Nasa GSO na ang details mo para sa validation.</p><p className="mt-1 text-xs leading-relaxed text-blue-800">Hindi pa makakapagpadala ng request hangga’t hindi pa Verified.</p>{identity.reviewNote && <p className="mt-3 text-xs font-semibold text-slate-700">GSO note: {identity.reviewNote}</p>}</div>}
        {identity.status === 'Needs Correction' && <div role="alert" className="mx-5 mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:mx-6">{identity.reviewNote || 'Pakitingnan at itama ang details bago muling isumite.'}</div>}
        {!showForm && <dl className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
          <div className="rounded-xl bg-slate-50 p-4"><dt className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-400">Employee number</dt><dd className="mt-2 text-sm font-bold text-slate-800">{identity.employeeCode}</dd></div>
          <div className="rounded-xl bg-slate-50 p-4"><dt className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-400">Department / office</dt><dd className="mt-2 text-sm font-bold text-slate-800">{identity.department}</dd></div>
          <div className="rounded-xl bg-slate-50 p-4"><dt className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-400">Position</dt><dd className="mt-2 text-sm font-bold text-slate-800">{identity.position}</dd></div>
          <div className="rounded-xl bg-slate-50 p-4"><dt className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-400">Contact number</dt><dd className="mt-2 text-sm font-bold text-slate-800">{identity.contactNumber}</dd></div>
        </dl>}
        {identity.status === 'Verified' && !showForm && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6"><button type="button" onClick={() => setEditing(true)} className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-extrabold text-blue-700 transition hover:bg-blue-50">Update identity details</button><button type="button" onClick={openIdentityPrompt} className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-200">Verification status</button></div>}
      </>}
    </section>

    {!identityLoading && showForm && <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5"><h2 className="text-lg font-black text-slate-900">{identity?.status === 'Needs Correction' ? 'Update staff details' : 'Complete staff details'}</h2><p className="mt-1 text-sm leading-relaxed text-slate-500">GSO will compare your employee number, department, position, and account email against Employee Master Data.</p></div>
      <RequesterIdentityForm profile={identity} onSaved={async () => { await refreshIdentity(); setEditing(false) }} onCancel={identity?.status === 'Verified' ? () => setEditing(false) : undefined} />
    </section>}
  </div>
}

export default function RequesterProfile() {
  return <RequesterLayout title="Profile" subtitle="Update your staff identity and check GSO validation status."><RequesterProfileContent /></RequesterLayout>
}
