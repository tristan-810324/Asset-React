import { useEffect, useState } from 'react'
import { GsoHeadPageFrame } from './gsoheadnavbar'
import { IssuanceProgressPath } from '../components/requestpath'
import {
  listIssuanceRecords,
  type ConfirmationMethod,
  type IssuanceRecord,
  type IssuanceRecordStatus,
} from '../gso/issuancesApi'

// The backend returns at most this many records per date range.
const recordLimit = 1000
const damagedConditions = ['Needs Repair', 'Under Maintenance', 'Unserviceable']

const statusTones: Record<IssuanceRecordStatus, string> = {
  'Pending acknowledgment': 'bg-amber-50 text-amber-700',
  Issued: 'bg-blue-50 text-blue-700',
  Overdue: 'bg-rose-50 text-rose-700',
  'Partially returned': 'bg-sky-50 text-sky-700',
  Returned: 'bg-emerald-50 text-emerald-700',
  Lost: 'bg-rose-50 text-rose-700',
  Consumed: 'bg-slate-100 text-slate-600',
  Rejected: 'bg-slate-100 text-slate-600',
  Expired: 'bg-slate-100 text-slate-600',
  'Email failed': 'bg-slate-100 text-slate-600',
}

const statusReportColors: Partial<Record<IssuanceRecordStatus, string>> = {
  'Pending acknowledgment': '#b45309',
  Issued: '#1d4ed8',
  Overdue: '#be123c',
  'Partially returned': '#0369a1',
  Returned: '#047857',
  Lost: '#be123c',
}

const confirmationLabels: Record<ConfirmationMethod, string> = {
  scan: 'Scanned',
  typed_code: 'Typed + employee code',
  employee_code: 'Employee code',
  admin_override: 'IT Admin override',
}

const statusFilters: { key: string; label: string; matches: (record: IssuanceRecord) => boolean }[] = [
  { key: 'all', label: 'All', matches: () => true },
  { key: 'out', label: 'Still out', matches: (record) => record.outQuantity > 0 },
  { key: 'overdue', label: 'Overdue', matches: (record) => record.isOverdue },
  { key: 'returned', label: 'Returned', matches: (record) => record.status === 'Returned' },
  { key: 'lost', label: 'With lost units', matches: (record) => record.lostQuantity > 0 },
  { key: 'pending', label: 'Pending acknowledgment', matches: (record) => record.status === 'Pending acknowledgment' },
  { key: 'not-issued', label: 'Rejected / expired', matches: (record) => ['Rejected', 'Expired', 'Email failed'].includes(record.status) },
]

const decisionTitles: Partial<Record<IssuanceRecord['issuanceStatus'], string>> = {
  Issued: 'Acknowledged by the employee',
  Returned: 'Acknowledged by the employee',
  Rejected: 'Rejected by the employee',
  Expired: 'Acknowledgment link expired',
  'Email Failed': 'Acknowledgment email could not be sent',
}

const dotTones = {
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-400',
}

type TimelineEvent = { at: string | null; title: string; detail: string; tone: keyof typeof dotTones }

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'Asia/Manila' })
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : `${dateFormat.format(date)} · ${timeFormat.format(date)}`
}

// A due date saved without a time comes back as midnight; show only the date for those.
function formatDue(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const time = timeFormat.format(date)
  return time === '12:00 AM' ? dateFormat.format(date) : `${dateFormat.format(date)} · ${time}`
}


const issuedAt = (record: IssuanceRecord) => record.decidedAt || record.requestedAt
const lastReturn = (record: IssuanceRecord) => [...record.returns].reverse().find((entry) => entry.status !== 'Voided')

function quantityBreakdown(record: IssuanceRecord) {
  return [
    record.outQuantity ? `${record.outQuantity} out` : '',
    record.returnedQuantity ? `${record.returnedQuantity} returned` : '',
    record.lostQuantity ? `${record.lostQuantity} lost` : '',
  ].filter(Boolean).join(' · ')
}

