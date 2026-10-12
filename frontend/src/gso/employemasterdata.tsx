import { GsoPageFrame } from '../components/navbars/gsonavbar'

const sampleEmployees = [
  { id: 'EMP-1042', name: 'Ana Santos', initials: 'AS', department: 'Registrar Office', position: 'Records Officer', email: 'ana.santos@dyci.edu.ph', assigned: 2, status: 'Active', statusTone: 'bg-emerald-50 text-emerald-700' },
  { id: 'EMP-1128', name: 'Marco Villanueva', initials: 'MV', department: 'IT Services', position: 'Support Technician', email: 'marco.villanueva@dyci.edu.ph', assigned: 2, status: 'Active', statusTone: 'bg-emerald-50 text-emerald-700' },
  { id: 'EMP-1186', name: 'Liza Mendoza', initials: 'LM', department: 'Science Department', position: 'Lab Coordinator', email: 'liza.mendoza@dyci.edu.ph', assigned: 1, status: 'Active', statusTone: 'bg-emerald-50 text-emerald-700' },
  { id: 'EMP-1214', name: 'Rafael Cruz', initials: 'RC', department: 'Finance Office', position: 'Accounting Assistant', email: 'rafael.cruz@dyci.edu.ph', assigned: 0, status: 'Inactive', statusTone: 'bg-slate-100 text-slate-600' },
]

const sampleAssignedItems = [
  { code: 'AST-LTP-0142', name: 'Lenovo ThinkPad E14', condition: 'Good', tone: 'bg-emerald-50 text-emerald-700', assignedOn: 'Oct 08, 2026' },
  { code: 'AST-MON-0084', name: 'Dell 24-inch Monitor', condition: 'Good', tone: 'bg-emerald-50 text-emerald-700', assignedOn: 'Sep 18, 2026' },
]

const sampleEmployeeHistory = [
  { date: 'Oct 08, 2026', event: 'Issued', item: 'Lenovo ThinkPad E14', code: 'AST-LTP-0142', note: 'Acknowledged' },
  { date: 'Sep 18, 2026', event: 'Released', item: 'Dell 24-inch Monitor', code: 'AST-MON-0084', note: 'Acknowledged' },
  { date: 'Aug 30, 2026', event: 'Returned', item: 'Ergonomic Office Chair', code: 'AST-CHR-0112', note: 'Condition: Fair' },
]

export default function EmployeeMasterData() {
  return (
    <GsoPageFrame activePage="Employee Master Data" searchPlaceholder="Search employees...">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">People directory</span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Employee Master Data</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Keep one employee profile for assignments, returns, and complete item history.</p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Search employees</span>
              <input type="search" placeholder="Name, employee ID, or email" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Department</span>
              <select defaultValue="all" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                <option value="all">All departments</option>
                <option>Registrar Office</option>
                <option>IT Services</option>
                <option>Science Department</option>
                <option>Finance Office</option>
              </select>
            </label>
          </div>

          <details className="group w-full xl:w-auto">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 marker:content-none">
              <span className="text-base leading-none">+</span> Add Employee
            </summary>
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5 xl:absolute xl:right-9 xl:z-10 xl:w-[min(42rem,calc(100vw-3rem))] xl:bg-white xl:shadow-xl">
              <div className="mb-4">
                <h2 className="text-sm font-black text-slate-900">New employee profile</h2>
                <p className="mt-1 text-xs text-slate-500">Use one employee record for all future issuances.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Employee ID</span><input type="text" placeholder="Enter employee ID" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Full name</span><input type="text" placeholder="First name and last name" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">School email</span><input type="email" placeholder="name@dyci.edu.ph" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Department</span><input type="text" placeholder="Department name" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Position</span><input type="text" placeholder="Position or role" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                <label className="block"><span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Employee status</span><select defaultValue="active" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="reset" className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600">Clear form</button>
                <button type="button" className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white">Save employee</button>
              </div>
            </div>
          </details>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Employee directory</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Select an employee profile to review assigned items and history.</p>
          </div>
          <span className="rounded-lg bg-blue-50 px-3 py-2 text-[0.65rem] font-extrabold text-blue-700">Sample data · UI preview</span>
        </div>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-205 w-full text-left">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Employee</th>
                <th className="px-5 py-3.5">Department / position</th>
                <th className="px-5 py-3.5">School email</th>
                <th className="px-5 py-3.5">Items</th>
                <th className="px-5 py-3.5 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {sampleEmployees.map((employee, index) => (
                <tr key={employee.id} className={`border-t border-slate-100 transition hover:bg-blue-50/40 ${index === 0 ? 'bg-blue-50/35' : ''}`}>
                  <td className="px-5 py-3.5 sm:px-6">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 text-[0.62rem] font-black text-blue-700">{employee.initials}</span>
                      <span><span className="block text-xs font-extrabold text-slate-800">{employee.name}</span><span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{employee.id}</span></span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><span className="block text-xs font-bold text-slate-700">{employee.department}</span><span className="mt-1 block text-[0.65rem] text-slate-400">{employee.position}</span></td>
                  <td className="px-5 py-3.5 text-xs font-medium text-slate-600">{employee.email}</td>
                  <td className="px-5 py-3.5"><span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-100 px-2 text-xs font-extrabold text-slate-700">{employee.assigned}</span></td>
                  <td className="px-5 py-3.5 sm:px-6"><span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${employee.statusTone}`}>{employee.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2" aria-label="Employee profile preview">
        <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
          <div className="px-5 py-5 sm:px-6">
            <h2 className="text-base font-black tracking-tight text-slate-900">Currently assigned items</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Sample profile: Ana Santos · EMP-1042</p>
          </div>
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="min-w-145 w-full text-left">
              <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-5 py-3.5 sm:px-6">Asset</th><th className="px-5 py-3.5">Condition</th><th className="px-5 py-3.5">Assigned since</th><th className="px-5 py-3.5 sm:px-6">Status</th></tr></thead>
              <tbody>
                {sampleAssignedItems.map((item) => <tr key={item.code} className="border-t border-slate-100"><td className="px-5 py-3.5 sm:px-6"><span className="block text-xs font-extrabold text-slate-800">{item.name}</span><span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{item.code}</span></td><td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${item.tone}`}>{item.condition}</span></td><td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate-600">{item.assignedOn}</td><td className="px-5 py-3.5 sm:px-6"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">Issued</span></td></tr>)}
              </tbody>
            </table>
          </div>
        </article>
        <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
          <div className="px-5 py-5 sm:px-6">
            <h2 className="text-base font-black tracking-tight text-slate-900">Issuance &amp; return history</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Full custody history for the selected employee</p>
          </div>
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="min-w-155 w-full text-left">
              <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-5 py-3.5 sm:px-6">Date</th><th className="px-5 py-3.5">Event</th><th className="px-5 py-3.5">Asset</th><th className="px-5 py-3.5 sm:px-6">Notes</th></tr></thead>
              <tbody>
                {sampleEmployeeHistory.map((entry) => <tr key={`${entry.date}-${entry.code}`} className="border-t border-slate-100"><td className="whitespace-nowrap px-5 py-3.5 sm:px-6 text-xs font-semibold text-slate-600">{entry.date}</td><td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${entry.event === 'Returned' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{entry.event}</span></td><td className="px-5 py-3.5"><span className="block text-xs font-bold text-slate-700">{entry.item}</span><span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{entry.code}</span></td><td className="px-5 py-3.5 sm:px-6 text-xs text-slate-500">{entry.note}</td></tr>)}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </GsoPageFrame>
  )
}
