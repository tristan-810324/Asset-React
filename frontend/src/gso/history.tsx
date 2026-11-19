import { useEffect, useMemo, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { listFacilityFinanceReport, listGsoRequests, type FacilityFinanceRow } from '../requesters/requesterApi'
import { formatDateTime } from '../requesters/requesterrequestutils'
import { listIssuanceRecords } from './issuancesApi'
import { listServiceWorkOrders } from './serviceWorkboardApi'
import { listEmployees } from './employeesApi'
import { listLossDamageCases } from './lossDamageCasesApi'

type TabKey = 'returns' | 'facilities' | 'service' | 'loss' | 'repair' | 'unserviceable' | 'employees' | 'requisitions'

// Tabs with a working history list. The rest are placeholders until their data is wired.
const TABS: { key: TabKey; label: string; ready: boolean }[] = [
  { key: 'returns', label: 'Returns', ready: true },
  { key: 'facilities', label: 'Facilities and equipment', ready: true },
  { key: 'service', label: 'Service Workboard', ready: true },
  { key: 'loss', label: 'Loss & Damage', ready: true },
  { key: 'repair', label: 'Repair & Maintenance', ready: true },
  { key: 'unserviceable', label: 'Unserviceable', ready: true },
  { key: 'employees', label: 'Employees', ready: false },
  { key: 'requisitions', label: 'Requisitions & Issuances', ready: false },
]

type HistoryRow = { id: string; date: string | null; reference: string; detail: string; items?: string; person: string; personEmail?: string; status: string }

const FACILITY_DONE = ['Completed', 'Closed', 'Rejected']
const BORROW_DONE = ['Returned', 'Closed', 'Rejected']
const LOSS_DONE = ['Completed', 'Closed']
const YEAR_MS = 365 * 24 * 60 * 60 * 1000
const isoDay = (date: Date) => date.toISOString().slice(0, 10)
// Units that could not be repaired: those the GSO check marked Unserviceable, or an item that came back Unserviceable.
const unserviceableCount = (row: { condition: string | null; damagedQuantity: number; unserviceableQuantity: number }) =>
  row.unserviceableQuantity || (row.condition === 'Unserviceable' ? row.damagedQuantity : 0)
// One history line per facility item from the return check. Payment is handled by Finance, so no settlement status is shown.
// Unserviceable items sort by what is left to do: To pay first, then Waived, then Paid.
const writeOffRank: Record<string, number> = { 'To pay': 0, Waived: 1, Paid: 2, 'No decision': 3 }
const writeOffStatus = (row: FacilityFinanceRow) => {
  if (row.writeOffDecision === 'WAIVED') return 'Waived'
  if (row.writeOffDecision !== 'CHARGED') return 'No decision'
  return row.settlementStatus === 'Paid' || row.settlementStatus === 'Replaced' ? 'Paid' : 'To pay'
}
const writeOffTone = (status: string) => status === 'To pay'
  ? 'bg-rose-50 text-rose-700'
  : status === 'Paid' ? 'bg-emerald-50 text-emerald-700'
    : status === 'Waived' ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-700'
const facilityHistoryRow = (row: FacilityFinanceRow, prefix: string, index: number, detail: string, status: string): HistoryRow => ({
  id: `${prefix}-${row.requestId}-${row.itemCode}-${index}`,
  date: row.returnedAt,
  reference: row.referenceNo,
  detail: `${row.itemName} · ${detail}`,
  person: row.accountableName,
  personEmail: row.accountableEmail,
  status,
})

async function loadRows(tab: TabKey): Promise<HistoryRow[]> {
  if (tab === 'returns') {
    // Item returns from Return Issuance, plus facility items brought back from facility requests.
    const [records, facilityRows] = await Promise.all([
      listIssuanceRecords({ from: isoDay(new Date(Date.now() - YEAR_MS)), to: isoDay(new Date()) }),
      listFacilityFinanceReport(),
    ])
    const itemReturns = records
      .filter((record) => record.returnedQuantity > 0 || record.lostQuantity > 0 || record.issuanceStatus === 'Returned')
      .map((record) => ({
        id: `ret-${record.id}`,
        date: record.decidedAt || record.requestedAt,
        reference: record.itemCode,
        detail: `${record.itemName} · ${record.returnedQuantity} returned${record.lostQuantity ? `, ${record.lostQuantity} lost` : ''}`,
        person: record.employeeName,
        status: record.issuanceStatus,
      }))
    const facilityReturns = facilityRows
      .filter((row) => row.returnedAt && (row.returnedQuantity > 0 || row.lostQuantity > 0))
      .map((row, index) => facilityHistoryRow(
        row,
        'ret-fac',
        index,
        `${row.returnedQuantity} returned${row.lostQuantity ? `, ${row.lostQuantity} missing` : ''}${row.damagedQuantity ? `, ${row.damagedQuantity} damaged` : ''}`,
        row.lostQuantity ? 'Missing' : row.damagedQuantity ? 'Damaged' : 'Returned',
      ))
    return [...itemReturns, ...facilityReturns]
  }
  if (tab === 'facilities') {
    // Finished facility requests, plus borrowed equipment that has been returned or closed.
    const [facilityRequests, borrowings] = await Promise.all([
      listGsoRequests({ type: 'FACILITY_USE' }),
      listGsoRequests({ type: 'BORROWING' }),
    ])
    // The items each request took, e.g. "Laptop × 2, Projector × 1", so the history shows what was borrowed.
    const itemsText = (formData: Record<string, unknown> | undefined, key: 'equipment' | 'items') => {
      const list = (formData?.[key] as Array<{ name?: string; itemName?: string; quantity?: number }> | undefined) || []
      return list.map((row) => `${row.name || row.itemName || 'Item'} × ${row.quantity ?? 1}`).join(', ')
    }
    const facilityRows = facilityRequests
      .filter((request) => FACILITY_DONE.includes(request.status))
      .map((request) => {
        const items = itemsText(request.formData, 'equipment')
        return { id: `fac-${request.id}`, date: request.createdAt, reference: request.referenceNo, detail: request.title, items, person: request.requesterName, personEmail: request.requesterEmail, status: request.status }
      })
    const borrowRows = borrowings
      .filter((request) => BORROW_DONE.includes(request.status))
      .map((request) => {
        const items = itemsText(request.formData, 'items')
        return { id: `brw-${request.id}`, date: request.createdAt, reference: request.referenceNo, detail: request.title, items, person: request.requesterName, personEmail: request.requesterEmail, status: request.status }
      })
    return [...facilityRows, ...borrowRows]
  }
  if (tab === 'service') {
    // Every job on the GSO Service Workboard and the ITSS Support Queue, with who claimed it and when it closed.
    // A queue the user cannot open is skipped. The status filter narrows the list.
    const results = await Promise.allSettled((['GSO', 'ITSS'] as const).map((team) => listServiceWorkOrders({ team, limit: 200 })))
    return results
      .flatMap((result) => (result.status === 'fulfilled' ? result.value.workOrders : []))
      .map((order) => {
        const claimed = typeof order.claimedBy === 'string' ? order.claimedBy : order.claimedBy?.name
        const closed = order.closedAt ? `Closed ${formatDateTime(order.closedAt)}` : ''
        const detail = [order.title, order.routeTeam, claimed ? `Claimed by ${claimed}` : 'Not claimed', closed].filter(Boolean).join(' · ')
        return { id: `svc-${order.id}`, date: order.closedAt || order.completedAt || order.updatedAt || null, reference: order.referenceNo, detail, person: order.requester?.name || '—', status: order.status }
      })
  }
  if (tab === 'unserviceable') {
    // Every facility item that could not be repaired, whether it came back Unserviceable or was checked as Unserviceable.
    const rows = await listFacilityFinanceReport()
    return rows
      .filter((row) => unserviceableCount(row) > 0)
      .map((row, index) => {
        const value = Number(row.writeOffEstimatedValue)
        const money = value > 0 ? ` · ₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : ''
        // A waived write-off shows the GSO staff who checked it, taken from the reason ("... Checked by: <name>").
        const checkedBy = writeOffStatus(row) === 'Waived' ? ` · Checked by ${(row.writeOffReason || '').match(/Checked by: (.+)$/)?.[1] || 'not recorded'}` : ''
        // Only the unserviceable units are charged; the damaged units that were repaired are not.
        const breakdown = row.damagedQuantity > 0 ? ` (of ${row.damagedQuantity} damaged, ${row.repairedQuantity} repaired)` : ''
        return facilityHistoryRow(row, 'uns', index, `${unserviceableCount(row)} unserviceable${breakdown}${money}${checkedBy}`, writeOffStatus(row))
      })
  }
  if (tab === 'repair') {
    // Facility items checked as Needs Repair, with how many were repaired or found unserviceable.
    const rows = await listFacilityFinanceReport()
    return rows
      .filter((row) => row.condition === 'Needs Repair' && row.damagedQuantity > 0)
      .map((row, index) => {
        const pending = row.damagedQuantity - row.repairedQuantity - row.unserviceableQuantity
        return facilityHistoryRow(row, 'rep', index, `${row.damagedQuantity} damaged · ${row.repairedQuantity} repaired · ${row.unserviceableQuantity} unserviceable`, pending > 0 ? 'Needs Repair' : 'Done')
      })
  }
  if (tab === 'loss') {
    // Loss & Damage cases, plus facility items that came back missing.
    const { cases } = await listLossDamageCases()
    const caseRows = cases
      .filter((item) => LOSS_DONE.includes(item.status))
      .map((item) => ({ id: `loss-${item.id}`, date: item.updatedAt, reference: item.referenceNo, detail: `${item.title} · ${item.settlement?.resolution ?? 'No decision'}`, person: item.requesterName, status: item.status }))
    const missing = (await listFacilityFinanceReport())
      .filter((row) => row.lostQuantity > 0)
      .map((row, index) => facilityHistoryRow(row, 'lost', index, `${row.lostQuantity} missing`, 'Missing'))
    return [...caseRows, ...missing]
  }
  return []
}

const dateText = (value: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : formatDateTime(value)
}
// Local calendar day (YYYY-MM-DD) of a record, for the date filter.
const localDay = (value: string | null) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-CA') : ''
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
const downloadHistoryFile = (fileName: string, parts: BlobPart[], mimeType: string) => {
  const url = URL.createObjectURL(new Blob(parts, { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
type SortKey = 'newest' | 'oldest' | 'reference' | 'person'
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'reference', label: 'Reference A–Z' },
  { value: 'person', label: 'Person A–Z' },
]

export default function GsoHistory() {
  const [tab, setTab] = useState<TabKey>(() => {
    const requested = new URLSearchParams(window.location.search).get('tab') as TabKey | null
    return TABS.some((item) => item.key === requested) ? requested as TabKey : 'returns'
  })
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('oldest')
  // Employee first and last names by email, so the Person column shows a real name instead of the login name.
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({})
  useEffect(() => {
    listEmployees()
      .then(({ employees }) => setEmployeeNames(Object.fromEntries(employees.map((employee) => [employee.email.toLowerCase(), `${employee.firstName} ${employee.lastName}`.trim()]))))
      .catch(() => setEmployeeNames({}))
  }, [])
  const personName = (row: HistoryRow) => (row.personEmail && employeeNames[row.personEmail.toLowerCase()]) || row.person
  const current = TABS.find((item) => item.key === tab) ?? TABS[0]

  const selectModule = (key: TabKey) => {
    setTab(key)
    setSearch('')
    setStatusFilter('all')
    setDateFilter('')
    setSortKey('oldest')
  }

  useEffect(() => {
    window.history.replaceState(null, '', `/gso/history?tab=${tab}`)
    if (!current.ready) return
    let cancelled = false
    setLoading(true)
    setError('')
    loadRows(tab)
      .then((result) => { if (!cancelled) setRows(result) })
      .catch((reason: unknown) => { if (!cancelled) { setRows([]); setError(reason instanceof Error ? reason.message : 'The history could not be loaded.') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tab, current.ready])

  const statusOptions = useMemo(() => [...new Set(rows.map((row) => row.status))].sort(), [rows])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    const byNewest = (a: HistoryRow, b: HistoryRow) => (b.date ?? '').localeCompare(a.date ?? '')
    const sorted = [...rows].sort((a, b) => {
      if (sortKey === 'reference') return a.reference.localeCompare(b.reference, undefined, { numeric: true })
      if (sortKey === 'person') return a.person.localeCompare(b.person)
      if (sortKey === 'oldest') return byNewest(b, a)
      if (tab === 'unserviceable') return (writeOffRank[a.status] ?? 9) - (writeOffRank[b.status] ?? 9) || byNewest(a, b)
      return byNewest(a, b)
    })
    return sorted.filter((row) => (!query || `${row.reference} ${row.detail} ${row.person} ${row.status}`.toLowerCase().includes(query))
      && (statusFilter === 'all' || row.status === statusFilter)
      && (!dateFilter || localDay(row.date) === dateFilter))
  }, [rows, search, tab, sortKey, statusFilter, dateFilter])

  const reportName = current.label.replace(/[^a-z0-9]+/gi, '_')
  const today = new Date().toISOString().slice(0, 10)
  const reportCells = (row: HistoryRow) => [dateText(row.date), row.reference, row.detail, row.items || '', row.person, row.status]
  const exportCsv = () => {
    const lines = [['Date', 'Reference', 'Details', 'Items', 'Person', 'Status'], ...visible.map(reportCells)]
      .map((cells) => cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    downloadHistoryFile(`GSO_${reportName}_History_${today}.csv`, ['﻿', lines.join('\r\n')], 'text/csv;charset=utf-8')
  }
  const exportWord = () => {
    const body = visible.map((row) => `<tr>${reportCells(row).map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join('')}</tr>`).join('')
    const html = `<html><head><meta charset="utf-8"><title>${escapeHtml(current.label)} history</title></head><body><h2>${escapeHtml(current.label)} history</h2><p>${visible.length} record(s) · exported ${today}</p><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Arial;font-size:10pt"><thead><tr><th>Date</th><th>Reference</th><th>Details</th><th>Items</th><th>Person</th><th>Status</th></tr></thead><tbody>${body}</tbody></table></body></html>`
    downloadHistoryFile(`GSO_${reportName}_History_${today}.doc`, ['﻿', html], 'application/msword;charset=utf-8')
  }

  return <GsoPageFrame activePage="History" searchPlaceholder="Search history...">
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Records</span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">History</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-blue-100">Past activity for each module. Pick a module below.</p>
          <nav className="mt-5 flex flex-wrap gap-2 border-t border-blue-300/20 pt-4" aria-label="History modules">
            {TABS.map((item) => {
              const isActive = item.key === tab
              return <button
                key={item.key}
                type="button"
                onClick={() => selectModule(item.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-xl border px-4 py-2 text-xs font-extrabold transition ${isActive ? 'border-white bg-white text-blue-950 shadow-md' : 'border-white/15 bg-white/5 text-blue-100 hover:bg-white/12'}`}
              >
                {item.label}
              </button>
            })}
          </nav>
        </div>
      </section>

      {!current.ready && <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="text-sm font-extrabold text-slate-800">{current.label} history</p>
        <p className="mt-1 text-xs font-medium text-slate-500">Coming next. This module's history will appear here.</p>
      </section>}

      {current.ready && <section className="overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">{current.label} history</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Use the filters to narrow the list. Generate CSV or Word exports what is shown.</p>
            <span className="mt-2 inline-flex rounded-lg bg-blue-50 px-3 py-2 text-[0.65rem] font-extrabold text-blue-700">{loading ? 'Loading…' : `${visible.length} record(s) found`}</span>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block w-40">
              <span className="mb-1 block text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-500">Filter by date</span>
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label={`Filter ${current.label} history by date`} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
            </label>
            {dateFilter && <button type="button" aria-label="Clear date filter" onClick={() => setDateFilter('')} className="mb-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[0.65rem] font-bold text-slate-600 transition hover:bg-slate-100">Clear date</button>}
            <button type="button" onClick={exportCsv} disabled={loading || visible.length === 0} className="inline-flex min-h-9 min-w-40 items-center justify-center gap-1.5 rounded-lg bg-[#138548] px-4 py-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#0f7440] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0">
              <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h2M8 17h2M14 13h2M14 17h2" /></svg>
              Generate CSV
            </button>
            <button type="button" onClick={exportWord} disabled={loading || visible.length === 0} className="inline-flex min-h-9 min-w-40 items-center justify-center gap-1.5 rounded-lg bg-[#2d5aa3] px-4 py-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#264e8e] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0">
              <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></svg>
              Generate Word
            </button>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">Search</span>
              <div className="relative">
                <svg aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.75" cy="10.75" r="5.75" /><path d="m15.1 15.1 4.15 4.15" /></svg>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, detail, or person" className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 text-xs font-semibold text-slate-800 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                <option value="all">All statuses</option>
                {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">Sort by</span>
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {error && <p role="alert" className="px-5 py-4 text-xs font-bold text-rose-700">{error}</p>}
        {!error && !loading && visible.length === 0 && <p className="px-5 py-12 text-center text-xs font-semibold text-slate-500">{rows.length === 0
  ? tab === 'facilities'
    ? 'No borrowed equipment or facility requests yet. They will show up here once they are returned or completed.'
    : `No ${current.label.toLowerCase()} history yet.`
  : 'No records match these filters.'}</p>}
        {visible.length > 0 && <div className="max-h-144 overflow-auto border-t border-slate-100">
          <table className="w-full min-w-200 text-left text-xs">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5 sm:px-6">Person</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Date</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Reference</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Details</th>
                {tab === 'facilities' && <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Items borrowed</th>}
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => <tr key={row.id} className="border-t border-slate-100 text-slate-700 transition hover:bg-blue-50/50">
                <td className="px-5 py-4 sm:px-6">
                  <div className="flex min-w-40 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#17377f] text-[0.65rem] font-black text-white shadow-sm">{personName(row).split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'}</span>
                    <span className="font-semibold text-slate-800">{personName(row)}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-5 py-4 font-semibold">{dateText(row.date)}</td>
                <td className="px-5 py-4 font-extrabold text-slate-900">{row.reference}</td>
                <td className="max-w-md px-5 py-4 text-slate-600">{row.detail}</td>
                {tab === 'facilities' && <td className="max-w-md px-5 py-4 text-slate-700">{row.items || <span className="text-slate-400">No items listed</span>}</td>}
                <td className="px-5 py-4 sm:px-6"><span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${tab === 'unserviceable' ? writeOffTone(row.status) : 'bg-slate-100 text-slate-700'}`}>{row.status}</span></td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>}
    </div>
  </GsoPageFrame>
}