function buildTimeline(record: IssuanceRecord): TimelineEvent[] {
  const units = (quantity: number) => `${quantity} ${record.unitOfMeasure}`
  const events: TimelineEvent[] = [{
    at: record.requestedAt,
    title: `Issued ${units(record.quantity)} in ${record.conditionAtIssue} condition`,
    detail: [record.issuedBy ? `Prepared by ${record.issuedBy}` : '', record.issueNote || ''].filter(Boolean).join(' · '),
    tone: 'blue',
  }]
  const decisionTitle = decisionTitles[record.issuanceStatus]
  if (record.issuanceStatus === 'Pending') {
    events.push({ at: null, title: 'Waiting for the employee to acknowledge', detail: '', tone: 'amber' })
  } else if (decisionTitle && record.decidedAt) {
    const accepted = record.issuanceStatus === 'Issued' || record.issuanceStatus === 'Returned'
    events.push({ at: record.decidedAt, title: decisionTitle, detail: record.decisionNote || '', tone: accepted ? 'emerald' : 'slate' })
  }
  for (const entry of record.returns) {
    const how = [
      entry.tagCode,
      entry.processedBy ? `Processed by ${entry.processedBy}` : '',
      entry.confirmationMethod ? confirmationLabels[entry.confirmationMethod] : '',
      entry.returnedByName ? `Brought in by ${entry.returnedByName}` : '',
      entry.reason,
    ].filter(Boolean).join(' · ')
    if (entry.status === 'Voided') {
      events.push({ at: entry.returnedAt, title: `Return of ${units(entry.quantity)} voided`, detail: [entry.voidReason, how].filter(Boolean).join(' · '), tone: 'slate' })
    } else if (entry.status === 'Lost') {
      const pending = entry.settlementStatus === 'Pending' ? 'Settlement pending' : ''
      events.push({ at: entry.returnedAt, title: `${units(entry.quantity)} reported lost`, detail: [how, pending].filter(Boolean).join(' · '), tone: 'rose' })
      if (entry.settlementStatus && entry.settlementStatus !== 'Pending') {
        events.push({ at: entry.settledAt, title: `Lost item settled: ${entry.settlementStatus}`, detail: entry.settlementNote || '', tone: 'emerald' })
      }
    } else {
      const damaged = damagedConditions.includes(entry.condition)
      events.push({ at: entry.returnedAt, title: `Returned ${units(entry.quantity)} in ${entry.condition} condition`, detail: how, tone: damaged ? 'amber' : 'emerald' })
      if (entry.repairOutcome) {
        const repaired = entry.repairOutcome === 'Repaired'
        events.push({ at: entry.repairResolvedAt, title: repaired ? 'Repaired and back in stock' : 'Written off as beyond repair', detail: '', tone: repaired ? 'emerald' : 'slate' })
      }
    }
  }
  const time = (event: TimelineEvent) => (event.at ? Date.parse(event.at) : Number.MAX_SAFE_INTEGER)
  return events.sort((left, right) => time(left) - time(right))
}

function escapeHTML(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}

