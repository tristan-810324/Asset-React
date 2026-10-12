import { GsoPageFrame } from '../components/navbars/gsonavbar'

const issuanceConditions = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired']

const sampleIssuances = [
  { code: 'AST-LTP-0142', asset: 'Lenovo ThinkPad E14', category: 'Office Equipment', employee: 'Ana Santos', department: 'Registrar Office', position: 'Records Officer', date: 'Oct 08, 2026', time: '9:20 AM', condition: 'Good', conditionTone: 'bg-emerald-50 text-emerald-700', status: 'Acknowledged', statusTone: 'bg-emerald-50 text-emerald-700' },
  { code: 'AST-PRJ-0031', asset: 'Epson EB-X06 Projector', category: 'Office Equipment', employee: 'Marco Villanueva', department: 'IT Services', position: 'Support Technician', date: 'Oct 07, 2026', time: '2:15 PM', condition: 'Fair', conditionTone: 'bg-amber-50 text-amber-700', status: 'Pending acknowledgment', statusTone: 'bg-amber-50 text-amber-700' },
  { code: 'AST-MON-0084', asset: 'Dell 24-inch Monitor', category: 'Office Equipment', employee: 'Liza Mendoza', department: 'Science Department', position: 'Lab Coordinator', date: 'Oct 06, 2026', time: '10:45 AM', condition: 'New', conditionTone: 'bg-sky-50 text-sky-700', status: 'Released', statusTone: 'bg-blue-50 text-blue-700' },
  { code: 'AST-CHR-0112', asset: 'Ergonomic Office Chair', category: 'Office Equipment', employee: 'Ana Santos', department: 'Registrar Office', position: 'Records Officer', date: 'Sep 18, 2026', time: '1:30 PM', condition: 'Good', conditionTone: 'bg-emerald-50 text-emerald-700', status: 'Returned', statusTone: 'bg-slate-100 text-slate-600' },
]

const sampleReleases = [
  { code: 'AST-LTP-0142', asset: 'Lenovo ThinkPad E14', employee: 'Ana Santos', releasedAt: 'Oct 08 · 9:20 AM', acknowledgment: 'Confirmed', tone: 'bg-emerald-50 text-emerald-700' },
  { code: 'AST-PRJ-0031', asset: 'Epson EB-X06 Projector', employee: 'Marco Villanueva', releasedAt: 'Oct 07 · 2:15 PM', acknowledgment: 'Pending', tone: 'bg-amber-50 text-amber-700' },
  { code: 'AST-MON-0084', asset: 'Dell 24-inch Monitor', employee: 'Liza Mendoza', releasedAt: 'Oct 06 · 10:45 AM', acknowledgment: 'Confirmed', tone: 'bg-emerald-50 text-emerald-700' },
]

export default function IssuanceRecord() {
  return (
    <GsoPageFrame activePage="Issuance Records" searchPlaceholder="Search item code, employee, or department...">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">Asset custody</span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Issuance Records</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Review assigned assets, physical releases, employee acknowledgments, and returns as distinct records.</p>
          </div>
          <span className="rounded-xl border border-white/10 bg-white/8 px-3.5 py-2 text-xs font-bold text-blue-100">Issuance → Release → Acknowledgment</span>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">New issuance</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Prepare an assignment to an existing employee and available asset.</p>
          </div>
          <details className="group sm:relative">
            <summary className="flex h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 marker:content-none">
              <span className="text-base leading-none">+</span> New Issuance
            </summary>
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5 sm:relative sm:w-[min(52rem,calc(100vw-3rem))] sm:bg-white sm:shadow-xl">
              <div className="mb-4">
                <h3 className="text-sm font-black text-slate-900">Issuance details</h3>
                <p className="mt-1 text-xs text-slate-500">Release and employee acknowledgment are recorded separately.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Employee</span><select defaultValue="" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"><option value="" disabled>Select existing employee</option><option>Ana Santos · EMP-1042</option><option>Marco Villanueva · EMP-1128</option><option>Liza Mendoza · EMP-1186</option></select></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Available asset</span><select defaultValue="" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"><option value="" disabled>Select asset</option><option>AST-LTP-0199 · Lenovo ThinkPad E14</option><option>AST-CHR-0134 · Ergonomic Office Chair</option></select></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Condition upon issuance</span><select defaultValue="" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"><option value="" disabled>Select condition</option>{issuanceConditions.map((condition) => <option key={condition}>{condition}</option>)}</select></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Date of issuance</span><input type="date" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Time of issuance</span><input type="time" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Notes</span><input type="text" placeholder="Optional issuance note" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="reset" className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600">Clear form</button>
                <button type="button" className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white">Save issuance</button>
              </div>
            </div>
          </details>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Recent issuance</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Assignment details and condition upon issuance</p>
          </div>
          <span className="rounded-lg bg-blue-50 px-3 py-2 text-[0.65rem] font-extrabold text-blue-700">Sample data · UI preview</span>
        </div>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-235 w-full text-left">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Asset</th>
                <th className="px-5 py-3.5">Recipient</th>
                <th className="px-5 py-3.5">Issued on</th>
                <th className="px-5 py-3.5">Condition</th>
                <th className="px-5 py-3.5 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {sampleIssuances.map((record) => (
                <tr key={record.code} className="border-t border-slate-100 transition hover:bg-blue-50/35">
                  <td className="px-5 py-3.5 sm:px-6"><span className="block text-xs font-extrabold text-slate-800">{record.asset}</span><span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{record.code} · {record.category}</span></td>
                  <td className="px-5 py-3.5"><span className="block text-xs font-bold text-slate-700">{record.employee}</span><span className="mt-1 block text-[0.62rem] text-slate-400">{record.department} · {record.position}</span></td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate-700">{record.date}<span className="mt-1 block text-[0.65rem] font-medium text-slate-400">{record.time}</span></td>
                  <td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${record.conditionTone}`}>{record.condition}</span></td>
                  <td className="px-5 py-3.5 sm:px-6"><span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${record.statusTone}`}>{record.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="px-5 py-5 sm:px-6">
          <h2 className="text-base font-black tracking-tight text-slate-900">Recent releases</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">Physical release and acknowledgment status</p>
        </div>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-180 w-full text-left">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Asset</th>
                <th className="px-5 py-3.5">Recipient</th>
                <th className="px-5 py-3.5">Released on</th>
                <th className="px-5 py-3.5 sm:px-6">Acknowledgment</th>
              </tr>
            </thead>
            <tbody>
              {sampleReleases.map((release) => (
                <tr key={release.code} className="border-t border-slate-100 transition hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 sm:px-6"><span className="block text-xs font-extrabold text-slate-800">{release.asset}</span><span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{release.code}</span></td>
                  <td className="px-5 py-3.5 text-xs font-bold text-slate-700">{release.employee}</td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate-600">{release.releasedAt}</td>
                  <td className="px-5 py-3.5 sm:px-6"><span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${release.tone}`}>{release.acknowledgment}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </GsoPageFrame>
  )
}
