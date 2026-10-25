import { useCallback, useEffect, useMemo, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { getOperationalReports, type OperationalReports } from './reportsApi'

type ReportKey = keyof Omit<OperationalReports, 'generatedAt'>
const reports: Array<{ key: ReportKey; label: string; description: string }> = [
  { key: 'inventory', label: 'Inventory', description: 'Stock, location, condition, lifecycle, and valuation.' },
  { key: 'requests', label: 'Requests', description: 'All borrower and school-service requests, including external PR handoffs.' },
  { key: 'issuances', label: 'Issuance', description: 'Employee accountability and remaining issued quantities.' },
  { key: 'returns', label: 'Returns', description: 'Employee return requests, condition, and decision records.' },
  { key: 'movements', label: 'Asset movements', description: 'Transfers, turnovers, location changes, reasons, and acknowledgement.' },
  { key: 'assetUnits', label: 'Asset tags', description: 'Unique unit tags, serial numbers, custody, condition, and disposal records.' },
]

function textValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function csvValue(value: unknown) {
  const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

export default function GsoReports() {
  const [data, setData] = useState<OperationalReports | null>(null)
  const [selected, setSelected] = useState<ReportKey>('inventory')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try { setData(await getOperationalReports()); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang reports.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  const selectedReport = reports.find((report) => report.key === selected) || reports[0]
  const rows = data?.[selected] || []
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? rows.filter((row) => Object.values(row).some((value) => textValue(value).toLowerCase().includes(query))) : rows
  }, [rows, search])
  const columns = useMemo(() => {
    if (filteredRows.length === 0) return []
    const preferred: Record<ReportKey, string[]> = {
      inventory: ['itemCode','itemName','category','quantity','availableQuantity','unitOfMeasure','condition','location','reorderLevel','lifecycleStatus','acquisitionCost','currentValue'],
      requests: ['referenceNo','requestType','title','status','createdAt','requesterName','externalForwardedAt','externalForwardedTo','externalReference','formData'],
      issuances: ['employeeCode','employeeName','department','itemCode','itemName','quantity','returnedQuantity','unitOfMeasure','status','issuedAt'],
      returns: ['employeeCode','employeeName','itemCode','itemName','quantity','condition','status','reason','requestedAt','returnedAt'],
      movements: ['itemCode','itemName','movementType','quantity','fromEmployee','fromLocation','toEmployee','toLocation','reason','acknowledgement','createdAt','recordedBy'],
      assetUnits: ['tagCode','serialNumber','itemCode','itemName','unitNumber','location','condition','lifecycleStatus','custodyStatus','employeeCode','employeeName','borrowerName','disposalReason','disposalReference','createdAt'],
    }
    return preferred[selected].filter((column) => filteredRows.some((row) => column in row))
  }, [filteredRows, selected])

  function exportCsv() {
    if (filteredRows.length === 0 || columns.length === 0) return
    const contents = [columns.map(csvValue).join(','), ...filteredRows.map((row) => columns.map((column) => csvValue(row[column])).join(','))].join('\r\n')
    const blob = new Blob([`\uFEFF${contents}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `A-SET_${selected}_report_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <GsoPageFrame activePage="Reports & Audit" searchPlaceholder="Search operational reports...">
    <style>{`@media print { body * { visibility: hidden !important; } #operational-report, #operational-report * { visibility: visible !important; } #operational-report { position: absolute; inset: 0; width: 100%; max-height: none; overflow: visible; } .report-controls { display: none !important; } }`}</style>
    <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
      <span className="rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">GSO reporting</span>
      <div className="mt-3"><h1 className="text-2xl font-black sm:text-3xl">Reports &amp; Audit</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100">Operational reports use persisted inventory, request, issuance, return, and movement history.</p></div>
    </section>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
    <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {reports.map((report) => <button key={report.key} type="button" onClick={() => { setSelected(report.key); setSearch('') }} aria-pressed={selected === report.key} className={`rounded-2xl border p-4 text-left shadow-sm transition ${selected === report.key ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-200'}`}><span className={`text-xs font-black ${selected === report.key ? 'text-blue-800' : 'text-slate-800'}`}>{report.label}</span><p className="mt-1 text-[0.62rem] leading-relaxed text-slate-500">{report.description}</p><span className="mt-3 block text-xl font-black tabular-nums text-slate-900">{loading ? '—' : (data?.[report.key].length || 0).toLocaleString('en-PH')}</span></button>)}
    </section>
    <section id="operational-report" className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="report-controls flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h2 className="text-base font-black text-slate-900">{selectedReport.label} report</h2><p className="mt-1 text-xs text-slate-500">{data ? `Generated ${new Date(data.generatedAt).toLocaleString('en-PH')}` : 'Waiting for report data'}</p></div><div className="flex gap-2"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter rows" className="h-10 min-w-0 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400" /><button type="button" onClick={exportCsv} disabled={filteredRows.length === 0} className="rounded-lg bg-blue-600 px-3 text-xs font-extrabold text-white disabled:opacity-50">Export CSV</button><button type="button" onClick={() => window.print()} disabled={filteredRows.length === 0} className="rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 disabled:opacity-50">Print / PDF</button><button type="button" onClick={() => void refresh()} className="rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600">Refresh</button></div></div>
      <div className="max-h-152 overflow-auto">
        <table className="min-w-full border-collapse text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500"><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3">{column.replace(/([A-Z])/g, ' $1')}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={Math.max(columns.length, 1)} className="px-4 py-12 text-center text-slate-400">Loading report…</td></tr> : filteredRows.length === 0 ? <tr><td colSpan={Math.max(columns.length, 1)} className="px-4 py-12 text-center text-slate-400">No matching records.</td></tr> : filteredRows.map((row, index) => <tr key={`${selected}-${String(row.id || row.referenceNo || row.itemCode || index)}`} className="hover:bg-slate-50/70">{columns.map((column) => <td key={column} className="max-w-80 px-4 py-3 text-slate-700"><span className="block max-w-80 truncate" title={textValue(row[column])}>{textValue(row[column])}</span></td>)}</tr>)}</tbody></table>
      </div>
      <p className="border-t border-slate-100 px-4 py-3 text-[0.62rem] text-slate-400">CSV export includes the current search filter. Print / PDF uses the browser’s print dialog.</p>
    </section>
  </GsoPageFrame>
}
