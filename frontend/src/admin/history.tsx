import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AdminPageFrame } from '../components/navbars/adminnavbar'
import { listServiceWorkOrders, type ServiceWorkOrder } from '../gso/serviceWorkboardApi'
import { listAuditLogs, type AuditLogEntry } from './auditLogsApi'
import { listMyAdminActivity, type MyActivityRecord } from './historyApi'
import { getRequesterIdentityPicture, listRequesterIdentityReviews, type RequesterIdentity } from '../requesters/requesterApi'

type SortKey = 'newest' | 'oldest' | 'reference' | 'person'
type ModuleKey = 'users' | 'support' | 'repair'
// One history row. Service Workboard rows are the ITSS jobs; the other modules are the IT Admin's own audit entries.
type HistoryRow = { id: string; date: string | null; reference: string; detail: string; person: string; status: string; service?: { title: string; claimedBy: string | null; closedAt: string | null }; approvedBy?: string; identity?: RequesterIdentity }
// One table column: the header, the plain text used by the exports, and the cell as it looks on screen.
type TableColumn = { label: string; text: (row: HistoryRow) => string; render: (row: HistoryRow, index: number) => ReactNode }

// The Service Workboard module lists the ITSS jobs, the same list as the Support Queue. The other two read the audit entries.
const MODULES: { key: ModuleKey; label: string; entityTypes: string[] }[] = [
  { key: 'users', label: 'User management', entityTypes: ['user'] },
  { key: 'support', label: 'Service Workboard', entityTypes: [] },
  { key: 'repair', label: 'Repair & Maintenance', entityTypes: ['item'] },
]
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'reference', label: 'Reference A–Z' },
  { value: 'person', label: 'Person A–Z' },
]
// Status colours, the same as the GSO Service Workboard history.
const STATUS_TONE: Record<string, string> = {
  'In Progress': 'bg-blue-50 text-blue-700',
  'Awaiting Requester Confirmation': 'bg-violet-50 text-violet-700',
  Closed: 'bg-emerald-50 text-emerald-700',
  Completed: 'bg-emerald-50 text-emerald-700',
  Rejected: 'bg-rose-50 text-rose-700',
  Cancelled: 'bg-rose-50 text-rose-700',
  'Needs Information': 'bg-amber-50 text-amber-700',
  'Needs Correction': 'bg-amber-50 text-amber-700',
}
const ATTENTION_STATUSES = ['Deleted', 'Deactivated', 'Rejected', 'Cancelled']
const DONE_STATUSES = ['Created', 'Activated', 'Completed', 'Closed', 'Repaired', 'Confirmed', 'Returned', 'Approved', 'Verified']
const statusTone = (status: string) => STATUS_TONE[status] ?? (ATTENTION_STATUSES.includes(status)
  ? 'bg-rose-50 text-rose-700'
  : DONE_STATUSES.includes(status) ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700')
// Status meanings in plain words, shown under the status in the record popup (same as the GSO History popup).
const STATUS_NOTE: Record<string, string> = {
  Created: 'The record was created.',
  Updated: 'The record was updated.',
  Activated: 'The account is active.',
  Deactivated: 'The account is deactivated.',
  Deleted: 'The record was deleted.',
  Approved: 'The request was approved.',
  Verified: 'The account is verified.',
  Completed: 'The work is completed.',
  Closed: 'The job is closed.',
  'In Progress': 'The work is in progress.',
  Repaired: 'Repaired and back in stock.',
  Returned: 'Returned to GSO.',
  Rejected: 'The request was rejected.',
  Cancelled: 'The request was cancelled.',
  'Needs Information': 'More information is needed from the requester.',
  'Needs Correction': 'Sent back for correction.',
}

const HISTORY_WIDTHS: Record<string, number> = { Name: 170, Person: 170, 'Date & time': 150, Reference: 150, Details: 260, Status: 130 }

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

const isValidDate = (value: string | null) => Boolean(value) && !Number.isNaN(new Date(value as string).getTime())
const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const dateText = (value: string | null) => (isValidDate(value) ? formatDateTime(value as string) : '—')
const localDay = (value: string | null) => (isValidDate(value) ? new Date(value as string).toLocaleDateString('en-CA') : '')

// "created" -> "Created", "deactivated" -> "Deactivated"
const actionLabel = (action: string) => {
  const text = action.replaceAll('_', ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '—'
}
const historyAvatarTone = (index: number) => (index % 2 === 0
  ? 'border-[#d6b333] bg-[#17377f] text-white'
  : 'border-[#17377f] bg-[#d6b333] text-[#17377f]')
const initialsOf = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—'

const serviceRow = (order: ServiceWorkOrder): HistoryRow => {
  const claimed = typeof order.claimedBy === 'string' ? order.claimedBy : order.claimedBy?.name
  return {
    id: `svc-${order.id}`,
    date: order.closedAt || order.completedAt || order.updatedAt || null,
    reference: order.referenceNo,
    detail: order.title,
    person: order.requester?.name || '—',
    status: order.status,
    service: { title: order.title, claimedBy: claimed || null, closedAt: order.closedAt || null },
  }
}
const auditRow = (record: MyActivityRecord): HistoryRow => ({
  id: String(record.id),
  date: record.changedAt,
  reference: record.entityKey || '—',
  detail: record.reason || '—',
  person: record.entityName,
  status: actionLabel(record.action),
})

// The name as the requester entered it: first, middle, last, and suffix.
const requesterFullName = (identity: RequesterIdentity) => [identity.firstName, identity.middleName, identity.lastName, identity.suffix]
  .map((part) => part?.trim()).filter(Boolean).join(' ') || identity.accountName
// Requester accounts verified or sent back for correction, the same records as the GSO Employees tab.
// The review list adds each account's full name and profile; without it the rows keep the login name.
async function loadEmployeeRows(): Promise<HistoryRow[]> {
  const [page, identities] = await Promise.all([
    listAuditLogs({ limit: 100, offset: 0, action: 'all', entityType: 'employee', flag: 'all', search: '', from: '', to: '' }),
    listRequesterIdentityReviews().catch((): RequesterIdentity[] => []),
  ])
  const identityByUser = new Map(identities.map((identity) => [String(identity.userId), identity]))
  return page.logs
    .filter((log) => log.newValues?.requesterVerification === true)
    .map((log) => {
      const identity = identityByUser.get(String(log.entityId))
      return {
        id: `emp-${log.id}`,
        date: log.changedAt,
        reference: `ACC-${log.entityId}`,
        detail: log.reason,
        person: identity ? requesterFullName(identity) : log.entityName,
        status: log.newValues.status === 'Verified' ? 'Verified' : log.newValues.status === 'Rejected' ? 'Rejected' : 'Needs Correction',
        approvedBy: typeof log.newValues.reviewerName === 'string' ? log.newValues.reviewerName : (log.changedBy || 'GSO'),
        identity,
      }
    })
}
// The employee's photo from the requester profile, shown in the record popup. Nothing shows when there is no photo.
function EmployeePhoto({ userId, name }: { userId: string | number; name: string }) {
  const [picture, setPicture] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getRequesterIdentityPicture(userId)
      .then((value) => { if (active) setPicture(value) })
      .catch(() => { if (active) setPicture(null) })
    return () => { active = false }
  }, [userId])
  return picture
    ? <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5"><img src={picture} alt={`Photo of ${name}`} className="h-28 w-28 rounded-2xl border border-slate-200 bg-slate-50 object-cover" /></section>
    : null
}

