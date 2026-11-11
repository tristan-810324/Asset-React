import JsBarcode from 'jsbarcode'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import {
  createEmployeeIssuanceBatch,
  getEmployeeIssuanceBatch,
  recordEmployeeIssuanceHandover,
  listEmployeeIssuances,
  recordLabelPrintBatch,
  type EmployeeIssuanceBatchDetails,
  type EmployeeIssuanceRecord,
} from './issuancesApi'
import { createEmployee, listEmployeePositions, listEmployees, type EmployeeProfile, type EmployeeProfileInput } from './employeesApi'
import { listInventoryItems, type InventoryItemRecord } from './inventoryApi'
import { getStaffPurchaseRequisition, listStaffPurchaseRequisitions } from './purchaseRequisitionsApi'
import { linesOf, formText } from './requisitionFlow'
import { RequisitionIssuanceShortcuts } from './requisitionIssuanceShortcuts'
import type { PurchaseRequisitionLine, ServiceRequest } from '../requesters/requesterApi'

type InventoryFlow = 'individual' | 'consumable' | 'reusable'
type InventoryTypeFilter = 'all' | 'individual' | 'consumable'
type RecipientAllocation = { employeeCode: string; quantity: string; location: string; purpose: string }
type PlannedRecipient = { employeeCode: string; employeeName?: string; quantity: number; useLocation: string; purpose: string }
type SelectedInventoryItem = { item: InventoryItemRecord; quantity: number }
type IssuanceItemGroup = {
  key: string
  item: InventoryItemRecord
  entries: SelectedInventoryItem[]
  quantity: number
  availableQuantity: number
}

const INVENTORY_PAGE_SIZE = 50
const inventoryTypeOptions: Array<{ value: InventoryTypeFilter; label: string }> = [
  { value: 'all', label: 'All requisition items' },
  { value: 'individual', label: 'Track each item separately' },
  { value: 'consumable', label: 'Consumable stock' },
]

type SubmittedBatch = {
  id: string
  status: string
  employeeCode: string
  employeeName: string
  employeeEmail: string
  requesterAccountLinked?: boolean
  emailSent?: boolean
  borrowDetails: {
    useAt: string
    expectedReturnAt: string
    useLocation: string
    purpose: string
  } | null
  items: Array<{
    itemCode: string
    itemName: string
    recipientEmployeeCode: string
    recipientEmployeeName: string
    recipientLocation: string
    recipientPurpose: string
    trackingMode: 'individual' | 'quantity'
    issueBehavior: 'consumable' | 'returnable'
    quantity: number
    unitOfMeasure: string
    tags: Array<{ tagCode: string; unitNumber: number; printedAt?: string | null; returned?: boolean }>
  }>
}

type PrintableBarcodeLabel = {
  tagCode: string
  itemCode: string
  itemName: string
  unitNumber?: number
}

const employeeCodeFromUrl = new URLSearchParams(window.location.search).get('employeeCode')?.trim() ?? ''
const purchaseRequisitionIdFromUrl = new URLSearchParams(window.location.search).get('purchaseRequisitionId')?.trim() ?? ''
const batchIdFromUrl = new URLSearchParams(window.location.search).get('batchId')?.trim() ?? ''

function employeeName(employee: EmployeeProfile) {
  return [employee.firstName, employee.middleName, employee.lastName, employee.suffix]
    .filter(Boolean)
    .join(' ')
}

function isReusableQuantityStock(item: InventoryItemRecord) {
  return item.trackingMode === 'quantity' && item.issueBehavior !== 'consumable'
}

function inventoryTypeFor(item: InventoryItemRecord): InventoryFlow {
  if (item.trackingMode === 'individual') return 'individual'
  return item.issueBehavior === 'consumable' ? 'consumable' : 'reusable'
}

function requiresPurchaseRequisition(item: InventoryItemRecord) {
  return item.trackingMode === 'individual'
}

function availableUnitConditionSummary(item: InventoryItemRecord) {
  if (item.trackingMode !== 'individual') return item.condition
  const unavailableConditions = ['Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired']
  const availableTags = item.assetTags
    .filter((tag) => tag.custodyStatus === 'Available'
      && tag.lifecycleStatus === 'Active'
      && !unavailableConditions.includes(tag.condition))
    .sort((first, second) => first.unitNumber - second.unitNumber)
  if (availableTags.length === 0) return item.condition
  const unitConditions = availableTags.slice(0, 4).map((tag) => `Unit ${tag.unitNumber}: ${tag.condition}`)
  if (availableTags.length > unitConditions.length) unitConditions.push(`+${availableTags.length - unitConditions.length} more`)
  return `Available unit condition · ${unitConditions.join(' · ')}`
}

function isCompactAssetTagCode(tagCode: string) {
  return /^AST-[A-Z0-9]{13}$/i.test(tagCode)
}

function formatBorrowDateTime(value: string) {
  const isLocalDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  const date = new Date(isLocalDateTime ? `${value}:00+08:00` : `${value}T00:00:00+08:00`)
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    ...(isLocalDateTime ? { timeStyle: 'short' as const } : {}),
    timeZone: 'Asia/Manila',
  }).format(date)
}

function barcodePayload(tagCode: string) {
  // The GSO scan API restores AST- for these compact unique tag suffixes.
  const match = tagCode.match(/^AST-([A-Z0-9]{13}|[A-F0-9]{20})$/i)
  return match?.[1] ?? tagCode
}

function escapePrintText(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character)
}

function printRecipientSheet(batch: SubmittedBatch, requisitionReference: string) {
  const printWindow = window.open('', '_blank', 'width=960,height=760')
  if (!printWindow) return false
  const assignedRecipients = [...new Map(batch.items.map((item) => [
    item.recipientEmployeeCode.trim().toLowerCase(),
    { employeeCode: item.recipientEmployeeCode, employeeName: item.recipientEmployeeName },
  ])).values()]
  const headCode = batch.employeeCode.trim().toLowerCase()
  const headIsAssigned = assignedRecipients.some((recipient) => recipient.employeeCode.trim().toLowerCase() === headCode)
  const signatureBlocks = [
    '<div class="signature"><div class="signature-line"></div><strong>GSO representative</strong><span>Signature / date</span></div>',
    ...(!headIsAssigned ? [`<div class="signature"><div class="signature-line"></div><strong>Receiving head: ${escapePrintText(batch.employeeName)} (${escapePrintText(batch.employeeCode)})</strong><span>Signature / date</span></div>`] : []),
    ...assignedRecipients.map((recipient) => {
      const isHead = recipient.employeeCode.trim().toLowerCase() === headCode
      const signerLabel = isHead ? 'Receiving head & assigned user' : 'Assigned user'
      return '<div class="signature"><div class="signature-line"></div><strong>' + signerLabel + ': ' + escapePrintText(recipient.employeeName) + ' (' + escapePrintText(recipient.employeeCode) + ')</strong><span>Signature / date · Confirms receipt of assigned items</span></div>'
    }),
  ].join('')
  const rows = batch.items.map((item) => {
    const tags = item.tags.length > 0 ? item.tags : [{ tagCode: 'Quantity allocation', unitNumber: 0 }]
    return tags.map((tag) => '<tr><td>' + escapePrintText(item.itemName) + '<br><small>' + escapePrintText(item.itemCode) + (tag.unitNumber ? ' · Unit ' + tag.unitNumber : ' · Qty ' + item.quantity) + '</small></td>'
      + '<td>' + escapePrintText(tag.tagCode) + '</td>'
      + '<td><strong>' + escapePrintText(item.recipientEmployeeName) + '</strong><br><small>' + escapePrintText(item.recipientEmployeeCode) + '</small></td>'
      + '<td>' + escapePrintText(item.recipientLocation || 'Not specified') + '</td>'
      + '<td>' + escapePrintText(item.recipientPurpose || 'Not specified') + '</td>'
      + '<td>[ ] Received</td></tr>').join('')
  }).join('')
  const reference = requisitionReference ? escapePrintText(requisitionReference) : 'Issuance batch #' + escapePrintText(batch.id)
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>Asset Distribution Receipt</title><style>'
    + '@page { size: A4 landscape; margin: 14mm; } body { font: 12px Arial, sans-serif; color: #0f172a; }'
    + 'h1 { margin: 0 0 6px; font-size: 20px; } p { margin: 4px 0; color: #475569; }'
    + '.meta { margin: 16px 0; display: flex; gap: 40px; } table { width: 100%; border-collapse: collapse; margin-top: 14px; }'
    + 'th,td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; } th { background: #eff6ff; font-size: 10px; text-transform: uppercase; }'
    + 'small { color: #64748b; } .signature-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 28px 36px; margin-top: 34px; } .signature { min-width: 0; break-inside: avoid; } .signature-line { height: 22px; border-bottom: 1px solid #64748b; margin-bottom: 6px; } .signature strong,.signature span { display: block; } .signature strong { font-size: 11px; } .signature span { margin-top: 2px; color: #475569; font-size: 10px; }'
    + '</style></head><body><h1>Asset Distribution Receipt</h1>'
    + '<div class="meta"><p><strong>Request:</strong> ' + reference + '</p><p><strong>Head:</strong> ' + escapePrintText(batch.employeeName) + ' (' + escapePrintText(batch.employeeCode) + ')</p><p><strong>Date:</strong> ' + new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date()) + '</p></div>'
    + '<table><thead><tr><th>Item</th><th>Barcode</th><th>Assigned to</th><th>Location</th><th>Purpose</th><th>Received</th></tr></thead><tbody>' + rows + '</tbody></table>'
    + '<div class="signature-grid">' + signatureBlocks + '</div></body></html>'
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  window.setTimeout(() => { printWindow.focus(); printWindow.print() }, 300)
  return true
}

const MAIN_ISSUANCE_READY_STATUSES = ['READY_FOR_STAFF', 'PARTIAL_STOCK', 'PARTIALLY_ISSUED']

function isReadyPurchaseRequisition(request: ServiceRequest) {
  return request.requestType === 'PURCHASE_REQUISITION'
    && linesOf(request).some((line) => MAIN_ISSUANCE_READY_STATUSES.includes(line.routeStatus))
}

function inventoryItemGroupIdentity(item: InventoryItemRecord) {
  return [
    item.itemName || item.description,
    item.description,
    item.category,
    item.unitOfMeasure,
    item.trackingMode,
    item.issueBehavior,
  ].map((value) => String(value || '').trim().toLowerCase()).join('|')
}

function groupIssuanceItems(
  entries: SelectedInventoryItem[],
  purchaseRequisitionLineIds: Record<string, string>,
  isRequisitionIssuance: boolean,
): IssuanceItemGroup[] {
  const groups = new Map<string, IssuanceItemGroup>()
  for (const entry of entries) {
    const lineId = purchaseRequisitionLineIds[entry.item.id]
    const identity = inventoryItemGroupIdentity(entry.item)
    const key = lineId
      ? `line:${lineId}|${identity}`
      : isRequisitionIssuance
        ? `item:${entry.item.id}`
        : `catalog:${identity}`
    const group = groups.get(key)
    if (group) {
      group.entries.push(entry)
      group.quantity += entry.quantity
      group.availableQuantity += entry.item.availableQuantity
    } else {
      groups.set(key, {
        key,
        item: entry.item,
        entries: [entry],
        quantity: entry.quantity,
        availableQuantity: entry.item.availableQuantity,
      })
    }
  }
  return [...groups.values()].map((group) => ({
    ...group,
    entries: [...group.entries].sort((first, second) => first.item.itemCode.localeCompare(second.item.itemCode)),
  }))
}

function groupedRecipientAllocations(
  group: IssuanceItemGroup,
  recipientAllocations: Record<string, RecipientAllocation[]>,
): RecipientAllocation[] {
  const grouped = new Map<string, RecipientAllocation>()
  group.entries.forEach(({ item }) => {
    ;(recipientAllocations[item.id] || []).forEach((allocation, index) => {
      const employeeCode = allocation.employeeCode.trim()
      const key = employeeCode
        ? `${employeeCode.toLowerCase()}|${allocation.location.trim().toLowerCase()}|${allocation.purpose.trim().toLowerCase()}`
        : `empty:${item.id}:${index}`
      const existing = grouped.get(key)
      if (existing) existing.quantity = String((Number(existing.quantity) || 0) + (Number(allocation.quantity) || 0))
      else grouped.set(key, { ...allocation })
    })
  })
  return [...grouped.values()]
}

function allocateGroupRecipientsToItems(group: IssuanceItemGroup, allocations: RecipientAllocation[]) {
  const byItem = Object.fromEntries(group.entries.map(({ item }) => [item.id, [] as RecipientAllocation[]]))
  for (const allocation of allocations) {
    let remaining = Number(allocation.quantity) || 0
    for (const { item, quantity } of group.entries) {
      if (remaining <= 0) break
      const itemAllocations = byItem[item.id]
      const duplicateRecipient = allocation.employeeCode
        && itemAllocations.some((row) => row.employeeCode.toLowerCase() === allocation.employeeCode.toLowerCase())
      if (duplicateRecipient) continue
      const alreadyAllocated = itemAllocations.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)
      const room = Math.max(quantity - alreadyAllocated, 0)
      if (room <= 0) continue
      const assigned = Math.min(room, remaining)
      itemAllocations.push({ ...allocation, quantity: String(assigned) })
      remaining -= assigned
    }
    if (remaining > 0) {
      const lastItem = group.entries[group.entries.length - 1]?.item
      if (lastItem) byItem[lastItem.id].push({ ...allocation, quantity: String(remaining) })
    }
  }
  return byItem
}

function submittedBatchFromDetails(batch: EmployeeIssuanceBatchDetails): SubmittedBatch {
  return {
    id: batch.id,
    status: batch.status,
    employeeCode: batch.employeeCode,
    employeeName: batch.employeeName,
    employeeEmail: batch.employeeEmail,
    requesterAccountLinked: batch.requesterAccountLinked,
    emailSent: batch.emailSent,
    borrowDetails: batch.borrowUseDate && batch.expectedReturnDate && batch.useLocation && batch.usePurpose
      ? {
          useAt: batch.borrowUseAt || batch.borrowUseDate,
          expectedReturnAt: batch.expectedReturnAt || batch.expectedReturnDate,
          useLocation: batch.useLocation,
          purpose: batch.usePurpose,
        }
      : null,
    items: batch.items.map((item) => ({
      itemCode: item.itemCode,
      itemName: item.itemName,
      recipientEmployeeCode: item.recipientEmployeeCode,
      recipientEmployeeName: item.recipientEmployeeName,
      recipientLocation: item.recipientLocation,
      recipientPurpose: item.recipientPurpose,
      trackingMode: item.trackingMode,
      issueBehavior: item.issueBehavior ?? 'returnable',
      quantity: item.quantity,
      unitOfMeasure: item.unitOfMeasure,
      tags: item.tags,
    })),
  }
}

