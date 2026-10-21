import { useEffect, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { listDepartments, listEmployees } from './employeesApi'
import { listEmployeeIssuances } from './issuancesApi'
import { listInventoryItems } from './inventoryApi'

const initialDepartments = [
  'Registrar Office',
  'IT Services',
  'Science Department',
  'Finance Office',
  'Property & Supply',
  'Academic Affairs',
  'Human Resources',
]

type ReturnedItemRecord = {
  code: string
  asset: string
  category: string
  returnedBy: string
  department: string
  returnedDate: string
  returnCondition: string
  reason: string
  issuedTo: string
  status: string
  statusTone: string
}

function formatReturnedDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { date: value || '—', time: '—' }
  return {
    date: new Intl.DateTimeFormat('en-US', {
      month: 'short', day: '2-digit', year: 'numeric', timeZone: 'Asia/Manila',
    }).format(date),
    time: new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
    }).format(date),
  }
}

function returnedDateKey(value: string) {
  const date = new Date(value.split(' · ')[0])
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function returnedConditionTone(condition: string) {
  const normalizedCondition = condition.toLowerCase()
  if (normalizedCondition === 'good') return 'bg-emerald-50 text-emerald-700'
  if (normalizedCondition === 'new') return 'bg-sky-50 text-sky-700'
  if (normalizedCondition === 'fair' || normalizedCondition === 'under maintenance') return 'bg-amber-50 text-amber-700'
  return 'bg-rose-50 text-rose-700'
}

function returnedStatusTone(status: string) {
  const normalizedStatus = status.toLowerCase()
  if (normalizedStatus === 'available' || normalizedStatus === 'in storage') return 'bg-blue-50 text-blue-700'
  if (normalizedStatus === 'issued') return 'bg-amber-50 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

function returnConditionFromNote(note: string, fallback: string) {
  return note.match(/Condition after return:\s*([^.]*)/i)?.[1].trim() || fallback || '—'
}

function returnReasonFromNote(note: string) {
  if (!note.trim()) return 'Return confirmed by employee.'
  const gsoNotes = note.match(/GSO notes:\s*([\s\S]*)$/i)?.[1].trim()
  if (gsoNotes) return gsoNotes
  return note.split(/Condition after return:/i)[0].trim() || note.trim()
}

function escapeReportHTML(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character)
}

export default function ReturnItems() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all')
  const [selectedReportDate, setSelectedReportDate] = useState('')
  const [departmentOptions, setDepartmentOptions] = useState(initialDepartments)
  const [returnedItems, setReturnedItems] = useState<ReturnedItemRecord[]>([])
  const [mainIssuancesCount, setMainIssuancesCount] = useState(0)
  const [isLoadingReturns, setIsLoadingReturns] = useState(true)
  const [returnLoadError, setReturnLoadError] = useState('')
  const [selectedItem, setSelectedItem] = useState<ReturnedItemRecord | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadReturnedItems = async () => {
      setIsLoadingReturns(true)
      setReturnLoadError('')

      try {
        const [{ employees }, inventoryItems, departmentResponse] = await Promise.all([
          listEmployees(),
          listInventoryItems(),
          listDepartments().catch(() => null),
        ])
        const employeeHistories = await Promise.allSettled(
          employees.map((employee) => listEmployeeIssuances(employee.id)),
        )
        if (!isMounted) return
        const confirmedIssuancesCount = inventoryItems.reduce(
          (count, item) => count + (item.changeHistory || []).filter((change) => change.action === 'issued').length,
          0,
        )
        const pendingOrRejectedCount = employeeHistories.reduce((count, result) => count + (
          result.status === 'fulfilled'
            ? result.value.history.filter((entry) => entry.event === 'Pending Approval' || entry.event === 'Rejected').length
            : 0
        ), 0)
        setMainIssuancesCount(confirmedIssuancesCount + pendingOrRejectedCount)

        if (departmentResponse?.departments.length) {
          setDepartmentOptions(departmentResponse.departments.map((department) => department.name))
        }

        const employeesByCode = new Map(employees.map((employee) => [employee.id.toLowerCase(), employee]))
        const employeeIndexesByCode = new Map(employees.map((employee, index) => [employee.id.toLowerCase(), index]))
        const returnedRecords = inventoryItems.flatMap((item) =>
          (item.changeHistory || [])
            .filter((change) => change.action === 'returned')
            .map((change) => {
              const employeeIdentity = change.reason.match(/Returned by\s+(.+?)\s+\(([^)]+)\)/i)
              const employeeCode = employeeIdentity?.[2] || ''
              const employee = employeesByCode.get(employeeCode.toLowerCase())
              const employeeIndex = employeeIndexesByCode.get(employeeCode.toLowerCase())
              const historyResult = employeeIndex === undefined ? undefined : employeeHistories[employeeIndex]
              const returnedAt = formatReturnedDateTime(change.changedAt)
              const employeeHistory = historyResult?.status === 'fulfilled'
                ? historyResult.value.history
                : []
              const matchingReturn = employeeHistory.find((entry) =>
                entry.event === 'Returned'
                && entry.code.toLowerCase() === item.itemCode.toLowerCase()
                && entry.date === returnedAt.date,
              ) || employeeHistory.find((entry) =>
                entry.event === 'Returned' && entry.code.toLowerCase() === item.itemCode.toLowerCase(),
              )
              const condition = typeof change.newValues.condition === 'string'
                ? change.newValues.condition
                : item.condition
              const inventoryStatus = item.status || 'Returned'
              const status = inventoryStatus.toLowerCase() === 'available' ? 'In Storage' : inventoryStatus

              return {
                timestamp: new Date(change.changedAt).getTime() || 0,
                record: {
                  code: item.itemCode,
                  asset: item.description,
                  category: item.category,
                  returnedBy: employee
                    ? `${employee.firstName} ${employee.lastName}`
                    : employeeIdentity?.[1] || 'Employee',
                  department: employee?.department || '—',
                  returnedDate: `${returnedAt.date} · ${returnedAt.time}`,
                  returnCondition: returnConditionFromNote(matchingReturn?.note || '', condition),
                  reason: returnReasonFromNote(matchingReturn?.note || ''),
                  issuedTo: inventoryStatus.toLowerCase() === 'issued' ? item.assignedTo || '—' : '—',
                  status,
                  statusTone: returnedStatusTone(status),
                },
              }
            }),
        )
          .sort((left, right) => right.timestamp - left.timestamp)

        setReturnedItems(returnedRecords.map(({ record }) => record))
        if (employeeHistories.some((result) => result.status === 'rejected')) {
          setReturnLoadError('Some employee return records could not be loaded. Refresh the page to try again.')
        }
      } catch (error) {
        if (isMounted) {
          setReturnedItems([])
          setMainIssuancesCount(0)
          setReturnLoadError(error instanceof Error ? error.message : 'Unable to load returned item records.')
        }
      } finally {
        if (isMounted) setIsLoadingReturns(false)
      }
    }

    void loadReturnedItems()
    return () => { isMounted = false }
  }, [])

  const filteredItems = returnedItems.filter((item) => {
    const query = searchQuery.toLowerCase()
    const matchesSearch = item.asset.toLowerCase().includes(query)
      || item.code.toLowerCase().includes(query)
      || item.returnedBy.toLowerCase().includes(query)
      || item.issuedTo.toLowerCase().includes(query)
    const matchesDepartment = selectedDeptFilter === 'all' || item.department === selectedDeptFilter
    const matchesDate = !selectedReportDate || returnedDateKey(item.returnedDate) === selectedReportDate
    return matchesSearch && matchesDepartment && matchesDate
  })

  const reportFilterDescription = [
    selectedReportDate ? `Date: ${selectedReportDate}` : '',
    selectedDeptFilter !== 'all' ? `Department: ${selectedDeptFilter}` : '',
    searchQuery.trim() ? `Search: ${searchQuery.trim()}` : '',
  ].filter(Boolean).join(' · ') || 'All returned items'
  const reportFilterFilename = selectedReportDate ? `Date_${selectedReportDate}_` : ''

  const handleGenerateCSV = () => {
    if (filteredItems.length === 0) {
      alert('There is no data to export to CSV.')
      return
    }
    const headers = Object.keys(filteredItems[0]).join(',')
    const rows = filteredItems.map((item) =>
      Object.values(item).map((value) => `"${value}"`).join(','),
    )
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n')
    const link = document.createElement('a')
    link.href = encodeURI(csvContent)
    link.download = `Returned_Items_Report_${reportFilterFilename}${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleGenerateExcel = () => {
    if (filteredItems.length === 0) {
      alert('There is no data to export to Excel.')
      return
    }

    const inStorageCount = filteredItems.filter((item) => ['available', 'in storage'].includes(item.status.toLowerCase())).length
    const issuedCount = filteredItems.filter((item) => item.status.toLowerCase() === 'issued').length
    const otherStatusCount = filteredItems.length - inStorageCount - issuedCount
    const generatedAt = new Intl.DateTimeFormat('en-PH', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Asia/Manila',
    }).format(new Date())

    const reportRows = filteredItems.map((item, index) => {
      const condition = item.returnCondition.toLowerCase()
      const conditionColor = condition === 'good'
        ? '#047857'
        : condition === 'new'
          ? '#0369a1'
          : condition === 'fair' || condition === 'under maintenance'
            ? '#b45309'
            : '#be123c'
      const statusStyle = ['available', 'in storage'].includes(item.status.toLowerCase())
        ? 'background:#eff6ff;color:#1d4ed8;'
        : item.status.toLowerCase() === 'issued'
          ? 'background:#fffbeb;color:#b45309;'
          : 'background:#f1f5f9;color:#475569;'
      const rowBackground = index % 2 === 0 ? '#ffffff' : '#f1f5f9'

      return `<tr style="background:${rowBackground};">
        <td style="width:250px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
          <strong style="color:#0f172a;">${escapeReportHTML(item.asset)}</strong><br>
          <span style="font-size:10pt;color:#475569;">${escapeReportHTML(item.code)}</span><br>
          <span style="font-size:9pt;color:#64748b;">${escapeReportHTML(item.category)}</span>
        </td>
        <td style="width:210px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
          <strong style="color:#0f172a;">${escapeReportHTML(item.returnedBy)}</strong><br>
          <span style="font-size:10pt;color:#475569;">${escapeReportHTML(item.department)}</span>
        </td>
        <td style="width:150px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">${escapeReportHTML(item.returnedDate)}</td>
        <td style="width:150px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;color:${conditionColor};font-weight:bold;">${escapeReportHTML(item.returnCondition)}</td>
        <td style="width:360px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;white-space:normal;">${escapeReportHTML(item.reason || '—').replace(/\r?\n/g, '<br>')}</td>
        <td style="width:190px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">${escapeReportHTML(item.issuedTo)}</td>
        <td style="width:150px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
          <span style="${statusStyle}font-weight:bold;padding:4px 7px;">${escapeReportHTML(item.status)}</span>
        </td>
      </tr>`
    }).join('')

    const workbookHTML = `<!DOCTYPE html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <meta name="ProgId" content="Excel.Sheet">
          <title>Returned Items Report</title>
          <style>
            body { font-family: Calibri, Arial, sans-serif; color: #1e293b; }
            table { border-collapse: collapse; }
            .report-table { table-layout: fixed; width: 1460px; }
            .report-table th { padding: 10px; background: #09244a; color: #ffffff; border: 1px solid #09244a; text-align: left; }
            .summary td { padding: 10px 14px; border: 1px solid #dbe3ef; }
            .report-table td { mso-number-format: "\\@"; }
          </style>
        </head>
        <body>
          <table style="width:1460px;margin-bottom:14px;border-collapse:collapse;">
            <tr><td colspan="7" style="padding:18px 20px;background:#09244a;color:#ffffff;">
              <div style="font-size:10pt;font-weight:bold;letter-spacing:1px;color:#bfdbfe;">ASSET CUSTODY &amp; TRACKING</div>
              <h1 style="margin:7px 0 4px;font-size:22pt;color:#ffffff;">Returned Items Report</h1>
              <div style="font-size:10pt;color:#dbeafe;">Generated ${escapeReportHTML(generatedAt)} · ${escapeReportHTML(reportFilterDescription)}</div>
            </td></tr>
          </table>
          <table class="summary" style="width:1460px;margin-bottom:16px;border-collapse:collapse;">
            <tr>
              <td style="width:25%;background:#f8fafc;"><div style="font-size:9pt;color:#64748b;">TOTAL RECORDS</div><strong style="font-size:16pt;color:#09244a;">${filteredItems.length}</strong></td>
              <td style="width:25%;background:#eff6ff;"><div style="font-size:9pt;color:#1d4ed8;">IN STORAGE</div><strong style="font-size:16pt;color:#1d4ed8;">${inStorageCount}</strong></td>
              <td style="width:25%;background:#fffbeb;"><div style="font-size:9pt;color:#b45309;">ISSUED</div><strong style="font-size:16pt;color:#b45309;">${issuedCount}</strong></td>
              <td style="width:25%;background:#f1f5f9;"><div style="font-size:9pt;color:#475569;">OTHER STATUS</div><strong style="font-size:16pt;color:#475569;">${otherStatusCount}</strong></td>
            </tr>
          </table>
          <table class="report-table">
            <colgroup>
              <col style="width:250px;"><col style="width:210px;"><col style="width:150px;">
              <col style="width:150px;"><col style="width:360px;"><col style="width:190px;"><col style="width:150px;">
            </colgroup>
            <thead><tr>
              <th>Asset / Item</th><th>Returned By</th><th>Returned On</th>
              <th>Condition Upon Return</th><th>Reason / Note</th><th>Currently Issued To</th><th>Current Status</th>
            </tr></thead>
            <tbody>${reportRows}</tbody>
          </table>
        </body>
      </html>`

    const workbookBlob = new Blob(['\uFEFF', workbookHTML], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const workbookUrl = URL.createObjectURL(workbookBlob)
    const link = document.createElement('a')
    link.href = workbookUrl
    link.download = `Returned_Items_Styled_Report_${reportFilterFilename}${new Date().toISOString().slice(0, 10)}.xls`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.setTimeout(() => URL.revokeObjectURL(workbookUrl), 0)
  }

  const handleGenerateWord = () => {
    if (filteredItems.length === 0) {
      alert('There is no data to export to Word.')
      return
    }
    const inStorageCount = filteredItems.filter((item) => ['available', 'in storage'].includes(item.status.toLowerCase())).length
    const issuedCount = filteredItems.filter((item) => item.status.toLowerCase() === 'issued').length
    const otherStatusCount = filteredItems.length - inStorageCount - issuedCount
    const generatedAt = new Intl.DateTimeFormat('en-PH', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Asia/Manila',
    }).format(new Date())
    const rows = filteredItems.map((item, index) => {
      const condition = item.returnCondition.toLowerCase()
      const conditionColor = condition === 'good'
        ? '#047857'
        : condition === 'new'
          ? '#0369a1'
          : condition === 'fair' || condition === 'under maintenance'
            ? '#b45309'
            : '#be123c'
      const statusColor = ['available', 'in storage'].includes(item.status.toLowerCase())
        ? '#1d4ed8'
        : item.status.toLowerCase() === 'issued'
          ? '#b45309'
          : '#475569'

      return `<tr style="background:${index % 2 === 0 ? '#ffffff' : '#f8fafc'};page-break-inside:avoid;">
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">
          <strong style="color:#0f172a;">${escapeReportHTML(item.asset)}</strong><br>
          <span style="font-size:9pt;color:#475569;">Code: ${escapeReportHTML(item.code)}</span><br>
          <span style="font-size:9pt;color:#64748b;">${escapeReportHTML(item.category)}</span>
        </td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">
          <strong style="color:#0f172a;">${escapeReportHTML(item.returnedBy)}</strong><br>
          <span style="font-size:9pt;color:#475569;">${escapeReportHTML(item.department)}</span>
        </td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">${escapeReportHTML(item.returnedDate)}</td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;white-space:nowrap;">
          <span style="font-weight:bold;color:${conditionColor};">${escapeReportHTML(item.returnCondition)}</span>
        </td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">${escapeReportHTML(item.reason || '—').replace(/\r?\n/g, '<br>')}</td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">${escapeReportHTML(item.issuedTo)}</td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;white-space:nowrap;">
          <span style="font-weight:bold;color:${statusColor};">${escapeReportHTML(item.status)}</span>
        </td>
      </tr>`
    }).join('')
    const html = `<!DOCTYPE html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <title>Returned Items Report</title>
          <style>
            @page Section1 { size: 11in 8.5in; mso-page-orientation: landscape; margin: 0.45in; }
            div.Section1 { page: Section1; }
            body { font-family: Arial, sans-serif; color: #1e293b; font-size: 10pt; }
            table { border-collapse: collapse; width: 100%; }
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; }
          </style>
        </head>
        <body>
          <div class="Section1">
            <table style="margin-bottom:18px;border-collapse:collapse;">
              <tr><td style="padding:18px 20px;background:#09244a;color:#ffffff;">
                <div style="font-size:9pt;font-weight:bold;letter-spacing:1.2px;color:#bfdbfe;">ASSET CUSTODY &amp; TRACKING</div>
                <h1 style="margin:7px 0 4px;font-size:22pt;color:#ffffff;">Returned Items Report</h1>
                <div style="font-size:9pt;color:#dbeafe;">Generated ${escapeReportHTML(generatedAt)} · ${escapeReportHTML(reportFilterDescription)}</div>
              </td></tr>
            </table>
            <table style="margin-bottom:16px;border-collapse:separate;border-spacing:8px 0;">
              <tr>
                <td style="width:25%;padding:10px 12px;border:1px solid #dbe3ef;background:#f8fafc;"><div style="font-size:8pt;color:#64748b;text-transform:uppercase;">Records in this report</div><strong style="font-size:16pt;color:#09244a;">${filteredItems.length}</strong></td>
                <td style="width:25%;padding:10px 12px;border:1px solid #bfdbfe;background:#eff6ff;"><div style="font-size:8pt;color:#1d4ed8;text-transform:uppercase;">In Storage</div><strong style="font-size:16pt;color:#1d4ed8;">${inStorageCount}</strong></td>
                <td style="width:25%;padding:10px 12px;border:1px solid #fde68a;background:#fffbeb;"><div style="font-size:8pt;color:#b45309;text-transform:uppercase;">Issued</div><strong style="font-size:16pt;color:#b45309;">${issuedCount}</strong></td>
                <td style="width:25%;padding:10px 12px;border:1px solid #dbe3ef;background:#f1f5f9;"><div style="font-size:8pt;color:#475569;text-transform:uppercase;">Other status</div><strong style="font-size:16pt;color:#475569;">${otherStatusCount}</strong></td>
              </tr>
            </table>
            <table style="width:100%;border-collapse:collapse;font-size:9pt;">
              <thead><tr style="background:#09244a;color:#ffffff;">
                <th style="padding:9px;border:1px solid #09244a;text-align:left;">Asset / Item</th>
                <th style="padding:9px;border:1px solid #09244a;text-align:left;">Returned By</th>
                <th style="padding:9px;border:1px solid #09244a;text-align:left;">Returned On</th>
                <th style="padding:9px;border:1px solid #09244a;text-align:left;">Condition Upon Return</th>
                <th style="padding:9px;border:1px solid #09244a;text-align:left;">Reason / Note</th>
                <th style="padding:9px;border:1px solid #09244a;text-align:left;">Currently Issued To</th>
                <th style="padding:9px;border:1px solid #09244a;text-align:left;">Current Status</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <p style="margin-top:14px;font-size:8pt;color:#64748b;">This report contains the returned item records matching the filters selected in the Returned Items page.</p>
          </div>
        </body>
      </html>`
    const link = document.createElement('a')
    link.href = `data:application/vnd.ms-word;charset=utf-8,${encodeURIComponent(html)}`
    link.download = `Returned_Items_Report_${reportFilterFilename}${new Date().toISOString().slice(0, 10)}.doc`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportHandlers = {
    csv: handleGenerateCSV,
    excel: handleGenerateExcel,
    word: handleGenerateWord,
  }

  return (
    <GsoPageFrame activePage="Issuance & Returned" searchPlaceholder="Search returned asset, code, or employee...">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              Asset Custody &amp; Tracking
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Returned Items</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
              Review verified employee returns, return conditions, and current item status.
            </p>
          </div>
          <span className="rounded-xl border border-white/10 bg-white/8 px-3.5 py-2 text-xs font-bold text-blue-100">
            Custody · Returned Assets
          </span>
        </div>
        <nav className="relative mt-6 flex flex-wrap gap-2 border-t border-blue-400/20 pt-4" aria-label="Issuance and return records">
          <a href="/gso/issuance" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-extrabold text-blue-100 transition hover:bg-white/12">
            + Main Issuances ({mainIssuancesCount})
          </a>
          <a href="/gso/return-items" aria-current="page" className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-blue-950 shadow-md">
            + Returned Items ({returnedItems.length})
          </a>
        </nav>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Search Bar</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search asset, code, or recipient..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Filter by Department</span>
            <select
              value={selectedDeptFilter}
              onChange={(event) => setSelectedDeptFilter(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">All Departments</option>
              {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Returned Item Records</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Click any row to inspect complete details. Export report using CSV or Word buttons.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block w-40">
              <span className="mb-1 block text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-500">Filter by date</span>
              <input
                type="date"
                value={selectedReportDate}
                onChange={(event) => setSelectedReportDate(event.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>
            {selectedReportDate && (
              <button
                type="button"
                aria-label="Clear date filter"
                onClick={() => setSelectedReportDate('')}
                className="mb-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[0.65rem] font-bold text-slate-600 transition hover:bg-slate-100"
              >
                Clear date
              </button>
            )}
            <button
              type="button"
              onClick={exportHandlers.excel}
              className="inline-flex min-h-9 min-w-40 items-center justify-center gap-1.5 rounded-lg bg-[#138548] px-4 py-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#0f7440] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2"
            >
              <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M8 13h2M8 17h2M14 13h2M14 17h2" />
              </svg>
              Generate CSV
            </button>
            <button
              type="button"
              onClick={exportHandlers.word}
              className="inline-flex min-h-9 min-w-40 items-center justify-center gap-1.5 rounded-lg bg-[#2d5aa3] px-4 py-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#264e8e] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
            >
              <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M8 13h8M8 17h8" />
              </svg>
              Generate Word
            </button>
            <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-[0.65rem] font-extrabold text-blue-700">
              {isLoadingReturns ? 'Loading…' : `${filteredItems.length} return record(s)`}
            </span>
          </div>
        </div>

        <div className="max-h-[42vh] overflow-auto overscroll-contain border-t border-slate-100">
          <table className="min-w-220 w-full text-left">
            <thead className="sticky top-0 z-10 bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Asset Code &amp; Name</th>
                <th className="px-5 py-3.5">Returned By</th>
                <th className="px-5 py-3.5">Returned Date &amp; Time</th>
                <th className="px-5 py-3.5">Condition Upon Return</th>
                <th className="px-5 py-3.5">Reason / Note</th>
                <th className="px-5 py-3.5">Currently Issued To</th>
                <th className="px-5 py-3.5 sm:px-6">Current Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingReturns && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">
                    Loading saved return records...
                  </td>
                </tr>
              )}
              {!isLoadingReturns && filteredItems.map((item, index) => (
                <tr key={`${item.code}-${item.returnedDate}-${index}`} onClick={() => setSelectedItem(item)} className="cursor-pointer border-t border-slate-100 transition hover:bg-blue-50/40">
                  <td className="px-5 py-4 sm:px-6">
                    <span className="block text-xs font-extrabold text-slate-800">{item.asset}</span>
                    <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{item.code} · {item.category}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="block text-xs font-bold text-slate-700">{item.returnedBy}</span>
                    <span className="mt-1 block text-[0.62rem] text-slate-400">{item.department}</span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-700">{item.returnedDate}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${returnedConditionTone(item.returnCondition)}`}>{item.returnCondition}</span>
                  </td>
                  <td className="max-w-xs px-5 py-4 text-xs text-slate-600">{item.reason}</td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-700">{item.issuedTo}</td>
                  <td className="px-5 py-4 sm:px-6">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${item.statusTone}`}>{item.status}</span>
                  </td>
                </tr>
              ))}
              {!isLoadingReturns && returnLoadError && (
                <tr>
                  <td colSpan={7} className="px-5 py-4 text-center text-xs font-semibold text-amber-700">
                    {returnLoadError}
                  </td>
                </tr>
              )}
              {!isLoadingReturns && !returnLoadError && filteredItems.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">No returned items match the selected filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="returned-item-dialog-title" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 id="returned-item-dialog-title" className="text-sm font-black text-slate-900">Returned Item Details</h3>
              <button type="button" onClick={() => setSelectedItem(null)} className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50">Close</button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Returned Asset</span>
                <p className="mt-1 text-xs font-black text-slate-900">{selectedItem.asset}</p>
                <p className="text-[0.65rem] font-bold text-slate-500">{selectedItem.code} · {selectedItem.category}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Returned By</span>
                <p className="mt-1 text-xs font-bold text-slate-800">{selectedItem.returnedBy}</p>
                <p className="text-[0.65rem] font-medium text-slate-500">{selectedItem.department}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Condition &amp; Return Date</span>
                <p className="mt-1 text-xs font-bold text-slate-800">{selectedItem.returnCondition} · {selectedItem.returnedDate}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Reason for Return</span>
                <p className="mt-1 text-xs text-slate-700">{selectedItem.reason}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Currently Issued To</span>
                <p className="mt-1 text-xs font-bold text-slate-800">{selectedItem.issuedTo === '—' ? 'Not currently issued' : selectedItem.issuedTo}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Current Status</span>
                <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${selectedItem.statusTone}`}>{selectedItem.status}</span>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setSelectedItem(null)} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-700">Done</button>
            </div>
          </section>
        </div>
      )}
    </GsoPageFrame>
  )
}
