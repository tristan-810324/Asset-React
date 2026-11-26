import { useEffect, useState } from 'react'
import RequesterLayout from './requesterlayout'
import {
  listMyDepartmentReturns,
  type RequesterDepartmentReturn,
} from './requesterApi'
import { formatDateTime } from './requesterrequestutils'

export default function RequesterReturnItems() {
  const [departmentReturns, setDepartmentReturns] = useState<RequesterDepartmentReturn[]>([])
  const [departmentReturnsError, setDepartmentReturnsError] = useState('')

  // Same source and refresh rate as the dashboard's Recent returns, so both pages show the same records.
  useEffect(() => {
    let active = true
    const refresh = () => {
      listMyDepartmentReturns()
        .then((rows) => { if (active) { setDepartmentReturns(rows); setDepartmentReturnsError('') } })
        .catch((reason: unknown) => { if (active) setDepartmentReturnsError(reason instanceof Error ? reason.message : 'Could not load returns.') })
    }
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  return <RequesterLayout title="Return Items" subtitle="Items your department returned to GSO.">
    <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" /><div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border-18 border-white/4" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-[40%] h-64 w-64 rounded-full border-22 border-white/3" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">Returns</span><h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Return Items</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Track the returns and the condition GSO recorded for each item.</p></div>
      </div>
    </section>

    <section id="return-records" className="mt-6 scroll-mt-6 rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="return-records-title">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
        <div>
          <h2 id="return-records-title" className="text-base font-black tracking-tight text-slate-900">Recent returns</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">Items your department returned to GSO.</p>
        </div>
        <span className="text-xs font-bold text-slate-500">{departmentReturns.length} record{departmentReturns.length === 1 ? '' : 's'}</span>
      </div>
      {departmentReturnsError && <p role="alert" className="mx-5 mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 sm:mx-6">{departmentReturnsError}</p>}
      {departmentReturns.length === 0
        ? <div className="grid min-h-28 place-items-center px-4 text-center"><p className="text-sm font-bold text-slate-700">No recent returns</p></div>
        : <div className="max-h-112 space-y-2.5 overflow-y-auto p-4 sm:px-5">{departmentReturns.map((row) => <div key={row.id} className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/80 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900">{row.itemName}{Number(row.quantity) > 1 ? <span className="font-semibold text-slate-500"> · {row.quantity} {row.unitOfMeasure}</span> : null}</p>
                  <p className="mt-1 text-xs font-bold text-blue-700">{row.source === 'BORROWING' ? `Borrowed by ${row.employeeName}` : `Assigned to ${row.employeeName} · ${row.employeeCode}`}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{row.recipientLocation || 'Location not recorded'}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[0.6rem] font-extrabold ${row.status === 'Returned' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{row.status}</span>
              </div>
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[0.68rem] font-bold text-emerald-800">Surrendered to GSO{row.decidedAt || row.requestedAt ? ` · ${formatDateTime(row.decidedAt || row.requestedAt)}` : ''}{row.returnedByName ? ` · brought in by ${row.returnedByName}` : ''}{row.condition ? ` · ${row.condition}` : ''}</p>
            </div>)}</div>}
    </section>
  </RequesterLayout>
}