function plannedRecipientsForRequest(request: ServiceRequest | null, lineNumber: number): PlannedRecipient[] {
  const rawItems = request?.formData.items
  if (!Array.isArray(rawItems)) return []
  const requestItem = rawItems[lineNumber - 1]
  if (!requestItem || typeof requestItem !== 'object' || Array.isArray(requestItem)) return []
  const recipients = (requestItem as Record<string, unknown>).plannedRecipients
  if (!Array.isArray(recipients)) return []
  return recipients.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const recipient = raw as Record<string, unknown>
    const employeeCode = typeof recipient.employeeCode === 'string' ? recipient.employeeCode.trim() : ''
    const quantity = Number(recipient.quantity)
    if (!employeeCode || !Number.isInteger(quantity) || quantity < 1) return []
    return [{
      employeeCode,
      employeeName: typeof recipient.employeeName === 'string' ? recipient.employeeName : undefined,
      quantity,
      useLocation: typeof recipient.useLocation === 'string' ? recipient.useLocation : '',
      purpose: typeof recipient.purpose === 'string' ? recipient.purpose : '',
    }]
  })
}

function allocatePlannedRecipients(
  quantity: number,
  line: PurchaseRequisitionLine | undefined,
  request: ServiceRequest,
  headEmployeeCode: string,
  remainingPlansByLine: Map<string, Array<PlannedRecipient & { remaining: number }>>,
): RecipientAllocation[] {
  if (!line) return [{ employeeCode: headEmployeeCode, quantity: String(quantity), location: '', purpose: '' }]
  let planned = remainingPlansByLine.get(line.id)
  if (!planned) {
    const issuedByEmployee = new Map<string, number>()
    for (const issued of line.issuedRecipients || []) {
      const code = issued.employeeCode.trim().toLowerCase()
      issuedByEmployee.set(code, (issuedByEmployee.get(code) || 0) + Number(issued.quantity || 0))
    }
    planned = plannedRecipientsForRequest(request, line.lineNumber).map((recipient) => ({
      ...recipient,
      remaining: Math.max(recipient.quantity - (issuedByEmployee.get(recipient.employeeCode.toLowerCase()) || 0), 0),
    })).filter((recipient) => recipient.remaining > 0)
    remainingPlansByLine.set(line.id, planned)
  }
  const allocations: RecipientAllocation[] = []
  let remaining = quantity
  for (const recipient of planned) {
    if (remaining <= 0) break
    const assignedQuantity = Math.min(remaining, recipient.remaining)
    allocations.push({
      employeeCode: recipient.employeeCode,
      quantity: String(assignedQuantity),
      location: recipient.useLocation,
      purpose: recipient.purpose,
    })
    recipient.remaining -= assignedQuantity
    remaining -= assignedQuantity
  }
  if (remaining > 0) allocations.push({ employeeCode: headEmployeeCode, quantity: String(remaining), location: '', purpose: '' })
  return allocations.length > 0 ? allocations : [{ employeeCode: headEmployeeCode, quantity: String(quantity), location: '', purpose: '' }]
}

function BarcodeSvg({ value, height = 50, className = 'mx-auto h-11 max-w-full' }: { value: string; height?: number; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    JsBarcode(svgRef.current, barcodePayload(value), {
      format: isCompactAssetTagCode(value) ? 'CODE128B' : 'CODE128',
      displayValue: false,
      lineColor: '#000000',
      background: '#ffffff',
      width: 1,
      height,
      margin: 10,
    })
  }, [height, value])

  return <svg ref={svgRef} role="img" aria-label={`Barcode ${value}`} className={className} />
}

const fieldLabelClass = 'mb-1.5 block text-sm font-bold text-slate-800'
const fieldControlClass = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500'

type StepStatus = 'done' | 'current' | 'upcoming'

const stepStyles: Record<StepStatus, { badge: string; label: string; suffix: string }> = {
  done: { badge: 'bg-emerald-600 text-white', label: 'text-emerald-700', suffix: ' · Done' },
  current: { badge: 'bg-blue-600 text-white ring-4 ring-blue-100', label: 'text-blue-700', suffix: '' },
  upcoming: { badge: 'bg-slate-200 text-slate-700', label: 'text-slate-600', suffix: '' },
}

