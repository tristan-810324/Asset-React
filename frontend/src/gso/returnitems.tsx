import { useEffect, useRef, useState, type FormEvent } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { listDepartments, listEmployees } from './employeesApi'
import {
  confirmTaggedAssetReturn,
  createEmployeeReturn,
  getAssetTagForInspection,
  listEmployeeIssuances,
  type AssetTagInspectionRecord,
} from './issuancesApi'
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

const assetTagCodePattern = /^(?:AST-(?:[A-Z0-9]{13}|[A-F0-9]{20})|[A-Z0-9]{13}|[A-F0-9]{20})$/i
const barcodeScanQuietPeriodMs = 220

type ReturnedItemRecord = {
  code: string
  tagCode: string | null
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

type BulkReturnOption = {
  id: string
  employeeCode: string
  employeeName: string
  itemCode: string
  itemName: string
  quantity: number
  unitOfMeasure: string
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

function formatBorrowerHistoryDate(value: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(date)
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
  if (normalizedStatus === 'to be repaired') return 'bg-rose-50 text-rose-700'
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
  const [returnsRefreshToken, setReturnsRefreshToken] = useState(0)
  const [scannerCode, setScannerCode] = useState('')
  const scannerInputRef = useRef<HTMLInputElement>(null)
  const scannerLookupTimerRef = useRef<number | null>(null)
  const barcodeLookupInFlightRef = useRef(false)
  const [hasScannerFocus, setHasScannerFocus] = useState(false)
  const [scannedTag, setScannedTag] = useState<AssetTagInspectionRecord | null>(null)
  const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false)
  const [isConfirmingReturn, setIsConfirmingReturn] = useState(false)
  const [barcodeError, setBarcodeError] = useState('')
  const [returnMessage, setReturnMessage] = useState('')
  const [returnCondition, setReturnCondition] = useState('Good')
  const [returnNote, setReturnNote] = useState('')
  const [bulkReturnOptions, setBulkReturnOptions] = useState<BulkReturnOption[]>([])
  const [selectedBulkReturnId, setSelectedBulkReturnId] = useState('')
  const [bulkReturnQuantity, setBulkReturnQuantity] = useState('1')
  const [bulkReturnCondition, setBulkReturnCondition] = useState('Good')
  const [bulkReturnReason, setBulkReturnReason] = useState('Bulk stock return processed by GSO.')
  const [isSubmittingBulkReturn, setIsSubmittingBulkReturn] = useState(false)
  const [bulkReturnError, setBulkReturnError] = useState('')
  const [bulkReturnMessage, setBulkReturnMessage] = useState('')

  useEffect(() => () => {
    if (scannerLookupTimerRef.current !== null) {
      window.clearTimeout(scannerLookupTimerRef.current)
    }
  }, [])

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
        const inventoryItemsByCode = new Map(inventoryItems.map((item) => [item.itemCode.toLowerCase(), item]))
        const quantityReturnOptions: BulkReturnOption[] = employeeHistories.flatMap((history, index) => {
          if (history.status !== 'fulfilled') return []
          const employee = employees[index]
          if (!employee) return []
          const pendingReturnCodes = new Set(history.value.history
            .filter((entry) => entry.event === 'Return Pending Approval')
            .map((entry) => entry.code.toLowerCase()))
          return history.value.assignedItems.flatMap((assignedItem) => {
            if (pendingReturnCodes.has(assignedItem.code.toLowerCase())) return []
            const inventoryItem = inventoryItemsByCode.get(assignedItem.code.toLowerCase())
            if (!inventoryItem || inventoryItem.trackingMode !== 'quantity') return []
            return [{
              id: assignedItem.id,
              employeeCode: employee.id,
              employeeName: `${employee.firstName} ${employee.lastName}`,
              itemCode: assignedItem.code,
              itemName: assignedItem.name,
              quantity: assignedItem.quantity,
              unitOfMeasure: assignedItem.unitOfMeasure,
            }]
          })
        })
        setBulkReturnOptions(quantityReturnOptions)
        setSelectedBulkReturnId((current) => quantityReturnOptions.some((option) => option.id === current)
          ? current
          : quantityReturnOptions[0]?.id || '')
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
              const tagCode = typeof change.newValues.tagCode === 'string' ? change.newValues.tagCode : null
              const matchingReturn = (tagCode
                ? employeeHistory.find((entry) => entry.event === 'Returned' && entry.assetTagCode === tagCode)
                : undefined) || employeeHistory.find((entry) =>
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
              const repairConditions = ['needs repair', 'under maintenance', 'unserviceable']
              const status = tagCode
                ? repairConditions.includes(condition.toLowerCase()) ? 'To Be Repaired' : 'In Storage'
                : inventoryStatus.toLowerCase() === 'available' ? 'In Storage' : inventoryStatus

              return {
                timestamp: new Date(change.changedAt).getTime() || 0,
                record: {
                  code: item.itemCode,
                  tagCode,
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
  }, [returnsRefreshToken])

  function focusScannerInput(delay = 0) {
    window.setTimeout(() => scannerInputRef.current?.focus(), delay)
  }

  async function lookupScannedTag(value: string) {
    const tagCode = value.trim().toUpperCase()
    if (!tagCode) {
      setBarcodeError('Scan or enter an item barcode first.')
      return
    }
    if (barcodeLookupInFlightRef.current || scannedTag || isConfirmingReturn) return

    if (scannerLookupTimerRef.current !== null) {
      window.clearTimeout(scannerLookupTimerRef.current)
      scannerLookupTimerRef.current = null
    }

    barcodeLookupInFlightRef.current = true
    setScannerCode('')
    setIsLookingUpBarcode(true)
    setBarcodeError('')
    setReturnMessage('')
    let foundTag = false
    try {
      const tag = await getAssetTagForInspection(tagCode)
      if (tag.custodyStatus !== 'Issued' || !tag.employeeCode) {
        throw new Error(`${tag.tagCode} is not currently assigned to an employee.`)
      }
      setScannedTag(tag)
      foundTag = true
      setReturnCondition(['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable'].includes(tag.condition) ? tag.condition : 'Good')
      setReturnNote('')
    } catch (error) {
      setScannedTag(null)
      setBarcodeError(error instanceof Error ? error.message : 'Could not find that item barcode.')
    } finally {
      barcodeLookupInFlightRef.current = false
      setIsLookingUpBarcode(false)
      if (!foundTag) focusScannerInput()
    }
  }

  function handleScannerInputChange(value: string) {
    setScannerCode(value)
    if (scannerLookupTimerRef.current !== null) {
      window.clearTimeout(scannerLookupTimerRef.current)
      scannerLookupTimerRef.current = null
    }

    if (!assetTagCodePattern.test(value.trim())) return
    scannerLookupTimerRef.current = window.setTimeout(() => {
      scannerLookupTimerRef.current = null
      void lookupScannedTag(value)
    }, barcodeScanQuietPeriodMs)
  }

  function handleBarcodeLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void lookupScannedTag(scannerCode)
  }

  function closeScannedTagDialog() {
    if (isConfirmingReturn) return
    setScannedTag(null)
    setScannerCode('')
    setReturnNote('')
    setBarcodeError('')
    focusScannerInput()
  }

  async function handleBulkReturnSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selectedReturn = bulkReturnOptions.find((option) => option.id === selectedBulkReturnId)
    const quantity = Number(bulkReturnQuantity)
    if (!selectedReturn) {
      setBulkReturnError('Select an active bulk-stock issuance first.')
      return
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > selectedReturn.quantity) {
      setBulkReturnError(`Enter a whole quantity from 1 to ${selectedReturn.quantity} ${selectedReturn.unitOfMeasure}.`)
      return
    }
    if (!bulkReturnReason.trim()) {
      setBulkReturnError('Enter the return reason or inspection notes.')
      return
    }

    setIsSubmittingBulkReturn(true)
    setBulkReturnError('')
    setBulkReturnMessage('')
    try {
      const request = await createEmployeeReturn(
        selectedReturn.employeeCode,
        selectedReturn.itemCode,
        bulkReturnCondition,
        bulkReturnReason.trim(),
        selectedReturn.id,
        quantity,
      )
      setBulkReturnMessage(request.emailSent
        ? `GSO recorded the return of ${quantity} ${selectedReturn.unitOfMeasure} of ${selectedReturn.itemName}. A confirmation email was sent to ${selectedReturn.employeeName}.`
        : `GSO recorded the return of ${quantity} ${selectedReturn.unitOfMeasure} of ${selectedReturn.itemName}, but the confirmation email could not be sent.`)
      setBulkReturnQuantity('1')
      setBulkReturnReason('')
      setReturnsRefreshToken((current) => current + 1)
    } catch (error) {
      setBulkReturnError(error instanceof Error ? error.message : 'Unable to create this quantity return request.')
    } finally {
      setIsSubmittingBulkReturn(false)
    }
  }

  async function handleReturnConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!scannedTag) return

    setIsConfirmingReturn(true)
    setBarcodeError('')
    try {
      const result = await confirmTaggedAssetReturn(scannedTag.tagCode, {
        condition: returnCondition,
        reason: returnNote,
      })
      setScannedTag(null)
      setScannerCode('')
      setReturnNote('')
      setReturnMessage(`${result.tagCode} was returned for ${result.employeeName} and routed to ${result.destination}.`)
      setReturnsRefreshToken((current) => current + 1)
      focusScannerInput(50)
    } catch (error) {
      setBarcodeError(error instanceof Error ? error.message : 'Could not confirm this item return.')
    } finally {
      setIsConfirmingReturn(false)
    }
  }

  const filteredItems = returnedItems.filter((item) => {
    const query = searchQuery.toLowerCase()
    const matchesSearch = item.asset.toLowerCase().includes(query)
      || item.code.toLowerCase().includes(query)
      || (item.tagCode?.toLowerCase().includes(query) ?? false)
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
              Scan a unique per-unit asset tag for physical assets. Record bulk stock returns by quantity.
            </p>
          </div>
          
        </div>
        <nav className="relative mt-6 flex flex-wrap gap-2 border-t border-blue-400/20 pt-4" aria-label="Issuance and return records">
          <a href="/gso/issuance" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-extrabold text-blue-100 transition hover:bg-white/12">
            + Issuances Records ({mainIssuancesCount})
          </a>
          <a href="/gso/main-issuance" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-extrabold text-blue-100 transition hover:bg-white/12">
            + Main Issuance
          </a>
          <a href="/gso/return-items" aria-current="page" className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-blue-950 shadow-md">
            + Returned Items ({returnedItems.length})
          </a>
        </nav>
      </section>

      <section className="mt-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6" aria-labelledby="return-scan-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="return-scan-title" className="text-sm font-black text-slate-900">Process an item return</h2>
            <p className="mt-1 text-xs text-slate-500">This scanner handles individually tagged assets. Bulk stock is returned by quantity through the employee return approval.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[0.62rem] font-extrabold text-blue-700">GSO confirmation</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-extrabold text-blue-900" role="status" aria-live="polite">
              <span className={`h-2.5 w-2.5 rounded-full ${isLookingUpBarcode ? 'animate-pulse bg-amber-500' : hasScannerFocus ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {isLookingUpBarcode ? 'Reading barcode...' : scannedTag ? 'Inspection in progress' : hasScannerFocus ? 'Scanner ready' : 'Scanner waiting for focus'}
            </p>
            <p className="mt-1 text-[0.68rem] text-slate-600">Scan the label on one unit. Item and borrower details will pop up automatically; no typing or scan button is needed.</p>
          </div>
          <button type="button" onClick={() => focusScannerInput()} disabled={isLookingUpBarcode || Boolean(scannedTag)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-[0.68rem] font-extrabold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">
            Focus scanner
          </button>
        </div>
        <form onSubmit={handleBarcodeLookup} aria-label="USB barcode scanner input" className="sr-only">
          <input
            ref={scannerInputRef}
            type="text"
            value={scannerCode}
            onChange={(event) => handleScannerInputChange(event.target.value)}
            onFocus={() => setHasScannerFocus(true)}
            onBlur={() => setHasScannerFocus(false)}
            autoComplete="off"
            autoFocus
            aria-label="Scan an individual asset barcode"
            disabled={isLookingUpBarcode || Boolean(scannedTag) || isConfirmingReturn}
          />
          <button type="submit" tabIndex={-1} aria-hidden="true" />
        </form>
        {barcodeError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{barcodeError}</p>}
        {returnMessage && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{returnMessage}</p>}
      </section>

      <section className="mt-5 rounded-2xl border border-amber-100 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6" aria-labelledby="bulk-return-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="bulk-return-title" className="text-sm font-black text-slate-900">Return bulk stock by quantity</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Use this flow for quantity-tracked items. GSO records the returned quantity and condition, then sends the employee a confirmation email. Bulk stock shares one inventory condition; use per-unit tracking when units can differ.</p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[0.62rem] font-extrabold text-amber-700">No unit barcode required</span>
        </div>
        {bulkReturnOptions.length > 0 ? (
          <form onSubmit={(event) => void handleBulkReturnSubmit(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Issued bulk item</span>
              <select
                value={selectedBulkReturnId}
                onChange={(event) => {
                  setSelectedBulkReturnId(event.target.value)
                  setBulkReturnQuantity('1')
                  setBulkReturnError('')
                }}
                disabled={isSubmittingBulkReturn}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50"
              >
                {bulkReturnOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.employeeName} · {option.itemName} ({option.itemCode}) · {option.quantity} {option.unitOfMeasure} outstanding
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Quantity to return</span>
              <input
                type="number"
                min="1"
                max={bulkReturnOptions.find((option) => option.id === selectedBulkReturnId)?.quantity || 1}
                step="1"
                value={bulkReturnQuantity}
                onChange={(event) => setBulkReturnQuantity(event.target.value)}
                disabled={isSubmittingBulkReturn}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Condition after return</span>
              <select
                value={bulkReturnCondition}
                onChange={(event) => setBulkReturnCondition(event.target.value)}
                disabled={isSubmittingBulkReturn}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50"
              >
                {['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'].map((condition) => (
                  <option key={condition} value={condition}>{condition}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Return reason / inspection notes</span>
              <input
                type="text"
                value={bulkReturnReason}
                onChange={(event) => setBulkReturnReason(event.target.value)}
                maxLength={1000}
                disabled={isSubmittingBulkReturn}
                placeholder="Enter the return reason or inspection notes"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50"
              />
            </label>
            {bulkReturnError && <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{bulkReturnError}</p>}
            {bulkReturnMessage && <p role="status" className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{bulkReturnMessage}</p>}
            <div className="sm:col-span-2 flex justify-end">
              <button type="submit" disabled={isSubmittingBulkReturn} className="rounded-xl bg-amber-600 px-5 py-3 text-xs font-extrabold text-white transition hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60">
                {isSubmittingBulkReturn ? 'Recording return…' : 'Record quantity return'}
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs font-semibold text-slate-500">
            No active bulk-stock issuances are available to return by quantity.
          </p>
        )}
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
                    <span className="mt-1 block text-[0.62rem] font-bold text-slate-500">{item.tagCode || item.code} · {item.category}</span>
                    {item.tagCode && <span className="mt-0.5 block text-[0.58rem] text-slate-400">Item code: {item.code}</span>}
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

      {scannedTag && (
        <div className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="return-confirm-title" className="my-auto w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-blue-600">{scannedTag.tagCode}</p>
                <h2 id="return-confirm-title" className="mt-1 text-lg font-black text-slate-900">Confirm item return</h2>
                <p className="mt-1 text-xs text-slate-500">Check the item and condition before saving.</p>
              </div>
              <button type="button" disabled={isConfirmingReturn} onClick={closeScannedTagDialog} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Close</button>
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-2">
              <div>
                <span className="block text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">Item</span>
                <p className="mt-1 text-xs font-extrabold text-slate-800">{scannedTag.itemName}</p>
                <p className="mt-0.5 text-[0.68rem] text-slate-500">{scannedTag.itemCode} · Unit {scannedTag.unitNumber}</p>
              </div>
              <div>
                <span className="block text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">Assigned to</span>
                <p className="mt-1 text-xs font-extrabold text-slate-800">{scannedTag.employeeName}</p>
                <p className="mt-0.5 text-[0.68rem] text-slate-500">{scannedTag.employeeCode}</p>
              </div>
              <div className="sm:col-span-2">
                <span className="block text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">Current condition</span>
                <p className="mt-1 text-xs font-bold text-slate-800">{scannedTag.condition}</p>
              </div>
            </div>

            <section className="mt-3 rounded-xl border border-blue-100 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-extrabold text-slate-800">Borrower history for this unit</h3>
                <span className="text-[0.62rem] font-semibold text-slate-400">Latest first</span>
              </div>
              {(scannedTag.borrowerHistory || []).length > 0 ? (
                <ol className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {(scannedTag.borrowerHistory ?? []).map((borrower, index) => (
                    <li key={`${borrower.employeeCode}-${borrower.issuedAt}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-extrabold text-slate-800">{borrower.employeeName}</p>
                          <p className="mt-0.5 text-[0.65rem] font-semibold text-slate-500">{borrower.employeeCode} | {borrower.department} | {borrower.position}</p>
                          <p className="mt-0.5 break-all text-[0.62rem] text-slate-500">{borrower.email}</p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[0.58rem] font-extrabold ${borrower.status === 'Issued' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'}`}>
                          {borrower.status === 'Issued' ? 'Currently assigned' : 'Previous borrower'}
                        </span>
                      </div>
                      <p className="mt-2 text-[0.62rem] text-slate-600">
                        Issued {formatBorrowerHistoryDate(borrower.issuedAt)}
                        {borrower.returnedAt ? ` | Returned ${formatBorrowerHistoryDate(borrower.returnedAt)}` : ''}
                        {borrower.returnCondition ? ` | Return condition: ${borrower.returnCondition}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-[0.68rem] text-slate-500">No borrower history has been recorded for this tag.</p>
              )}
            </section>

            <form onSubmit={(event) => void handleReturnConfirmation(event)} className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Condition after inspection</span>
                <select value={returnCondition} onChange={(event) => setReturnCondition(event.target.value)} disabled={isConfirmingReturn} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                  <option>New</option><option>Good</option><option>Fair</option><option>Needs Repair</option><option>Under Maintenance</option><option>Unserviceable</option>
                </select>
              </label>
              <div className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${['Needs Repair', 'Under Maintenance', 'Unserviceable'].includes(returnCondition) ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
                {['Needs Repair', 'Under Maintenance', 'Unserviceable'].includes(returnCondition)
                  ? 'This item will be routed to To Be Repaired.'
                  : 'This item will be returned to GSO Storage.'}
              </div>
              <label className="block">
                <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Return notes (optional)</span>
                <textarea maxLength={1000} value={returnNote} onChange={(event) => setReturnNote(event.target.value)} disabled={isConfirmingReturn} placeholder="Add a note about the item's condition" className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
              </label>
              {barcodeError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{barcodeError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" disabled={isConfirmingReturn} onClick={closeScannedTagDialog} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={isConfirmingReturn} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-blue-700 disabled:opacity-50">{isConfirmingReturn ? 'Saving return…' : 'Confirm return'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

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
                {selectedItem.tagCode && <p className="mt-1 text-[0.65rem] font-bold text-blue-700">Barcode: {selectedItem.tagCode}</p>}
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
