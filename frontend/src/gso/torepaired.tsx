import { useEffect, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { listEmployees } from './employeesApi'
import { listEmployeeIssuances } from './issuancesApi'
import { listInventoryItems, updateInventoryItem, type InventoryItemRecord } from './inventoryApi'

type RepairQueueItem = {
  code: string
  asset: string
  category: string
  reportedBy: string
  dateReported: string
  issue: string
  priority: string
  priorityTone: string
  repairStatus: string
  repairStatusTone: string
  dateCompleted?: string
}

const repairCompletionReason = 'Repair completed from the To Be Repaired module; item condition updated to Good.'

function repairHistoryTimestamp(value: string) {
  const directTimestamp = new Date(value).getTime()
  if (!Number.isNaN(directTimestamp)) return directTimestamp
  const normalizedTimestamp = new Date(value.replace(/[^\w,\s:/-]/g, ' ')).getTime()
  return Number.isNaN(normalizedTimestamp) ? 0 : normalizedTimestamp
}

function formatRepairCompletionDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(date)
}

function conditionFromReturnNote(note: string, fallback: string) {
  return note.match(/Condition after return:\s*([^.]*)/i)?.[1].trim() || fallback
}

function issueFromReturnNote(note: string, condition: string) {
  const gsoNotes = note.match(/GSO notes:\s*([\s\S]*)$/i)?.[1].trim()
  const issueNotes = gsoNotes?.replace(/\s*Repair priority:\s*(?:High|Medium)\s*$/i, '').trim()
  return issueNotes || `Returned with condition: ${condition}.`
}

function priorityFromReturnNote(note: string, condition: string) {
  const specifiedPriority = note.match(/Repair priority:\s*(High|Medium)\s*$/i)?.[1]
  if (specifiedPriority) return specifiedPriority.toLowerCase() === 'medium' ? 'Medium' : 'High'
  return condition.trim().toLowerCase() === 'under maintenance' ? 'Medium' : 'High'
}

function isRepairCondition(condition: string) {
  return ['needs repair', 'under maintenance', 'unserviceable'].includes(condition.trim().toLowerCase())
}