function StepHeader({ step, totalSteps = 3, status, titleId, title, description, children }: {
  step: number
  totalSteps?: number
  status: StepStatus
  titleId: string
  title: string
  description: string
  children?: ReactNode
}) {
  const styles = stepStyles[status]
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black ${styles.badge}`}>
        {status === 'done' ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 4 4L19 6" />
          </svg>
        ) : step}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <p className={`text-xs font-extrabold uppercase tracking-wide ${styles.label}`}>Step {step} of {totalSteps}{styles.suffix}</p>
            <h2 id={titleId} className="mt-0.5 text-base font-black leading-tight text-slate-900">{title}</h2>
          </div>
          {children}
        </div>
        <p className="mt-1 text-sm leading-snug text-slate-600">{description}</p>
      </div>
    </div>
  )
}

export default function MainIssuance() {
  const [selectedPurchaseRequisitionId, setSelectedPurchaseRequisitionId] = useState(purchaseRequisitionIdFromUrl)
  const [readyRequisitions, setReadyRequisitions] = useState<ServiceRequest[]>([])
  const [requisitionSearch, setRequisitionSearch] = useState('')
  const [isRequisitionPickerOpen, setIsRequisitionPickerOpen] = useState(false)
  const isRequisitionIssuance = Boolean(selectedPurchaseRequisitionId)
  const showRequisitionStep = !batchIdFromUrl && (readyRequisitions.length > 0 || isRequisitionIssuance)
  const visibleInventoryTypeOptions = isRequisitionIssuance
    ? inventoryTypeOptions
    : [{ value: 'consumable' as const, label: 'Consumable stock' }]
  const [employees, setEmployees] = useState<EmployeeProfile[]>([])
  const [inventory, setInventory] = useState<InventoryItemRecord[]>([])
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState(employeeCodeFromUrl)
  const [employeeIssuedItems, setEmployeeIssuedItems] = useState<EmployeeIssuanceRecord['assignedItems']>([])
  const [isLoadingEmployeeItems, setIsLoadingEmployeeItems] = useState(Boolean(employeeCodeFromUrl))
  const [employeeItemsError, setEmployeeItemsError] = useState('')
  const [showEmployeeItems, setShowEmployeeItems] = useState(false)
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, string>>({})
  const [recipientAllocations, setRecipientAllocations] = useState<Record<string, RecipientAllocation[]>>({})
  const [isRecipientAssignmentOpen, setIsRecipientAssignmentOpen] = useState(false)
  const [recipientEmployeeSearch, setRecipientEmployeeSearch] = useState('')
  const [isManualRecipientFormOpen, setIsManualRecipientFormOpen] = useState(false)
  const [manualRecipientDraft, setManualRecipientDraft] = useState({ employeeCode: '', firstName: '', middleName: '', lastName: '', suffix: '', email: '', position: '' })
  const [employeePositions, setEmployeePositions] = useState<string[]>([])
  const [isSavingManualRecipient, setIsSavingManualRecipient] = useState(false)
  const [manualRecipientError, setManualRecipientError] = useState('')
  const [manualRecipientSuccess, setManualRecipientSuccess] = useState('')
  const [recipientAssignmentChecks, setRecipientAssignmentChecks] = useState<Record<string, EmployeeIssuanceRecord['assignedItems']>>({})
  const [recipientAssignmentErrors, setRecipientAssignmentErrors] = useState<Record<string, string>>({})
  const [purchaseRequisitionLineIds, setPurchaseRequisitionLineIds] = useState<Record<string, string>>({})
  const [purchaseRequisitionReference, setPurchaseRequisitionReference] = useState('')
  const [purchaseRequisitionOtherTypeCount, setPurchaseRequisitionOtherTypeCount] = useState(0)
  const [purchaseRequisitionReusableCount, setPurchaseRequisitionReusableCount] = useState(0)
  const [itemSearch, setItemSearch] = useState('')
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('all')
  const [inventoryTypeFilter, setInventoryTypeFilter] = useState<InventoryTypeFilter>(isRequisitionIssuance ? 'all' : 'consumable')
  const [inventoryPage, setInventoryPage] = useState(1)
  const [notes, setNotes] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [handoverMethod, setHandoverMethod] = useState<'signed_receipt' | 'authorized_handover'>('signed_receipt')
  const [handoverReference, setHandoverReference] = useState('')
  const [handoverError, setHandoverError] = useState('')
  const [isRecordingHandover, setIsRecordingHandover] = useState(false)
  const [submittedBatch, setSubmittedBatch] = useState<SubmittedBatch | null>(null)
  const [isRefreshingBatch, setIsRefreshingBatch] = useState(Boolean(batchIdFromUrl))
  const [batchDetailsError, setBatchDetailsError] = useState('')
  const [labelsToPrint, setLabelsToPrint] = useState<PrintableBarcodeLabel[]>([])
  const [shouldOpenPrintDialog, setShouldOpenPrintDialog] = useState(false)
  const [isRecordingPrint, setIsRecordingPrint] = useState(false)
  const [printError, setPrintError] = useState('')
  // Labels printed in this session, so the issuance panel updates before the batch reloads.
  const [printedTagCodes, setPrintedTagCodes] = useState<Set<string>>(() => new Set())
  const requisitionPickerSearchRef = useRef<HTMLInputElement>(null)
  const requisitionPickerTriggerRef = useRef<HTMLButtonElement>(null)
  const recipientEmployeeSearchRef = useRef<HTMLInputElement>(null)
  const recipientAssignmentTriggerRef = useRef<HTMLButtonElement>(null)
  const pendingBatchId = submittedBatch?.status === 'Pending' ? submittedBatch.id : null

  useEffect(() => {
    let active = true

    Promise.all([
      listEmployees(),
      listInventoryItems(),
      listStaffPurchaseRequisitions().catch(() => []),
      selectedPurchaseRequisitionId ? getStaffPurchaseRequisition(selectedPurchaseRequisitionId) : Promise.resolve(null),
      listEmployeePositions().catch(() => ({ positions: [] })),
    ])
      .then(([employeeResult, inventoryResult, requisitionQueue, purchaseRequisition, positionResult]) => {
        if (!active) return
        setEmployees(employeeResult.employees)
        setEmployeePositions(positionResult.positions.map((position) => position.name))
        setReadyRequisitions(requisitionQueue.filter(isReadyPurchaseRequisition))
        const requestEmployeeCode = purchaseRequisition
          ? formText(purchaseRequisition.formData.requesterEmployeeCode) || employeeCodeFromUrl
          : employeeCodeFromUrl
        setSelectedEmployeeCode(requestEmployeeCode)
        setIsLoadingEmployeeItems(Boolean(requestEmployeeCode))
        setEmployeeIssuedItems([])
        setEmployeeItemsError('')
        setShowEmployeeItems(false)
        setSelectedQuantities({})
        setRecipientAllocations({})
        setRecipientAssignmentChecks({})
        setRecipientAssignmentErrors({})
        setPurchaseRequisitionLineIds({})
        setPurchaseRequisitionOtherTypeCount(0)
        setPurchaseRequisitionReusableCount(0)
        setItemSearch('')
        setInventoryCategoryFilter('all')
        setInventoryPage(1)
        if (purchaseRequisition) {
          const reservedByItem = new Map<string, { quantity: number; lineId: string; lineNumber: number }>()
          for (const line of purchaseRequisition.purchaseLines || []) {
            if (!MAIN_ISSUANCE_READY_STATUSES.includes(line.routeStatus)) continue
            for (const allocation of line.allocations || []) {
              if (allocation.status !== 'Reserved') continue
              const remaining = Number(allocation.quantity) - Number(allocation.fulfilledQuantity || 0)
              if (remaining <= 0) continue
              reservedByItem.set(allocation.itemId, { quantity: remaining, lineId: line.id, lineNumber: line.lineNumber })
            }
          }
          const allReservedItems = inventoryResult
            .filter((item) => reservedByItem.has(item.id))
            .map((item) => {
              const reservation = reservedByItem.get(item.id)
              return reservation ? { ...item, availableQuantity: reservation.quantity } : item
            })
          const reusableItems = allReservedItems.filter(isReusableQuantityStock)
          const reservedItems = allReservedItems.filter((item) => !isReusableQuantityStock(item))
          const firstFlow = reservedItems[0] ? inventoryTypeFor(reservedItems[0]) : null
          const items = firstFlow ? reservedItems.filter((item) => inventoryTypeFor(item) === firstFlow) : []
          const itemIds = new Set(items.map((item) => item.id))
          const quantities = Object.fromEntries([...reservedByItem.entries()]
            .filter(([itemId]) => itemIds.has(itemId))
            .map(([itemId, reservation]) => [itemId, String(reservation.quantity)]))
          setInventory(items)
          setSelectedQuantities(quantities)
          setPurchaseRequisitionLineIds(Object.fromEntries([...reservedByItem.entries()]
            .filter(([itemId]) => itemIds.has(itemId))
            .map(([itemId, reservation]) => [itemId, reservation.lineId])))
          const lineById = new Map((purchaseRequisition.purchaseLines || []).map((line) => [line.id, line]))
          const remainingPlansByLine = new Map<string, Array<PlannedRecipient & { remaining: number }>>()
          setRecipientAllocations(Object.fromEntries(items.map((item) => {
            const reservation = reservedByItem.get(item.id)
            const line = reservation ? lineById.get(reservation.lineId) : undefined
            return [item.id, allocatePlannedRecipients(
              Number(quantities[item.id] || 0),
              line,
              purchaseRequisition,
              requestEmployeeCode,
              remainingPlansByLine,
            )]
          })))
          setPurchaseRequisitionOtherTypeCount(reservedItems.length - items.length)
          setPurchaseRequisitionReusableCount(reusableItems.length)
          setPurchaseRequisitionReference(purchaseRequisition.referenceNo)
          setNotes(`GSO issuance for ${purchaseRequisition.referenceNo}`)
          setInventoryTypeFilter('all')
        } else {
          setRecipientAllocations({})
          setInventory(inventoryResult.filter((item) => (
            item.status.toLowerCase() === 'available'
            && item.availableQuantity > 0
            && item.trackingMode === 'quantity'
            && item.issueBehavior === 'consumable'
          )))
          setPurchaseRequisitionLineIds({})
          setPurchaseRequisitionReference('')
          setPurchaseRequisitionOtherTypeCount(0)
          setPurchaseRequisitionReusableCount(0)
          setInventoryTypeFilter('consumable')
          setNotes('')
        }
        setLoadError('')
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : 'Unable to load employees and available inventory.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => { active = false }
  }, [selectedPurchaseRequisitionId])

  useEffect(() => {
    if (!selectedEmployeeCode) return
    let active = true
    listEmployeeIssuances(selectedEmployeeCode)
      .then(({ assignedItems }) => {
        if (!active) return
        setEmployeeIssuedItems(assignedItems)
        setEmployeeItemsError('')
      })
      .catch((error: unknown) => {
        if (active) setEmployeeItemsError(error instanceof Error ? error.message : 'Unable to load this employee’s current items.')
      })
      .finally(() => {
        if (active) setIsLoadingEmployeeItems(false)
      })
    return () => { active = false }
  }, [selectedEmployeeCode])

  useEffect(() => {
    if (!batchIdFromUrl) return
    let active = true
    getEmployeeIssuanceBatch(batchIdFromUrl)
      .then((batch) => { if (active) setSubmittedBatch(submittedBatchFromDetails(batch)) })
      .catch((error: unknown) => { if (active) setBatchDetailsError(error instanceof Error ? error.message : 'Unable to load this issuance batch.') })
      .finally(() => { if (active) setIsRefreshingBatch(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (labelsToPrint.length === 0 || !shouldOpenPrintDialog) return
    const clearPrintMode = () => {
      setShouldOpenPrintDialog(false)
      setLabelsToPrint([])
    }
    document.body.classList.add('printing-asset-labels')
    window.addEventListener('afterprint', clearPrintMode, { once: true })
    const timer = window.setTimeout(() => window.print(), 50)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', clearPrintMode)
      document.body.classList.remove('printing-asset-labels')
    }
  }, [labelsToPrint, shouldOpenPrintDialog])

  useEffect(() => {
    if (!pendingBatchId) return
    let active = true
    const checkForDecision = async () => {
      try {
        const batch = await getEmployeeIssuanceBatch(pendingBatchId)
        if (active) {
          setSubmittedBatch(submittedBatchFromDetails(batch))
          setBatchDetailsError('')
        }
      } catch (error) {
        if (active) setBatchDetailsError(error instanceof Error ? error.message : 'Unable to refresh the issuance status.')
      }
    }
    const timer = window.setInterval(() => { void checkForDecision() }, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [pendingBatchId])

  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeCode) ?? null
  const inventoryCategories = useMemo(() => Array.from(new Set(
    inventory.map((item) => item.category.trim()).filter(Boolean),
  )).sort((first, second) => first.localeCompare(second)), [inventory])
  const inventoryCategoryCounts = useMemo(() => inventory.reduce<Record<string, number>>((counts, item) => {
    const category = item.category.trim()
    counts[category] = (counts[category] || 0) + 1
    return counts
  }, {}), [inventory])
  const categoryAndSearchInventory = useMemo(() => {
    const query = itemSearch.trim().toLowerCase()
    return inventory.filter((item) => {
      const matchesCategory = inventoryCategoryFilter === 'all' || item.category.trim() === inventoryCategoryFilter
      const matchesSearch = !query || `${item.itemCode} ${item.itemName} ${item.description} ${item.category}`.toLowerCase().includes(query)
      return matchesCategory && matchesSearch
    })
  }, [inventory, inventoryCategoryFilter, itemSearch])
  const inventoryTypeCounts = useMemo(() => {
    const counts: Record<'all' | InventoryFlow, number> = {
      all: categoryAndSearchInventory.length,
      individual: 0,
      consumable: 0,
      reusable: 0,
    }
    categoryAndSearchInventory.forEach((item) => { counts[inventoryTypeFor(item)] += 1 })
    return counts
  }, [categoryAndSearchInventory])
  const filteredInventory = useMemo(() => categoryAndSearchInventory
    .filter((item) => inventoryTypeFilter === 'all' || inventoryTypeFor(item) === inventoryTypeFilter)
    .sort((first, second) => first.category.localeCompare(second.category)
      || first.itemName.localeCompare(second.itemName)
      || first.itemCode.localeCompare(second.itemCode)), [categoryAndSearchInventory, inventoryTypeFilter])
  const filteredInventoryGroups = useMemo(
    () => groupIssuanceItems(filteredInventory.map((item) => ({ item, quantity: item.availableQuantity })), purchaseRequisitionLineIds, isRequisitionIssuance),
    [filteredInventory, purchaseRequisitionLineIds, isRequisitionIssuance],
  )
  const inventoryPageCount = Math.max(1, Math.ceil(filteredInventoryGroups.length / INVENTORY_PAGE_SIZE))
  const currentInventoryPage = Math.min(inventoryPage, inventoryPageCount)
  const visibleInventoryGroups = useMemo(() => {
    const start = (currentInventoryPage - 1) * INVENTORY_PAGE_SIZE
    return filteredInventoryGroups.slice(start, start + INVENTORY_PAGE_SIZE)
  }, [filteredInventoryGroups, currentInventoryPage])
  const filteredReadyRequisitions = useMemo(() => {
    const query = requisitionSearch.trim().toLowerCase()
    if (!query) return readyRequisitions
    return readyRequisitions.filter((request) => [
      request.referenceNo,
      request.title,
      request.requesterName,
      request.requesterEmail,
      formText(request.formData.departmentOrganization),
    ].some((value) => String(value || '').toLowerCase().includes(query)))
  }, [readyRequisitions, requisitionSearch])
  const selectedReadyRequisitionDetails = useMemo(() => {
    const request = readyRequisitions.find((requisition) => requisition.id === selectedPurchaseRequisitionId)
    if (!request) return null
    const readyLines = linesOf(request).filter((line) => MAIN_ISSUANCE_READY_STATUSES.includes(line.routeStatus))
    const reservedUnits = readyLines.reduce((total, line) => total + line.allocations
      .filter((allocation) => allocation.status === 'Reserved')
      .reduce((lineTotal, allocation) => lineTotal + Math.max(Number(allocation.quantity) - Number(allocation.fulfilledQuantity || 0), 0), 0), 0)
    return {
      request,
      requesterName: formText(request.formData.requesterName) || request.requesterName,
      department: formText(request.formData.departmentOrganization) || request.requesterEmail,
      readyLineCount: readyLines.length,
      reservedUnits,
    }
  }, [readyRequisitions, selectedPurchaseRequisitionId])
  const inventoryById = useMemo(() => new Map(inventory.map((item) => [item.id, item])), [inventory])
  const selectedItems = useMemo<SelectedInventoryItem[]>(() => Object.entries(selectedQuantities).flatMap(([itemId, quantityText]) => {
    const item = inventoryById.get(itemId)
    return item ? [{ item, quantity: Number(quantityText || 0) }] : []
  }), [inventoryById, selectedQuantities])
  const selectedItemGroups = useMemo(
    () => groupIssuanceItems(selectedItems, purchaseRequisitionLineIds, isRequisitionIssuance),
    [selectedItems, purchaseRequisitionLineIds, isRequisitionIssuance],
  )
  const selectedUnitCount = selectedItems.reduce((total, selection) => total + selection.quantity, 0)
  const hasMixedItemTypes = selectedItems.some(({ item }) => inventoryTypeFor(item) !== inventoryTypeFor(selectedItems[0]?.item))
  const isConsumableIssue = selectedItems.length > 0 && selectedItems.every(({ item }) => item.trackingMode === 'quantity' && item.issueBehavior === 'consumable')
  const isPerUnitPickup = selectedItems.length > 0 && selectedItems.every(({ item }) => item.trackingMode === 'individual')
  const recipientEmployeeCodes = useMemo(() => [...new Set(Object.values(recipientAllocations)
    .flatMap((allocations) => allocations.map((allocation) => allocation.employeeCode.trim()))
    .filter(Boolean))].sort(), [recipientAllocations])
  const assignableEmployees = useMemo(() => {
    if (!selectedEmployee) return []
    return employees.filter((employee) => employee.status === 'Active'
      && employee.department.trim().toLowerCase() === selectedEmployee.department.trim().toLowerCase())
  }, [employees, selectedEmployee])
  const filteredAssignableEmployees = useMemo(() => {
    const query = recipientEmployeeSearch.trim().toLowerCase()
    if (!query) return assignableEmployees
    return assignableEmployees.filter((employee) => [
      employeeName(employee),
      employee.id,
      employee.email,
      employee.position,
    ].some((value) => value.toLowerCase().includes(query)))
  }, [assignableEmployees, recipientEmployeeSearch])

  useEffect(() => {
    if (!isRequisitionIssuance || recipientEmployeeCodes.length === 0) return
    let active = true
    Promise.all(recipientEmployeeCodes.map(async (code) => {
      try {
        const result = await listEmployeeIssuances(code)
        return { code, assignedItems: result.assignedItems, error: '' }
      } catch (error) {
        return { code, assignedItems: [], error: error instanceof Error ? error.message : 'Unable to load current assignments.' }
      }
    })).then((results) => {
      if (!active) return
      setRecipientAssignmentChecks((current) => {
        const next = { ...current }
        results.forEach((result) => {
          if (result.error) delete next[result.code]
          else next[result.code] = result.assignedItems
        })
        return next
      })
      setRecipientAssignmentErrors((current) => {
        const next = { ...current }
        results.forEach((result) => {
          if (result.error) next[result.code] = result.error
          else delete next[result.code]
        })
        return next
      })
    })
    return () => { active = false }
  }, [isRequisitionIssuance, recipientEmployeeCodes])

  useEffect(() => {
    if (!isRecipientAssignmentOpen) return
    recipientEmployeeSearchRef.current?.focus()
    const trigger = recipientAssignmentTriggerRef.current
    return () => { trigger?.focus() }
  }, [isRecipientAssignmentOpen])

  useEffect(() => {
    if (!isRequisitionPickerOpen) return
    requisitionPickerSearchRef.current?.focus()
    const trigger = requisitionPickerTriggerRef.current
    return () => { trigger?.focus() }
  }, [isRequisitionPickerOpen])

  useEffect(() => {
    if (!isRecipientAssignmentOpen && !isRequisitionPickerOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [isRecipientAssignmentOpen, isRequisitionPickerOpen])

  const invalidRecipientAllocation = isRequisitionIssuance && selectedItems.some(({ item, quantity }) => {
    const allocations = recipientAllocations[item.id] || []
    const total = allocations.reduce((sum, allocation) => sum + (Number(allocation.quantity) || 0), 0)
    const codes = allocations.map((allocation) => allocation.employeeCode.trim().toLowerCase()).filter(Boolean)
    return total !== quantity
      || allocations.some((allocation) => !assignableEmployees.some((employee) => employee.id === allocation.employeeCode))
      || new Set(codes).size !== codes.length
      || allocations.some((allocation) => !Number.isInteger(Number(allocation.quantity)) || Number(allocation.quantity) < 1)
  })
  const assignedRecipientUnitCount = selectedItemGroups.reduce((total, group) => total
    + groupedRecipientAllocations(group, recipientAllocations).reduce((groupTotal, allocation) => groupTotal + (Number(allocation.quantity) || 0), 0), 0)
  const isRecipientAssignmentComplete = selectedItemGroups.length > 0 && !invalidRecipientAllocation
  const recipientCrossCheckPending = isRequisitionIssuance && recipientEmployeeCodes.some((code) => (
    recipientAssignmentChecks[code] === undefined && !recipientAssignmentErrors[code]
  ))
  const recipientCrossCheckFailed = isRequisitionIssuance && recipientEmployeeCodes.some((code) => Boolean(recipientAssignmentErrors[code]))
  const hasInvalidQuantity = selectedItems.some(({ item, quantity }) =>
    !Number.isInteger(quantity) || quantity < 1 || quantity > item.availableQuantity
  )
  const generatedLabels = submittedBatch?.items.flatMap((item) => item.tags.map((tag) => ({ ...item, tag }))) ?? []
  const submittedBarcodeLabels: PrintableBarcodeLabel[] = generatedLabels.map(({ itemCode, itemName, tag }) => ({
    tagCode: tag.tagCode,
    itemCode,
    itemName,
    unitNumber: tag.unitNumber,
  }))
  const isTagReturned = (tagCode: string) => generatedLabels.some(({ tag }) => tag.tagCode === tagCode && Boolean(tag.returned))
  const isTagPrinted = (tagCode: string) => printedTagCodes.has(tagCode)
    || generatedLabels.some(({ tag }) => tag.tagCode === tagCode && Boolean(tag.printedAt))
  const expectedLabelCount = submittedBatch?.items.reduce((total, item) =>
    total + (item.trackingMode === 'individual' ? item.quantity : 0), 0) ?? 0
  const hasCompleteLabelSet = generatedLabels.length === expectedLabelCount && expectedLabelCount > 0
  const printableSubmittedBarcodeLabels = submittedBarcodeLabels.filter((label) => !isTagReturned(label.tagCode) && !isTagPrinted(label.tagCode))
  const isIndividualTrackedBatch = Boolean(submittedBatch && submittedBatch.items.length > 0
    && submittedBatch.items.every((item) => item.trackingMode === 'individual'))
  const isStaffDistributionBatch = Boolean(submittedBatch?.status === 'Issued'
    && selectedPurchaseRequisitionId && isIndividualTrackedBatch)
  const activeSubmittedBarcodeLabels = submittedBarcodeLabels.filter((label) => !isTagReturned(label.tagCode))
  const barcodePrintStatus = !hasCompleteLabelSet
    ? 'Barcode labels not ready'
    : printableSubmittedBarcodeLabels.length > 0
      ? `${printableSubmittedBarcodeLabels.length} ready to print`
      : activeSubmittedBarcodeLabels.length > 0 ? 'All labels printed' : 'No active labels'
  // A sent batch replaces the empty review form until the staff selects another item or starts over.
  const isShowingSentBatch = Boolean(submittedBatch) && selectedItems.length === 0
  const isEmployeeStepDone = Boolean(selectedEmployee)
  const isItemsStepDone = selectedItems.length > 0 && !hasInvalidQuantity && !hasMixedItemTypes
  const stepTotal = showRequisitionStep ? 4 : 3
  const employeeStepNumber = showRequisitionStep ? 2 : 1
  const itemsStepNumber = employeeStepNumber + 1
  const reviewStepNumber = itemsStepNumber + 1
  const currentStep = !isEmployeeStepDone ? employeeStepNumber : !isItemsStepDone ? itemsStepNumber : reviewStepNumber
  const stepStatusFor = (step: number, isDone: boolean): StepStatus => {
    if (isDone) return 'done'
    return currentStep === step ? 'current' : 'upcoming'
  }
  const nextStepHint = !selectedEmployee
    ? `Next: choose the employee in Step ${employeeStepNumber}.`
    : selectedItems.length === 0
      ? `Next: choose at least one item in Step ${itemsStepNumber}.`
      : hasMixedItemTypes
        ? 'Process one inventory type at a time.'
        : ''
  const submitErrorAlert = submitError
    ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">{submitError}</p>
    : null

  function updateSelectedQuantities(nextQuantities: Record<string, string>) {
    setSelectedQuantities(nextQuantities)
  }

  function clearSubmittedBatch() {
    setSubmittedBatch(null)
    setBatchDetailsError('')
    setHandoverError('')
    setHandoverReference('')
    const currentUrl = new URL(window.location.href)
    currentUrl.searchParams.delete('batchId')
    window.history.replaceState({}, '', currentUrl)
  }

  function selectPurchaseRequisition(requestId: string) {
    setSelectedPurchaseRequisitionId(requestId)
    setIsLoading(true)
    setLoadError('')
    setSelectedEmployeeCode('')
    setSelectedQuantities({})
    setSubmitError('')
    setSubmittedBatch(null)
    setBatchDetailsError('')
    const currentUrl = new URL(window.location.href)
    if (requestId) currentUrl.searchParams.set('purchaseRequisitionId', requestId)
    else currentUrl.searchParams.delete('purchaseRequisitionId')
    window.history.replaceState({}, '', currentUrl)
  }

  function addScannedInventoryCode(value: string) {
    const normalizedCode = value.trim().toLowerCase()
    if (!normalizedCode) return

    const scannedAssetItem = inventory.find((candidate) => candidate.assetTags.some((tag) =>
      tag.tagCode.toLowerCase() === normalizedCode
        && tag.custodyStatus === 'Available'
        && tag.lifecycleStatus === 'Active'
        && !['Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'].includes(tag.condition)))
    if (scannedAssetItem?.trackingMode === 'individual' && scannedAssetItem.quantity > 1) {
      setSubmitError('This asset record contains multiple units. Select its inventory row and quantity instead of scanning one unit tag.')
      return
    }
    const item = scannedAssetItem || inventory.find((candidate) => candidate.itemCode.toLowerCase() === normalizedCode)
    if (!item) {
      setSubmitError(isRequisitionIssuance
        ? `No available item matches barcode ${value.trim()}.`
        : `No directly issuable consumable matches barcode ${value.trim()}. Individually tracked items must be processed through Purchase Requisitions.`)
      return
    }
    if (isReusableQuantityStock(item)) {
      setSubmitError('Reusable stock is handled through the separate Borrowing Requests workflow.')
      return
    }
    if (!isRequisitionIssuance && requiresPurchaseRequisition(item)) {
      setSubmitError('Individually tracked items must be processed through Purchase Requisitions before they can be issued.')
      return
    }
    if (selectedQuantities[item.id] !== undefined) {
      setSubmitError(`${item.itemCode} is already selected for this issuance.`)
      return
    }
    if (selectedItems.length > 0 && inventoryTypeFor(item) !== inventoryTypeFor(selectedItems[0].item)) {
      setSubmitError('Process one inventory type at a time.')
      return
    }
    if (Object.keys(selectedQuantities).length >= 100) {
      setSubmitError('Select up to 100 items for one approval email.')
      return
    }

    clearSubmittedBatch()
    setSubmitError('')
    const nextQuantities = { ...selectedQuantities, [item.id]: '1' }
    updateSelectedQuantities(nextQuantities)
    setItemSearch('')
    setInventoryPage(1)
  }

  function toggleInventoryGroup(items: InventoryItemRecord[]) {
    if (isRequisitionIssuance || items.length === 0) return
    if (items.some((item) => isReusableQuantityStock(item) || requiresPurchaseRequisition(item))) {
      setSubmitError('Only directly issuable consumable stock can be selected here.')
      return
    }
    const shouldSelect = items.some((item) => selectedQuantities[item.id] === undefined)
    const groupIds = new Set(items.map((item) => item.id))
    if (shouldSelect && selectedItems.some(({ item }) => !groupIds.has(item.id)
      && inventoryTypeFor(item) !== inventoryTypeFor(items[0]))) {
      setSubmitError('Process one inventory type at a time.')
      return
    }
    const additions = items.filter((item) => selectedQuantities[item.id] === undefined)
    if (shouldSelect && Object.keys(selectedQuantities).length + additions.length > 100) {
      setSubmitError('Select up to 100 items for one approval email.')
      return
    }
    clearSubmittedBatch()
    const next = { ...selectedQuantities }
    if (shouldSelect) items.forEach((item) => { next[item.id] = next[item.id] ?? '1' })
    else items.forEach((item) => { delete next[item.id] })
    updateSelectedQuantities(next)
    setSubmitError('')
  }

  function setGroupRecipientAllocations(group: IssuanceItemGroup, allocations: RecipientAllocation[]) {
    const allocationsByItem = allocateGroupRecipientsToItems(group, allocations)
    setRecipientAllocations((current) => ({ ...current, ...allocationsByItem }))
    setSubmitError('')
    setSubmittedBatch(null)
  }

  function updateGroupRecipientAllocation(
    group: IssuanceItemGroup,
    allocationIndex: number,
    field: keyof RecipientAllocation,
    value: string,
  ) {
    const allocations = groupedRecipientAllocations(group, recipientAllocations)
      .map((allocation, index) => index === allocationIndex ? { ...allocation, [field]: value } : allocation)
    setGroupRecipientAllocations(group, allocations)
  }

  function addGroupRecipientAllocation(group: IssuanceItemGroup) {
    const allocations = groupedRecipientAllocations(group, recipientAllocations)
    const allocatedTotal = allocations.reduce((sum, allocation) => sum + (Number(allocation.quantity) || 0), 0)
    const remaining = group.quantity - allocatedTotal
    const assignedCodes = new Set(allocations.map((allocation) => allocation.employeeCode.trim()).filter(Boolean))
    const nextRecipient = filteredAssignableEmployees.find((employee) => !assignedCodes.has(employee.id))
    if (remaining <= 0 || !nextRecipient) return
    setGroupRecipientAllocations(group, [...allocations, {
      employeeCode: nextRecipient.id,
      quantity: String(remaining),
      location: '',
      purpose: '',
    }])
  }

  async function handleManualRecipientSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedEmployee) {
      setManualRecipientError('Choose the receiving head first so the new employee is added to the correct department.')
      return
    }
    if (!employeePositions.includes(manualRecipientDraft.position)) {
      setManualRecipientError('Choose a position from Employee Master Data.')
      return
    }

    setIsSavingManualRecipient(true)
    setManualRecipientError('')
    setManualRecipientSuccess('')
    try {
      const input: EmployeeProfileInput = {
        employeeCode: manualRecipientDraft.employeeCode.trim(),
        firstName: manualRecipientDraft.firstName.trim(),
        middleName: manualRecipientDraft.middleName.trim(),
        lastName: manualRecipientDraft.lastName.trim(),
        suffix: manualRecipientDraft.suffix.trim(),
        email: manualRecipientDraft.email.trim(),
        position: manualRecipientDraft.position,
        department: selectedEmployee.department,
        status: 'Active',
      }
      const { employee } = await createEmployee(input)
      setEmployees((current) => current.some((entry) => entry.id === employee.id) ? current : [...current, employee])
      setRecipientAssignmentChecks((current) => ({ ...current, [employee.id]: [] }))
      setRecipientAssignmentErrors((current) => {
        const next = { ...current }
        delete next[employee.id]
        return next
      })
      setRecipientEmployeeSearch(employeeName(employee))
      setManualRecipientSuccess(`${employeeName(employee)} was added to Employee Master Data. Choose them from an employee picker.`)
      setManualRecipientDraft({ employeeCode: '', firstName: '', middleName: '', lastName: '', suffix: '', email: '', position: '' })
      setIsManualRecipientFormOpen(false)
    } catch (error) {
      setManualRecipientError(error instanceof Error ? error.message : 'Unable to add the employee. Please check the details and try again.')
    } finally {
      setIsSavingManualRecipient(false)
    }
  }

  function removeGroupRecipientAllocation(group: IssuanceItemGroup, allocationIndex: number) {
    const allocations = groupedRecipientAllocations(group, recipientAllocations)
      .filter((_allocation, index) => index !== allocationIndex)
    setGroupRecipientAllocations(group, allocations)
  }

  async function refreshSubmittedBatch() {
    if (!submittedBatch) return
    setIsRefreshingBatch(true)
    setBatchDetailsError('')
    try {
      const batch = await getEmployeeIssuanceBatch(submittedBatch.id)
      setSubmittedBatch(submittedBatchFromDetails(batch))
    } catch (error) {
      setBatchDetailsError(error instanceof Error ? error.message : 'Unable to refresh the issuance status.')
    } finally {
      setIsRefreshingBatch(false)
    }
  }

  async function recordManualHandover() {
    if (!submittedBatch || !handoverReference.trim()) {
      setHandoverError('Ilagay ang receipt reference o pangalan ng authorized recipient.')
      return
    }
    setIsRecordingHandover(true)
    setHandoverError('')
    try {
      await recordEmployeeIssuanceHandover(submittedBatch.id, {
        method: handoverMethod,
        reference: handoverReference.trim(),
      })
      const batch = await getEmployeeIssuanceBatch(submittedBatch.id)
      setSubmittedBatch({ ...submittedBatchFromDetails(batch), emailSent: submittedBatch.emailSent })
      setHandoverReference('')
    } catch (error) {
      setHandoverError(error instanceof Error ? error.message : 'Hindi maitala ang handover.')
    } finally {
      setIsRecordingHandover(false)
    }
  }

  function previewBarcodeLabels(labels: PrintableBarcodeLabel[]) {
    if (labelsToPrint.length > 0) return
    const uniqueLabels = [...new Map(labels.map((label) => [label.tagCode, label])).values()]
    if (uniqueLabels.length === 0) return
    setShouldOpenPrintDialog(false)
    setPrintError('')
    setLabelsToPrint(uniqueLabels)
  }

  function closeLabelPreview() {
    if (isRecordingPrint) return
    setLabelsToPrint([])
    setPrintError('')
  }

  // Records every label before opening the printer dialog, so each barcode keeps its one normal print.
  async function handleConfirmPrint() {
    if (labelsToPrint.length === 0 || isRecordingPrint) return
    setIsRecordingPrint(true)
    setPrintError('')
    try {
      await recordLabelPrintBatch(labelsToPrint.map((label) => label.tagCode))
      setPrintedTagCodes((current) => {
        const next = new Set(current)
        labelsToPrint.forEach((label) => next.add(label.tagCode))
        return next
      })
      setShouldOpenPrintDialog(true)
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Unable to print this label. Please try again.')
    } finally {
      setIsRecordingPrint(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedEmployee) {
      setSubmitError('Select an employee before creating an issuance request.')
      return
    }
    if (selectedItems.length === 0) {
      setSubmitError('Select at least one available item.')
      return
    }
    if (selectedItems.some(({ item }) => isReusableQuantityStock(item))) {
      setSubmitError('Reusable stock must be handled through the separate Borrowing Requests workflow.')
      return
    }
    if (!isRequisitionIssuance && selectedItems.some(({ item }) => requiresPurchaseRequisition(item))) {
      setSubmitError('Individually tracked items must be processed through Purchase Requisitions before they can be issued.')
      return
    }
    if (hasInvalidQuantity) {
      setSubmitError('Check the requested quantities. Each quantity must be a whole number within the available stock.')
      return
    }
    if (hasMixedItemTypes) {
      setSubmitError('Process one inventory type at a time.')
      return
    }
    if (isRequisitionIssuance && invalidRecipientAllocation) {
      setSubmitError('Complete the recipient quantity allocation for every item. The allocated total must exactly match the GSO quantity.')
      return
    }
    setIsSubmitting(true)
    setSubmitError('')
    clearSubmittedBatch()
    try {
      const batch = await createEmployeeIssuanceBatch(
        selectedEmployee.id,
        selectedItems.map(({ item, quantity }) => ({
          itemId: item.id,
          quantity,
          ...(isRequisitionIssuance ? { purchaseRequisitionLineId: purchaseRequisitionLineIds[item.id] } : {}),
          ...(isRequisitionIssuance ? {
            recipientAllocations: (recipientAllocations[item.id] || []).map((allocation) => ({
              employeeCode: allocation.employeeCode,
              quantity: Number(allocation.quantity),
              location: allocation.location.trim(),
              purpose: allocation.purpose.trim(),
            })),
          } : {}),
        })),
        notes,
        null,
        selectedPurchaseRequisitionId || undefined,
      )
      setSubmittedBatch({
        id: batch.id,
        status: batch.status,
        employeeCode: batch.employeeCode,
        employeeName: batch.employeeName,
        employeeEmail: batch.employeeEmail,
        requesterAccountLinked: batch.requesterAccountLinked,
        emailSent: batch.emailSent,
        borrowDetails: batch.borrowDetails,
        items: batch.items.map((item) => ({
          itemCode: item.itemCode,
          itemName: item.itemName,
          recipientEmployeeCode: item.recipientEmployeeCode,
          recipientEmployeeName: item.recipientEmployeeName,
          recipientLocation: item.recipientLocation,
          recipientPurpose: item.recipientPurpose,
          trackingMode: item.trackingMode,
          issueBehavior: item.issueBehavior,
          quantity: item.quantity,
          unitOfMeasure: item.unitOfMeasure,
          tags: item.tags ?? [],
        })),
      })
      const currentUrl = new URL(window.location.href)
      currentUrl.searchParams.set('batchId', batch.id)
      window.history.replaceState({}, '', currentUrl)
      updateSelectedQuantities({})
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to record the issuance.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
    <GsoPageFrame activePage="Main Issuance" searchPlaceholder="Search employees or inventory...">
      <style>{`
        @media print {
          @page { size: 50mm 30mm; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; }
          body.printing-asset-labels > *:not(#asset-barcode-labels) { display: none !important; }
          body.printing-asset-labels > #asset-barcode-labels {
            display: block !important; position: static !important; inset: auto !important;
            width: 50mm !important; height: auto !important; min-height: 30mm !important; margin: 0 !important; padding: 0 !important; overflow: visible !important;
          }
          body.printing-asset-labels .asset-barcode-label {
            box-sizing: border-box !important; display: flex !important; width: 50mm !important; height: 30mm !important;
            min-height: 30mm !important; flex-direction: column; align-items: center; justify-content: flex-start; gap: 0.2mm;
            padding: 0.3mm 0.5mm 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
            overflow: hidden !important; page-break-inside: avoid; break-inside: avoid; page-break-after: always; break-after: page;
          }
          body.printing-asset-labels .asset-barcode-label:last-child { page-break-after: auto; break-after: auto; }
          body.printing-asset-labels .asset-barcode-label p {
            max-width: 100%; margin: 0 !important; color: #000 !important; line-height: 1.15;
            letter-spacing: normal; white-space: nowrap !important; overflow: visible !important; text-overflow: clip !important;
          }
          body.printing-asset-labels .asset-barcode-label .label-barcode-value { font-size: 4mm !important; font-weight: 800; letter-spacing: 0.02mm; line-height: 1 !important; }
          body.printing-asset-labels .asset-barcode-label .label-removal-warning {
            font-size: 2mm !important; font-weight: 900; letter-spacing: 0.12mm; line-height: 1 !important;
          }
          body.printing-asset-labels .asset-barcode-label .label-item-details {
            max-width: 49mm; font-size: 1.7mm !important; font-weight: 700; line-height: 1 !important;
          }
          body.printing-asset-labels .asset-barcode-label .label-item-name {
            display: inline-block; max-width: 32mm; overflow: hidden !important; text-overflow: ellipsis !important;
            vertical-align: bottom;
          }
          body.printing-asset-labels .asset-barcode-label .barcode-preview,
          body.printing-asset-labels .asset-barcode-label .label-barcode-value,
          body.printing-asset-labels .asset-barcode-label .label-removal-warning,
          body.printing-asset-labels .asset-barcode-label .label-item-details { flex: 0 0 auto; }
          body.printing-asset-labels .barcode-preview { width: 49mm !important; max-width: 100% !important; margin: 0 auto !important; }
          body.printing-asset-labels .barcode-preview svg {
            display: block !important; width: 100% !important; height: auto !important; max-width: 49mm !important;
            max-height: 19mm !important; margin: 0 auto; object-fit: contain;
          }
        }
      `}</style>
      <div className="mx-auto max-w-7xl pb-8">
        <section className="rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GSO Staff issuance</span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Main Issuance</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-blue-100">Issue items from an approved requisition or distribute consumable stock directly to an employee.</p>
          <RequisitionIssuanceShortcuts active="issuance" />
        </section>

        {selectedPurchaseRequisitionId && <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3"><p className="text-xs font-extrabold text-indigo-900">Purchase requisition {purchaseRequisitionReference || selectedPurchaseRequisitionId}</p><p className="mt-1 text-[0.68rem] text-indigo-800">Only approved, reserved items are available here. Confirm the receiving head, allocate each item to its actual employee, then record the physical handover.</p>{purchaseRequisitionReusableCount > 0 && <p className="mt-2 text-[0.65rem] font-bold text-indigo-900">{purchaseRequisitionReusableCount} reusable item record(s) are handled through the separate Borrowing workflow.</p>}{purchaseRequisitionOtherTypeCount > 0 && <p className="mt-2 text-[0.65rem] font-bold text-indigo-900">{purchaseRequisitionOtherTypeCount} other reserved item record(s) use another issuance type. Return to Purchase Requisitions after this batch.</p>}</div>}
        {showRequisitionStep && <section className="mt-5 rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="issuance-source-title">
          <StepHeader
            step={1}
            totalSteps={stepTotal}
            status="done"
            titleId="issuance-source-title"
            title="Choose issuance source"
            description="Select a ready requisition or issue consumable stock directly."
          />
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(15rem,0.72fr)_minmax(0,1.28fr)]">
            <button
              type="button"
              aria-pressed={!isRequisitionIssuance}
              disabled={isSubmitting}
              onClick={() => selectPurchaseRequisition('')}
              className={`flex min-h-36 flex-col items-start justify-between rounded-2xl border-2 p-4 text-left shadow-md shadow-slate-300/35 transition disabled:opacity-60 ${!isRequisitionIssuance ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-300/80 bg-white ring-1 ring-slate-900/5 hover:border-emerald-300 hover:bg-emerald-50/40'}`}
            >
              <span>
                <span className="block text-sm font-extrabold text-slate-900">Direct consumables</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-600">For available consumable stock that does not need a requisition.</span>
              </span>
              <span className={`mt-4 inline-flex items-center rounded-full px-2.5 py-1 text-[0.65rem] font-extrabold ${!isRequisitionIssuance ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                {!isRequisitionIssuance ? 'Selected' : 'Issue stock directly'}
              </span>
            </button>
            <div className={`min-w-0 rounded-2xl border-2 p-3 sm:p-4 shadow-md shadow-slate-300/35 ${isRequisitionIssuance ? 'border-blue-300 bg-blue-50/40 ring-2 ring-blue-100' : 'border-slate-300/80 bg-white ring-1 ring-slate-900/5'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Approved requisitions</h3>
                  <p className="mt-0.5 text-xs text-slate-600">Choose a request with reserved items ready for issuance.</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[0.65rem] font-extrabold text-blue-800 ring-1 ring-blue-100">
                  {readyRequisitions.length} ready
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="min-w-0 flex-1">
                  {selectedPurchaseRequisitionId ? (
                    <>
                      <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-blue-700">Selected request</p>
                      <p className="mt-0.5 truncate text-sm font-black text-slate-900">{selectedReadyRequisitionDetails?.request.referenceNo || purchaseRequisitionReference || selectedPurchaseRequisitionId}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-slate-700">{selectedReadyRequisitionDetails?.requesterName || (selectedEmployee ? employeeName(selectedEmployee) : 'Loading requester details…')}</p>
                      <p className="mt-0.5 truncate text-[0.68rem] text-slate-500">{selectedReadyRequisitionDetails?.department || selectedEmployee?.department || 'Approved requisition'}</p>
                      {selectedReadyRequisitionDetails && <div className="mt-2 flex flex-wrap gap-2 text-[0.62rem] font-bold text-slate-600">
                        <span className="rounded-md bg-slate-100 px-2 py-1">{selectedReadyRequisitionDetails.readyLineCount} ready item line{selectedReadyRequisitionDetails.readyLineCount === 1 ? '' : 's'}</span>
                        <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-800">{selectedReadyRequisitionDetails.reservedUnits} reserved unit{selectedReadyRequisitionDetails.reservedUnits === 1 ? '' : 's'}</span>
                      </div>}
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-extrabold text-slate-800">No request selected</p>
                      <p className="mt-0.5 text-xs text-slate-500">Open the list to find an approved request.</p>
                    </>
                  )}
                </div>
                <button
                  ref={requisitionPickerTriggerRef}
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={isRequisitionPickerOpen}
                  disabled={isSubmitting}
                  onClick={() => { setRequisitionSearch(''); setIsRequisitionPickerOpen(true) }}
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 ${selectedPurchaseRequisitionId ? 'border border-blue-200 bg-white text-blue-700 hover:bg-blue-50' : 'bg-blue-700 text-white shadow-sm hover:bg-blue-800'}`}
                >
                  {selectedPurchaseRequisitionId ? 'Change request' : 'Choose approved requisition'}
                </button>
              </div>
            </div>
          </div>
        </section>}
        {isRequisitionPickerOpen && createPortal(
          <div
            className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm sm:p-4"
            onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) setIsRequisitionPickerOpen(false) }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="requisition-picker-title"
              onKeyDown={(event) => { if (event.key === 'Escape' && !isSubmitting) setIsRequisitionPickerOpen(false) }}
              className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-3xl"
            >
              <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Main issuance</p>
                  <h2 id="requisition-picker-title" className="mt-1 text-base font-black text-slate-900 sm:text-lg">Choose an approved requisition</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">Select the request whose reserved items you are ready to issue.</p>
                </div>
                <button type="button" aria-label="Close approved requisition picker" disabled={isSubmitting} onClick={() => setIsRequisitionPickerOpen(false)} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Close</button>
              </header>

              <div className="grid shrink-0 gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-6">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-extrabold text-slate-700">Find a request</span>
                  <input
                    ref={requisitionPickerSearchRef}
                    type="search"
                    value={requisitionSearch}
                    onChange={(event) => setRequisitionSearch(event.target.value)}
                    placeholder="Search request number, requester, or department"
                    disabled={isSubmitting}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <span className="rounded-xl bg-blue-50 px-3.5 py-2.5 text-xs font-extrabold text-blue-900">{readyRequisitions.length} ready request{readyRequisitions.length === 1 ? '' : 's'}</span>
              </div>

              <div className="inventory-list-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-4 sm:p-6" role="group" aria-label="Ready approved requisitions">
                {filteredReadyRequisitions.map((request) => {
                  const readyLines = linesOf(request).filter((line) => MAIN_ISSUANCE_READY_STATUSES.includes(line.routeStatus))
                  const reservedUnits = readyLines.reduce((total, line) => total + line.allocations
                    .filter((allocation) => allocation.status === 'Reserved')
                    .reduce((lineTotal, allocation) => lineTotal + Math.max(Number(allocation.quantity) - Number(allocation.fulfilledQuantity || 0), 0), 0), 0)
                  const requesterName = formText(request.formData.requesterName) || request.requesterName
                  const department = formText(request.formData.departmentOrganization)
                  const isSelectedRequest = request.id === selectedPurchaseRequisitionId
                  return (
                    <button
                      key={request.id}
                      type="button"
                      aria-pressed={isSelectedRequest}
                      disabled={isSubmitting}
                      onClick={() => {
                        selectPurchaseRequisition(request.id)
                        setIsRequisitionPickerOpen(false)
                      }}
                      className={`w-full rounded-xl border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 sm:p-4 ${isSelectedRequest ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'}`}
                    >
                      <span className="flex flex-wrap items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-extrabold text-slate-900">{request.referenceNo}</span>
                          <span className="mt-0.5 block truncate text-xs font-semibold text-slate-700">{requesterName}</span>
                          <span className="mt-0.5 block truncate text-[0.68rem] text-slate-500">{department || request.requesterEmail}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${isSelectedRequest ? 'bg-blue-600 text-white' : 'bg-emerald-50 text-emerald-800'}`}>
                          {isSelectedRequest ? 'Currently selected' : 'Ready to issue'}
                        </span>
                      </span>
                      <span className="mt-2.5 flex flex-wrap gap-2 text-[0.62rem] font-bold text-slate-600">
                        <span className="rounded-md bg-slate-100 px-2 py-1">{readyLines.length} ready item line{readyLines.length === 1 ? '' : 's'}</span>
                        <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-800">{reservedUnits} reserved unit{reservedUnits === 1 ? '' : 's'}</span>
                      </span>
                    </button>
                  )
                })}
                {isLoading && filteredReadyRequisitions.length === 0 && <p role="status" className="rounded-xl bg-white px-3 py-8 text-center text-xs font-semibold text-slate-500">Loading ready requisitions…</p>}
                {!isLoading && filteredReadyRequisitions.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-8 text-center text-xs font-semibold text-slate-500">{readyRequisitions.length === 0 ? 'No approved requisitions are ready for issuance.' : 'No requisition matches your search. Try a request number, requester name, or department.'}</p>}
              </div>

              <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                <p className="text-xs font-semibold text-slate-600">Showing {filteredReadyRequisitions.length} of {readyRequisitions.length} ready request{readyRequisitions.length === 1 ? '' : 's'}.</p>
                <button type="button" disabled={isSubmitting} onClick={() => setIsRequisitionPickerOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
        <form onSubmit={handleSubmit} className="mt-5 grid gap-5 xl:grid-cols-2" aria-label="Issue consumables or prepare approved item handovers">
          <div className="flex min-w-0 flex-col rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
            <section aria-labelledby="employee-section-title" className="border-b border-slate-200 p-4 sm:p-5">
              <StepHeader
                step={employeeStepNumber}
                totalSteps={stepTotal}
                status={stepStatusFor(employeeStepNumber, isEmployeeStepDone)}
                titleId="employee-section-title"
                title={isRequisitionIssuance ? 'Confirm receiving head' : 'Choose employee'}
                description={isRequisitionIssuance ? 'Confirm the requesting head who will receive the physical handover. Assign actual staff recipients in the review step below.' : 'Who will receive the selected items?'}
              />
              <label className="mt-3 block">
                <span className="sr-only">Employee</span>
                <select
                  value={selectedEmployeeCode}
                  onChange={(event) => {
                    const nextEmployeeCode = event.target.value
                    setSelectedEmployeeCode(nextEmployeeCode)
                    setEmployeeIssuedItems([])
                    setEmployeeItemsError('')
                    setIsLoadingEmployeeItems(Boolean(nextEmployeeCode))
                    setShowEmployeeItems(false)
                    setSubmitError('')
                    clearSubmittedBatch()
                  }}
                  disabled={isLoading || isSubmitting || isRequisitionIssuance}
                  className={fieldControlClass}
                >
                  <option value="">Select an employee</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employeeName(employee)} · {employee.id}
                    </option>
                  ))}
                </select>
              </label>
              {selectedEmployee ? (
                <>
                  <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-sm font-extrabold text-slate-900">{employeeName(selectedEmployee)}</p>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${selectedEmployee.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                        {selectedEmployee.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-700">{selectedEmployee.id} · {selectedEmployee.department} · {selectedEmployee.position}</p>
                    <p className="mt-0.5 break-all text-xs font-semibold text-slate-700">{selectedEmployee.email}</p>
                  </div>
                  {!isRequisitionIssuance && <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900">{isRequisitionIssuance ? 'Items currently with this head' : 'Items issued to this employee'}</h3>
                        <p className="mt-0.5 text-xs font-bold text-blue-700">
                          {isLoadingEmployeeItems
                            ? 'Loading employee items…'
                            : `${employeeIssuedItems.length} record${employeeIssuedItems.length === 1 ? '' : 's'} · ${employeeIssuedItems.reduce((total, item) => total + item.quantity, 0)} unit(s)`}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-expanded={showEmployeeItems}
                        aria-controls="employee-issued-items-list"
                        onClick={() => setShowEmployeeItems((visible) => !visible)}
                        className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
                      >
                        {showEmployeeItems ? 'Hide items' : 'View items'}
                      </button>
                    </div>
                    {showEmployeeItems && (
                      <div id="employee-issued-items-list" className="inventory-list-scrollbar max-h-60 space-y-2 overflow-y-auto border-t border-slate-200 bg-slate-50 p-2">
                        {isLoadingEmployeeItems && <p role="status" className="rounded-lg bg-white px-3 py-4 text-center text-sm font-semibold text-slate-600">Loading issued item records…</p>}
                        {employeeItemsError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{employeeItemsError}</p>}
                        {!isLoadingEmployeeItems && !employeeItemsError && employeeIssuedItems.length === 0 && <p className="rounded-lg bg-white px-3 py-4 text-center text-sm font-semibold text-slate-600">No active item records are linked to this employee.</p>}
                        {!isLoadingEmployeeItems && !employeeItemsError && employeeIssuedItems.map((item) => (
                          <article key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-extrabold text-slate-900">{item.name}</p>
                              <p className="mt-0.5 text-xs font-semibold text-slate-600">{item.code} · {item.condition} · {item.assignedOn}</p>
                              <span className="mt-1 inline-flex rounded-md bg-blue-100 px-2 py-0.5 text-xs font-extrabold text-blue-800">
                                {item.trackingMode === 'individual' ? 'Individually tracked item' : item.issueBehavior === 'consumable' ? 'Consumable stock' : 'Reusable item · Borrowing workflow'}
                              </span>
                            </div>
                            <span className="shrink-0 text-sm font-extrabold text-slate-800">{item.quantity} {item.unitOfMeasure}</span>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>}
                </>
              ) : (
                <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">Choose an employee to view current assignments.</p>
              )}
              {employeeCodeFromUrl && !isLoading && !selectedEmployee && (
                <p role="status" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-900">
                  Hindi makita sa Employee Master Data ang employee code na {employeeCodeFromUrl}. Pumili ng employee sa listahan para magpatuloy.
                </p>
              )}
            </section>

            <section aria-labelledby="items-section-title" className="flex min-h-0 grow flex-col p-4 sm:p-5">
              <StepHeader
                step={itemsStepNumber}
                totalSteps={stepTotal}
                status={stepStatusFor(itemsStepNumber, isItemsStepDone)}
                titleId="items-section-title"
                title="Choose items"
                description={isRequisitionIssuance
                  ? 'Review reserved items from the approved purchase requisition.'
                  : 'Choose consumable stock to issue directly to the selected employee.'}
              />

              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.55fr)]">
                <label className="block">
                  <span className="sr-only">Search inventory by item name, code, description, or category</span>
                  <input
                    type="search"
                    value={itemSearch}
                    onChange={(event) => { setItemSearch(event.target.value); setInventoryPage(1) }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      addScannedInventoryCode(event.currentTarget.value)
                    }}
                    placeholder="Search by item name, code, or description"
                    className={fieldControlClass}
                  />
                </label>
                <label className="block">
                  <span className="sr-only">Filter inventory by category</span>
                  <select
                    value={inventoryCategoryFilter}
                    onChange={(event) => { setInventoryCategoryFilter(event.target.value); setInventoryPage(1) }}
                    className={fieldControlClass}
                  >
                    <option value="all">All categories ({inventory.length.toLocaleString()})</option>
                    {inventoryCategories.map((category) => (
                      <option key={category} value={category}>{category} ({(inventoryCategoryCounts[category] || 0).toLocaleString()})</option>
                    ))}
                  </select>
                </label>
              </div>

              {isRequisitionIssuance && <div className="mt-3 grid gap-2 grid-cols-2 xl:grid-cols-3" role="group" aria-label="Filter by inventory type">
                {visibleInventoryTypeOptions.map((option) => {
                  const isActive = inventoryTypeFilter === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isActive}
                      disabled={isSubmitting}
                      onClick={() => { setInventoryTypeFilter(option.value); setInventoryPage(1) }}
                      className={`min-w-0 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-60 ${isActive ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40'}`}
                    >
                      <span className="block text-xs font-extrabold leading-snug text-slate-900">{option.label}</span>
                      <span className="mt-1 block text-[0.65rem] font-semibold text-slate-500">{inventoryTypeCounts[option.value].toLocaleString()} available</span>
                    </button>
                  )
                })}
              </div>}
              {!isRequisitionIssuance && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold leading-relaxed text-emerald-900">Consumable stock is issued directly to the selected employee and deducted immediately. No requisition approval is needed.</p>}

              {loadError && (
                <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">{loadError}</p>
              )}
              {isLoading ? (
                <p role="status" className="mt-3 grid grow basis-80 place-items-center rounded-xl bg-slate-50 px-4 text-center text-sm font-semibold text-slate-600">Loading employees and available inventory...</p>
                ) : !loadError && visibleInventoryGroups.length > 0 ? (
                <div className="inventory-list-scrollbar mt-3 grid min-h-0 grow basis-80 grid-cols-1 content-start gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                  {visibleInventoryGroups.map((group) => {
                    const item = group.item
                    const selectedQuantity = group.entries.reduce((total, entry) => total + Number(selectedQuantities[entry.item.id] || 0), 0)
                    const isSelected = selectedQuantity > 0
                    const isFullySelected = group.entries.every((entry) => selectedQuantities[entry.item.id] !== undefined)
                    const itemType = inventoryTypeFor(item)
                    const itemTypeLabel = itemType === 'individual' ? 'Individually tracked item' : 'Consumable stock'
                    const itemCodes = group.entries.map((entry) => entry.item.itemCode)
                    const conditions = [...new Set(group.entries.map((entry) => availableUnitConditionSummary(entry.item)))]
                    const groupConditionSummary = conditions.length === 1 ? conditions[0] : `${conditions.length} condition types`
                    return (
                      <button
                        key={group.key}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={isSubmitting || isRequisitionIssuance}
                        onClick={() => toggleInventoryGroup(group.entries.map((entry) => entry.item))}
                        className={`rounded-xl border p-3 text-left transition disabled:opacity-60 ${isFullySelected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : isSelected ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'}`}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span title={item.description} className="block truncate text-sm font-extrabold text-slate-900">{item.description || item.itemName}</span>
                            <span className="mt-0.5 block truncate text-xs font-bold text-blue-700">{item.itemName}</span>
                            <span title={itemCodes.join(' · ')} className="mt-1 block truncate text-xs text-slate-500">{itemCodes.join(' · ')} · {item.category}</span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-800">×{group.availableQuantity}</span>
                            <span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${isFullySelected ? 'bg-blue-600 text-white' : isSelected ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-800'}`}>
                              {isFullySelected ? 'Selected' : isSelected ? `${selectedQuantity} selected` : 'Select'}
                            </span>
                          </span>
                        </span>
                        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-700">
                          <span className={`rounded-md px-1.5 py-0.5 font-extrabold ${itemType === 'individual' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {itemTypeLabel}
                          </span>
                          <span>{groupConditionSummary}</span>
                          <span className="ml-auto font-bold text-slate-800">{isRequisitionIssuance ? 'Reserved' : 'Available'}: {group.availableQuantity} {item.unitOfMeasure}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : !loadError ? (
                <p className="mt-3 grid grow basis-80 place-items-center rounded-xl bg-slate-50 px-4 text-center text-sm font-semibold text-slate-600">
                  {inventory.length === 0
                    ? isRequisitionIssuance
                      ? 'No reserved inventory is currently available for this purchase requisition.'
                      : 'No consumable stock is currently available for direct issuance.'
                    : 'No items match the current search, category, and type filters.'}
                </p>
              ) : null}
              {!isLoading && !loadError && filteredInventoryGroups.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-xs font-semibold text-slate-600">
                    Showing {((currentInventoryPage - 1) * INVENTORY_PAGE_SIZE + 1).toLocaleString()}–{Math.min(currentInventoryPage * INVENTORY_PAGE_SIZE, filteredInventoryGroups.length).toLocaleString()} of {filteredInventoryGroups.length.toLocaleString()} matching item types
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentInventoryPage <= 1 || isSubmitting}
                      onClick={() => setInventoryPage((page) => Math.max(1, page - 1))}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-extrabold text-slate-700">{currentInventoryPage} / {inventoryPageCount}</span>
                    <button
                      type="button"
                      disabled={currentInventoryPage >= inventoryPageCount || isSubmitting}
                      onClick={() => setInventoryPage((page) => Math.min(inventoryPageCount, page + 1))}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <section aria-labelledby="review-section-title" className="flex min-w-0 flex-col rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
            <StepHeader
              step={reviewStepNumber}
              totalSteps={stepTotal}
              status={stepStatusFor(reviewStepNumber, isShowingSentBatch)}
              titleId="review-section-title"
              title={isShowingSentBatch ? 'Issuance recorded' : 'Review issuance'}
              description={isShowingSentBatch ? 'Track the record or start another transaction.' : isRequisitionIssuance ? 'Confirm the receiving head, actual staff recipients, and quantities.' : isConsumableIssue ? 'Confirm the employee and consumable quantities.' : 'Confirm the employee, approved items, and quantities.'}
            >
              {!isShowingSentBatch && (
                <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-extrabold text-blue-800">
                  {selectedItemGroups.length} item type{selectedItemGroups.length === 1 ? '' : 's'} · {selectedUnitCount} unit{selectedUnitCount === 1 ? '' : 's'}
                </span>
              )}
            </StepHeader>

            {!isShowingSentBatch && (
              <>
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-xl bg-slate-100 px-3.5 py-2.5">
                  <span className="text-xs font-bold text-slate-700">{isRequisitionIssuance ? 'Physical handover recipient' : 'Employee'}</span>
                  <span className="min-w-0 text-sm font-extrabold text-slate-900">
                    {selectedEmployee ? `${employeeName(selectedEmployee)} · ${selectedEmployee.id}` : 'Not selected yet'}
                  </span>
                </div>

                {isRequisitionIssuance && selectedItems.length > 0 && <>
                  <section className="mt-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3" aria-label="Actual staff recipient assignment summary">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-blue-950">Actual employee assignments</h3>
                        <p className="mt-0.5 text-[0.68rem] leading-relaxed text-blue-900">The head receives the items from GSO. Assign each unit to the employee who will use it.</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${isRecipientAssignmentComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                        {isRecipientAssignmentComplete ? 'Assignments ready' : 'Assignment needed'}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <p className="font-extrabold text-slate-800">{assignedRecipientUnitCount} / {selectedUnitCount} units assigned <span className="font-semibold text-slate-500">· {recipientEmployeeCodes.length} employee{recipientEmployeeCodes.length === 1 ? '' : 's'}</span></p>
                      <button
                        ref={recipientAssignmentTriggerRef}
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => { setRecipientEmployeeSearch(''); setIsRecipientAssignmentOpen(true) }}
                        className="rounded-lg bg-blue-700 px-3.5 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isRecipientAssignmentComplete ? 'Review / edit assignments' : 'Assign actual employees'}
                      </button>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="Recipient assignment progress" aria-valuemin={0} aria-valuemax={selectedUnitCount} aria-valuenow={Math.min(assignedRecipientUnitCount, selectedUnitCount)}>
                      <div className={`h-full rounded-full transition-all ${isRecipientAssignmentComplete ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${selectedUnitCount > 0 ? Math.min((assignedRecipientUnitCount / selectedUnitCount) * 100, 100) : 0}%` }} />
                    </div>
                    {recipientCrossCheckFailed && <p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[0.68rem] font-bold text-rose-800">Could not check one or more employees’ current assignments. Refresh Main Issuance and retry before issuing.</p>}
                  </section>

                  {isRecipientAssignmentOpen && createPortal(
                    <div
                      className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm sm:p-4"
                      onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) setIsRecipientAssignmentOpen(false) }}
                    >
                      <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="recipient-assignment-title"
                        onKeyDown={(event) => { if (event.key === 'Escape' && !isSubmitting) setIsRecipientAssignmentOpen(false) }}
                        className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-3xl"
                      >
                        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
                          <div className="min-w-0">
                            <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Staff distribution</p>
                            <h2 id="recipient-assignment-title" className="mt-1 text-base font-black text-slate-900 sm:text-lg">Assign items to actual employees</h2>
                            <p className="mt-1 text-xs leading-relaxed text-slate-600">{selectedEmployee ? `GSO will hand the items to ${employeeName(selectedEmployee)}. Assign the units below to their actual users.` : 'Assign each unit to its actual user.'}</p>
                          </div>
                          <button type="button" aria-label="Close employee assignments" disabled={isSubmitting} onClick={() => setIsRecipientAssignmentOpen(false)} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Close</button>
                        </header>

                        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                            <label className="block">
                              <span className="mb-1.5 block text-xs font-extrabold text-slate-700">Find an employee</span>
                              <input
                                ref={recipientEmployeeSearchRef}
                                type="search"
                                value={recipientEmployeeSearch}
                                onChange={(event) => setRecipientEmployeeSearch(event.target.value)}
                                placeholder="Search by name, employee code, email, or position"
                                disabled={isSubmitting}
                                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                              />
                            </label>
                            <div className="rounded-xl bg-blue-50 px-3.5 py-2.5 text-xs font-extrabold text-blue-900">
                              {assignedRecipientUnitCount} / {selectedUnitCount} units assigned · {recipientEmployeeCodes.length} employee{recipientEmployeeCodes.length === 1 ? '' : 's'}
                            </div>
                          </div>
                          <p className="mt-2 text-[0.68rem] leading-relaxed text-slate-500">
                            {assignableEmployees.length} active employee{assignableEmployees.length === 1 ? '' : 's'} in {selectedEmployee?.department || 'the requesting department'} can be selected. Other departments are hidden; search narrows the options in every picker.
                          </p>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[0.68rem] text-slate-500">Employee missing from the list?</p>
                            <button
                              type="button"
                              disabled={isSubmitting || isSavingManualRecipient}
                              onClick={() => {
                                setIsManualRecipientFormOpen((open) => !open)
                                setManualRecipientError('')
                                setManualRecipientSuccess('')
                              }}
                              className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isManualRecipientFormOpen ? 'Close form' : '+ Add employee manually'}
                            </button>
                          </div>
                          {manualRecipientSuccess && <p role="status" className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{manualRecipientSuccess}</p>}
                          {isManualRecipientFormOpen && <form onSubmit={(event) => void handleManualRecipientSubmit(event)} className="mt-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 sm:p-4">
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <h3 className="text-sm font-extrabold text-slate-900">Add employee to Employee Master Data</h3>
                                <p className="mt-1 text-[0.68rem] text-slate-600">They will be added to {selectedEmployee?.department || 'the head’s department'} and appear in the employee picker.</p>
                              </div>
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[0.62rem] font-extrabold text-emerald-800">Active profile</span>
                            </div>
                            <div className="grid gap-2.5 sm:grid-cols-2">
                              <label className="block">
                                <span className="mb-1 block text-xs font-extrabold text-slate-700">Employee code *</span>
                                <input required maxLength={40} value={manualRecipientDraft.employeeCode} onChange={(event) => setManualRecipientDraft((draft) => ({ ...draft, employeeCode: event.target.value }))} disabled={isSavingManualRecipient || isSubmitting} placeholder="Official employee code" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-xs font-extrabold text-slate-700">School email *</span>
                                <input required type="email" maxLength={254} value={manualRecipientDraft.email} onChange={(event) => setManualRecipientDraft((draft) => ({ ...draft, email: event.target.value }))} disabled={isSavingManualRecipient || isSubmitting} placeholder="name@school.edu" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-xs font-extrabold text-slate-700">First name *</span>
                                <input required maxLength={100} value={manualRecipientDraft.firstName} onChange={(event) => setManualRecipientDraft((draft) => ({ ...draft, firstName: event.target.value }))} disabled={isSavingManualRecipient || isSubmitting} placeholder="First name" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-xs font-extrabold text-slate-700">Last name *</span>
                                <input required maxLength={100} value={manualRecipientDraft.lastName} onChange={(event) => setManualRecipientDraft((draft) => ({ ...draft, lastName: event.target.value }))} disabled={isSavingManualRecipient || isSubmitting} placeholder="Last name" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-xs font-extrabold text-slate-700">Middle name <span className="font-semibold text-slate-400">(optional)</span></span>
                                <input maxLength={100} value={manualRecipientDraft.middleName} onChange={(event) => setManualRecipientDraft((draft) => ({ ...draft, middleName: event.target.value }))} disabled={isSavingManualRecipient || isSubmitting} placeholder="Middle name" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-xs font-extrabold text-slate-700">Suffix <span className="font-semibold text-slate-400">(optional)</span></span>
                                <input maxLength={40} value={manualRecipientDraft.suffix} onChange={(event) => setManualRecipientDraft((draft) => ({ ...draft, suffix: event.target.value }))} disabled={isSavingManualRecipient || isSubmitting} placeholder="Jr., III" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                              </label>
                              <label className="block sm:col-span-2">
                                <span className="mb-1 block text-xs font-extrabold text-slate-700">Position *</span>
                                <select required value={manualRecipientDraft.position} onChange={(event) => setManualRecipientDraft((draft) => ({ ...draft, position: event.target.value }))} disabled={isSavingManualRecipient || isSubmitting || employeePositions.length === 0} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                                  <option value="">Select position</option>
                                  {employeePositions.map((position) => <option key={position} value={position}>{position}</option>)}
                                </select>
                              </label>
                            </div>
                            <p className="mt-2 text-[0.65rem] leading-relaxed text-slate-500">Use the official employee code. This creates an Employee Master Data profile, not a login account.</p>
                            {employeePositions.length === 0 && <p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">No positions are available. Add a position in Employee Master Data first.</p>}
                            {manualRecipientError && <p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{manualRecipientError}</p>}
                            <div className="mt-3 flex justify-end gap-2">
                              <button type="button" disabled={isSavingManualRecipient || isSubmitting} onClick={() => setIsManualRecipientFormOpen(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                              <button type="submit" disabled={isSavingManualRecipient || isSubmitting || employeePositions.length === 0} className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{isSavingManualRecipient ? 'Saving employee…' : 'Save and add'}</button>
                            </div>
                          </form>}

                          <div className="mt-4 space-y-3">
                            {selectedItemGroups.map((group) => {
                              const { item, quantity } = group
                              const allocations = groupedRecipientAllocations(group, recipientAllocations)
                              const allocatedTotal = allocations.reduce((sum, allocation) => sum + (Number(allocation.quantity) || 0), 0)
                              const allocationIsComplete = allocatedTotal === quantity
                              const itemCodes = group.entries.map((entry) => entry.item.itemCode)
                              return <article key={`recipient-${group.key}`} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-extrabold text-slate-900">{item.itemName || item.description} <span className="text-blue-700">×{quantity}</span></p>
                                    <p className="mt-0.5 text-[0.68rem] font-semibold text-slate-500">{itemCodes.length} physical record{itemCodes.length === 1 ? '' : 's'} · {item.unitOfMeasure}</p>
                                    <p title={itemCodes.join(' · ')} className="mt-0.5 wrap-break-word text-[0.65rem] text-slate-500">Unit codes: {itemCodes.join(' · ')}</p>
                                  </div>
                                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${allocationIsComplete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{allocatedTotal} / {quantity} assigned</span>
                                </div>
                                <div className="mt-3 space-y-2.5">
                                  {allocations.map((allocation, allocationIndex) => {
                                    const recipient = employees.find((employee) => employee.id === allocation.employeeCode)
                                    const activeItems = recipientAssignmentChecks[allocation.employeeCode] || []
                                    const recipientIsPending = recipientAssignmentChecks[allocation.employeeCode] === undefined && !recipientAssignmentErrors[allocation.employeeCode]
                                    const sameItemAssignments = activeItems.filter((assigned) => itemCodes.includes(assigned.code))
                                    const quantityAssignedElsewhere = allocations.reduce((sum, row, rowIndex) => sum + (rowIndex === allocationIndex ? 0 : Number(row.quantity) || 0), 0)
                                    const maxAllocation = Math.max(quantity - quantityAssignedElsewhere, 1)
                                    const matchingOptions = [
                                      ...assignableEmployees.filter((employee) => employee.id === allocation.employeeCode && !filteredAssignableEmployees.some((match) => match.id === employee.id)),
                                      ...filteredAssignableEmployees,
                                    ]
                                    return <div key={`${group.key}-${allocation.employeeCode || 'unassigned'}-${allocationIndex}`} className="rounded-xl border border-slate-200 bg-white p-3">
                                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
                                        <label className="block min-w-0">
                                          <span className="mb-1 block text-xs font-extrabold text-slate-700">Actual employee</span>
                                          <select value={allocation.employeeCode} disabled={isSubmitting} onChange={(event) => updateGroupRecipientAllocation(group, allocationIndex, 'employeeCode', event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                                            <option value="">Select employee</option>
                                            {allocation.employeeCode && !assignableEmployees.some((employee) => employee.id === allocation.employeeCode) && <option value={allocation.employeeCode} disabled>Unavailable employee · {allocation.employeeCode} · choose another</option>}
                                            {matchingOptions.map((employee) => <option key={employee.id} value={employee.id} disabled={allocations.some((row, rowIndex) => rowIndex !== allocationIndex && row.employeeCode === employee.id)}>{employee.id === selectedEmployee?.id ? `${employeeName(employee)} · Head / department stock` : `${employeeName(employee)} · ${employee.id} · ${employee.position}`}</option>)}
                                          </select>
                                          {recipient && <span className="mt-1 block truncate text-[0.65rem] font-medium text-slate-500">{recipient.email}</span>}
                                        </label>
                                        <label className="block"><span className="mb-1 block text-xs font-extrabold text-slate-700">Quantity</span><input type="number" min="1" max={maxAllocation} step="1" value={allocation.quantity} disabled={isSubmitting} onChange={(event) => updateGroupRecipientAllocation(group, allocationIndex, 'quantity', event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
                                        <button type="button" disabled={isSubmitting || allocations.length <= 1} onClick={() => removeGroupRecipientAllocation(group, allocationIndex)} className="self-end rounded-lg border border-rose-100 px-3 py-3 text-xs font-extrabold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">Remove</button>
                                      </div>
                                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        <label className="block"><span className="mb-1 block text-[0.68rem] font-extrabold text-slate-700">Actual use location <span className="font-semibold text-slate-400">(optional)</span></span><input value={allocation.location} maxLength={200} disabled={isSubmitting} onChange={(event) => updateGroupRecipientAllocation(group, allocationIndex, 'location', event.target.value)} placeholder="e.g. IT Office · Room 201" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
                                        <label className="block"><span className="mb-1 block text-[0.68rem] font-extrabold text-slate-700">Intended use <span className="font-semibold text-slate-400">(optional)</span></span><input value={allocation.purpose} maxLength={500} disabled={isSubmitting} onChange={(event) => updateGroupRecipientAllocation(group, allocationIndex, 'purpose', event.target.value)} placeholder="e.g. For student records" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
                                      </div>
                                      {allocation.employeeCode && <div className={`mt-2 rounded-lg px-2.5 py-2 text-[0.68rem] ${recipientAssignmentErrors[allocation.employeeCode] ? 'bg-rose-50 text-rose-800' : sameItemAssignments.length > 0 ? 'bg-amber-50 text-amber-900' : recipientIsPending ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-800'}`}>
                                        {recipientAssignmentErrors[allocation.employeeCode]
                                          ? `Unable to cross-check ${recipient?.firstName || allocation.employeeCode}: ${recipientAssignmentErrors[allocation.employeeCode]}`
                                          : recipientIsPending
                                            ? `Checking current assignments for ${recipient ? employeeName(recipient) : allocation.employeeCode}…`
                                            : sameItemAssignments.length > 0
                                              ? `${recipient ? employeeName(recipient) : allocation.employeeCode} already has ${sameItemAssignments.reduce((sum, assigned) => sum + assigned.quantity, 0)} active ${item.itemName || item.description} item(s). Confirm this additional allocation is needed.`
                                              : `Cross-check complete${recipient ? ` · ${employeeName(recipient)} has ${activeItems.length} active item record(s)` : ''}.`}
                                      </div>}
                                      {allocation.employeeCode && !recipientIsPending && !recipientAssignmentErrors[allocation.employeeCode] && activeItems.length > 0 && <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                                        <summary className="cursor-pointer text-[0.68rem] font-extrabold text-slate-700">View current assignments ({activeItems.length})</summary>
                                        <ul className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                                          {activeItems.map((assigned, assignedIndex) => <li key={`${assigned.id}-${assignedIndex}`} className="flex items-center justify-between gap-2 text-[0.65rem] text-slate-600"><span className="min-w-0 truncate">{assigned.name} · {assigned.code}</span><span className="shrink-0 font-bold">{assigned.quantity} {assigned.unitOfMeasure}</span></li>)}
                                        </ul>
                                      </details>}
                                    </div>
                                  })}
                                </div>
                                <button type="button" disabled={isSubmitting || allocatedTotal >= quantity || !filteredAssignableEmployees.some((employee) => !allocations.some((allocation) => allocation.employeeCode === employee.id))} onClick={() => addGroupRecipientAllocation(group)} className="mt-2.5 rounded-lg border border-blue-200 px-3 py-2.5 text-xs font-extrabold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">+ Add employee</button>
                              </article>
                            })}
                          </div>
                          {invalidRecipientAllocation && <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-900">Assign the full quantity in each item group. Each unit will still be linked to its own inventory record and barcode.</p>}
                          {recipientCrossCheckFailed && <p role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-800">Could not check one or more employees’ current assignments. Refresh Main Issuance and retry before issuing.</p>}
                        </div>

                        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                          <p className="text-xs font-semibold text-slate-600">{recipientCrossCheckPending ? 'Checking assigned employees…' : 'Your entries stay here while you review. Close this window to return to Step 4.'}</p>
                          <button
                            type="button"
                            disabled={isSubmitting || !isRecipientAssignmentComplete || recipientCrossCheckPending || recipientCrossCheckFailed}
                            onClick={() => setIsRecipientAssignmentOpen(false)}
                            className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                          >
                            Done
                          </button>
                        </footer>
                      </section>
                    </div>,
                    document.body,
                  )}
                </>}

                {selectedItemGroups.length > 0 ? (
                  <div className="mt-3 min-h-0 grow xl:basis-56">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-extrabold text-slate-800">Issuance summary</h3>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-800">{selectedItemGroups.length} item group{selectedItemGroups.length === 1 ? '' : 's'} · {selectedUnitCount} unit{selectedUnitCount === 1 ? '' : 's'}</span>
                    </div>
                    <ul className="inventory-list-scrollbar max-h-96 divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200 px-3 xl:max-h-72">
                      {selectedItemGroups.map((group) => (
                        <li key={`summary-${group.key}`} className="py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-extrabold text-slate-900">{group.item.itemName || group.item.description} <span className="text-blue-700">×{group.quantity}</span></p>
                              <p title={group.entries.map((entry) => entry.item.itemCode).join(' · ')} className="mt-1 wrap-break-word text-xs font-semibold text-slate-600">{group.entries.map((entry) => entry.item.itemCode).join(' · ')}</p>
                              <p className="mt-1 text-[0.65rem] font-bold text-blue-700">{isRequisitionIssuance ? 'Approved requisition quantity · unit records and barcodes remain separate' : 'Consumable stock · issued immediately'}</p>
                            </div>
                            {isRequisitionIssuance && <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-emerald-800">Ready to issue</span>}
                          </div>
                          {!isRequisitionIssuance && <div className="mt-2 space-y-2">
                            {group.entries.map(({ item }) => (
                              <label key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2.5 py-2">
                                <span className="min-w-0">
                                  <span className="block truncate text-[0.65rem] font-extrabold text-slate-700">{item.itemCode}</span>
                                  <span className="block text-[0.6rem] text-slate-500">Max {item.availableQuantity} {item.unitOfMeasure}</span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <span className="text-[0.62rem] font-bold text-slate-600">Qty</span>
                                  <input
                                    aria-label={`Quantity for ${item.itemName || item.description} (${item.itemCode})`}
                                    type="number"
                                    min="1"
                                    max={item.availableQuantity}
                                    step="1"
                                    value={selectedQuantities[item.id] ?? '1'}
                                    disabled={isSubmitting}
                                    onChange={(event) => {
                                      setSelectedQuantities((current) => ({ ...current, [item.id]: event.target.value }))
                                      setSubmittedBatch(null)
                                    }}
                                    className="h-9 w-20 rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                  />
                                </span>
                              </label>
                            ))}
                          </div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mt-2 grid min-h-28 grow place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
                    <p className="text-sm font-medium text-slate-600">Choose an available item in Step 2 to add it here.</p>
                  </div>
                )}
                {hasInvalidQuantity && (
                  <p role="alert" className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
                    Enter a whole quantity from 1 up to the available stock for each selected item.
                  </p>
                )}

                <label className="mt-3 block border-t border-slate-200 pt-3">
                  <span className={fieldLabelClass}>{selectedItems[0]?.item.trackingMode === 'individual' ? 'Accessories and handover notes' : 'Distribution notes'}</span>
                  <input
                    type="text"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={1000}
                    disabled={isSubmitting}
                    placeholder={selectedItems[0]?.item.trackingMode === 'individual' ? 'e.g. charger, bag, or other included accessories' : 'Optional distribution note'}
                    className={fieldControlClass}
                  />
                </label>

                {submitErrorAlert}

                <button
                  type="submit"
                  disabled={isLoading || isSubmitting || !selectedEmployee || selectedItems.length === 0 || hasInvalidQuantity || hasMixedItemTypes || invalidRecipientAllocation || recipientCrossCheckPending || recipientCrossCheckFailed || Boolean(loadError)}
                  className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700 disabled:shadow-none"
                >
                  {isSubmitting ? 'Recording...' : `${isPerUnitPickup ? 'Record approved item handover' : 'Issue consumable stock'} (${selectedUnitCount} unit${selectedUnitCount === 1 ? '' : 's'})`}
                </button>
                {nextStepHint ? (
                  <p className="mt-2 text-center text-sm font-bold text-blue-800">{nextStepHint}</p>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {isPerUnitPickup
                      ? 'This handover is linked to an approved Purchase Requisition. Each barcode will be linked to the recipient allocation below.'
                      : 'Consumable stock is deducted immediately. No employee approval is required.'}
                  </p>
                )}
              </>
            )}

            {submittedBatch && (
              <section role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-800">{submittedBatch.status === 'Issued' ? 'Issuance complete' : 'Issuance pending'}</p>
                    <h3 className="mt-1 text-sm font-black text-emerald-950">{submittedBatch.status === 'Pending' ? `Awaiting handover to ${submittedBatch.employeeName}` : selectedPurchaseRequisitionId ? `Issued to ${submittedBatch.employeeName}` : isIndividualTrackedBatch ? `Ready for pickup by ${submittedBatch.employeeName}` : submittedBatch.items.every((item) => item.issueBehavior === 'returnable') ? `Borrowing recorded for ${submittedBatch.employeeName}` : `Consumables issued to ${submittedBatch.employeeName}`}</h3>
                  </div>
                  <button type="button" disabled={isRefreshingBatch} onClick={() => void refreshSubmittedBatch()} className="rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50">
                    {isRefreshingBatch ? 'Checking...' : 'Refresh status'}
                  </button>
                </div>
                <p className="mt-1 text-xs font-semibold text-emerald-900">{submittedBatch.emailSent ? 'Email sent' : 'Email not sent'}</p>
                {submittedBatch.borrowDetails && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
                  <p className="font-extrabold">Reusable-stock borrowing schedule</p>
                  <p className="mt-1">Borrow: {formatBorrowDateTime(submittedBatch.borrowDetails.useAt)} · Return: {formatBorrowDateTime(submittedBatch.borrowDetails.expectedReturnAt)}</p>
                  <p className="mt-1">Event: {submittedBatch.borrowDetails.purpose} · Location: {submittedBatch.borrowDetails.useLocation}</p>
                </div>}
                <ul className="mt-3 space-y-1.5 border-t border-emerald-200 pt-3 text-sm text-emerald-950">
                  {submittedBatch.items.map((item) => (
                    <li key={`${item.itemCode}-${item.recipientEmployeeCode}-${item.itemName}`} className="flex justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate">{item.itemCode} · {item.itemName}</span>
                        {selectedPurchaseRequisitionId && <span className="mt-1 block text-xs font-extrabold text-emerald-800">For {item.recipientEmployeeName} · {item.recipientEmployeeCode}</span>}
                        {(item.recipientLocation || item.recipientPurpose) && <span className="mt-0.5 block text-[0.68rem] leading-relaxed text-slate-600">{[item.recipientLocation, item.recipientPurpose].filter(Boolean).join(' · ')}</span>}
                        {!isIndividualTrackedBatch && item.tags.map((tag) => <span key={tag.tagCode} className="mt-2 block rounded-lg border border-emerald-100 bg-white px-2.5 py-2 text-xs font-bold text-emerald-900">
                          <span className="block">Barcode · Unit {tag.unitNumber}: {tag.tagCode}</span>
                          <span className="mt-1 block"><BarcodeSvg value={tag.tagCode} /></span>
                        </span>)}
                      </span>
                      <span className="shrink-0 font-bold">{item.quantity} {item.unitOfMeasure}</span>
                    </li>
                  ))}
                </ul>
                {isStaffDistributionBatch && <div className="mt-3">
                  <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-emerald-950">Print steps</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <article className="flex flex-col justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3">
                      <div className="flex items-start gap-2.5">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-700 text-xs font-black text-white">1</span>
                        <div><p className="text-sm font-extrabold text-slate-900">Recipient sheet</p><p className="mt-0.5 text-xs text-slate-600">Staff assignments and handover.</p></div>
                      </div>
                      <button type="button" onClick={() => { if (!printRecipientSheet(submittedBatch, purchaseRequisitionReference)) setBatchDetailsError('Allow pop-ups to print the recipient sheet.') }} className="self-start rounded-lg bg-blue-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-blue-800">Print sheet</button>
                    </article>
                    <article className="flex flex-col justify-between gap-3 rounded-lg border border-emerald-200 bg-white p-3">
                      <div className="flex items-start gap-2.5">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-700 text-xs font-black text-white">2</span>
                        <div><p className="text-sm font-extrabold text-slate-900">Barcode labels</p><p className="mt-0.5 text-xs text-slate-600">{barcodePrintStatus}</p></div>
                      </div>
                      <button type="button" disabled={!hasCompleteLabelSet || printableSubmittedBarcodeLabels.length === 0 || labelsToPrint.length > 0 || isRecordingPrint} onClick={() => previewBarcodeLabels(printableSubmittedBarcodeLabels)} className="self-start rounded-lg bg-emerald-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                        {printableSubmittedBarcodeLabels.length > 0 ? 'Print all labels' : 'No labels to print'}
                      </button>
                    </article>
                  </div>
                </div>}
                {submittedBatch.status === 'Pending' && <p className="mt-3 text-xs leading-relaxed text-emerald-900">Reserved until handover. {submittedBatch.requesterAccountLinked ? 'Employee: confirm receipt in Requester Portal.' : 'GSO: record the signed handover.'} Batch #{submittedBatch.id}</p>}
                {submittedBatch.status === 'Issued' && submittedBatch.items.every((item) => item.trackingMode === 'quantity' && item.issueBehavior === 'returnable') && <p className="mt-3 text-xs leading-relaxed text-emerald-900">{submittedBatch.borrowDetails ? `Borrowing saved · return by ${formatBorrowDateTime(submittedBatch.borrowDetails.expectedReturnAt)}.` : 'Borrowing saved.'}</p>}
                {submittedBatch.status === 'Issued' && submittedBatch.items.every((item) => item.trackingMode === 'quantity' && item.issueBehavior === 'consumable') && <p className="mt-3 text-xs leading-relaxed text-emerald-900">Stock deducted. No barcode or employee action needed.</p>}
                {submittedBatch.status === 'Issued' && isIndividualTrackedBatch && !isStaffDistributionBatch && <p className="mt-3 text-xs leading-relaxed text-emerald-900">Handover recorded. Print and attach the barcode labels before pickup.</p>}
                {submittedBatch.status === 'Pending' && !submittedBatch.requesterAccountLinked && submittedBatch.items.every((item) => item.trackingMode === 'individual') && <fieldset className="mt-4 rounded-xl border border-blue-200 bg-white p-3.5">
                  <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-blue-900">Record signed handover</legend>
                  <p className="text-xs leading-relaxed text-slate-600">Complete after physical pickup.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Handover method</span><select value={handoverMethod} onChange={(event) => setHandoverMethod(event.target.value as 'signed_receipt' | 'authorized_handover')} disabled={isRecordingHandover} className={fieldControlClass}><option value="signed_receipt">Signed receipt</option><option value="authorized_handover">Authorized handover</option></select></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">{handoverMethod === 'signed_receipt' ? 'Receipt reference' : 'Authorized recipient name'}</span><input value={handoverReference} onChange={(event) => setHandoverReference(event.target.value)} maxLength={200} required disabled={isRecordingHandover} className={fieldControlClass} placeholder={handoverMethod === 'signed_receipt' ? 'e.g. signed form no.' : 'Name of person who received the unit'} /></label>
                  </div>
                  {handoverError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{handoverError}</p>}
                  <button type="button" disabled={isRecordingHandover || !handoverReference.trim()} onClick={() => void recordManualHandover()} className="mt-3 rounded-lg bg-blue-700 px-3.5 py-2.5 text-xs font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{isRecordingHandover ? 'Saving...' : 'Record handover'}</button>
                </fieldset>}
                {submittedBatch.status === 'Issued' && expectedLabelCount > 0 && !hasCompleteLabelSet && <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">Labels incomplete ({generatedLabels.length}/{expectedLabelCount}). Refresh status before printing.</p>}
                {batchDetailsError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{batchDetailsError}</p>}
                {generatedLabels.length > 0 && !isStaffDistributionBatch && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white/80 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-extrabold text-emerald-950">Barcode labels</p>
                    <p className="mt-0.5 text-xs text-emerald-800">{barcodePrintStatus}</p>
                  </div>
                  <button type="button" disabled={!hasCompleteLabelSet || printableSubmittedBarcodeLabels.length === 0 || labelsToPrint.length > 0 || isRecordingPrint} onClick={() => previewBarcodeLabels(printableSubmittedBarcodeLabels)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                    {printableSubmittedBarcodeLabels.length > 0 ? 'Print labels' : 'No labels to print'}
                  </button>
                </div>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href="/gso/issuance" className="rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100">
                    View issuance records
                  </a>
                  <a href="/gso/asset-labels" className="rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100">
                    View all asset labels
                  </a>
                </div>
              </section>
            )}
            {isShowingSentBatch && submitErrorAlert}
          </section>
        </form>
      </div>
      {labelsToPrint.length > 0 && !shouldOpenPrintDialog && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="barcode-preview-title">
          <section className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="barcode-preview-title" className="text-sm font-black text-slate-900">Print barcode labels</h2>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">{labelsToPrint.length} label{labelsToPrint.length === 1 ? '' : 's'} ready to print</p>
              </div>
              <button type="button" disabled={isRecordingPrint} onClick={closeLabelPreview} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            </div>
            <div className="my-4 max-h-[56vh] overflow-auto rounded-xl bg-slate-100 p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {labelsToPrint.map((label) => (
                  <article key={label.tagCode} className="mx-auto flex h-[30mm] w-[50mm] box-border flex-col items-center justify-start gap-[0.2mm] bg-white px-[0.5mm] pb-0 pt-[0.3mm] text-center shadow-md">
                    <div className="w-[49mm] flex-none"><BarcodeSvg value={label.tagCode} height={64} className="mx-auto h-auto w-full max-h-[19mm] max-w-full object-contain" /></div>
                    <p className="max-w-[49mm] flex-none whitespace-nowrap text-[4mm] font-extrabold leading-none text-black">{label.tagCode}</p>
                    <p className="label-removal-warning flex-none whitespace-nowrap text-[2mm] font-black leading-none tracking-[0.12mm] text-black">PROPERTY OF DYCI-DO NOT REMOVE</p>
                    <p className="label-item-details flex-none whitespace-nowrap text-[1.7mm] font-bold leading-none text-black"><span className="label-item-name inline-block max-w-[32mm] truncate align-bottom">{label.itemName}</span> - {label.itemCode}</p>
                  </article>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-600">Printer: 50 x 30 mm · Landscape · 100% · No margins · 1 copy</p>
            <p className="mt-2 text-xs text-slate-600">Printing marks labels as printed. Reprints are in Asset Labels.</p>
            {printError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{printError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={isRecordingPrint} onClick={closeLabelPreview} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={isRecordingPrint} onClick={() => void handleConfirmPrint()} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{isRecordingPrint ? 'Saving…' : `Print ${labelsToPrint.length} label${labelsToPrint.length === 1 ? '' : 's'}`}</button>
            </div>
          </section>
        </div>
      )}

    </GsoPageFrame>
    {labelsToPrint.length > 0 && createPortal(
      <div id="asset-barcode-labels" aria-hidden="true" className="fixed left-[-10000px] top-0">
        {labelsToPrint.map((label) => (
          <article key={label.tagCode} className="asset-barcode-label bg-white text-center">
            <div className="barcode-preview"><BarcodeSvg value={label.tagCode} height={64} /></div>
            <p className="label-barcode-value">{label.tagCode}</p>
            <p className="label-removal-warning">PROPERTY OF DYCI-DO NOT REMOVE</p>
            <p className="label-item-details"><span className="label-item-name">{label.itemName}</span> - {label.itemCode}</p>
          </article>
        ))}
      </div>,
      document.body,
    )}
    </>
  )
}
   