const reportStatusStyle = (status: string) => ATTENTION_STATUSES.includes(status)
  ? 'background:#fff1f2;color:#be123c;'
  : DONE_STATUSES.includes(status) ? 'background:#ecfdf5;color:#047857;' : 'background:#eff6ff;color:#1d4ed8;'

// The styled report used by both exports, the same look as the GSO History exports.
function reportParts({ title, note, generatedAt, headers, rows }: { title: string; note: string; generatedAt: string; headers: string[]; rows: string[][] }) {
  const statusIndex = headers.length - 1
  const widths = headers.map((label) => HISTORY_WIDTHS[label] ?? 160)
  const attention = rows.filter((cells) => ATTENTION_STATUSES.includes(cells[statusIndex])).length
  const header = `<table style="width:100%;margin-bottom:14px;border-collapse:collapse;"><tr><td colspan="${headers.length}" style="padding:18px 20px;background:#09244a;color:#ffffff;">
    <div style="font-size:9pt;font-weight:bold;letter-spacing:1.2px;color:#bfdbfe;">ASSET CUSTODY &amp; TRACKING</div>
    <h1 style="margin:7px 0 4px;font-size:22pt;color:#ffffff;">${escapeHtml(title)}</h1>
    <div style="font-size:9pt;color:#dbeafe;">Generated ${escapeHtml(generatedAt)} · ${escapeHtml(note)}</div>
  </td></tr></table>`
  // The two tiles split the table's width between them, so they line up with the columns in Excel and Word.
  const firstSpan = Math.ceil(headers.length / 2)
  const tile = (label: string, value: number, background: string, color: string, span: number) => `<td colspan="${span}" style="padding:10px 12px;border:1px solid #dbe3ef;background:${background};"><div style="font-size:8pt;color:${color};text-transform:uppercase;">${label}</div><strong style="font-size:16pt;color:${color};">${value}</strong></td>`
  const summary = `<table style="width:100%;margin-bottom:16px;border-collapse:collapse;"><tr>${tile('Records in this report', rows.length, '#f8fafc', '#09244a', firstSpan)}${tile('Needs attention', attention, '#fff1f2', '#be123c', headers.length - firstSpan)}</tr></table>`
  // Columns take their share of the full table width, so Word and Excel fill the same space as the banner.
  const totalWidth = widths.reduce((sum, width) => sum + width, 0)
  const columns = widths.map((width) => `<col style="width:${((width / totalWidth) * 100).toFixed(1)}%;">`).join('')
  const head = headers.map((label) => `<th style="padding:9px 10px;background:#09244a;color:#ffffff;border:1px solid #09244a;text-align:left;">${escapeHtml(label)}</th>`).join('')
  const body = rows.map((cells, index) => `<tr style="background:${index % 2 ? '#f8fafc' : '#ffffff'};">${cells.map((cell, column) => column === statusIndex
    ? `<td style="padding:8px 10px;border:1px solid #dbe3ef;vertical-align:top;"><span style="${reportStatusStyle(cell)}display:inline-block;padding:4px 7px;font-weight:bold;">${escapeHtml(cell)}</span></td>`
    : `<td style="padding:8px 10px;border:1px solid #dbe3ef;vertical-align:top;">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
  const table = `<table style="width:100%;border-collapse:collapse;font-size:9pt;table-layout:fixed;"><colgroup>${columns}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
  return { header, summary, table }
}

export default function AdminHistory() {
  const [records, setRecords] = useState<MyActivityRecord[]>([])
  const [serviceRows, setServiceRows] = useState<HistoryRow[]>([])
  const [employeeRows, setEmployeeRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [module, setModule] = useState<ModuleKey>('users')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('oldest')
  // The record popup and its audit trail. The audit list is keyed by the record, so an old list never shows for a new record.
  const [detailRow, setDetailRow] = useState<HistoryRow | null>(null)
  const [detailAudit, setDetailAudit] = useState<{ key: string; logs: AuditLogEntry[] } | null>(null)

  useEffect(() => {
    let active = true
    // One module failing does not hide the other; the error shows once.
    Promise.allSettled([listMyAdminActivity(), listServiceWorkOrders({ team: 'ITSS', limit: 100 }), loadEmployeeRows()])
      .then(([activity, service, employees]) => {
        if (!active) return
        if (activity.status === 'fulfilled') setRecords(activity.value)
        if (service.status === 'fulfilled') setServiceRows(service.value.workOrders.map(serviceRow))
        if (employees.status === 'fulfilled') setEmployeeRows(employees.value)
        const failed = [activity, service, employees].find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failed) setError(failed.reason instanceof Error ? failed.reason.message : 'Unable to load the history.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!detailRow) return
    let active = true
    const key = detailRow.id
    // The audit search matches the login name, not the ACC- label, so an employee's activity is found by its login name.
    listAuditLogs({ limit: 20, offset: 0, action: 'all', entityType: 'all', flag: 'all', search: detailRow.identity?.accountName || detailRow.reference, from: '', to: '' })
      .then((page) => { if (active) setDetailAudit({ key, logs: page.logs }) })
      .catch(() => { if (active) setDetailAudit({ key, logs: [] }) })
    return () => { active = false }
  }, [detailRow])

  const current = MODULES.find((item) => item.key === module) ?? MODULES[0]
  const moduleRows = useMemo<HistoryRow[]>(() => {
    if (module === 'support') return serviceRows
    const audit = records.filter((record) => current.entityTypes.includes(record.entityType)).map(auditRow)
    return module === 'users' ? [...employeeRows, ...audit] : audit
  }, [module, records, serviceRows, employeeRows, current])
  const statusOptions = useMemo(() => [...new Set(moduleRows.map((row) => row.status))].sort(), [moduleRows])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    const byNewest = (a: HistoryRow, b: HistoryRow) => (b.date ?? '').localeCompare(a.date ?? '')
    const sorted = [...moduleRows].sort((a, b) => {
      if (sortKey === 'reference') return a.reference.localeCompare(b.reference, undefined, { numeric: true })
      if (sortKey === 'person') return a.person.localeCompare(b.person)
      if (sortKey === 'oldest') return byNewest(b, a)
      return byNewest(a, b)
    })
    return sorted.filter((row) => (!query || `${row.reference} ${row.detail} ${row.person} ${row.status}`.toLowerCase().includes(query))
      && (statusFilter === 'all' || row.status === statusFilter)
      && (!dateFilter || localDay(row.date) === dateFilter))
  }, [moduleRows, search, statusFilter, dateFilter, sortKey])

  const personColumn: TableColumn = {
    label: module === 'repair' ? 'Name' : 'Person',
    text: (row) => row.person,
    render: (row, index) => (
      <div className="flex min-w-52 items-center gap-3">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 text-xs font-black shadow-sm ${historyAvatarTone(index)}`}>{initialsOf(row.person)}</span>
        <span className="min-w-0 text-xs font-extrabold text-slate-800">{row.person}</span>
      </div>
    ),
  }
  const dateColumn: TableColumn = {
    label: 'Date & time',
    text: (row) => dateText(row.date),
    render: (row) => <span className="block whitespace-nowrap text-xs font-semibold text-slate-700">{dateText(row.date)}</span>,
  }
  const referenceColumn: TableColumn = {
    label: 'Reference',
    text: (row) => row.reference,
    render: (row) => <span className="block text-xs font-extrabold text-slate-900">{row.reference}</span>,
  }
  // Service jobs show their title with team, claim and close chips; the other modules show the reason.
  const detailsColumn: TableColumn = {
    label: 'Details',
    text: (row) => (row.service ? row.service.title : row.detail),
    render: (row) => (row.service
      ? (
        <div className="max-w-md">
          <p className="truncate text-xs font-bold text-slate-900" title={row.service.title}>{row.service.title || 'Service request'}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[0.6rem] font-extrabold text-indigo-700">ITSS Support</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-bold text-slate-600">{row.service.claimedBy ? `Claimed by ${row.service.claimedBy}` : 'Not claimed'}</span>
            {row.service.closedAt && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] font-bold text-slate-600">Closed {dateText(row.service.closedAt)}</span>}
          </div>
        </div>
      )
      : <span className="block max-w-md text-xs text-slate-600">{row.detail}</span>),
  }
  const statusColumn: TableColumn = {
    label: 'Status',
    text: (row) => row.status,
    render: (row) => <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${statusTone(row.status)}`}>{row.status}</span>,
  }
  // Same columns and order as the table on screen, for the CSV and Word exports too.
  const employeeIdColumn: TableColumn = {
    label: 'Employee ID',
    text: (row) => row.identity?.employeeCode || '—',
    render: (row) => <span className="block whitespace-nowrap text-xs font-extrabold text-slate-900">{row.identity?.employeeCode || '—'}</span>,
  }
  const approvedByColumn: TableColumn = {
    label: 'Approved by',
    text: (row) => row.approvedBy || '—',
    render: (row) => <span className="text-xs font-semibold text-slate-800">{row.approvedBy || '—'}</span>,
  }
  const positionColumn: TableColumn = {
    label: 'Position',
    text: (row) => row.identity?.position || '—',
    render: (row) => <span className="block text-xs font-semibold text-slate-700">{row.identity?.position || '—'}</span>,
  }
  // User management: the requester accounts, the same table as the GSO Employees tab. The other modules keep their columns.
  const columns: TableColumn[] = module === 'users'
    ? [employeeIdColumn, personColumn, approvedByColumn, positionColumn, statusColumn]
    : [personColumn, dateColumn, referenceColumn, detailsColumn, statusColumn]
  const reportName = current.label.replace(/[^a-z0-9]+/gi, '_')
  const reportTitle = `${current.label} History`
  const reportNote = dateFilter ? `Filtered by date: ${dateFilter}` : 'Includes the records matching the selected filters'
  const reportGeneratedAt = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())
  const reportHeaders = columns.map((column) => column.label)
  const reportRows = visible.map((row) => columns.map((column) => column.text(row)))

  const exportCsv = () => {
    const report = reportParts({ title: reportTitle, note: reportNote, generatedAt: reportGeneratedAt, headers: reportHeaders, rows: reportRows })
    const workbook = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><meta name="ProgId" content="Excel.Sheet"><title>${escapeHtml(reportTitle)}</title><style>body { font-family: Calibri, Arial, sans-serif; color: #1e293b; } table { border-collapse: collapse; }</style></head><body>${report.header}${report.summary}${report.table}</body></html>`
    downloadFile(`IT_Admin_${reportName}_Styled_Report_${today}.xls`, ['﻿', workbook], 'application/vnd.ms-excel;charset=utf-8')
  }

  const exportWord = () => {
    const report = reportParts({ title: reportTitle, note: reportNote, generatedAt: reportGeneratedAt, headers: reportHeaders, rows: reportRows })
    const wordDocument = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escapeHtml(reportTitle)}</title><style>@page Section1 { size: 11in 8.5in; mso-page-orientation: landscape; margin: 0.45in; } div.Section1 { page: Section1; } body { font-family: Arial, sans-serif; color: #1e293b; font-size: 10pt; } table { border-collapse: collapse; } thead { display: table-header-group; } tr { page-break-inside: avoid; }</style></head><body><div class="Section1">${report.header}${report.summary}${report.table}</div></body></html>`
    downloadFile(`IT_Admin_${reportName}_Styled_Report_${today}.doc`, ['﻿', wordDocument], 'application/msword;charset=utf-8')
  }

  // An employee's popup shows everything the requester profile and its review hold (the same facts as the GSO Employees popup).
  const employeeFactsOf = (row: HistoryRow, identity: RequesterIdentity) => [
    { label: 'Full name', value: row.person },
    { label: 'Login name', value: identity.accountName || '—' },
    { label: 'Email', value: identity.accountEmail || '—' },
    { label: 'Employee code', value: identity.employeeCode || '—' },
    { label: 'Department / office', value: identity.department || '—' },
    { label: 'Position', value: identity.position || '—' },
    { label: 'Contact number', value: identity.contactNumber || '—' },
    { label: 'Submitted', value: dateText(identity.submittedAt) },
    { label: 'Reviewed by', value: row.approvedBy || '—' },
    { label: 'Reviewed', value: dateText(row.date) },
    { label: 'Result', value: row.detail, wide: true },
    identity.reviewNote ? { label: 'Review note', value: identity.reviewNote, wide: true } : null,
  ].filter((fact): fact is { label: string; value: string; wide?: boolean } => Boolean(fact))
  // The facts shown in the record popup. Only the ones this record has are listed.
  const factsOf = (row: HistoryRow): { label: string; value: string; wide?: boolean }[] => (row.identity ? employeeFactsOf(row, row.identity) : [
    { label: module === 'support' ? 'Person' : 'Name', value: row.person, wide: false },
    { label: 'Date & time', value: dateText(row.date), wide: false },
    { label: 'Reference', value: row.reference, wide: false },
    { label: 'Details', value: row.service?.title || row.detail, wide: true },
  ])

  const changeModule = (key: ModuleKey) => {
    setModule(key)
    setSearch('')
    setStatusFilter('all')
    setDateFilter('')
    setSortKey('oldest')
  }

  return (
    <AdminPageFrame activePath="/admin/history" pageName="History" subtitle="Past activity in the IT Admin console">
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" /><div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border-18 border-white/4" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-[40%] h-64 w-64 rounded-full border-22 border-white/3" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Records</span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">History</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-blue-100">Past activity for each module. Pick a module below.</p>
            <nav className="mt-5 flex flex-wrap gap-2 border-t border-blue-300/20 pt-4" aria-label="History modules">
              {MODULES.map((item) => {
                const isActive = item.key === module
                return <button
                  key={item.key}
                  type="button"
                  onClick={() => changeModule(item.key)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`rounded-xl border px-4 py-2 text-xs font-extrabold transition ${isActive ? 'border-white bg-white text-blue-950 shadow-md' : 'border-white/15 bg-white/5 text-blue-100 hover:bg-white/12'}`}
                >
                  {item.label}
                </button>
              })}
            </nav>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900">{current.label} history</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">Click on any row to open the full record and its audit trail. Generate CSV or Word exports what is shown.</p>
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
          {!error && !loading && visible.length === 0 && <p className="px-5 py-12 text-center text-xs font-semibold text-slate-500">{moduleRows.length === 0 ? `No ${current.label.toLowerCase()} history yet.` : 'No records match these filters.'}</p>}
          {visible.length > 0 && <div className="inventory-list-scrollbar max-h-144 overflow-auto border-t border-slate-100">
            <table className="min-w-200 w-full text-left">
              <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  {columns.map((column, index) => <th key={column.label} className={`sticky top-0 z-10 bg-slate-50 px-5 py-3.5 ${index === 0 || index === columns.length - 1 ? 'sm:px-6' : ''}`}>{column.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, rowIndex) => (
                  <tr key={row.id} onClick={() => setDetailRow(row)} className="cursor-pointer border-t border-slate-100 transition hover:bg-blue-50/50">
                    {columns.map((column, index) => <td key={column.label} className={`px-5 py-4 ${index === 0 || index === columns.length - 1 ? 'sm:px-6' : ''}`}>{column.render(row, rowIndex)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}

          {detailRow && <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailRow(null) }}>
            <section role="dialog" aria-modal="true" aria-labelledby="admin-history-detail-title" className="flex max-h-[88vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl shadow-slate-950/30">
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 text-sm font-black ${historyAvatarTone(0)}`}>{initialsOf(detailRow.person)}</div>
                  <div className="min-w-0">
                    <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">{current.label}</p>
                    <h2 id="admin-history-detail-title" className="mt-0.5 truncate text-lg font-black text-slate-900">{detailRow.identity ? detailRow.person : (detailRow.service?.title || detailRow.detail || detailRow.reference)}</h2>
                    {!detailRow.identity && <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{detailRow.reference}</p>}
                  </div>
                </div>
                <button type="button" onClick={() => setDetailRow(null)} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50">Close</button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 px-4 py-5 sm:px-6">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                  <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                    {!(detailRow.identity && detailRow.status === 'Verified') && <span className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${statusTone(detailRow.status)}`}>{detailRow.status}</span>}
                    {STATUS_NOTE[detailRow.status] && <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-700">{STATUS_NOTE[detailRow.status]}</p>}
                    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                      {factsOf(detailRow).map((fact) => (
                        <div key={fact.label} className={`rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 shadow-md shadow-slate-300/35 ${fact.wide ? 'sm:col-span-2' : ''}`}>
                          <dt className="text-xs font-semibold text-slate-500">{fact.label}</dt>
                          <dd className="mt-1 wrap-break-word text-sm font-bold text-slate-900">{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  <div className="space-y-4">
                  {detailRow.identity && detailRow.status === 'Verified' && <section className="rounded-2xl border-2 border-blue-200 bg-blue-50/60 p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                    <span className="inline-flex rounded-full border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-extrabold text-white">Verified</span>
                    <p className="mt-3 text-sm font-black text-blue-950">Approved by {detailRow.approvedBy || '—'}</p>
                    <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-700">{dateText(detailRow.date)}</p>
                  </section>}
                  {detailRow.identity && <EmployeePhoto key={detailRow.id} userId={detailRow.identity.userId} name={detailRow.person} />}
                  <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                    <h3 className="text-sm font-extrabold text-slate-900">Activity</h3>
                    <p className="mt-0.5 text-xs text-slate-500">What happened to this record, newest first.</p>
                    <div className="mt-4 max-h-72 overflow-y-auto pr-2">
                      {detailAudit?.key === detailRow.id
                        ? detailAudit.logs.length === 0
                          ? <p className="text-sm font-semibold text-slate-500">No activity recorded for this yet.</p>
                          : <ol className="ml-2 space-y-4 border-l-2 border-slate-100">
                            {detailAudit.logs.map((log) => (
                              <li key={log.id} className="relative pl-6">
                                <span aria-hidden="true" className="absolute -left-1.75 top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow" />
                                <p className="text-sm font-semibold leading-relaxed text-slate-800">{log.reason || log.action}</p>
                                <p className="mt-1 text-xs text-slate-500">{log.changedBy || 'System'} · {dateText(log.changedAt)}</p>
                              </li>
                            ))}
                          </ol>
                        : <p className="text-sm font-semibold text-slate-500">Loading activity…</p>}
                    </div>
                  </section>
                  </div>
                </div>
              </div>
            </section>
          </div>}
        </section>
      </div>
    </AdminPageFrame>
  )
}
