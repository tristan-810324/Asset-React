import { GsoPageFrame } from '../components/navbars/gsonavbar'

const requestTypes = [
  'Purchase Request',
  'Job Request',
  'Permit to use School Facilities',
  'Request for Services',
  'Permit to use School Vehicle',
]

const sampleRequests = [
  { code: 'PR-2026-014', type: 'Purchase Request', requester: 'Ana Santos', email: 'ana.santos@dyci.edu.ph', submitted: 'Oct 11, 2026 · 9:10 AM', verification: 'Verified', attachment: 'purchase-request.pdf', status: 'Pending', tone: 'bg-amber-50 text-amber-700', summary: 'Request for three laptops for the Learning Resource Center.' },
  { code: 'JOB-2026-008', type: 'Job Request', requester: 'Marco Villanueva', email: 'marco.villanueva@dyci.edu.ph', submitted: 'Oct 10, 2026 · 2:35 PM', verification: 'Verified', attachment: 'service-request.pdf', status: 'Pending', tone: 'bg-amber-50 text-amber-700', summary: 'Repair request for a projector with intermittent display.' },
  { code: 'SVF-2026-003', type: 'Permit to use School Facilities', requester: 'Liza Mendoza', email: 'liza.mendoza@dyci.edu.ph', submitted: 'Oct 09, 2026 · 1:20 PM', verification: 'Verified', attachment: 'facility-permit.pdf', status: 'Approved', tone: 'bg-emerald-50 text-emerald-700', summary: 'Use of the science laboratory for a scheduled faculty workshop.' },
  { code: 'VHC-2026-002', type: 'Permit to use School Vehicle', requester: 'Rafael Cruz', email: 'rafael.cruz@dyci.edu.ph', submitted: 'Oct 08, 2026 · 8:45 AM', verification: 'Verified', attachment: 'vehicle-permit.pdf', status: 'Approved', tone: 'bg-emerald-50 text-emerald-700', summary: 'School vehicle request for an approved campus errand.' },
]

const sampleBorrowings = [
  { code: 'BRW-2026-007', item: 'Lenovo ThinkPad E14', asset: 'AST-LTP-0142', borrower: 'Ana Santos', checkout: 'Oct 10, 2026', due: 'Oct 17, 2026', actual: '—', out: 'Good', in: '—', status: 'Active', tone: 'bg-blue-50 text-blue-700' },
  { code: 'BRW-2026-006', item: 'Epson EB-X06 Projector', asset: 'AST-PRJ-0031', borrower: 'Marco Villanueva', checkout: 'Oct 02, 2026', due: 'Oct 09, 2026', actual: '—', out: 'Fair', in: '—', status: 'Overdue', tone: 'bg-rose-50 text-rose-700' },
  { code: 'BRW-2026-004', item: 'Ergonomic Office Chair', asset: 'AST-CHR-0112', borrower: 'Liza Mendoza', checkout: 'Sep 28, 2026', due: 'Oct 01, 2026', actual: 'Oct 01, 2026', out: 'Good', in: 'Fair', status: 'Returned', tone: 'bg-slate-100 text-slate-600' },
]