// Excel and Word both open an HTML table; only the wrapper and file type differ.
function downloadReport(kind: 'excel' | 'word', records: IssuanceRecord[], filterDescription: string) {
  const cell = 'padding:8px;border:1px solid #dbe3ef;vertical-align:top;'
  const small = (value: string) => (value ? `<br><span style="font-size:8pt;color:#64748b;">${escapeHTML(value)}</span>` : '')
  const generatedAt = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date())
  const summary: [string, number, string][] = [
    ['Records', records.length, '#09244a'],
    ['Still out', records.filter((record) => record.outQuantity > 0).length, '#1d4ed8'],
    ['Overdue', records.filter((record) => record.isOverdue).length, '#be123c'],
    ['Returned', records.filter((record) => record.status === 'Returned').length, '#047857'],
  ]
  const headers = ['Item / Barcode', 'Employee', 'Issued', 'Due', 'Quantity', 'Status', 'Last return']
  const rows = records.map((record, index) => {
    const last = lastReturn(record)
    return `<tr style="background:${index % 2 ? '#f8fafc' : '#ffffff'};page-break-inside:avoid;">
      <td style="${cell}"><strong>${escapeHTML(record.itemName)}</strong>${small(record.tagCodes.join(', ') || record.itemCode)}${small(record.category)}</td>
      <td style="${cell}"><strong>${escapeHTML(record.employeeName)}</strong>${small(`${record.employeeCode} · ${record.department}`)}</td>
      <td style="${cell}">${escapeHTML(formatDateTime(issuedAt(record)))}${small(`${record.conditionAtIssue}${record.issuedBy ? ` · by ${record.issuedBy}` : ''}`)}</td>
      <td style="${cell}${record.isOverdue ? 'color:#be123c;font-weight:bold;' : ''}">${escapeHTML(formatDue(record.dueAt))}</td>
      <td style="${cell}">${record.quantity} ${escapeHTML(record.unitOfMeasure)}${small(quantityBreakdown(record))}</td>
      <td style="${cell}font-weight:bold;color:${statusReportColors[record.status] || '#475569'};">${escapeHTML(record.status)}</td>
      <td style="${cell}">${last ? `${escapeHTML(formatDateTime(last.returnedAt))}${small(last.condition)}` : 'Not yet'}</td>
    </tr>`
  }).join('')
  const body = `
    <table style="width:100%;margin-bottom:14px;border-collapse:collapse;"><tr><td style="padding:18px 20px;background:#09244a;color:#ffffff;">
      <div style="font-size:9pt;font-weight:bold;letter-spacing:1px;color:#bfdbfe;">ASSET CUSTODY &amp; TRACKING</div>
      <h1 style="margin:7px 0 4px;font-size:22pt;color:#ffffff;">Issuance Records Report</h1>
      <div style="font-size:9pt;color:#dbeafe;">Generated ${escapeHTML(generatedAt)} · ${escapeHTML(filterDescription)}</div>
    </td></tr></table>
    <table style="width:100%;margin-bottom:16px;border-collapse:collapse;"><tr>${summary.map(([label, value, color]) => `
      <td style="${cell}background:#f8fafc;"><div style="font-size:8pt;color:${color};text-transform:uppercase;">${label}</div><strong style="font-size:16pt;color:${color};">${value}</strong></td>`).join('')}
    </tr></table>
    <table style="width:100%;border-collapse:collapse;font-size:9pt;">
      <thead><tr>${headers.map((header) => `<th style="padding:9px;background:#09244a;color:#ffffff;border:1px solid #09244a;text-align:left;">${header}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`
  const page = kind === 'word' ? '@page Section1 { size: 11in 8.5in; mso-page-orientation: landscape; margin: 0.45in; } div.Section1 { page: Section1; }' : ''
  const html = `<!DOCTYPE html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:${kind === 'excel' ? 'x' : 'w'}="urn:schemas-microsoft-com:office:${kind}" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><title>Issuance Records Report</title>
        <style>${page} body { font-family: Arial, sans-serif; color: #1e293b; font-size: 10pt; } thead { display: table-header-group; } td { mso-number-format: "\\@"; }</style>
      </head>
      <body><div class="Section1">${body}</div></body>
    </html>`
  const blob = new Blob(['﻿', html], { type: kind === 'excel' ? 'application/vnd.ms-excel;charset=utf-8' : 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Issuance_Records_${new Date().toISOString().slice(0, 10)}.${kind === 'excel' ? 'xls' : 'doc'}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function GsoHeadIssuanceRecord() {
  const [searchQuery, setSearchQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [loaded, setLoaded] = useState<{ key: string; records: IssuanceRecord[]; error: string } | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<IssuanceRecord | null>(null)

  useEffect(() => {
    let active = true
    const key = `${fromDate}|${toDate}`
    listIssuanceRecords({ from: fromDate, to: toDate })
      .then((records) => { if (active) setLoaded({ key, records, error: '' }) })
      .catch((error: unknown) => {
        if (active) setLoaded({ key, records: [], error: error instanceof Error ? error.message : 'Unable to load the issuance records.' })
      })
    return () => { active = false }
  }, [fromDate, toDate])

  useEffect(() => {
    if (!selectedRecord) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedRecord(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedRecord])

  const isLoading = loaded?.key !== `${fromDate}|${toDate}`
  const records = isLoading ? [] : loaded.records
  const loadError = isLoading ? '' : loaded.error
  const departments = [...new Set([...records.map((record) => record.department), ...(departmentFilter === 'all' ? [] : [departmentFilter])])]
    .filter(Boolean)
    .sort()
  const query = searchQuery.trim().toLowerCase()
  const activeStatus = statusFilters.find((filter) => filter.key === statusFilter) ?? statusFilters[0]
  const filteredRecords = records.filter((record) => activeStatus.matches(record)
    && (departmentFilter === 'all' || record.department === departmentFilter)
    && (!query || [record.itemName, record.itemCode, record.employeeName, record.employeeCode, ...record.tagCodes]
      .some((value) => value.toLowerCase().includes(query))))
  const hasFilters = Boolean(query || departmentFilter !== 'all' || statusFilter !== 'all' || fromDate || toDate)
  const filterDescription = [
    fromDate || toDate ? `Issued ${fromDate || 'any date'} to ${toDate || 'today'}` : '',
    statusFilter !== 'all' ? `Status: ${activeStatus.label}` : '',
    departmentFilter !== 'all' ? `Department: ${departmentFilter}` : '',
    query ? `Search: ${searchQuery.trim()}` : '',
  ].filter(Boolean).join(' · ') || 'All issuance records'

  function clearFilters() {
    setSearchQuery('')
    setDepartmentFilter('all')
    setStatusFilter('all')
    setFromDate('')
    setToDate('')
  }

  function exportReport(kind: 'excel' | 'word') {
    if (!filteredRecords.length) {
      alert(`There is no data to export to ${kind === 'excel' ? 'Excel' : 'Word'}.`)
      return
    }
    downloadReport(kind, filteredRecords, filterDescription)
  }

  const selectedDetails: [string, string][] = selectedRecord
    ? ([
        ['Employee', `${selectedRecord.employeeName} (${selectedRecord.employeeCode})`],
        ['Department', [selectedRecord.department, selectedRecord.position].filter(Boolean).join(' · ')],
        ['Barcode', selectedRecord.tagCodes.join(', ')],
        ['Item code', `${selectedRecord.itemCode} · ${selectedRecord.category}`],
        ['Quantity', [`${selectedRecord.quantity} ${selectedRecord.unitOfMeasure}`, quantityBreakdown(selectedRecord)].filter(Boolean).join(' · ')],
        ['Due back', selectedRecord.dueAt ? formatDue(selectedRecord.dueAt) : ''],
        ['Purpose', [selectedRecord.purpose, selectedRecord.useLocation].filter(Boolean).join(' · ')],
        ['Actual use', [selectedRecord.recipientLocation, selectedRecord.recipientPurpose].filter(Boolean).join(' · ')],
      ] as [string, string][]).filter(([, value]) => value)
    : []

  return (
    <GsoHeadPageFrame activePage="issuance">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
            Asset Custody &amp; Tracking
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Issuance Records</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
            Every issuance in one place: who has what, when it is due, and how it came back. Click a row for its full history.
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-6">
        <p className="mb-4 text-xs font-medium text-slate-500">Search or narrow the list by date, department, or status. Click a row to see its full history.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Search</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Item, barcode, employee name or code…"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Department</span>
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">All departments</option>
              {departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Issued from</span>
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => setFromDate(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Issued to</span>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
          {statusFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setStatusFilter(filter.key)}
              aria-pressed={statusFilter === filter.key}
              className={`rounded-full px-3 py-1.5 text-[0.68rem] font-extrabold transition ${statusFilter === filter.key ? 'bg-[#09244a] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {filter.label}
            </button>
          ))}
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="ml-auto text-[0.68rem] font-bold text-blue-700 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Issuance records</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">One card per issuance. Exports include only the cards shown.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportReport('excel')}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-[#138548] px-4 py-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-white shadow-md transition hover:bg-[#0f7440] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2"
            >
              Generate Excel
            </button>
            <button
              type="button"
              onClick={() => exportReport('word')}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-[#2d5aa3] px-4 py-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-white shadow-md transition hover:bg-[#264e8e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
            >
              Generate Word
            </button>
            <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-[0.65rem] font-extrabold text-blue-700" role="status">
              {isLoading ? 'Loading…' : `${filteredRecords.length} record(s)`}
            </span>
          </div>
        </div>
        {!isLoading && records.length >= recordLimit && (
          <p className="border-t border-amber-100 bg-amber-50 px-5 py-2 text-[0.68rem] font-semibold text-amber-800 sm:px-6">
            Showing the newest {recordLimit.toLocaleString('en-PH')} issuances. Use the issued from and to dates to see older ones.
          </p>
        )}

        <div className="inventory-list-scrollbar max-h-[60vh] space-y-2.5 overflow-y-auto overscroll-contain border-t border-slate-100 bg-slate-50/60 p-3 sm:p-4">
          {isLoading && <p className="py-8 text-center text-xs font-semibold text-slate-400">Loading issuance records…</p>}
          {loadError && <p role="alert" className="py-6 text-center text-xs font-semibold text-rose-700">{loadError}</p>}
          {filteredRecords.map((record) => {
            const last = lastReturn(record)
            return (
              <button
                key={record.id}
                type="button"
                onClick={() => setSelectedRecord(record)}
                className="block w-full rounded-xl border-2 border-slate-300/80 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-slate-900">{record.itemName}</span>
                    <span className="mt-1 block truncate text-xs font-bold text-blue-700">{record.employeeName} · {record.employeeCode}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{record.quantity} {record.unitOfMeasure} · {record.recipientLocation || 'No location'}</span>
                  </span>
                  <span className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.6rem] font-extrabold ${statusTones[record.status]}`}>{record.status}</span>
                </span>
                <span className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <span className="text-[0.62rem] font-medium text-slate-400">Issued {formatDateTime(issuedAt(record))} · {last ? `Returned ${formatDateTime(last.returnedAt)}` : 'Not yet returned'}</span>
                  <span className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[0.65rem] font-extrabold text-white shadow-sm">View details →</span>
                </span>
              </button>
            )
          })}
          {!isLoading && !loadError && !filteredRecords.length && (
            <p className="py-8 text-center text-xs font-semibold text-slate-400">No issuance records match the selected filters.</p>
          )}
        </div>
      </section>

      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm" onClick={() => setSelectedRecord(null)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="issuance-record-title"
            onClick={(event) => event.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
              <div>
                <p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-600">Issuance #{selectedRecord.id}</p>
                <h2 id="issuance-record-title" className="mt-1 text-base font-black text-slate-900">{selectedRecord.itemName}</h2>
                <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${statusTones[selectedRecord.status]}`}>{selectedRecord.status}</span>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setSelectedRecord(null)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="space-y-5 px-5 py-5">
              <dl className="grid grid-cols-2 gap-2">
                {selectedDetails.map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
                    <dd className="mt-1 wrap-break-word text-xs font-bold text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
              <IssuanceProgressPath status={selectedRecord.status} />
              <section aria-labelledby="issuance-timeline-title">
                <h3 id="issuance-timeline-title" className="text-[0.65rem] font-black uppercase tracking-wide text-slate-500">History</h3>
                <ol className="mt-3 space-y-4 border-l-2 border-slate-100 pl-4">
                  {buildTimeline(selectedRecord).map((event, index) => (
                    <li key={index} className="relative">
                      <span aria-hidden="true" className={`absolute -left-5.5 top-1 h-2.5 w-2.5 rounded-full ${dotTones[event.tone]}`} />
                      <p className="text-xs font-bold text-slate-800">{event.title}</p>
                      <p className="text-[0.62rem] font-semibold text-slate-400">{event.at ? formatDateTime(event.at) : 'Not yet'}</p>
                      {event.detail && <p className="mt-0.5 text-[0.65rem] leading-relaxed text-slate-600">{event.detail}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </aside>
        </div>
      )}
    </GsoHeadPageFrame>
  )
}
