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

type MainIssuanceRecord = {
  id: string
  code: string
  asset: string
  category: string
  employee: string
  department: string
  position: string
  date: string
  time: string
  condition: string
  conditionTone: string
  acknowledgment: 'Confirmed' | 'Pending' | 'Rejected'
  acknowledgmentTone: string
  notes: string
}

function mainIssuanceConditionTone(condition: string) {
  const normalizedCondition = condition.toLowerCase()
  if (normalizedCondition === 'good') return 'bg-emerald-50 text-emerald-700'
  if (normalizedCondition === 'new') return 'bg-sky-50 text-sky-700'
  if (normalizedCondition === 'fair') return 'bg-amber-50 text-amber-700'
  return 'bg-rose-50 text-rose-700'
}

function mainIssuanceAcknowledgmentTone(acknowledgment: MainIssuanceRecord['acknowledgment']) {
  if (acknowledgment === 'Confirmed') return 'bg-emerald-50 text-emerald-700'
  if (acknowledgment === 'Rejected') return 'bg-rose-50 text-rose-700'
  return 'bg-amber-50 text-amber-700'
}

function mainIssuanceAcknowledgmentLabel(acknowledgment: MainIssuanceRecord['acknowledgment']) {
  if (acknowledgment === 'Confirmed') return 'Confirmed'
  if (acknowledgment === 'Rejected') return 'Rejected'
  return 'Pending Acknowledgment'
}