export default function BorrowingPage() {
  return (
    <GsoPageFrame activePage="Requests & Borrowing" searchPlaceholder="Search requests and borrowings...">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">GSO workflow</span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Requests &amp; Borrowing</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Review requester submissions and keep temporary checkouts separate from long-term issuance.</p>
          </div>
          <span className="rounded-xl border border-white/10 bg-white/8 px-3.5 py-2 text-xs font-bold text-blue-100">Sample data · UI preview</span>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="Request and borrowing summary">
        {[
          { label: 'Pending requests', value: '2', detail: 'Awaiting GSO review', tone: 'bg-amber-50 text-amber-700' },
          { label: 'Approved requests', value: '2', detail: 'Ready for next step', tone: 'bg-emerald-50 text-emerald-700' },
          { label: 'Active borrowings', value: '2', detail: 'Includes one overdue', tone: 'bg-blue-50 text-blue-700' },
        ].map((item) => (
          <article key={item.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55">
            <p className="text-xs font-bold text-slate-500">{item.label}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-3xl font-black tracking-tight text-slate-900">{item.value}</span>
              <span className={`rounded-lg px-2.5 py-1.5 text-[0.65rem] font-extrabold ${item.tone}`}>{item.detail}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900">Request queue</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">Filter by submission period, type, and review status.</p>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Request status views">
              <span className="rounded-lg bg-blue-600 px-3 py-2 text-[0.68rem] font-extrabold text-white">All requests</span>
              <span className="rounded-lg bg-amber-50 px-3 py-2 text-[0.68rem] font-extrabold text-amber-700">Pending <span className="ml-1 rounded-md bg-white/75 px-1.5 py-0.5">2</span></span>
              <span className="rounded-lg bg-emerald-50 px-3 py-2 text-[0.68rem] font-extrabold text-emerald-700">Approved <span className="ml-1 rounded-md bg-white/75 px-1.5 py-0.5">2</span></span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.5fr]">
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Submission period</span>
              <select defaultValue="week" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                <option value="day">Today</option>
                <option value="week">This week</option>
                <option value="all">All dates</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Request type</span>
              <select defaultValue="all" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                <option value="all">All request types</option>
                {requestTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Search requests</span>
              <input type="search" placeholder="Request code, employee, or email" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-205 w-full text-left">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Request</th>
                <th className="px-5 py-3.5">Request type</th>
                <th className="px-5 py-3.5">Requester</th>
                <th className="px-5 py-3.5">Verification</th>
                <th className="px-5 py-3.5 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {sampleRequests.map((request, index) => (
                <tr key={request.code} className={`border-t border-slate-100 transition hover:bg-blue-50/40 ${index === 0 ? 'bg-blue-50/35' : ''}`}>
                  <td className="whitespace-nowrap px-5 py-3.5 sm:px-6"><span className="block text-xs font-extrabold text-slate-800">{request.code}</span><span className="mt-1 block text-[0.62rem] font-medium text-slate-400">{request.submitted}</span></td>
                  <td className="px-5 py-3.5"><span className="inline-flex max-w-48 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[0.62rem] font-bold leading-relaxed text-slate-600">{request.type}</span></td>
                  <td className="px-5 py-3.5"><span className="block text-xs font-bold text-slate-700">{request.requester}</span><span className="mt-1 block text-[0.62rem] text-slate-400">{request.email}</span></td>
                  <td className="px-5 py-3.5"><span className="rounded-full bg-sky-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-sky-700">{request.verification}</span><span className="mt-1 block text-[0.62rem] text-slate-400">{request.attachment}</span></td>
                  <td className="px-5 py-3.5 sm:px-6"><span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${request.tone}`}>{request.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Request details</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Submitted form and attached verification</p>
          </div>
          <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/45 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><span className="text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-600">Selected sample</span><h3 className="mt-1 text-sm font-black text-slate-800">{sampleRequests[0].code}</h3></div>
              <span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${sampleRequests[0].tone}`}>{sampleRequests[0].status}</span>
            </div>
            <dl className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Type</dt><dd className="text-right font-bold text-slate-700">{sampleRequests[0].type}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Requester</dt><dd className="text-right font-bold text-slate-700">{sampleRequests[0].requester}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Submitted</dt><dd className="text-right font-bold text-slate-700">{sampleRequests[0].submitted}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Attachment</dt><dd className="text-right font-bold text-blue-700">{sampleRequests[0].attachment}</dd></div>
            </dl>
            <div className="mt-4 rounded-lg border border-white/80 bg-white/80 p-3"><p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-400">Request summary</p><p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">{sampleRequests[0].summary}</p></div>
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
          <div className="px-5 py-5 sm:px-6">
            <h2 className="text-base font-black tracking-tight text-slate-900">Borrowing records</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Temporary checkouts, expected returns, and condition on return</p>
          </div>
          <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-190 w-full text-left">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Borrowed item / borrower</th>
                <th className="px-5 py-3.5">Checkout → due</th>
                <th className="px-5 py-3.5">Condition out → in</th>
                <th className="px-5 py-3.5">Returned</th>
                <th className="px-5 py-3.5 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {sampleBorrowings.map((record) => (
                <tr key={record.code} className="border-t border-slate-100 transition hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 sm:px-6"><span className="block text-xs font-extrabold text-slate-800">{record.item}</span><span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{record.asset} · {record.borrower}</span></td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate-700">{record.checkout}<span className="mt-1 block text-[0.62rem] text-slate-400">Due {record.due}</span></td>
                  <td className="px-5 py-3.5"><span className="rounded-full bg-slate-100 px-2 py-1 text-[0.6rem] font-bold text-slate-600">{record.out}</span><span className="mx-1 text-slate-300">→</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[0.6rem] font-bold text-slate-600">{record.in}</span></td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate-600">{record.actual}</td>
                  <td className="px-5 py-3.5 sm:px-6"><span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${record.tone}`}>{record.status}</span></td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </GsoPageFrame>
  )
}
