import { useEffect, useState } from 'react'
import { listHoldings, type AccountabilityEntry, type HoldingEntry } from './issuancesApi'

function formatDueDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'Asia/Manila' }).format(date)
}

// Everything still out with employees, plus a clearance check by search. Shown on the GSO dashboard.
export default function HoldingsClearance() {
  const [holdings, setHoldings] = useState<HoldingEntry[]>([])
  const [accountabilities, setAccountabilities] = useState<AccountabilityEntry[]>([])
  const [filter, setFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    listHoldings()
      .then((result) => {
        if (!active) return
        setHoldings(result.items)
        setAccountabilities(result.accountabilities)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load items still with employees.')
      })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [])

  const normalizedFilter = filter.trim().toLowerCase()
  const visibleHoldings = holdings.filter((entry) => !normalizedFilter
    || `${entry.employeeCode || ''} ${entry.employeeName} ${entry.itemName} ${entry.itemCode} ${entry.referenceNo || ''}`.toLowerCase().includes(normalizedFilter))
  const visibleAccountabilities = accountabilities.filter((entry) => !normalizedFilter
    || `${entry.employeeCode} ${entry.employeeName} ${entry.itemName} ${entry.itemCode}`.toLowerCase().includes(normalizedFilter))
  const overdueCount = holdings.filter((entry) => entry.isOverdue).length

  return (
    <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6" aria-labelledby="holdings-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="holdings-title" className="text-base font-black tracking-tight text-slate-900">Still with employees &amp; clearance</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">Everything not yet returned, from GSO issuances and the Request Center. Search an employee to check clearance.</p>
        </div>
        {overdueCount > 0 && <span className="rounded-full bg-rose-50 px-3 py-1.5 text-[0.62rem] font-extrabold text-rose-700">{overdueCount} overdue</span>}
      </div>
      <input
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Search employee name or code, item, or request no."
        aria-label="Search items still with employees"
        className="mt-3 h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
      />
      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      {normalizedFilter && !isLoading && !error && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${visibleHoldings.length || visibleAccountabilities.length ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}>
          {visibleHoldings.length || visibleAccountabilities.length
            ? `Not cleared: ${visibleHoldings.length} item record${visibleHoldings.length === 1 ? '' : 's'} still out and ${visibleAccountabilities.length} unsettled lost item${visibleAccountabilities.length === 1 ? '' : 's'}.`
            : 'Cleared: nothing is still out and no lost item is unsettled for this search.'}
        </p>
      )}
      <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-160 text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-400">
            <tr><th className="px-3 py-2.5">Employee</th><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5">Qty</th><th className="px-3 py-2.5">Due</th><th className="px-3 py-2.5">Return at</th></tr>
          </thead>
          <tbody>
            {visibleHoldings.map((entry) => (
              <tr key={`${entry.source}-${entry.issuanceId}`} className="border-t border-slate-100">
                <td className="px-3 py-2.5">
                  <span className="block font-bold text-slate-800">{entry.employeeName}</span>
                  <span className="text-[0.62rem] text-slate-500">{entry.employeeCode || 'No verified employee code'} · {entry.source}{entry.referenceNo ? ` ${entry.referenceNo}` : ''}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="block font-bold text-slate-800">{entry.itemName}</span>
                  <span className="text-[0.62rem] text-slate-500">{entry.tagCodes.length ? entry.tagCodes.join(', ') : entry.itemCode}</span>
                </td>
                <td className="px-3 py-2.5 font-semibold text-slate-700">{entry.quantity} {entry.unitOfMeasure}</td>
                <td className="px-3 py-2.5">
                  {entry.dueAt ? formatDueDate(entry.dueAt) : '—'}
                  {entry.isOverdue && <span className="ml-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-[0.58rem] font-extrabold text-rose-700">Overdue</span>}
                </td>
                <td className="px-3 py-2.5">
                  {entry.source === 'GSO issuance'
                    ? <a href="/gso/return-items" className="text-[0.62rem] font-extrabold text-blue-700 hover:underline">Return Items</a>
                    : <a href="/gso/requests-borrowing" className="text-[0.62rem] font-extrabold text-blue-700 hover:underline">Request &amp; Borrowing</a>}
                </td>
              </tr>
            ))}
            {!isLoading && !error && !visibleHoldings.length && (
              <tr><td colSpan={5} className="px-3 py-6 text-center font-semibold text-slate-400">Nothing is still out{normalizedFilter ? ' for this search' : ''}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