function reportDateParts(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

export default function ToRepaired() {
  const [activeRepairSection, setActiveRepairSection] = useState<'queue' | 'history'>('queue')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedReportDate, setSelectedReportDate] = useState('')
  const [repairItems, setRepairItems] = useState<RepairQueueItem[]>([])
  const [repairHistoryItems, setRepairHistoryItems] = useState<RepairQueueItem[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRecord[]>([])
  const [isLoadingRepairs, setIsLoadingRepairs] = useState(true)
  const [repairLoadError, setRepairLoadError] = useState('')
  const [selectedRepairItem, setSelectedRepairItem] = useState<RepairQueueItem | null>(null)
  const [repairCompletionItem, setRepairCompletionItem] = useState<RepairQueueItem | null>(null)
  const [isCompletingRepair, setIsCompletingRepair] = useState(false)
  const [repairActionError, setRepairActionError] = useState('')
  const [repairActionMessage, setRepairActionMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadRepairItems = async () => {
      setIsLoadingRepairs(true)
      setRepairLoadError('')

      try {
        const [{ employees }, inventoryItems] = await Promise.all([
          listEmployees(),
          listInventoryItems(),
        ])
        const employeeHistories = await Promise.allSettled(
          employees.map((employee) => listEmployeeIssuances(employee.id)),
        )
        if (!isMounted) return

        setInventoryItems(inventoryItems)
        const inventoryByCode = new Map(inventoryItems.map((item) => [item.itemCode.toLowerCase(), item]))
        const returnedForRepair = employeeHistories.flatMap((historyResult, employeeIndex) => {
          if (historyResult.status !== 'fulfilled') return []

          const employee = employees[employeeIndex]
          return historyResult.value.history.flatMap((entry) => {
            if (entry.event !== 'Returned' && entry.event !== 'Return Pending Approval') return []

            const item = inventoryByCode.get(entry.code.toLowerCase())
            const condition = conditionFromReturnNote(entry.note, item?.condition || '')
            const completionRecords = item?.changeHistory.filter((change) => change.reason === repairCompletionReason) ?? []
            const latestCompletionRecord = [...completionRecords].sort(
              (left, right) => repairHistoryTimestamp(left.changedAt) - repairHistoryTimestamp(right.changedAt),
            )[completionRecords.length - 1]
            const reportTimestamp = repairHistoryTimestamp(entry.date)
            const completionTimestamp = latestCompletionRecord ? repairHistoryTimestamp(latestCompletionRecord.changedAt) : 0
            const isRepairCompleted = entry.event === 'Returned' && completionTimestamp > 0 && reportTimestamp > 0 && completionTimestamp >= reportTimestamp

            if (!isRepairCondition(condition) && !isRepairCompleted) return []
            if (entry.event === 'Returned' && item && !isRepairCondition(item.condition) && !isRepairCompleted) return []
            if (entry.event === 'Returned' && item?.status.toLowerCase() === 'issued' && !isRepairCompleted) return []

            const isPendingApproval = entry.event === 'Return Pending Approval'
            const priority = priorityFromReturnNote(entry.note, condition)
            const repairStatus = isPendingApproval
              ? 'Awaiting Return Approval'
              : isRepairCompleted
                ? 'Repaired / Complete'
                : 'Pending Repair'

            return [{
              code: entry.code,
              asset: item?.description || entry.item,
              category: item?.category || '—',
              reportedBy: `${employee.firstName} ${employee.lastName} (${employee.department})`,
              dateReported: entry.date,
              issue: issueFromReturnNote(entry.note, condition),
              priority,
              priorityTone: priority === 'High' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700',
              repairStatus,
              repairStatusTone: isPendingApproval
                ? 'bg-slate-100 text-slate-700'
                : isRepairCompleted
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700',
              dateCompleted: isRepairCompleted ? formatRepairCompletionDate(latestCompletionRecord?.changedAt) : undefined,
            }]
          })
        })
          .sort((left, right) => {
            const leftDate = new Date(left.dateReported).getTime() || 0
            const rightDate = new Date(right.dateReported).getTime() || 0
            return rightDate - leftDate
          })

        setRepairItems(returnedForRepair.filter((item) => item.repairStatus !== 'Repaired / Complete'))
        setRepairHistoryItems(returnedForRepair.filter((item) => item.repairStatus === 'Repaired / Complete'))
        if (employeeHistories.some((result) => result.status === 'rejected')) {
          setRepairLoadError('Some employee repair records could not be loaded. Refresh the page to try again.')
        }
      } catch (error) {
        if (isMounted) {
          setRepairItems([])
          setRepairHistoryItems([])
          setInventoryItems([])
          setRepairLoadError(error instanceof Error ? error.message : 'Unable to load returned items marked for repair.')
        }
      } finally {
        if (isMounted) setIsLoadingRepairs(false)
      }
    }

    void loadRepairItems()
    return () => { isMounted = false }
  }, [])

  const filteredRepairs = repairItems.filter((item) => {
    const matchesSearch = item.asset.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.reportedBy.toLowerCase().includes(searchQuery.toLowerCase())
    const itemDate = reportDateParts(item.dateReported)
    const matchesDate = !selectedReportDate || itemDate === selectedReportDate

    return matchesSearch && matchesDate
  })
  const filteredRepairHistory = repairHistoryItems.filter((item) => {
    const matchesSearch = item.asset.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.reportedBy.toLowerCase().includes(searchQuery.toLowerCase())
    const itemDate = reportDateParts(item.dateReported)
    const matchesDate = !selectedReportDate || itemDate === selectedReportDate

    return matchesSearch && matchesDate
  })

  const reportFilterDescription = [
    selectedReportDate ? `Date: ${selectedReportDate}` : '',
    searchQuery.trim() ? `Search: ${searchQuery.trim()}` : '',
  ].filter(Boolean).join(' · ') || 'All dates and records'
  const reportFilterFilename = [
    selectedReportDate ? `Date_${selectedReportDate}` : '',
  ].filter(Boolean).join('_')

  const beginRepairCompletion = (item: RepairQueueItem) => {
    setSelectedRepairItem(null)
    setRepairActionError('')
    setRepairActionMessage('')
    setRepairCompletionItem(item)
  }

  const handleMarkAsRepaired = async () => {
    if (!repairCompletionItem || isCompletingRepair) return

    const inventoryItem = inventoryItems.find((item) => item.itemCode.toLowerCase() === repairCompletionItem.code.toLowerCase())
    if (!inventoryItem) {
      setRepairActionError('The matching inventory record could not be found. Refresh the page and try again.')
      return
    }

    setIsCompletingRepair(true)
    setRepairActionError('')
    try {
      const updatedInventoryItem = await updateInventoryItem(inventoryItem.id, {
        itemCode: inventoryItem.itemCode,
        category: inventoryItem.category,
        itemName: inventoryItem.itemName,
        description: inventoryItem.description,
        dateAcquired: inventoryItem.dateAcquired || '',
        timeAcquired: inventoryItem.timeAcquired || '',
        unitCost: Number(inventoryItem.unitCost),
        acquisitionCost: Number(inventoryItem.acquisitionCost),
        currentValue: inventoryItem.currentValue === null ? null : Number(inventoryItem.currentValue),
        quantity: inventoryItem.quantity,
        unitOfMeasure: inventoryItem.unitOfMeasure,
        condition: 'Good',
        reason: repairCompletionReason,
      })

      setInventoryItems((currentItems) => currentItems.map((item) => item.id === updatedInventoryItem.id ? updatedInventoryItem : item))
      setRepairItems((currentItems) => currentItems.filter((item) => item.code.toLowerCase() !== repairCompletionItem.code.toLowerCase()))
      const completionRecords = updatedInventoryItem.changeHistory.filter((change) => change.reason === repairCompletionReason)
      const latestCompletionRecord = [...completionRecords].sort(
        (left, right) => repairHistoryTimestamp(left.changedAt) - repairHistoryTimestamp(right.changedAt),
      )[completionRecords.length - 1]
      const completedRepair: RepairQueueItem = {
        ...repairCompletionItem,
        repairStatus: 'Repaired / Complete',
        repairStatusTone: 'bg-emerald-50 text-emerald-700',
        dateCompleted: formatRepairCompletionDate(latestCompletionRecord?.changedAt || new Date().toISOString()),
      }
      setRepairHistoryItems((currentItems) => [
        completedRepair,
        ...currentItems.filter((item) => !(item.code.toLowerCase() === completedRepair.code.toLowerCase() && item.dateReported === completedRepair.dateReported)),
      ])
      setRepairActionMessage(`${repairCompletionItem.asset} is marked as repaired and is now listed as Good in Items Master Data.`)
      setRepairCompletionItem(null)
    } catch (error) {
      setRepairActionError(error instanceof Error ? error.message : 'Unable to complete this repair. Please try again.')
    } finally {
      setIsCompletingRepair(false)
    }
  }

  const handleGenerateCSV = () => {
    if (filteredRepairs.length === 0) {
      alert('There is no data to export to CSV.')
      return
    }

    const headers = Object.keys(filteredRepairs[0]).join(',')
    const rows = filteredRepairs.map((item) =>
      Object.values(item).map((value) => `"${value}"`).join(','),
    )
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n')
    const link = document.createElement('a')
    link.setAttribute('href', encodeURI(csvContent))
    link.setAttribute('download', `Items_To_Be_Repaired_Report_${reportFilterFilename ? `${reportFilterFilename}_` : ''}${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleGenerateExcel = () => {
    if (filteredRepairs.length === 0) {
      alert('There is no data to export to Excel.')
      return
    }

    const highPriorityCount = filteredRepairs.filter((item) => item.priority === 'High').length
    const mediumPriorityCount = filteredRepairs.filter((item) => item.priority === 'Medium').length
    const awaitingApprovalCount = filteredRepairs.filter((item) => item.repairStatus === 'Awaiting Return Approval').length
    const generatedAt = new Intl.DateTimeFormat('en-PH', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Asia/Manila',
    }).format(new Date())

    const reportRows = filteredRepairs.map((item, index) => {
      const rowBackground = index % 2 === 0 ? '#ffffff' : '#f1f5f9'
      const priorityStyle = item.priority === 'High'
        ? 'background:#fff1f2;color:#be123c;'
        : 'background:#fffbeb;color:#b45309;'
      const statusStyle = item.repairStatus === 'Awaiting Return Approval'
        ? 'background:#f1f5f9;color:#475569;'
        : 'background:#fffbeb;color:#b45309;'

      return `<tr style="background:${rowBackground};">
        <td style="width:220px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
          <strong style="color:#0f172a;">${escapeReportHTML(item.asset)}</strong><br>
          <span style="font-size:10pt;color:#475569;">${escapeReportHTML(item.code)}</span><br>
          <span style="font-size:9pt;color:#64748b;">${escapeReportHTML(item.category)}</span>
        </td>
        <td style="width:210px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">${escapeReportHTML(item.reportedBy)}</td>
        <td style="width:145px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">${escapeReportHTML(item.dateReported)}</td>
        <td style="width:390px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;white-space:normal;">${escapeReportHTML(item.issue || '—').replace(/\r?\n/g, '<br>')}</td>
        <td style="width:125px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
          <span style="${priorityStyle}font-weight:bold;padding:4px 7px;">${escapeReportHTML(item.priority)}</span>
        </td>
        <td style="width:180px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
          <span style="${statusStyle}font-weight:bold;padding:4px 7px;">${escapeReportHTML(item.repairStatus)}</span>
        </td>
      </tr>`
    }).join('')

    const workbookHTML = `<!DOCTYPE html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <meta name="ProgId" content="Excel.Sheet">
          <title>Items To Be Repaired Report</title>
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
              <div style="font-size:10pt;font-weight:bold;letter-spacing:1px;color:#bfdbfe;">ASSET MAINTENANCE</div>
              <h1 style="margin:7px 0 4px;font-size:22pt;color:#ffffff;">Items To Be Repaired Report</h1>
              <div style="font-size:10pt;color:#dbeafe;">Generated ${escapeReportHTML(generatedAt)} · Filters: ${escapeReportHTML(reportFilterDescription)}</div>
            </td></tr>
          </table>
          <table class="summary" style="width:1270px;margin-bottom:16px;border-collapse:collapse;">
            <tr>
              <td style="width:25%;background:#f8fafc;"><div style="font-size:9pt;color:#64748b;">TOTAL RECORDS</div><strong style="font-size:16pt;color:#09244a;">${filteredRepairs.length}</strong></td>
              <td style="width:25%;background:#fff1f2;"><div style="font-size:9pt;color:#be123c;">HIGH PRIORITY</div><strong style="font-size:16pt;color:#be123c;">${highPriorityCount}</strong></td>
              <td style="width:25%;background:#fffbeb;"><div style="font-size:9pt;color:#b45309;">MEDIUM PRIORITY</div><strong style="font-size:16pt;color:#b45309;">${mediumPriorityCount}</strong></td>
              <td style="width:25%;background:#f1f5f9;"><div style="font-size:9pt;color:#475569;">AWAITING APPROVAL</div><strong style="font-size:16pt;color:#475569;">${awaitingApprovalCount}</strong></td>
            </tr>
          </table>
          <table class="report-table">
            <colgroup>
              <col style="width:220px;"><col style="width:210px;"><col style="width:145px;">
              <col style="width:390px;"><col style="width:125px;"><col style="width:180px;">
            </colgroup>
            <thead><tr>
              <th>Asset / Item</th><th>Reported By</th><th>Date Reported</th>
              <th>Issue / Damage Description</th><th>Priority</th><th>Repair Status</th>
            </tr></thead>
            <tbody>${reportRows}</tbody>
          </table>
        </body>
      </html>`

    const workbookBlob = new Blob(['\uFEFF', workbookHTML], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const workbookUrl = URL.createObjectURL(workbookBlob)
    const link = document.createElement('a')
    link.href = workbookUrl
    link.download = `Items_To_Be_Repaired_Styled_Report_${new Date().toISOString().slice(0, 10)}.xls`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.setTimeout(() => URL.revokeObjectURL(workbookUrl), 0)
  }

  const handleGenerateWord = () => {
    if (filteredRepairs.length === 0) {
      alert('There is no data to export to Word.')
      return
    }

    const highPriorityCount = filteredRepairs.filter((item) => item.priority === 'High').length
    const mediumPriorityCount = filteredRepairs.filter((item) => item.priority === 'Medium').length
    const awaitingApprovalCount = filteredRepairs.filter((item) => item.repairStatus === 'Awaiting Return Approval').length
    const generatedAt = new Intl.DateTimeFormat('en-PH', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Asia/Manila',
    }).format(new Date())
    const reportRows = filteredRepairs.map((item, index) => {
      const priorityColor = item.priority === 'High' ? '#be123c' : '#b45309'
      const statusColor = item.repairStatus === 'Awaiting Return Approval' ? '#475569' : '#b45309'

      return `<tr style="background:${index % 2 === 0 ? '#ffffff' : '#f8fafc'};page-break-inside:avoid;">
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">
          <strong style="color:#0f172a;">${escapeReportHTML(item.asset)}</strong><br>
          <span style="font-size:9pt;color:#475569;">Code: ${escapeReportHTML(item.code)}</span><br>
          <span style="font-size:9pt;color:#64748b;">${escapeReportHTML(item.category)}</span>
        </td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">${escapeReportHTML(item.reportedBy)}</td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;white-space:nowrap;">${escapeReportHTML(item.dateReported)}</td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">${escapeReportHTML(item.issue || '—').replace(/\r?\n/g, '<br>')}</td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;white-space:nowrap;">
          <span style="font-weight:bold;color:${priorityColor};">${escapeReportHTML(item.priority)}</span>
        </td>
        <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">
          <span style="font-weight:bold;color:${statusColor};">${escapeReportHTML(item.repairStatus)}</span>
        </td>
      </tr>`
    }).join('')
    const sourceHTML = `<!DOCTYPE html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <title>Items To Be Repaired Report</title>
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
                <div style="font-size:9pt;font-weight:bold;letter-spacing:1.2px;color:#bfdbfe;">ASSET MAINTENANCE</div>
                <h1 style="margin:7px 0 4px;font-size:22pt;color:#ffffff;">Items To Be Repaired Report</h1>
                <div style="font-size:9pt;color:#dbeafe;">Generated ${escapeReportHTML(generatedAt)} · Filters: ${escapeReportHTML(reportFilterDescription)}</div>
              </td></tr>
            </table>
            <table style="margin-bottom:16px;border-collapse:separate;border-spacing:8px 0;">
              <tr>
                <td style="width:25%;padding:10px 12px;border:1px solid #dbe3ef;background:#f8fafc;"><div style="font-size:8pt;color:#64748b;text-transform:uppercase;">Records in this report</div><strong style="font-size:16pt;color:#09244a;">${filteredRepairs.length}</strong></td>
                <td style="width:25%;padding:10px 12px;border:1px solid #fecdd3;background:#fff1f2;"><div style="font-size:8pt;color:#be123c;text-transform:uppercase;">High priority</div><strong style="font-size:16pt;color:#be123c;">${highPriorityCount}</strong></td>
                <td style="width:25%;padding:10px 12px;border:1px solid #fde68a;background:#fffbeb;"><div style="font-size:8pt;color:#b45309;text-transform:uppercase;">Medium priority</div><strong style="font-size:16pt;color:#b45309;">${mediumPriorityCount}</strong></td>
                <td style="width:25%;padding:10px 12px;border:1px solid #dbe3ef;background:#f1f5f9;"><div style="font-size:8pt;color:#475569;text-transform:uppercase;">Awaiting return approval</div><strong style="font-size:16pt;color:#475569;">${awaitingApprovalCount}</strong></td>
              </tr>
            </table>
            <table style="width:100%;border-collapse:collapse;font-size:9pt;">
              <thead><tr style="background:#09244a;color:#ffffff;">
                <th style="padding:9px;border:1px solid #09244a;text-align:left;">Asset / Item</th>
                <th style="padding:9px;border:1px solid #09244a;text-align:left;">Reported By</th>
                <th style="padding:9px;border:1px solid #09244a;text-align:left;">Date Reported</th>
                <th style="padding:9px;border:1px solid #09244a;text-align:left;">Issue / Damage Description</th>
                <th style="padding:9px;border:1px solid #09244a;text-align:left;">Priority</th>
                <th style="padding:9px;border:1px solid #09244a;text-align:left;">Repair Status</th>
              </tr></thead>
              <tbody>${reportRows}</tbody>
            </table>
            <p style="margin-top:14px;font-size:8pt;color:#64748b;">This report contains the repair records matching the search, date, and month filters selected in the To Be Repaired page.</p>
          </div>
        </body>
      </html>`
    const fileDownload = document.createElement('a')
    fileDownload.href = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML)
    fileDownload.download = `Items_To_Be_Repaired_Report_${new Date().toISOString().slice(0, 10)}.doc`
    document.body.appendChild(fileDownload)
    fileDownload.click()
    document.body.removeChild(fileDownload)
  }

  const exportHandlers = {
    csv: handleGenerateCSV,
    excel: handleGenerateExcel,
    word: handleGenerateWord,
  }

  return (
    <GsoPageFrame activePage="To Be Repaired" searchPlaceholder="Search asset, code, or reporter...">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              Asset Maintenance
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">To Be Repaired</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
              Review equipment reported for inspection, maintenance, or repair.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4" role="group" aria-label="Repair records view">
            <button
              type="button"
              aria-pressed={activeRepairSection === 'queue'}
              onClick={() => setActiveRepairSection('queue')}
              className={`rounded-xl px-4 py-2 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${activeRepairSection === 'queue' ? 'bg-white text-[#09244a]' : 'border border-white/10 bg-white/8 text-white hover:bg-white/15'}`}
            >
              Items To Be Repaired ({isLoadingRepairs ? '…' : repairItems.length})
            </button>
            <button
              type="button"
              aria-pressed={activeRepairSection === 'history'}
              onClick={() => setActiveRepairSection('history')}
              className={`rounded-xl px-4 py-2 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${activeRepairSection === 'history' ? 'bg-white text-[#09244a]' : 'border border-white/10 bg-white/8 text-white hover:bg-white/15'}`}
            >
              Complete Repair History ({isLoadingRepairs ? '…' : repairHistoryItems.length})
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/55 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(300px,1.2fr)] lg:items-center">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
            </span>
            <div>
              <label htmlFor="repair-item-search" className="block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-600">
                Search repair items
              </label>
              <p className="mt-1 text-xs font-medium text-slate-400">Find by asset name, code, or reporter.</p>
            </div>
          </div>
          <div className="relative">
            <svg aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              id="repair-item-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search asset, code, or reporter..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-11 text-xs font-semibold text-slate-700 outline-none transition placeholder:font-medium placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m18 6-12 12M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </section>

      {repairActionMessage && (
        <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          {repairActionMessage}
        </div>
      )}

      {activeRepairSection === 'queue' && (
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Items To Be Repaired</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Defective equipment flagged for repair. Select a row to review its details.
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
              {filteredRepairs.length} item(s) in queue
            </span>
          </div>
        </div>

        <div className="max-h-[65vh] overflow-auto overscroll-contain border-t border-slate-100">
          <table className="min-w-220 w-full text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-500 shadow-sm">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Asset / Item</th>
                <th className="px-5 py-3.5">Reported By</th>
                <th className="px-5 py-3.5">Date Reported</th>
                <th className="px-5 py-3.5">Issue / Damage Description</th>
                <th className="px-5 py-3.5">Priority</th>
                <th className="px-5 py-3.5 sm:px-6">Repair Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingRepairs && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">
                    Loading return and repair records...
                  </td>
                </tr>
              )}
              {!isLoadingRepairs && filteredRepairs.map((item, index) => (
                <tr
                  key={`${item.code}-${item.dateReported}-${index}`}
                  onClick={() => setSelectedRepairItem(item)}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/60"
                >
                  <td className="px-5 py-4 sm:px-6">
                    <span className="block text-xs font-extrabold text-slate-800">{item.asset}</span>
                    <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{item.code} · {item.category}</span>
                  </td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-700">{item.reportedBy}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-600">{item.dateReported}</td>
                  <td className="max-w-xs px-5 py-4 text-xs text-slate-600">{item.issue}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${item.priorityTone}`}>
                      {item.priority}
                    </span>
                  </td>
                  <td className="px-5 py-4 sm:px-6">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${item.repairStatusTone}`}>
                      {item.repairStatus}
                    </span>
                  </td>
                </tr>
              ))}
              {!isLoadingRepairs && repairLoadError && (
                <tr>
                  <td colSpan={6} className="px-5 py-4 text-center text-xs font-semibold text-amber-700">
                    {repairLoadError}
                  </td>
                </tr>
              )}
              {!isLoadingRepairs && !repairLoadError && filteredRepairs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">
                    No returned items marked for repair match your search and date filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {activeRepairSection === 'history' && (
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Completed Repair History</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Repairs marked complete are kept here with their completion status.</p>
          </div>
          <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-[0.65rem] font-extrabold text-emerald-700">
            {repairHistoryItems.length} completed
          </span>
        </div>

        <div className="max-h-[55vh] overflow-auto overscroll-contain border-t border-slate-100">
          <table className="min-w-220 w-full text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-500 shadow-sm">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Asset / Item</th>
                <th className="px-5 py-3.5">Reported By</th>
                <th className="px-5 py-3.5">Date Reported</th>
                <th className="px-5 py-3.5">Completed On</th>
                <th className="px-5 py-3.5">Issue / Damage</th>
                <th className="px-5 py-3.5 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingRepairs && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">Loading repair history...</td>
                </tr>
              )}
              {!isLoadingRepairs && filteredRepairHistory.map((item, index) => (
                <tr
                  key={`${item.code}-${item.dateReported}-${index}`}
                  onClick={() => setSelectedRepairItem(item)}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/60"
                >
                  <td className="px-5 py-4 sm:px-6">
                    <span className="block text-xs font-extrabold text-slate-800">{item.asset}</span>
                    <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{item.code} · {item.category}</span>
                  </td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-700">{item.reportedBy}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-600">{item.dateReported}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-600">{item.dateCompleted || '—'}</td>
                  <td className="max-w-xs px-5 py-4 text-xs text-slate-600">{item.issue}</td>
                  <td className="px-5 py-4 sm:px-6">
                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-emerald-700">Repaired / Complete</span>
                  </td>
                </tr>
              ))}
              {!isLoadingRepairs && filteredRepairHistory.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">No completed repairs match your search and date filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {selectedRepairItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">Repair Ticket Details</h3>
              <button
                type="button"
                onClick={() => setSelectedRepairItem(null)}
                className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-rose-100 bg-rose-50/30 p-3.5">
                <span className="block text-[0.6rem] font-black uppercase text-rose-800">Defective Asset</span>
                <p className="mt-1 text-xs font-black text-slate-900">{selectedRepairItem.asset}</p>
                <p className="text-[0.65rem] font-bold text-slate-500">{selectedRepairItem.code}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Damage / Issue Report</span>
                <p className="mt-1 text-xs font-semibold text-slate-800">{selectedRepairItem.issue}</p>
                <p className="mt-1 text-[0.65rem] text-slate-400">Reported by: {selectedRepairItem.reportedBy} on {selectedRepairItem.dateReported}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.6rem] font-extrabold uppercase text-slate-400">Repair Status</span>
                <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${selectedRepairItem.repairStatusTone}`}>
                  {selectedRepairItem.repairStatus}
                </span>
                {selectedRepairItem.dateCompleted && (
                  <p className="mt-1 text-[0.65rem] text-slate-500">Completed on: {selectedRepairItem.dateCompleted}</p>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              {selectedRepairItem.repairStatus === 'Pending Repair' && (
                <button
                  type="button"
                  onClick={() => beginRepairCompletion(selectedRepairItem)}
                  className="mr-auto inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2"
                >
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 4 4L19 6" />
                    <path d="M12 22a10 10 0 1 0-10-10" />
                  </svg>
                  Mark as Repaired
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedRepairItem(null)}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {repairCompletionItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="repair-completion-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 4 4L19 6" />
                  <path d="M12 22a10 10 0 1 0-10-10" />
                </svg>
              </span>
              <div>
                <h3 id="repair-completion-title" className="text-sm font-black text-slate-900">Complete Repair</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Mark <span className="font-bold text-slate-700">{repairCompletionItem.asset}</span> ({repairCompletionItem.code}) as repaired? Its condition in Items Master Data will be updated to Good.
                </p>
              </div>
            </div>
            {repairActionError && (
              <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">
                {repairActionError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={isCompletingRepair}
                onClick={() => { setRepairCompletionItem(null); setRepairActionError('') }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCompletingRepair}
                onClick={() => { void handleMarkAsRepaired() }}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCompletingRepair ? 'Saving...' : 'Confirm Repair'}
              </button>
            </div>
          </section>
        </div>
      )}
    </GsoPageFrame>
  )
}