function formatMainIssuanceDateTime(value: string) {
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

function mainIssuanceDateKey(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function IssuanceRecord() {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all')
  const [selectedReportDate, setSelectedReportDate] = useState('')
  const [departmentOptions, setDepartmentOptions] = useState<string[]>(initialDepartments)
  const [selectedAckFilter, setSelectedAckFilter] = useState('all')
  const [mainIssuances, setMainIssuances] = useState<MainIssuanceRecord[]>([])
  const [returnedItemsCount, setReturnedItemsCount] = useState(0)
  const [isLoadingMainIssuances, setIsLoadingMainIssuances] = useState(true)
  const [mainIssuanceLoadError, setMainIssuanceLoadError] = useState('')

  // Row Details Modal States
  const [selectedMainItem, setSelectedMainItem] = useState<MainIssuanceRecord | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadDepartments = async () => {
      try {
        const { departments } = await listDepartments()
        if (isMounted && departments.length > 0) {
          setDepartmentOptions(departments.map((department) => department.name))
        }
      } catch {
        if (isMounted) setDepartmentOptions(initialDepartments)
      }
    }

    const loadMainIssuances = async () => {
      setIsLoadingMainIssuances(true)
      setMainIssuanceLoadError('')

      try {
        const [{ employees }, inventoryItems] = await Promise.all([listEmployees(), listInventoryItems()])
        const employeeHistories = await Promise.allSettled(
          employees.map((employee) => listEmployeeIssuances(employee.id)),
        )
        if (!isMounted) return
        setReturnedItemsCount(inventoryItems.reduce(
          (count, item) => count + (item.changeHistory || []).filter((change) => change.action === 'returned').length,
          0,
        ))

        const employeesByCode = new Map(employees.map((employee) => [employee.id.toLowerCase(), employee]))
        const inventoryByCode = new Map(inventoryItems.map((item) => [item.itemCode.toLowerCase(), item]))

        const confirmedRecords: MainIssuanceRecord[] = inventoryItems.flatMap((item) =>
          (item.changeHistory || [])
            .filter((change) => change.action === 'issued')
            .map((change, index) => {
              const employeeCode = typeof change.newValues.employeeCode === 'string'
                ? change.newValues.employeeCode
                : ''
              const employeeProfile = employeesByCode.get(employeeCode.toLowerCase())
              const employeeName = typeof change.newValues.employeeName === 'string'
                ? change.newValues.employeeName
                : employeeProfile
                  ? `${employeeProfile.firstName} ${employeeProfile.lastName}`
                  : employeeCode || 'Employee'
              const condition = typeof change.newValues.condition === 'string'
                ? change.newValues.condition
                : item.condition
              const issuedAt = formatMainIssuanceDateTime(change.changedAt)

              return {
                id: `issued-${item.id}-${change.changedAt}-${index}`,
                code: item.itemCode,
                asset: item.description,
                category: item.category,
                employee: employeeName,
                department: employeeProfile?.department || '—',
                position: employeeProfile?.position || '—',
                date: issuedAt.date,
                time: issuedAt.time,
                condition,
                conditionTone: mainIssuanceConditionTone(condition),
                acknowledgment: 'Confirmed',
                acknowledgmentTone: 'bg-emerald-50 text-emerald-700',
                notes: change.reason || 'Issuance confirmed by employee.',
              }
            }),
        )

        const pendingRecords: MainIssuanceRecord[] = []
        const rejectedRecords: MainIssuanceRecord[] = []
        employeeHistories.forEach((result, employeeIndex) => {
          if (result.status !== 'fulfilled') return
          const employeeProfile = employees[employeeIndex]

          result.value.history.forEach((entry, historyIndex) => {
            if (entry.event !== 'Pending Approval' && entry.event !== 'Rejected') return
            const inventoryItem = inventoryByCode.get(entry.code.toLowerCase())
            const condition = inventoryItem?.condition || '—'
            const acknowledgment = entry.event === 'Rejected' ? 'Rejected' : 'Pending'
            const record: MainIssuanceRecord = {
              id: `${acknowledgment.toLowerCase()}-${employeeProfile.id}-${entry.code}-${historyIndex}`,
              code: entry.code,
              asset: inventoryItem?.description || entry.item,
              category: inventoryItem?.category || '—',
              employee: `${employeeProfile.firstName} ${employeeProfile.lastName}`,
              department: employeeProfile.department,
              position: employeeProfile.position,
              date: entry.date || '—',
              time: '—',
              condition,
              conditionTone: mainIssuanceConditionTone(condition),
              acknowledgment,
              acknowledgmentTone: mainIssuanceAcknowledgmentTone(acknowledgment),
              notes: entry.note || (acknowledgment === 'Rejected'
                ? 'Issuance request was rejected by the employee.'
                : 'Awaiting employee acknowledgment.'),
            }
            if (acknowledgment === 'Rejected') rejectedRecords.push(record)
            else pendingRecords.push(record)
          })
        })

        const recordTimestamp = (record: MainIssuanceRecord) => {
          const timestamp = new Date(record.time === '—' ? record.date : `${record.date} ${record.time}`).getTime()
          return Number.isNaN(timestamp) ? 0 : timestamp
        }
        setMainIssuances([...confirmedRecords, ...pendingRecords, ...rejectedRecords].sort(
          (left, right) => recordTimestamp(right) - recordTimestamp(left),
        ))

        if (employeeHistories.some((result) => result.status === 'rejected')) {
          setMainIssuanceLoadError('Some employee issuance records could not be loaded. Refresh the page to try again.')
        }
      } catch (error) {
        if (isMounted) {
          setMainIssuances([])
          setReturnedItemsCount(0)
          setMainIssuanceLoadError(error instanceof Error ? error.message : 'Unable to load saved issuance records.')
        }
      } finally {
        if (isMounted) setIsLoadingMainIssuances(false)
      }
    }

    void loadDepartments()
    void loadMainIssuances()
    return () => { isMounted = false }
  }, [])

  // CSV Generator Helper
  const handleGenerateCSV = (tableName: string, data: MainIssuanceRecord[]) => {
    if (data.length === 0) {
      alert('There is no data to export to CSV.')
      return
    }
    const headers = [
      'Asset / Item',
      'Asset Code',
      'Category',
      'Recipient',
      'Department',
      'Position',
      'Issued Date',
      'Issued Time',
      'Condition',
      'Acknowledgment',
      'Notes',
    ]
    const rows = data.map((record) => [
      record.asset,
      record.code,
      record.category,
      record.employee,
      record.department,
      record.position,
      record.date,
      record.time === '—' ? 'Not recorded' : record.time,
      record.condition,
      mainIssuanceAcknowledgmentLabel(record.acknowledgment),
      record.notes,
    ])
    const escapeCSVCell = (value: string) => `"${value.replace(/"/g, '""')}"`
    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCSVCell).join(','))
      .join('\r\n')
    const encodedUri = `data:text/csv;charset=utf-8,%EF%BB%BF${encodeURIComponent(csvContent)}`
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `${tableName}_Report_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleGenerateExcel = (tableName: string, data: MainIssuanceRecord[]) => {
    if (data.length === 0) {
      alert('There is no data to export to Excel.')
      return
    }

    const escapeHTML = (value: string) => value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character] || character)
    const confirmedCount = data.filter((record) => record.acknowledgment === 'Confirmed').length
    const pendingCount = data.filter((record) => record.acknowledgment === 'Pending').length
    const rejectedCount = data.filter((record) => record.acknowledgment === 'Rejected').length
    const generatedAt = new Intl.DateTimeFormat('en-PH', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Asia/Manila',
    }).format(new Date())

    const reportRows = data.map((record, index) => {
      const rowBackground = index % 2 === 0 ? '#ffffff' : '#f1f5f9'
      const conditionColor = record.conditionTone.includes('emerald')
        ? '#047857'
        : record.conditionTone.includes('sky')
          ? '#0369a1'
          : record.conditionTone.includes('amber')
            ? '#b45309'
            : '#be123c'
      const statusStyle = record.acknowledgment === 'Rejected'
        ? 'background:#fff1f2;color:#be123c;'
        : record.acknowledgment === 'Pending'
          ? 'background:#fffbeb;color:#b45309;'
          : 'background:#ecfdf5;color:#047857;'

      return `<tr style="background:${rowBackground};">
        <td style="width:250px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
          <strong style="color:#0f172a;">${escapeHTML(record.asset)}</strong><br>
          <span style="font-size:10pt;color:#475569;">${escapeHTML(record.code)}</span><br>
          <span style="font-size:9pt;color:#64748b;">${escapeHTML(record.category)}</span>
        </td>
        <td style="width:230px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
          <strong style="color:#0f172a;">${escapeHTML(record.employee)}</strong><br>
          <span style="font-size:10pt;color:#475569;">${escapeHTML(record.department)}</span><br>
          <span style="font-size:9pt;color:#64748b;">${escapeHTML(record.position)}</span>
        </td>
        <td style="width:150px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
          <strong>${escapeHTML(record.date)}</strong><br>
          <span style="font-size:10pt;color:#64748b;">${record.time === '—' ? 'Time not recorded' : escapeHTML(record.time)}</span>
        </td>
        <td style="width:110px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;color:${conditionColor};font-weight:bold;">
          ${escapeHTML(record.condition)}
        </td>
        <td style="width:190px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
          <span style="${statusStyle}font-weight:bold;padding:4px 7px;">${escapeHTML(mainIssuanceAcknowledgmentLabel(record.acknowledgment))}</span>
        </td>
        <td style="width:340px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;white-space:normal;">
          ${escapeHTML(record.notes || '—').replace(/\r?\n/g, '<br>')}
        </td>
      </tr>`
    }).join('')

    const workbookHTML = `<!DOCTYPE html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <meta name="ProgId" content="Excel.Sheet">
          <title>${escapeHTML(tableName.replace(/_/g, ' '))} Report</title>
          <style>
            body { font-family: Calibri, Arial, sans-serif; color: #1e293b; }
            table { border-collapse: collapse; }
            .report-table { table-layout: fixed; width: 1270px; }
            .report-table th { padding: 10px; background: #09244a; color: #ffffff; border: 1px solid #09244a; text-align: left; }
            .summary td { padding: 10px 14px; border: 1px solid #dbe3ef; }
            .report-table td { mso-number-format: "\\@"; }
          </style>
        </head>
        <body>
          <table style="width:1270px;margin-bottom:14px;border-collapse:collapse;">
            <tr><td colspan="6" style="padding:18px 20px;background:#09244a;color:#ffffff;">
              <div style="font-size:10pt;font-weight:bold;letter-spacing:1px;color:#bfdbfe;">ASSET CUSTODY &amp; TRACKING</div>
              <h1 style="margin:7px 0 4px;font-size:22pt;color:#ffffff;">${escapeHTML(tableName.replace(/_/g, ' '))} Report</h1>
              <div style="font-size:10pt;color:#dbeafe;">Generated ${escapeHTML(generatedAt)} · Includes the records matching the selected filters</div>
            </td></tr>
          </table>
          <table class="summary" style="width:1270px;margin-bottom:16px;border-collapse:collapse;">
            <tr>
              <td style="width:25%;background:#f8fafc;"><div style="font-size:9pt;color:#64748b;">TOTAL RECORDS</div><strong style="font-size:16pt;color:#09244a;">${data.length}</strong></td>
              <td style="width:25%;background:#ecfdf5;"><div style="font-size:9pt;color:#047857;">CONFIRMED</div><strong style="font-size:16pt;color:#047857;">${confirmedCount}</strong></td>
              <td style="width:25%;background:#fffbeb;"><div style="font-size:9pt;color:#b45309;">PENDING</div><strong style="font-size:16pt;color:#b45309;">${pendingCount}</strong></td>
              <td style="width:25%;background:#fff1f2;"><div style="font-size:9pt;color:#be123c;">REJECTED</div><strong style="font-size:16pt;color:#be123c;">${rejectedCount}</strong></td>
            </tr>
          </table>
          <table class="report-table">
            <colgroup>
              <col style="width:250px;"><col style="width:230px;"><col style="width:150px;">
              <col style="width:110px;"><col style="width:190px;"><col style="width:340px;">
            </colgroup>
            <thead><tr>
              <th>Asset / Item</th><th>Recipient</th><th>Issued On</th>
              <th>Condition</th><th>Acknowledgment</th><th>Notes</th>
            </tr></thead>
            <tbody>${reportRows}</tbody>
          </table>
        </body>
      </html>`

    const workbookBlob = new Blob(['\uFEFF', workbookHTML], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const workbookUrl = URL.createObjectURL(workbookBlob)
    const link = document.createElement('a')
    link.href = workbookUrl
    link.download = `${tableName}_Styled_Report_${new Date().toISOString().slice(0, 10)}.xls`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.setTimeout(() => URL.revokeObjectURL(workbookUrl), 0)
  }

  // Word Document Generator Helper
  const handleGenerateWord = (tableName: string, data: MainIssuanceRecord[]) => {
    if (data.length === 0) {
      alert('There is no data to export to Word.')
      return
    }
    const escapeHTML = (value: string) => value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character] || character)
    const formatNotes = (value: string) => escapeHTML(value || '—').replace(/\r?\n/g, '<br>')
    const confirmedCount = data.filter((record) => record.acknowledgment === 'Confirmed').length
    const pendingCount = data.filter((record) => record.acknowledgment === 'Pending').length
    const rejectedCount = data.filter((record) => record.acknowledgment === 'Rejected').length
    const generatedAt = new Intl.DateTimeFormat('en-PH', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Asia/Manila',
    }).format(new Date())

    const reportRows = data.map((record, index) => {
      const conditionColor = record.conditionTone.includes('emerald')
        ? '#047857'
        : record.conditionTone.includes('sky')
          ? '#0369a1'
          : record.conditionTone.includes('amber')
            ? '#b45309'
            : '#be123c'
      const acknowledgmentColor = record.acknowledgment === 'Rejected'
        ? '#be123c'
        : record.acknowledgment === 'Pending'
          ? '#b45309'
          : '#047857'

      return `<tr style="background:${index % 2 === 0 ? '#ffffff' : '#f8fafc'};page-break-inside:avoid;">
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">
          <strong style="color:#0f172a;">${escapeHTML(record.asset)}</strong><br>
          <span style="font-size:9pt;color:#475569;">Code: ${escapeHTML(record.code)}</span><br>
          <span style="font-size:9pt;color:#64748b;">${escapeHTML(record.category)}</span>
        </td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">
          <strong style="color:#0f172a;">${escapeHTML(record.employee)}</strong><br>
          <span style="font-size:9pt;color:#475569;">${escapeHTML(record.department)}</span><br>
          <span style="font-size:9pt;color:#64748b;">${escapeHTML(record.position)}</span>
        </td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;white-space:nowrap;">
          <strong>${escapeHTML(record.date)}</strong><br>
          <span style="font-size:9pt;color:#64748b;">${record.time === '—' ? 'Time not recorded' : escapeHTML(record.time)}</span>
        </td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;white-space:nowrap;">
          <span style="font-weight:bold;color:${conditionColor};">${escapeHTML(record.condition)}</span>
        </td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;white-space:nowrap;">
          <span style="font-weight:bold;color:${acknowledgmentColor};">${escapeHTML(mainIssuanceAcknowledgmentLabel(record.acknowledgment))}</span>
        </td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">${formatNotes(record.notes)}</td>
      </tr>`
    }).join('')

    const emptyTableMessage = '<tr><td colspan="6" style="padding:16px;border:1px solid #dbe3ef;text-align:center;color:#64748b;">No issuance records were included in this report.</td></tr>'
    const sourceHTML = `<!DOCTYPE html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <title>${escapeHTML(tableName.replace(/_/g, ' '))} Report</title>
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
              <tr>
                <td style="padding:18px 20px;background:#09244a;color:#ffffff;">
                  <div style="font-size:9pt;font-weight:bold;letter-spacing:1.2px;color:#bfdbfe;">ASSET CUSTODY &amp; TRACKING</div>
                  <h1 style="margin:7px 0 4px;font-size:22pt;color:#ffffff;">${escapeHTML(tableName.replace(/_/g, ' '))} Report</h1>
                  <div style="font-size:9pt;color:#dbeafe;">Generated ${escapeHTML(generatedAt)}</div>
                </td>
              </tr>
            </table>
            <table style="margin-bottom:16px;border-collapse:separate;border-spacing:8px 0;">
              <tr>
                <td style="width:25%;padding:10px 12px;border:1px solid #dbe3ef;background:#f8fafc;">
                  <div style="font-size:8pt;color:#64748b;text-transform:uppercase;">Records in this report</div>
                  <strong style="font-size:16pt;color:#09244a;">${data.length}</strong>
                </td>
                <td style="width:25%;padding:10px 12px;border:1px solid #d1fae5;background:#ecfdf5;">
                  <div style="font-size:8pt;color:#047857;text-transform:uppercase;">Confirmed</div>
                  <strong style="font-size:16pt;color:#047857;">${confirmedCount}</strong>
                </td>
                <td style="width:25%;padding:10px 12px;border:1px solid #fde68a;background:#fffbeb;">
                  <div style="font-size:8pt;color:#b45309;text-transform:uppercase;">Pending acknowledgment</div>
                  <strong style="font-size:16pt;color:#b45309;">${pendingCount}</strong>
                </td>
                <td style="width:25%;padding:10px 12px;border:1px solid #fecdd3;background:#fff1f2;">
                  <div style="font-size:8pt;color:#be123c;text-transform:uppercase;">Rejected</div>
                  <strong style="font-size:16pt;color:#be123c;">${rejectedCount}</strong>
                </td>
              </tr>
            </table>
            <table style="width:100%;border-collapse:collapse;font-size:9pt;">
              <thead>
                <tr style="background:#09244a;color:#ffffff;">
                  <th style="padding:9px;border:1px solid #09244a;text-align:left;">Asset / Item</th>
                  <th style="padding:9px;border:1px solid #09244a;text-align:left;">Recipient</th>
                  <th style="padding:9px;border:1px solid #09244a;text-align:left;">Issued On</th>
                  <th style="padding:9px;border:1px solid #09244a;text-align:left;">Condition</th>
                  <th style="padding:9px;border:1px solid #09244a;text-align:left;">Acknowledgment</th>
                  <th style="padding:9px;border:1px solid #09244a;text-align:left;">Notes</th>
                </tr>
              </thead>
              <tbody>${reportRows || emptyTableMessage}</tbody>
            </table>
            <p style="margin-top:14px;font-size:8pt;color:#64748b;">This report contains the issuance records matching the filters selected in the Issuance Records page.</p>
          </div>
        </body>
      </html>`

    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML)
    const fileDownload = document.createElement('a')
    document.body.appendChild(fileDownload)
    fileDownload.href = source
    fileDownload.download = `${tableName}_Report_${new Date().toISOString().slice(0, 10)}.doc`
    fileDownload.click()
    document.body.removeChild(fileDownload)
  }

  const exportHandlers = {
    csv: handleGenerateCSV,
    excel: handleGenerateExcel,
    word: handleGenerateWord,
  }

  // Main Issuance Filter
  const filteredMainIssuances = mainIssuances.filter((record) => {
    const matchesSearch =
      record.asset.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.employee.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesDept = selectedDeptFilter === 'all' || record.department === selectedDeptFilter
    const matchesAck = selectedAckFilter === 'all' || record.acknowledgment === selectedAckFilter
    const matchesDate = !selectedReportDate || mainIssuanceDateKey(record.date) === selectedReportDate

    return matchesSearch && matchesDept && matchesAck && matchesDate
  })

  return (
    <GsoPageFrame activePage="Issuance & Returned" searchPlaceholder="Search item code, employee, or department...">
      {/* HEADER SECTION */}
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              Asset Custody &amp; Tracking
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Issuance Records</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
              Review active asset assignments and employee acknowledgments.
            </p>
          </div>
         
        </div>

        {/* WORKSPACE NAVIGATION TABS */}
        <nav className="relative mt-6 flex flex-wrap gap-2 border-t border-blue-400/20 pt-4" aria-label="Issuance and return records">
          <a href="/gso/issuance" aria-current="page" className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-blue-950 shadow-md">
            +  Main Issuances ({mainIssuances.length})
          </a>
          <a href="/gso/return-items" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-extrabold text-blue-100 transition hover:bg-white/12">
            + Returned Items ({returnedItemsCount})
          </a>
        </nav>
      </section>

      {/* SEARCH AND FILTER CONTROL SECTION */}
      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
              Search Bar
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search asset, code, or recipient..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
              Filter by Department
            </span>
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">All Departments</option>
              {departmentOptions.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
                Acknowledgment Status
              </span>
              <select
                value={selectedAckFilter}
                onChange={(e) => setSelectedAckFilter(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                <option value="all">All Acknowledgment Statuses</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Pending">Pending</option>
                <option value="Rejected">Rejected</option>
              </select>
          </label>
        </div>
      </section>

      {/* TAB 1: MAIN ISSUANCES TABLE */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900">Recent &amp; Main Issuances</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Click any row to inspect complete details. Export report using CSV or Word buttons.
              </p>
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
                onClick={() => exportHandlers.excel('Main_Issuances', filteredMainIssuances)}
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
                onClick={() => exportHandlers.word('Main_Issuances', filteredMainIssuances)}
                className="inline-flex min-h-9 min-w-40 items-center justify-center gap-1.5 rounded-lg bg-[#2d5aa3] px-4 py-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#264e8e] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
              >
                <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6M8 13h8M8 17h8" />
                </svg>
                Generate Word
              </button>
              <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-[0.65rem] font-extrabold text-blue-700">
                {isLoadingMainIssuances ? 'Loading…' : `${filteredMainIssuances.length} record(s)`}
              </span>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-auto border-t border-slate-100">
            <table className="min-w-235 w-full text-left">
              <thead className="sticky top-0 z-10 bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th className="px-5 py-3.5 sm:px-6">Asset / Item</th>
                  <th className="px-5 py-3.5">Recipient</th>
                  <th className="px-5 py-3.5">Issued On</th>
                  <th className="px-5 py-3.5">Condition</th>
                  <th className="px-5 py-3.5 sm:px-6">Acknowledgment</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingMainIssuances && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">
                      Loading saved issuance records...
                    </td>
                  </tr>
                )}
                {!isLoadingMainIssuances && filteredMainIssuances.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => setSelectedMainItem(record)}
                    className="cursor-pointer border-t border-slate-100 transition hover:bg-blue-50/40"
                  >
                    <td className="px-5 py-4 sm:px-6">
                      <span className="block text-xs font-extrabold text-slate-800">{record.asset}</span>
                      <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">
                        {record.code} · {record.category}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="block text-xs font-bold text-slate-700">{record.employee}</span>
                      <span className="mt-1 block text-[0.62rem] text-slate-400">
                        {record.department} · {record.position}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-700">
                      {record.date}
                      <span className="mt-1 block text-[0.65rem] font-medium text-slate-400">{record.time}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${record.conditionTone}`}>
                        {record.condition}
                      </span>
                    </td>
                    <td className="px-5 py-4 sm:px-6">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${record.acknowledgmentTone}`}>
                        {record.acknowledgment === 'Confirmed'
                          ? '✓ Confirmed'
                          : record.acknowledgment === 'Rejected'
                            ? '✕ Rejected'
                            : <><svg aria-hidden="true" className="mr-1 inline-block h-3 w-3 align-[-2px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>Pending Acknowledgment</>}
                      </span>
                    </td>
                  </tr>
                ))}
                {!isLoadingMainIssuances && mainIssuanceLoadError && (
                  <tr>
                    <td colSpan={5} className="px-5 py-4 text-center text-xs font-semibold text-amber-700">
                      {mainIssuanceLoadError}
                    </td>
                  </tr>
                )}
                {!isLoadingMainIssuances && !mainIssuanceLoadError && filteredMainIssuances.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">
                      No saved issuance records match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </section>

      {/* MODAL VIEW 1: MAIN ISSUANCE POP-UP DETAILS */}
      {selectedMainItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">Main Issuance Details</h3>
              <button
                type="button"
                onClick={() => setSelectedMainItem(null)}
                className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                ✕ Close
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3.5">
                <span className="block text-[0.6rem] font-black uppercase text-blue-800">Asset Information</span>
                <p className="mt-1 text-xs font-black text-slate-900">{selectedMainItem.asset}</p>
                <p className="text-[0.65rem] font-bold text-slate-500">{selectedMainItem.code} · {selectedMainItem.category}</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Recipient Details</span>
                <p className="mt-1 text-xs font-bold text-slate-800">{selectedMainItem.employee}</p>
                <p className="text-[0.65rem] font-medium text-slate-500">{selectedMainItem.department} ({selectedMainItem.position})</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Date Issued</span>
                  <p className="mt-1 text-xs font-bold text-slate-800">{selectedMainItem.date} · {selectedMainItem.time}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Condition</span>
                  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold ${selectedMainItem.conditionTone}`}>
                    {selectedMainItem.condition}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Acknowledgment State</span>
                <p className={`mt-1 text-xs font-bold ${selectedMainItem.acknowledgment === 'Rejected' ? 'text-rose-700' : selectedMainItem.acknowledgment === 'Pending' ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {mainIssuanceAcknowledgmentLabel(selectedMainItem.acknowledgment)}
                </p>
                <p className="mt-0.5 text-[0.65rem] text-slate-500">{selectedMainItem.notes}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMainItem(null)}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </GsoPageFrame>
  )
}
