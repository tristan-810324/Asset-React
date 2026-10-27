import RequesterLayout from './requesterlayout'
import { useRequesterIdentity } from './requesteridentitycontext'
import { type RequestType } from './requesterApi'

const cards: Array<{ type: RequestType; description: string; detail: string; accent: string }> = [
  { type: 'BORROWING', description: 'Borrow an Asset', detail: 'Request school equipment, follow approval, and track an issued item through return.', accent: 'bg-blue-50 text-blue-700' },
  { type: 'FACILITY_USE', description: 'Facility Use Permit', detail: 'Request a campus venue, set an activity schedule, and list the equipment you need.', accent: 'bg-violet-50 text-violet-700' },
  { type: 'JOB_REQUEST', description: 'Job / Service Request', detail: 'Describe work needed by GSO, its location, task details, and target completion date.', accent: 'bg-amber-50 text-amber-700' },
  { type: 'PURCHASE_REQUISITION', description: 'Purchase Requisition', detail: 'Submit one supplier category per form with item quantities and specifications.', accent: 'bg-emerald-50 text-emerald-700' },
  { type: 'LOSS_DAMAGE_REPORT', description: 'Loss / Damage Report', detail: 'Report lost or damaged school property for GSO review and verification.', accent: 'bg-rose-50 text-rose-700' },
]

function RequestCenterContent() {
  const { identity, identityLoading, openIdentityPrompt } = useRequesterIdentity()
  const verified = identity?.status === 'Verified'
  return (
    <div>
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-7 text-white shadow-xl shadow-blue-950/15 sm:px-8 sm:py-9">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> School services</span>
          <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">What do you need help with?</h1>
          <p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">{verified ? 'Your GSO-verified staff identity will be attached to the request.' : 'GSO must verify your staff identity before you can submit.'} After submission, keep the reference number to check updates and respond to GSO.</p>
        </div>
      </section>

      {!verified && <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" role="status">
        <div><h2 className="text-sm font-extrabold text-amber-950">{identityLoading ? 'Checking your identity status…' : identity?.status === 'Pending' ? 'Waiting for GSO verification' : identity?.status === 'Needs Correction' ? 'Update the details requested by GSO' : 'Complete your staff identity before requesting'}</h2><p className="mt-1 text-xs leading-relaxed text-amber-900">{identity?.status === 'Pending' ? 'Hindi maipapadala ang service request hanggang ma-verify ng GSO.' : 'Puwede mong buksan ang form at maghanda ng request, pero hindi ito maipapadala hangga’t hindi verified.'}</p></div>
        <button type="button" onClick={openIdentityPrompt} className="shrink-0 rounded-xl bg-amber-900 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-amber-950">{identity?.status === 'Pending' ? 'View verification status' : 'Complete staff details'}</button>
      </section>}

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Available request forms">
        {cards.map((card) => (
          <a key={card.type} href={`/requester/requests/new?type=${card.type}`} className="group flex min-h-52 flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/50 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
            <span className={`grid h-11 w-11 place-items-center rounded-xl text-lg font-black ${card.accent}`} aria-hidden="true">{card.type === 'BORROWING' ? '↗' : card.type === 'FACILITY_USE' ? '⌂' : card.type === 'JOB_REQUEST' ? '✳' : card.type === 'PURCHASE_REQUISITION' ? '＋' : '!'}</span>
            <span className="mt-4 text-base font-black tracking-tight text-slate-900">{card.description}</span>
            <span className="mt-2 flex-1 text-xs font-medium leading-relaxed text-slate-500">{card.detail}</span>
            <span className="mt-4 inline-flex items-center gap-2 text-xs font-extrabold text-blue-700">Start request <span className="transition group-hover:translate-x-1" aria-hidden="true">→</span></span>
          </a>
        ))}

        <article className="flex min-h-52 flex-col rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-200/70 text-lg font-black text-slate-500" aria-hidden="true">…</span>
          <span className="mt-4 text-base font-black tracking-tight text-slate-700">Vehicle / Other Services</span>
          <span className="mt-2 flex-1 text-xs font-medium leading-relaxed text-slate-500">These forms need the official school form and approval rules before they can be safely digitized.</span>
          <span className="mt-4 inline-flex w-fit rounded-full bg-slate-200 px-2.5 py-1 text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-600">Not available yet</span>
        </article>
      </section>
      <p className="mt-5 text-[0.68rem] leading-relaxed text-slate-500">Submitting a request does not mean it is approved. GSO will review the details and update the status in <a href="/requester/my-requests" className="font-extrabold text-blue-700 hover:underline">My Requests</a>.</p>
    </div>
  )
}

export default function RequestCenter() {
  return <RequesterLayout title="Request Center" subtitle="Choose the school service form that matches your request."><RequestCenterContent /></RequesterLayout>
}
