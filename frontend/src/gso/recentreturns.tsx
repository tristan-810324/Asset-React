import { useEffect, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { formatDateTime } from '../requesters/requesterrequestutils'
import { listIssuanceRecords } from './issuancesApi'

type RecentReturn = {
  id: string
  returnedAt: string
  itemName: string
  itemCode: string
  employeeName: string
  employeeCode: string
  condition: string
  status: string
  quantity: number
  tagCode: string | null
}

const WINDOW_DAYS = 30
const SHOWN = 25
const dayText = (date: Date) => date.toLocaleDateString('en-CA')

// Chips: Lost is red, a unit needing repair or written off is amber, everything else is calm.
const conditionTone = (condition: string, status: string) => {
  if (status === 'Lost') return 'bg-rose-50 text-rose-700'
  if (['Needs Repair', 'Unserviceable', 'Under Maintenance'].includes(condition)) return 'bg-amber-50 text-amber-700'
  return 'bg-emerald-50 text-emerald-700'
}

// The latest returns from the last 30 days, newest first, so staff can check what they just recorded.
export default function RecentReturns() {
  const [rows, setRows] = useState<RecentReturn[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const to = new Date()
    const from = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
    listIssuanceRecords({ from: dayText(from), to: dayText(to) })
      .then((records) => {
        if (!active) return
        const returns = records.flatMap((record) => record.returns
          .filter((entry) => entry.status === 'Returned' || entry.status === 'Lost')
          .map((entry): RecentReturn => ({
            id: entry.id,
            returnedAt: entry.returnedAt,
            itemName: record.itemName,
            itemCode: record.itemCode,
            employeeName: record.employeeName,
            employeeCode: record.employeeCode,
            condition: entry.condition,
            status: entry.status,
            quantity: entry.quantity,
            tagCode: entry.tagCode,
          })))
        setRows(returns.sort((a, b) => b.returnedAt.localeCompare(a.returnedAt)).slice(0, SHOWN))
        setError('')
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load the recent returns.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <GsoPageFrame activePage="Return Items" searchPlaceholder="Search returned asset, code, or employee...">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
            Asset Custody &amp; Tracking
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Recent Returns</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
            The latest items returned to GSO. Check them here after each return.
          </p>
          <nav className="mt-5 flex flex-wrap gap-2 border-t border-blue-300/20 pt-4" aria-label="Returns and records pages">
            <a href="/gso/return-items" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-extrabold text-blue-100 transition hover:bg-white/12">
              + Return Items
            </a>
            <a href="/gso/recent-returns" aria-current="page" className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-blue-950 shadow-md">
              Recent Returns
            </a>
          </nav>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Latest returns</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Returns from the last {WINDOW_DAYS} days, newest first. Showing up to {SHOWN}.</p>
          </div>
          <span className="rounded-lg bg-blue-50 px-3 py-2 text-[0.65rem] font-extrabold text-blue-700">
            {loading ? 'Loading…' : `${rows.length} return(s)`}
          </span>
        </div>

        {error && <p role="alert" className="px-5 py-4 text-xs font-bold text-rose-700 sm:px-6">{error}</p>}
        {!error && !loading && rows.length === 0 && (
          <p className="px-5 py-12 text-center text-xs font-semibold text-slate-500">No returns in the last {WINDOW_DAYS} days yet.</p>
        )}
        {rows.length > 0 && (
          <div className="inventory-list-scrollbar max-h-144 overflow-auto">
            <table className="min-w-200 w-full text-left">
              <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5 sm:px-6">Item</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Unit code</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Employee</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Qty</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Condition</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Returned</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5 sm:px-6">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 transition hover:bg-blue-50/50">
                    <td className="px-5 py-4 sm:px-6">
                      <span className="block text-xs font-extrabold text-slate-900">{row.itemName}</span>
                      <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{row.itemCode}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-700">{row.tagCode || '—'}</td>
                    <td className="px-5 py-4">
                      <span className="block text-xs font-extrabold text-slate-800">{row.employeeName}</span>
                      <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{row.employeeCode}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-extrabold text-slate-900">{row.quantity}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${conditionTone(row.condition, row.status)}`}>{row.condition}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-700">{formatDateTime(row.returnedAt)}</td>
                    <td className="px-5 py-4 sm:px-6">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${row.status === 'Lost' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </GsoPageFrame>
  )
}
