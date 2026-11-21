import { useEffect, useMemo, useState } from 'react'
import { AdminPageFrame } from '../components/navbars/adminnavbar'
import { listMyAdminActivity, type MyActivityRecord } from './historyApi'

type SortKey = 'newest' | 'oldest'
type ModuleKey = 'users' | 'support' | 'repair'

// Each IT Admin module reads the audit entries of one kind of record.
const MODULES: { key: ModuleKey; label: string; entityTypes: string[] }[] = [
  { key: 'users', label: 'User management', entityTypes: ['user'] },
  { key: 'support', label: 'Support Queue', entityTypes: ['request'] },
  { key: 'repair', label: 'Repair & Maintenance', entityTypes: ['item'] },
]

const HEADERS = ['Date', 'Reference', 'Details', 'Action']
const HEADER_WIDTHS: Record<string, number> = { Date: 170, Reference: 240, Details: 380, Action: 130 }
const ATTENTION_ACTIONS = ['Deleted', 'Deactivated']
const DONE_ACTIONS = ['Created', 'Activated', 'Completed', 'Repaired', 'Confirmed', 'Returned', 'Approved', 'Verified']

const today = new Date().toLocaleDateString('en-CA')

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)

const downloadFile = (fileName: string, parts: BlobPart[], mimeType: string) => {
  const url = URL.createObjectURL(new Blob(parts, { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const localDay = (value: string) => new Date(value).toLocaleDateString('en-CA')

// "created" -> "Created", "deactivated" -> "Deactivated"
const actionLabel = (action: string) => {
  const text = action.replaceAll('_', ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '—'
}

const actionTone = (label: string) => ATTENTION_ACTIONS.includes(label)
  ? 'border-rose-300 bg-rose-50 text-rose-700'
  : DONE_ACTIONS.includes(label)
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-blue-200 bg-blue-50 text-blue-700'

const reportActionStyle = (label: string) => ATTENTION_ACTIONS.includes(label)
  ? 'background:#fff1f2;color:#be123c;'
  : DONE_ACTIONS.includes(label)
    ? 'background:#ecfdf5;color:#047857;'
    : 'background:#eff6ff;color:#1d4ed8;'

// The same styled report the GSO History exports use: a banner, a summary, then the table.
function reportParts(title: string, generatedAt: string, rows: string[][]) {
  const widths = HEADERS.map((label) => HEADER_WIDTHS[label] ?? 160)
  const totalWidth = widths.reduce((sum, width) => sum + width, 0)
  const columns = widths.map((width) => `<col style="width:${((width / totalWidth) * 100).toFixed(1)}%;">`).join('')
  const attention = rows.filter((cells) => ATTENTION_ACTIONS.includes(cells[HEADERS.length - 1])).length
  const header = `<table style="width:100%;margin-bottom:14px;border-collapse:collapse;"><tr><td colspan="${HEADERS.length}" style="padding:18px 20px;background:#09244a;color:#ffffff;">
    <div style="font-size:9pt;font-weight:bold;letter-spacing:1.2px;color:#bfdbfe;">ASSET CUSTODY &amp; TRACKING</div>
    <h1 style="margin:7px 0 4px;font-size:22pt;color:#ffffff;">${escapeHtml(title)}</h1>
    <div style="font-size:9pt;color:#dbeafe;">Generated ${escapeHtml(generatedAt)} · Actions performed by you as IT Admin</div>
  </td></tr></table>`
  const firstSpan = Math.ceil(HEADERS.length / 2)
  const tile = (label: string, value: number, background: string, color: string, span: number) => `<td colspan="${span}" style="padding:10px 12px;border:1px solid #dbe3ef;background:${background};"><div style="font-size:8pt;color:${color};text-transform:uppercase;">${label}</div><strong style="font-size:16pt;color:${color};">${value}</strong></td>`
  const summary = `<table style="width:100%;margin-bottom:16px;border-collapse:collapse;"><tr>${tile('Records in this report', rows.length, '#f8fafc', '#09244a', firstSpan)}${tile('Needs attention', attention, '#fff1f2', '#be123c', HEADERS.length - firstSpan)}</tr></table>`
  const head = HEADERS.map((label) => `<th style="padding:9px 10px;background:#09244a;color:#ffffff;border:1px solid #09244a;text-align:left;">${label}</th>`).join('')
  const body = rows.map((cells, index) => `<tr style="background:${index % 2 ? '#f8fafc' : '#ffffff'};">${cells.map((cell, column) => column === HEADERS.length - 1
    ? `<td style="padding:8px 10px;border:1px solid #dbe3ef;vertical-align:top;"><span style="${reportActionStyle(cell)}display:inline-block;padding:4px 7px;font-weight:bold;">${escapeHtml(cell)}</span></td>`
    : `<td style="padding:8px 10px;border:1px solid #dbe3ef;vertical-align:top;">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
  const table = `<table style="width:100%;border-collapse:collapse;font-size:9pt;table-layout:fixed;"><colgroup>${columns}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
  return { header, summary, table }
}

export default function AdminHistory() {
  const [records, setRecords] = useState<MyActivityRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [module, setModule] = useState<ModuleKey>('users')
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('newest')

  useEffect(() => {
    let active = true
    listMyAdminActivity()
      .then((activity) => { if (active) setRecords(activity) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load your history.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const current = MODULES.find((item) => item.key === module) ?? MODULES[0]

  const moduleRows = useMemo(() => records
    .filter((record) => current.entityTypes.includes(record.entityType))
    .map((record) => ({
      id: String(record.id),
      date: record.changedAt,
      day: localDay(record.changedAt),
      name: record.entityName,
      reference: record.entityKey ? `${record.entityName} · ${record.entityKey}` : record.entityName,
      details: record.reason || '—',
      action: actionLabel(record.action),
    })), [records, current])

  // Counts for the module buttons, so each one shows how many records it has.
  const moduleCounts = useMemo(() => Object.fromEntries(MODULES.map((item) => [
    item.key,
    records.filter((record) => item.entityTypes.includes(record.entityType)).length,
  ])) as Record<ModuleKey, number>, [records])

  const actionOptions = useMemo(() => [...new Set(moduleRows.map((row) => row.action))].sort(), [moduleRows])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = moduleRows.filter((row) => {
      if (actionFilter !== 'all' && row.action !== actionFilter) return false
      if (dateFilter && row.day !== dateFilter) return false
      if (query && !`${row.reference} ${row.details} ${row.action}`.toLowerCase().includes(query)) return false
      return true
    })
    return sortKey === 'oldest'
      ? [...filtered].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
      : filtered
  }, [moduleRows, search, actionFilter, dateFilter, sortKey])

  const exportRows = visible.map((row) => [formatDateTime(row.date), row.reference, row.details, row.action])
  const generatedAt = new Date().toLocaleString('en-PH')
  const title = `My ${current.label} history`
  const reportName = current.label.replaceAll(/[^A-Za-z0-9]+/g, '_').replaceAll(/^_|_$/g, '')

  const exportCsv = () => {
    const report = reportParts(title, generatedAt, exportRows)
    const workbook = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><meta name="ProgId" content="Excel.Sheet"><title>${escapeHtml(title)}</title><style>body { font-family: Calibri, Arial, sans-serif; color: #1e293b; } table { border-collapse: collapse; }</style></head><body>${report.header}${report.summary}${report.table}</body></html>`
    downloadFile(`IT_Admin_${reportName}_History_${today}.xls`, ['﻿', workbook], 'application/vnd.ms-excel;charset=utf-8')
  }

  const exportWord = () => {
    const report = reportParts(title, generatedAt, exportRows)
    const wordDocument = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page Section1 { size: 11in 8.5in; mso-page-orientation: landscape; margin: 0.45in; } div.Section1 { page: Section1; } body { font-family: Arial, sans-serif; color: #1e293b; font-size: 10pt; } table { border-collapse: collapse; } thead { display: table-header-group; } tr { page-break-inside: avoid; }</style></head><body><div class="Section1">${report.header}${report.summary}${report.table}</div></body></html>`
    downloadFile(`IT_Admin_${reportName}_History_${today}.doc`, ['﻿', wordDocument], 'application/msword;charset=utf-8')
  }

  const changeModule = (key: ModuleKey) => {
    setModule(key)
    setSearch('')
    setActionFilter('all')
    setDateFilter('')
  }

  return (
    <AdminPageFrame activePath="/admin/history" pageName="History" subtitle="Actions you performed as IT Admin">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Records
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">History</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-blue-100">Past activity for each module. Pick a module below.</p>
          <nav className="mt-5 flex flex-wrap gap-2 border-t border-blue-300/20 pt-4" aria-label="History modules">
            {MODULES.map((item) => {
              const isActive = item.key === module
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => changeModule(item.key)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`rounded-xl border px-4 py-2 text-xs font-extrabold transition ${isActive ? 'border-white bg-white text-blue-950 shadow-md' : 'border-white/15 bg-white/5 text-blue-100 hover:bg-white/12'}`}
                >
                  {item.label} <span className="opacity-70">({loading ? '…' : moduleCounts[item.key]})</span>
                </button>
              )
            })}
          </nav>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
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
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, detail, or action" className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 text-xs font-semibold text-slate-800 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">Action</span>
              <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                <option value="all">All actions</option>
                {actionOptions.map((action) => <option key={action} value={action}>{action}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">Sort by</span>
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
          </div>
        </div>

        {error && <p role="alert" className="px-5 py-4 text-xs font-bold text-rose-700">{error}</p>}
        {!error && !loading && visible.length === 0 && <p className="px-5 py-12 text-center text-xs font-semibold text-slate-500">{moduleRows.length === 0 ? `No ${current.label.toLowerCase()} history yet.` : 'No records match these filters.'}</p>}
        {visible.length > 0 && <div className="max-h-144 overflow-auto border-t border-slate-100">
          <table className="w-full min-w-200 text-left text-xs">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5 sm:px-6">Date</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Reference</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Details</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((row) => (
                <tr key={row.id} className="align-top transition hover:bg-blue-50/40">
                  <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700 sm:px-6">{formatDateTime(row.date)}</td>
                  <td className="px-5 py-4">
                    <p className="font-extrabold text-slate-900">{row.name}</p>
                    {row.reference !== row.name && <p className="mt-0.5 text-[0.68rem] text-slate-500">{row.reference.replace(`${row.name} · `, '')}</p>}
                  </td>
                  <td className="max-w-md px-5 py-4 leading-relaxed text-slate-600">{row.details}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[0.65rem] font-extrabold ${actionTone(row.action)}`}>{row.action}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </section>
    </AdminPageFrame>
  )
}
