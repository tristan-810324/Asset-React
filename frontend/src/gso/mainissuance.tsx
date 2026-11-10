import JsBarcode from 'jsbarcode'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import {
  createEmployeeIssuanceBatch,
  getEmployeeIssuanceBatch,
  recordEmployeeIssuanceHandover,
  listEmployeeIssuances,
  listUnitLabels,
  recordLabelPrintBatch,
  reprintUnitLabel,
  type EmployeeIssuanceBatchDetails,
  type EmployeeIssuanceRecord,
  type UnitLabel,
} from './issuancesApi'
import { listEmployees, type EmployeeProfile } from './employeesApi'
import { listInventoryItems, type InventoryItemRecord } from './inventoryApi'
import { getStaffPurchaseRequisition, listStaffPurchaseRequisitions } from './purchaseRequisitionsApi'
import { linesOf, formText } from './requisitionFlow'
import { RequisitionIssuanceShortcuts } from './requisitionIssuanceShortcuts'
import type { ServiceRequest } from '../requesters/requesterApi'

type InventoryFlow = 'individual' | 'consumable' | 'reusable'
type InventoryTypeFilter = 'all' | 'individual' | 'consumable'

const INVENTORY_PAGE_SIZE = 50
const inventoryTypeOptions: Array<{ value: InventoryTypeFilter; label: string }> = [
  { value: 'all', label: 'All requisition items' },
  { value: 'individual', label: 'Per-unit assets' },
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

type UnitLabelGroup = {
  id: string
  batchId: string | null
  holderName: string
  holderCode: string
  purchaseRequisitionReference: string | null
  issuedAt: string | null
  labels: UnitLabel[]
}

type LabelFilter = 'toPrint' | 'printed' | 'all' | 'returned'

const labelStatusFilters: Array<{ value: LabelFilter; label: string }> = [
  { value: 'toPrint', label: 'To print' },
  { value: 'printed', label: 'Printed' },
  { value: 'all', label: 'All issued' },
  { value: 'returned', label: 'Returned history' },
]

function formatLabelDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(value))
}

function formatLabelDateTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value))
}

function toPrintableBarcodeLabel(label: UnitLabel): PrintableBarcodeLabel {
  return {
    tagCode: label.tagCode,
    itemCode: label.itemCode,
    itemName: label.itemName,
    unitNumber: label.unitNumber,
  }
}

const reprintReasons = ['Damaged or unreadable', 'Torn or peeling', 'Label lost or missing', 'Printer error', 'Other']

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

const MAIN_ISSUANCE_READY_STATUSES = ['READY_FOR_STAFF', 'PARTIAL_STOCK', 'PARTIALLY_ISSUED']

function isReadyPurchaseRequisition(request: ServiceRequest) {
  return request.requestType === 'PURCHASE_REQUISITION'
    && linesOf(request).some((line) => MAIN_ISSUANCE_READY_STATUSES.includes(line.routeStatus))
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
      trackingMode: item.trackingMode,
      issueBehavior: item.issueBehavior ?? 'returnable',
      quantity: item.quantity,
      unitOfMeasure: item.unitOfMeasure,
      tags: item.tags,
    })),
  }
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
  const [unitLabels, setUnitLabels] = useState<UnitLabel[]>([])
  const [labelSearch, setLabelSearch] = useState('')
  const [labelStatusFilter, setLabelStatusFilter] = useState<LabelFilter>('all')
  const hasOpenedLabelsToPrintRef = useRef(false)
  const [reprintTarget, setReprintTarget] = useState<UnitLabel | null>(null)
  const [reprintReason, setReprintReason] = useState('')
  const [reprintDetails, setReprintDetails] = useState('')
  const [reprintError, setReprintError] = useState('')
  const [isReprinting, setIsReprinting] = useState(false)
  const [reprintMessage, setReprintMessage] = useState('')
  const [isLoadingApprovedLabels, setIsLoadingApprovedLabels] = useState(true)
  const [approvedLabelsError, setApprovedLabelsError] = useState('')
  const [approvedLabelsRefresh, setApprovedLabelsRefresh] = useState(0)
  const [isApprovedLabelsExpanded, setIsApprovedLabelsExpanded] = useState(false)
  const [labelsToPrint, setLabelsToPrint] = useState<PrintableBarcodeLabel[]>([])
  const [shouldOpenPrintDialog, setShouldOpenPrintDialog] = useState(false)
  const [isRecordingPrint, setIsRecordingPrint] = useState(false)
  const [printError, setPrintError] = useState('')
  // Labels printed in this session, so the issuance panel updates before the batch reloads.
  const [printedTagCodes, setPrintedTagCodes] = useState<Set<string>>(() => new Set())
  const pendingBatchId = submittedBatch?.status === 'Pending' ? submittedBatch.id : null

  useEffect(() => {
    let active = true

    Promise.all([
      listEmployees(),
      listInventoryItems(),
      listStaffPurchaseRequisitions().catch(() => []),
      selectedPurchaseRequisitionId ? getStaffPurchaseRequisition(selectedPurchaseRequisitionId) : Promise.resolve(null),
    ])
      .then(([employeeResult, inventoryResult, requisitionQueue, purchaseRequisition]) => {
        if (!active) return
        setEmployees(employeeResult.employees)
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
        setPurchaseRequisitionLineIds({})
        setPurchaseRequisitionOtherTypeCount(0)
        setPurchaseRequisitionReusableCount(0)
        setItemSearch('')
        setInventoryCategoryFilter('all')
        setInventoryPage(1)
        if (purchaseRequisition) {
          const reservedByItem = new Map<string, { quantity: number; lineId: string }>()
          for (const line of purchaseRequisition.purchaseLines || []) {
            if (!MAIN_ISSUANCE_READY_STATUSES.includes(line.routeStatus)) continue
            for (const allocation of line.allocations || []) {
              if (allocation.status !== 'Reserved') continue
              const remaining = Number(allocation.quantity) - Number(allocation.fulfilledQuantity || 0)
              if (remaining <= 0) continue
              reservedByItem.set(allocation.itemId, { quantity: remaining, lineId: line.id })
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
          setPurchaseRequisitionOtherTypeCount(reservedItems.length - items.length)
          setPurchaseRequisitionReusableCount(reusableItems.length)
          setPurchaseRequisitionReference(purchaseRequisition.referenceNo)
          setNotes(`GSO issuance for ${purchaseRequisition.referenceNo}`)
          setInventoryTypeFilter('all')
        } else {
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
    let active = true
    const refreshApprovedLabels = async () => {
      try {
        const labels = await listUnitLabels()
        if (!active) return
        setUnitLabels(labels)
        setApprovedLabelsError('')
        // Once per visit, open straight to labels that still need printing.
        if (!hasOpenedLabelsToPrintRef.current && labels.some((label) => label.needsPrinting)) {
          hasOpenedLabelsToPrintRef.current = true
          setIsApprovedLabelsExpanded(true)
          setLabelStatusFilter('toPrint')
        }
      } catch (error) {
        if (active) setApprovedLabelsError(error instanceof Error ? error.message : 'Unable to load the unit labels.')
      } finally {
        if (active) setIsLoadingApprovedLabels(false)
      }
    }

    void refreshApprovedLabels()
    const timer = window.setInterval(() => { void refreshApprovedLabels() }, 15000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [approvedLabelsRefresh])

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
          if (batch.status === 'Issued') setApprovedLabelsRefresh((current) => current + 1)
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
  const inventoryPageCount = Math.max(1, Math.ceil(filteredInventory.length / INVENTORY_PAGE_SIZE))
  const currentInventoryPage = Math.min(inventoryPage, inventoryPageCount)
  const visibleInventory = useMemo(() => {
    const start = (currentInventoryPage - 1) * INVENTORY_PAGE_SIZE
    return filteredInventory.slice(start, start + INVENTORY_PAGE_SIZE)
  }, [filteredInventory, currentInventoryPage])
  const inventoryById = useMemo(() => new Map(inventory.map((item) => [item.id, item])), [inventory])
  const selectedItems = Object.entries(selectedQuantities).flatMap(([itemId, quantityText]) => {
    const item = inventoryById.get(itemId)
    return item ? [{ item, quantity: Number(quantityText || 0) }] : []
  })
  const selectedUnitCount = selectedItems.reduce((total, selection) => total + selection.quantity, 0)
  const hasMixedItemTypes = selectedItems.some(({ item }) => inventoryTypeFor(item) !== inventoryTypeFor(selectedItems[0]?.item))
  const isConsumableIssue = selectedItems.length > 0 && selectedItems.every(({ item }) => item.trackingMode === 'quantity' && item.issueBehavior === 'consumable')
  const isPerUnitPickup = selectedItems.length > 0 && selectedItems.every(({ item }) => item.trackingMode === 'individual')
  const hasInvalidQuantity = selectedItems.some(({ item, quantity }) =>
    !Number.isInteger(quantity) || quantity < 1 || quantity > item.availableQuantity
  )
  const generatedLabels = submittedBatch?.items.flatMap((item) => item.tags.map((tag) => ({ ...item, tag }))) ?? []
  const labelSearchText = labelSearch.trim().toLowerCase()
  const activeUnitLabels = unitLabels.filter((label) => !label.isReturned)
  const returnedUnitLabels = unitLabels.filter((label) => label.isReturned)
  const toPrintCount = activeUnitLabels.filter((label) => label.needsPrinting).length
  const visibleUnitLabels = unitLabels.filter((label) => {
    const matchesFilter = labelStatusFilter === 'returned'
      ? label.isReturned
      : !label.isReturned && (labelStatusFilter === 'all'
        || (labelStatusFilter === 'toPrint' ? label.needsPrinting : !label.needsPrinting))
    const matchesSearch = !labelSearchText || [
      label.itemName, label.itemCode, label.tagCode, label.holderName, label.holderCode,
      label.purchaseRequisitionReference,
      label.returnCondition, label.returnReason, label.returnedByName,
    ].some((value) => value?.toLowerCase().includes(labelSearchText))
    return matchesFilter && matchesSearch
  })
  const visibleUnitLabelGroups = useMemo(() => {
    const groups = new Map<string, UnitLabelGroup>()
    for (const label of visibleUnitLabels) {
      const groupId = label.purchaseRequisitionReference
        ? `requisition-${label.purchaseRequisitionReference}-${label.holderCode}`
        : label.batchId
          ? `batch-${label.batchId}`
          : `label-${label.tagCode}`
      const existing = groups.get(groupId)
      if (existing) {
        existing.labels.push(label)
        continue
      }
      groups.set(groupId, {
        id: groupId,
        batchId: label.batchId,
        holderName: label.holderName,
        holderCode: label.holderCode,
        purchaseRequisitionReference: label.purchaseRequisitionReference,
        issuedAt: label.issuedAt,
        labels: [label],
      })
    }
    return [...groups.values()].map((group) => ({
      ...group,
      labels: [...group.labels].sort((first, second) => first.itemName.localeCompare(second.itemName) || first.unitNumber - second.unitNumber),
    }))
  }, [visibleUnitLabels])
  const isReprintDetailsRequired = reprintReason === 'Other'
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
        : `No directly issuable consumable matches barcode ${value.trim()}. Per-unit assets must be processed through Purchase Requisitions.`)
      return
    }
    if (isReusableQuantityStock(item)) {
      setSubmitError('Reusable stock is handled through the separate Request & Borrowing workflow.')
      return
    }
    if (!isRequisitionIssuance && requiresPurchaseRequisition(item)) {
      setSubmitError('Per-unit assets must be processed through Purchase Requisitions before they can be issued.')
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

  function toggleItem(item: InventoryItemRecord) {
    if (isRequisitionIssuance) {
      setSubmitError('Ang item at quantity ay nakatali sa purchase requisition na ito. Bumalik sa Request Requisitions kung kailangang baguhin ang request.')
      return
    }
    if (isReusableQuantityStock(item)) {
      setSubmitError('Reusable stock is handled through the separate Request & Borrowing workflow.')
      return
    }
    if (requiresPurchaseRequisition(item)) {
      setSubmitError('Per-unit assets must be processed through Purchase Requisitions before they can be issued.')
      return
    }
    clearSubmittedBatch()
    let nextQuantities: Record<string, string>
    if (selectedQuantities[item.id] !== undefined) {
      nextQuantities = { ...selectedQuantities }
      delete nextQuantities[item.id]
    } else if (Object.keys(selectedQuantities).length >= 100) {
      setSubmitError('Select up to 100 items for one approval email.')
      return
    } else if (selectedItems.length > 0 && inventoryTypeFor(item) !== inventoryTypeFor(selectedItems[0].item)) {
      setSubmitError('Process one inventory type at a time.')
      return
    } else {
      nextQuantities = { ...selectedQuantities, [item.id]: '1' }
    }
    updateSelectedQuantities(nextQuantities)
    setSubmitError('')
  }

  async function refreshSubmittedBatch() {
    if (!submittedBatch) return
    setIsRefreshingBatch(true)
    setBatchDetailsError('')
    try {
      const batch = await getEmployeeIssuanceBatch(submittedBatch.id)
      setSubmittedBatch(submittedBatchFromDetails(batch))
      if (batch.status === 'Issued') setApprovedLabelsRefresh((current) => current + 1)
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
      setApprovedLabelsRefresh((current) => current + 1)
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

  function previewBarcodeLabel(label: PrintableBarcodeLabel) {
    previewBarcodeLabels([label])
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
      setApprovedLabelsRefresh((current) => current + 1)
      setShouldOpenPrintDialog(true)
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Unable to print this label. Please try again.')
    } finally {
      setIsRecordingPrint(false)
    }
  }

  function showLabelsToPrint() {
    setIsApprovedLabelsExpanded(true)
    setLabelStatusFilter('toPrint')
  }

  function openReprint(label: UnitLabel) {
    setReprintTarget(label)
    setReprintReason('')
    setReprintDetails('')
    setReprintError('')
    setReprintMessage('')
  }

  async function handleReprint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reprintTarget || !reprintReason || (isReprintDetailsRequired && !reprintDetails.trim())) return
    setIsReprinting(true)
    setReprintError('')
    try {
      const details = reprintDetails.trim()
      const label = await reprintUnitLabel(reprintTarget.tagCode, details ? `${reprintReason} — ${details}` : reprintReason)
      setReprintTarget(null)
      setReprintMessage(`New label created for ${label.itemName}, unit ${label.unitNumber}. The old barcode ${label.oldTagCode} no longer scans.`)
      setApprovedLabelsRefresh((current) => current + 1)
      previewBarcodeLabel({ tagCode: label.tagCode, itemCode: label.itemCode, itemName: label.itemName })
    } catch (error) {
      setReprintError(error instanceof Error ? error.message : 'Unable to create a new label. Please try again.')
    } finally {
      setIsReprinting(false)
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
      setSubmitError('Reusable stock must be handled through the separate Request & Borrowing workflow.')
      return
    }
    if (!isRequisitionIssuance && selectedItems.some(({ item }) => requiresPurchaseRequisition(item))) {
      setSubmitError('Per-unit assets must be processed through Purchase Requisitions before they can be issued.')
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
          trackingMode: item.trackingMode,
          issueBehavior: item.issueBehavior,
          quantity: item.quantity,
          unitOfMeasure: item.unitOfMeasure,
          tags: item.tags ?? [],
        })),
      })
      if (batch.status === 'Issued' && batch.items.some((item) => item.trackingMode === 'individual')) {
        setIsApprovedLabelsExpanded(true)
        setLabelStatusFilter('toPrint')
        setApprovedLabelsRefresh((current) => current + 1)
      }
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
        <section className="rounded-3xl bg-linear-to-br from-[#092447] via-[#123c70] to-[#24558f] p-6 text-white shadow-xl shadow-blue-950/15 sm:p-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GSO Staff issuance</span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Main Issuance</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-blue-100">Issue items from an approved requisition or distribute consumable stock directly to an employee.</p>
          <RequisitionIssuanceShortcuts active="issuance" />
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm" aria-labelledby="approved-labels-title">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
            <div>
              <h2 id="approved-labels-title" className="text-sm font-black text-slate-900">Asset Labels</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">Labels are grouped by requester and issuance. Open every ready barcode in one batch; reprints create a replacement barcode.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {toPrintCount > 0 && (
                <button type="button" onClick={showLabelsToPrint} className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-[0.65rem] font-extrabold text-amber-900 ring-1 ring-amber-300 transition hover:bg-amber-200">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {toPrintCount} to print
                </button>
              )}
              <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[0.62rem] font-extrabold text-blue-700">
                {isLoadingApprovedLabels ? 'Loading…' : `${activeUnitLabels.length} issued`}
              </span>
              {returnedUnitLabels.length > 0 && <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[0.62rem] font-extrabold text-slate-600">{returnedUnitLabels.length} returned</span>}
              <button
                type="button"
                aria-expanded={isApprovedLabelsExpanded}
                aria-controls="approved-labels-content"
                onClick={() => setIsApprovedLabelsExpanded((expanded) => !expanded)}
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[0.68rem] font-bold text-blue-700 transition hover:bg-blue-100"
              >
                {isApprovedLabelsExpanded ? 'Hide labels' : 'View labels'}
              </button>
              <button type="button" disabled={isLoadingApprovedLabels} onClick={() => { setIsLoadingApprovedLabels(true); setApprovedLabelsRefresh((current) => current + 1) }} className="rounded-lg border border-slate-200 px-3 py-2 text-[0.68rem] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Refresh list
              </button>
            </div>
          </div>
          {reprintMessage && <p role="status" className="mx-5 mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 sm:mx-6">{reprintMessage}</p>}
          {isApprovedLabelsExpanded && <div id="approved-labels-content">
          {approvedLabelsError && <p role="alert" className="mx-5 mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 sm:mx-6">{approvedLabelsError}</p>}
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3 sm:px-6">
            <input
              type="search"
              value={labelSearch}
              onChange={(event) => setLabelSearch(event.target.value)}
              placeholder="Search item, barcode, or employee"
              aria-label="Search unit labels"
              className="h-9 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-72"
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter labels">
              {labelStatusFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={labelStatusFilter === filter.value}
                  onClick={() => setLabelStatusFilter(filter.value)}
                  className={`rounded-full px-3 py-1.5 text-[0.65rem] font-extrabold transition ${labelStatusFilter === filter.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {filter.label}{filter.value === 'toPrint' && toPrintCount > 0 ? ` · ${toPrintCount}` : filter.value === 'returned' && returnedUnitLabels.length > 0 ? ` · ${returnedUnitLabels.length}` : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[42vh] overflow-y-auto border-t border-slate-100 bg-slate-50 p-3 sm:p-4">
            {isLoadingApprovedLabels && <p role="status" className="rounded-xl bg-white px-4 py-8 text-center text-xs font-semibold text-slate-400">Loading label groups...</p>}
            {!isLoadingApprovedLabels && visibleUnitLabelGroups.length > 0 && (
              <div className="space-y-3">
                {visibleUnitLabelGroups.map((group) => {
                  const printableLabels = group.labels.filter((label) => label.needsPrinting)
                  const returnedLabels = group.labels.filter((label) => label.isReturned)
                  const groupReference = group.purchaseRequisitionReference
                    ? `Request ${group.purchaseRequisitionReference}`
                    : group.batchId
                      ? `Issuance #${group.batchId}`
                      : 'Direct issuance'
                  return (
                    <article key={group.id} className={`rounded-xl border bg-white p-3.5 shadow-sm ${printableLabels.length > 0 ? 'border-amber-200' : 'border-slate-200'}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-slate-900">{group.holderName}</p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-600">
                            {group.holderCode} &middot; {groupReference}{group.issuedAt ? ` \u00b7 Issued ${formatLabelDate(group.issuedAt)}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.65rem] font-extrabold text-slate-700">{group.labels.length} label{group.labels.length === 1 ? '' : 's'}</span>
                          {printableLabels.length > 0 ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[0.65rem] font-extrabold text-amber-900">{printableLabels.length} ready to print</span>
                          ) : returnedLabels.length === group.labels.length ? (
                            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[0.65rem] font-extrabold text-slate-600">Returned history</span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[0.65rem] font-extrabold text-emerald-800">All printed</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {group.labels.map((label) => (
                          <span key={label.tagCode} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[0.65rem] font-semibold text-slate-700">
                            {label.itemName} &middot; Unit {label.unitNumber}
                          </span>
                        ))}
                      </div>

                      {printableLabels.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2.5">
                          <p className="text-xs font-semibold text-amber-950">Open every ready label in one preview, then print them together.</p>
                          <button
                            type="button"
                            disabled={labelsToPrint.length > 0 || isRecordingPrint}
                            onClick={() => previewBarcodeLabels(printableLabels.map(toPrintableBarcodeLabel))}
                            className="shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-[0.68rem] font-extrabold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            View {printableLabels.length} barcode label{printableLabels.length === 1 ? '' : 's'}
                          </button>
                        </div>
                      )}

                      <details className="mt-3 border-t border-slate-100 pt-3">
                        <summary className="cursor-pointer text-xs font-extrabold text-blue-700 marker:text-blue-700">View individual label records</summary>
                        <div className="mt-3 space-y-2">
                          {group.labels.map((label) => (
                            <div key={label.tagCode} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-extrabold text-slate-900">{label.itemName} &middot; Unit {label.unitNumber}</p>
                                <p className="mt-0.5 break-all font-mono text-[0.65rem] font-bold text-slate-500">{label.tagCode}</p>
                                {label.isReturned ? (
                                  <p className="mt-1 text-[0.65rem] leading-relaxed text-slate-600">Returned {label.returnedAt ? formatLabelDateTime(label.returnedAt) : ''} &middot; {label.returnCondition || 'Condition not recorded'}{label.returnReason ? ` \u00b7 ${label.returnReason}` : ''}</p>
                                ) : label.needsPrinting ? (
                                  <p className="mt-1 text-[0.65rem] font-semibold text-amber-800">New &middot; not printed</p>
                                ) : (
                                  <p className="mt-1 text-[0.65rem] text-slate-600">Printed {label.labelPrintedAt ? formatLabelDate(label.labelPrintedAt) : ''}{label.labelPrintedBy ? ` by ${label.labelPrintedBy}` : ''}</p>
                                )}
                              </div>
                              {label.isReturned ? (
                                <span className="text-[0.65rem] font-bold text-slate-400">Details only</span>
                              ) : label.needsPrinting ? (
                                <button type="button" disabled={labelsToPrint.length > 0 || isRecordingPrint} onClick={() => previewBarcodeLabel(toPrintableBarcodeLabel(label))} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[0.68rem] font-extrabold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">View one label</button>
                              ) : (
                                <button type="button" onClick={() => openReprint(label)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[0.68rem] font-extrabold text-slate-700 transition hover:bg-slate-100">Reprint label</button>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    </article>
                  )
                })}
              </div>
            )}
            {!isLoadingApprovedLabels && !approvedLabelsError && visibleUnitLabelGroups.length === 0 && (
              <p className="rounded-xl bg-white px-4 py-8 text-center text-xs font-semibold text-slate-400">{labelStatusFilter === 'returned' && !returnedUnitLabels.length
                ? 'No returned asset labels yet. Returned unit details will appear here and stay out of print actions.'
                : !activeUnitLabels.length
                  ? 'No per-unit assets are out right now. A label group appears here once an issuance is confirmed.'
                  : labelStatusFilter === 'toPrint' && !labelSearchText
                    ? 'All labels are printed. New groups appear here once an issuance is confirmed.'
                    : 'No label groups match your search or filter.'}</p>
            )}
          </div>
          <div className="hidden max-h-[42vh] overflow-auto border-t border-slate-100">
            <table className="min-w-190 w-full text-left">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3.5 sm:px-6">Item / Unit</th>
                  <th className="px-5 py-3.5">Issued to</th>
                  <th className="px-5 py-3.5">Barcode</th>
                  <th className="px-5 py-3.5">Label status</th>
                  <th className="px-5 py-3.5 sm:px-6">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingApprovedLabels && <tr><td colSpan={5} className="px-5 py-7 text-center text-xs font-semibold text-slate-400">Loading unit labels…</td></tr>}
                {!isLoadingApprovedLabels && visibleUnitLabels.map((label) => (
                  <tr key={label.tagCode} className={`border-t border-slate-100 ${label.needsPrinting ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-5 py-3.5 sm:px-6">
                      <span className="block text-xs font-bold text-slate-800">{label.itemName}</span>
                      <span className="mt-0.5 block text-[0.62rem] text-slate-400">{label.itemCode} · Unit {label.unitNumber}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="block text-xs font-bold text-slate-800">{label.holderName}</span>
                      <span className="mt-0.5 block text-[0.62rem] text-slate-400">
                        {label.holderCode}{label.issuedAt ? ` · Issued ${formatLabelDate(label.issuedAt)}` : ''}{label.batchId ? ` · Request #${label.batchId}` : ''}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      {label.isReturned ? (
                        <>
                          <span className="block font-mono text-[0.66rem] font-bold text-slate-500">{label.tagCode}</span>
                          <span className="mt-1 block text-[0.56rem] font-extrabold uppercase tracking-wide text-slate-400">Retired · history only</span>
                        </>
                      ) : (
                        <>
                          <BarcodeSvg value={label.tagCode} />
                          <span className="mt-0.5 block text-center text-[0.58rem] font-bold tracking-wide text-slate-500">{label.tagCode}</span>
                        </>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[0.65rem] text-slate-500">
                      {label.isReturned ? (
                        <>
                          <span className="block font-bold text-slate-700">Returned {label.returnedAt ? formatLabelDateTime(label.returnedAt) : ''}</span>
                          <span className="block">Condition: {label.returnCondition || 'Not recorded'}</span>
                          <span className="mt-0.5 block max-w-56 truncate" title={label.returnReason || undefined}>Reason: {label.returnReason || 'Not recorded'}</span>
                          {label.returnedByName && <span className="mt-0.5 block">Brought in by {label.returnedByName}</span>}
                          {label.processedBy && <span className="mt-0.5 block">Processed by {label.processedBy}</span>}
                        </>
                      ) : label.needsPrinting ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[0.62rem] font-extrabold text-amber-900">New · not printed</span>
                      ) : label.labelPrintedAt ? (
                        <>
                          <span className="block font-bold text-slate-700">Printed {formatLabelDate(label.labelPrintedAt)}</span>
                          <span className="block">by {label.labelPrintedBy || 'a deleted account'}</span>
                        </>
                      ) : '—'}
                      {label.reprintReason && (
                        <span className="mt-0.5 block max-w-56 truncate" title={label.reprintReason}>Reprint: {label.reprintReason}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 sm:px-6">
                      {label.isReturned ? (
                        <span className="text-[0.65rem] font-bold text-slate-400">Details only</span>
                      ) : label.needsPrinting ? (
                        <button type="button" onClick={() => previewBarcodeLabel({ tagCode: label.tagCode, itemCode: label.itemCode, itemName: label.itemName })} className="rounded-lg bg-emerald-700 px-3 py-2 text-[0.68rem] font-extrabold text-white transition hover:bg-emerald-800">Print label</button>
                      ) : (
                        <button type="button" onClick={() => openReprint(label)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[0.68rem] font-extrabold text-slate-700 transition hover:bg-slate-50">Reprint label</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!isLoadingApprovedLabels && !approvedLabelsError && visibleUnitLabels.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">{labelStatusFilter === 'returned' && !returnedUnitLabels.length
                    ? 'No returned asset labels yet. Returned unit details will appear here and stay out of the print actions.'
                    : !activeUnitLabels.length
                    ? 'No per-unit assets are out right now. A label appears here once an issuance is confirmed.'
                    : labelStatusFilter === 'toPrint' && !labelSearchText
                      ? 'All labels are printed. New ones appear here once an issuance is confirmed.'
                      : 'No labels match your search or filter.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </div>}
        </section>

        {selectedPurchaseRequisitionId && <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3"><p className="text-xs font-extrabold text-indigo-900">Purchase requisition {purchaseRequisitionReference || selectedPurchaseRequisitionId}</p><p className="mt-1 text-[0.68rem] text-indigo-800">Only approved, reserved items are available here. Review the quantities and record the handover.</p>{purchaseRequisitionReusableCount > 0 && <p className="mt-2 text-[0.65rem] font-bold text-indigo-900">{purchaseRequisitionReusableCount} reusable item record(s) are handled through the separate Borrowing workflow.</p>}{purchaseRequisitionOtherTypeCount > 0 && <p className="mt-2 text-[0.65rem] font-bold text-indigo-900">{purchaseRequisitionOtherTypeCount} other reserved item record(s) use another issuance type. Return to Purchase Requisitions after this batch.</p>}</div>}
        {showRequisitionStep && <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="issuance-source-title">
          <StepHeader
            step={1}
            totalSteps={stepTotal}
            status="done"
            titleId="issuance-source-title"
            title="Choose issuance source"
            description="Select a ready requisition or issue consumable stock directly."
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <button
              type="button"
              aria-pressed={!isRequisitionIssuance}
              disabled={isSubmitting}
              onClick={() => selectPurchaseRequisition('')}
              className={`rounded-xl border p-3 text-left transition disabled:opacity-60 ${!isRequisitionIssuance ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40'}`}
            >
              <span className="block text-xs font-extrabold text-slate-900">Direct consumables</span>
              <span className="mt-1 block text-[0.68rem] leading-relaxed text-slate-600">Issue quantity stock without a requisition.</span>
            </button>
            <label className="block">
              <span className={fieldLabelClass}>Approved requisition</span>
              <select value={selectedPurchaseRequisitionId} onChange={(event) => selectPurchaseRequisition(event.target.value)} disabled={isSubmitting} className={fieldControlClass}>
                <option value="">Select a ready requisition</option>
                {readyRequisitions.map((request) => <option key={request.id} value={request.id}>{request.referenceNo} · {formText(request.formData.requesterName) || request.requesterName}</option>)}
              </select>
            </label>
          </div>
        </section>}
        <form onSubmit={handleSubmit} className="mt-5 grid gap-5 xl:grid-cols-2" aria-label="Issue consumables or prepare approved per-unit handovers">
          <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <section aria-labelledby="employee-section-title" className="border-b border-slate-200 p-4 sm:p-5">
              <StepHeader
                step={employeeStepNumber}
                totalSteps={stepTotal}
                status={stepStatusFor(employeeStepNumber, isEmployeeStepDone)}
                titleId="employee-section-title"
                title="Choose employee"
                description="Who will receive the selected items?"
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
                  disabled={isLoading || isSubmitting}
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
                  <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900">Items issued to this employee</h3>
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
                                {item.trackingMode === 'individual' ? 'Per-unit asset' : item.issueBehavior === 'consumable' ? 'Consumable stock' : 'Reusable item · Borrowing workflow'}
                              </span>
                            </div>
                            <span className="shrink-0 text-sm font-extrabold text-slate-800">{item.quantity} {item.unitOfMeasure}</span>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
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
              ) : !loadError && visibleInventory.length > 0 ? (
                <div className="inventory-list-scrollbar mt-3 grid min-h-0 grow basis-80 grid-cols-1 content-start gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                  {visibleInventory.map((item) => {
                    const isSelected = selectedQuantities[item.id] !== undefined
                    const itemType = inventoryTypeFor(item)
                    const itemTypeLabel = itemType === 'individual' ? 'Per-unit asset' : 'Consumable stock'
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={isSubmitting || isRequisitionIssuance}
                        onClick={() => toggleItem(item)}
                        className={`rounded-xl border p-3 text-left transition disabled:opacity-60 ${isSelected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'}`}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span title={item.description} className="block truncate text-sm font-extrabold text-slate-900">{item.description || item.itemName}</span>
                            <span className="mt-0.5 block truncate text-xs font-bold text-blue-700">{item.itemName}</span>
                            <span className="mt-1 block truncate text-xs text-slate-500">{item.itemCode} · {item.category}</span>
                          </span>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-800'}`}>
                            {isSelected ? 'Selected' : 'Select'}
                          </span>
                        </span>
                        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-700">
                          <span className={`rounded-md px-1.5 py-0.5 font-extrabold ${itemType === 'individual' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {itemTypeLabel}
                          </span>
                          <span>{availableUnitConditionSummary(item)}</span>
                          <span className="ml-auto font-bold text-slate-800">Available: {item.availableQuantity} {item.unitOfMeasure}</span>
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
              {!isLoading && !loadError && filteredInventory.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-xs font-semibold text-slate-600">
                    Showing {((currentInventoryPage - 1) * INVENTORY_PAGE_SIZE + 1).toLocaleString()}–{Math.min(currentInventoryPage * INVENTORY_PAGE_SIZE, filteredInventory.length).toLocaleString()} of {filteredInventory.length.toLocaleString()} matching items
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

          <section aria-labelledby="review-section-title" className="flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <StepHeader
              step={reviewStepNumber}
              totalSteps={stepTotal}
              status={stepStatusFor(reviewStepNumber, isShowingSentBatch)}
              titleId="review-section-title"
              title={isShowingSentBatch ? 'Issuance recorded' : 'Review issuance'}
              description={isShowingSentBatch ? 'Track the record or start another transaction.' : isConsumableIssue ? 'Confirm the employee and consumable quantities.' : 'Confirm the employee, approved items, and quantities.'}
            >
              {!isShowingSentBatch && (
                <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-extrabold text-blue-800">
                  {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'} · {selectedUnitCount} unit{selectedUnitCount === 1 ? '' : 's'}
                </span>
              )}
            </StepHeader>

            {!isShowingSentBatch && (
              <>
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-xl bg-slate-100 px-3.5 py-2.5">
                  <span className="text-xs font-bold text-slate-700">Employee</span>
                  <span className="min-w-0 text-sm font-extrabold text-slate-900">
                    {selectedEmployee ? `${employeeName(selectedEmployee)} · ${selectedEmployee.id}` : 'Not selected yet'}
                  </span>
                </div>

                {selectedItems.length > 0 ? (
                  <ul className="inventory-list-scrollbar mt-2 max-h-96 min-h-0 grow divide-y divide-slate-200 overflow-y-auto pr-1 xl:max-h-none xl:basis-56">
                    {selectedItems.map(({ item }) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-slate-900">{item.itemName || item.description}</p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-600">{item.itemCode} · {availableUnitConditionSummary(item)} · max {item.availableQuantity} {item.unitOfMeasure}</p>
                          <p className="mt-0.5 text-xs font-bold text-blue-700">{item.trackingMode === 'individual' ? 'Per-unit asset · approved requisition · barcode labels ready' : 'Consumable stock · issued immediately'}</p>
                        </div>
                        <label className="w-20 shrink-0">
                          <span aria-hidden="true" className="mb-1 block text-xs font-bold text-slate-700">Qty</span>
                          <span className="sr-only">Quantity for {item.itemName || item.description}</span>
                          <input
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
                            className="h-10 w-full rounded-lg border border-slate-300 px-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
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
                  disabled={isLoading || isSubmitting || !selectedEmployee || selectedItems.length === 0 || hasInvalidQuantity || hasMixedItemTypes || Boolean(loadError)}
                  className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700 disabled:shadow-none"
                >
                  {isSubmitting ? 'Recording...' : `${isPerUnitPickup ? 'Record approved per-unit handover' : 'Issue consumable stock'} (${selectedUnitCount} unit${selectedUnitCount === 1 ? '' : 's'})`}
                </button>
                {nextStepHint ? (
                  <p className="mt-2 text-center text-sm font-bold text-blue-800">{nextStepHint}</p>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {isPerUnitPickup
                      ? 'This handover is linked to an approved Purchase Requisition. Barcode labels are ready for pickup.'
                      : 'Consumable stock is deducted immediately. No employee approval is required.'}
                  </p>
                )}
              </>
            )}

            {submittedBatch && (
              <section role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-800">{submittedBatch.items.every((item) => item.trackingMode === 'individual') ? 'Per-unit pickup' : submittedBatch.items.every((item) => item.issueBehavior === 'returnable') ? 'Reusable stock borrowing' : 'Consumable distribution'} · {submittedBatch.status}</p>
                    <h3 className="mt-1 text-sm font-black text-emerald-950">{submittedBatch.status === 'Pending' ? `Reserved for ${submittedBatch.employeeName} · awaiting receipt` : submittedBatch.status === 'Issued' && submittedBatch.items.every((item) => item.trackingMode === 'individual') ? `Ready for pickup for ${submittedBatch.employeeName}` : submittedBatch.status === 'Issued' && submittedBatch.items.every((item) => item.issueBehavior === 'returnable') ? `Borrowing recorded for ${submittedBatch.employeeName}` : submittedBatch.status === 'Issued' ? `Consumables issued to ${submittedBatch.employeeName}` : `Issuance ${submittedBatch.status.toLowerCase()}`}</h3>
                  </div>
                  <button type="button" disabled={isRefreshingBatch} onClick={() => void refreshSubmittedBatch()} className="rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50">
                    {isRefreshingBatch ? 'Checking...' : 'Refresh status'}
                  </button>
                </div>
                <p className="mt-1 break-all text-xs font-semibold text-emerald-900">{submittedBatch.employeeEmail}</p>
                {submittedBatch.borrowDetails && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
                  <p className="font-extrabold">Reusable-stock borrowing schedule</p>
                  <p className="mt-1">Borrow: {formatBorrowDateTime(submittedBatch.borrowDetails.useAt)} · Return: {formatBorrowDateTime(submittedBatch.borrowDetails.expectedReturnAt)}</p>
                  <p className="mt-1">Event: {submittedBatch.borrowDetails.purpose} · Location: {submittedBatch.borrowDetails.useLocation}</p>
                </div>}
                <ul className="mt-3 space-y-1.5 border-t border-emerald-200 pt-3 text-sm text-emerald-950">
                  {submittedBatch.items.map((item) => (
                    <li key={`${item.itemCode}-${item.itemName}`} className="flex justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate">{item.itemCode} · {item.itemName}</span>
                        {item.tags.map((tag) => <span key={tag.tagCode} className="mt-2 block rounded-lg border border-emerald-100 bg-white px-2.5 py-2 text-xs font-bold text-emerald-900">
                          <span className="block">Barcode · Unit {tag.unitNumber}: {tag.tagCode}</span>
                          <span className="mt-1 block"><BarcodeSvg value={tag.tagCode} /></span>
                        </span>)}
                      </span>
                      <span className="shrink-0 font-bold">{item.quantity} {item.unitOfMeasure}</span>
                    </li>
                  ))}
                </ul>
                {submittedBatch.status === 'Pending' && <p className="mt-3 text-xs leading-relaxed text-emerald-900">Naka-reserve ang unit hanggang makumpirma ang aktuwal na handover. {submittedBatch.requesterAccountLinked ? 'Employee: confirm receipt in the Requester account.' : 'GSO: record the signed receipt or authorized handover after pickup.'} Email {submittedBatch.emailSent ? 'sent' : 'unavailable, issuance recorded'}. Batch #{submittedBatch.id}</p>}
                {submittedBatch.status === 'Issued' && submittedBatch.items.every((item) => item.trackingMode === 'quantity' && item.issueBehavior === 'returnable') && <p className="mt-3 text-xs leading-relaxed text-emerald-900">Borrowing saved and stock reserved until return. {submittedBatch.requesterAccountLinked ? 'A notice is available in the employee’s requester dashboard.' : 'No verified requester account is linked; use the employee email for the schedule.'} Email {submittedBatch.emailSent ? 'sent' : 'unavailable'}.</p>}
                {submittedBatch.status === 'Issued' && submittedBatch.items.every((item) => item.trackingMode === 'quantity' && item.issueBehavior === 'consumable') && <p className="mt-3 text-xs leading-relaxed text-emerald-900">Stock deducted and account updated. No employee action or unit barcode is needed. Email {submittedBatch.emailSent ? 'sent' : 'unavailable, account updated'}.</p>}
                {submittedBatch.status === 'Issued' && submittedBatch.items.every((item) => item.trackingMode === 'individual') && <p className="mt-3 text-xs leading-relaxed text-emerald-900">Barcode labels are ready. Ask {submittedBatch.employeeName} to coordinate pickup with GSO; no requester confirmation is needed. Email {submittedBatch.emailSent ? 'sent' : 'unavailable, pickup record updated'}.</p>}
                {submittedBatch.status === 'Pending' && !submittedBatch.requesterAccountLinked && submittedBatch.items.every((item) => item.trackingMode === 'individual') && <fieldset className="mt-4 rounded-xl border border-blue-200 bg-white p-3.5">
                  <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-blue-900">Record signed handover</legend>
                  <p className="text-xs leading-relaxed text-slate-600">Use after the employee or authorized recipient physically receives the unit.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Handover method</span><select value={handoverMethod} onChange={(event) => setHandoverMethod(event.target.value as 'signed_receipt' | 'authorized_handover')} disabled={isRecordingHandover} className={fieldControlClass}><option value="signed_receipt">Signed receipt</option><option value="authorized_handover">Authorized handover</option></select></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">{handoverMethod === 'signed_receipt' ? 'Receipt reference' : 'Authorized recipient name'}</span><input value={handoverReference} onChange={(event) => setHandoverReference(event.target.value)} maxLength={200} required disabled={isRecordingHandover} className={fieldControlClass} placeholder={handoverMethod === 'signed_receipt' ? 'e.g. signed form no.' : 'Name of person who received the unit'} /></label>
                  </div>
                  {handoverError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{handoverError}</p>}
                  <button type="button" disabled={isRecordingHandover || !handoverReference.trim()} onClick={() => void recordManualHandover()} className="mt-3 rounded-lg bg-blue-700 px-3.5 py-2.5 text-xs font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{isRecordingHandover ? 'Saving handover...' : 'Record receipt and activate custody'}</button>
                </fieldset>}
                {submittedBatch.status === 'Issued' && expectedLabelCount > 0 && !hasCompleteLabelSet && <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">Expected {expectedLabelCount} unit tags but found {generatedLabels.length}. Refresh and reconcile the issuance before printing labels.</p>}
                {batchDetailsError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{batchDetailsError}</p>}
                {generatedLabels.length > 0 && <>
                  <p className="mt-3 text-xs font-bold text-emerald-950">{generatedLabels.length} unique per-unit barcode label{generatedLabels.length === 1 ? '' : 's'} linked to this issuance.</p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-900">The full AST tag stays printed below the barcode. The barcode carries its shorter unique suffix so the bars can print wider; the GSO return scanner resolves it to the full tag automatically.</p>
                  {printableSubmittedBarcodeLabels.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white/80 px-3 py-2.5">
                    <p className="text-xs font-semibold text-emerald-950">{printableSubmittedBarcodeLabels.length} label{printableSubmittedBarcodeLabels.length === 1 ? '' : 's'} ready to print for this issuance.</p>
                    <button type="button" disabled={!hasCompleteLabelSet || labelsToPrint.length > 0 || isRecordingPrint} onClick={() => previewBarcodeLabels(printableSubmittedBarcodeLabels)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">View all barcode labels</button>
                  </div>}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {submittedBarcodeLabels.map((label) => <article key={label.tagCode} className="asset-barcode-label rounded-lg border border-emerald-200 bg-white p-3 text-center">
                      <div className="barcode-preview"><BarcodeSvg value={label.tagCode} /></div>
                      <p className="label-barcode-value mt-1 text-xs font-bold tracking-wide text-slate-700">{label.tagCode}</p>
                      {isTagReturned(label.tagCode) ? (
                        <p className="mt-2 text-xs font-bold text-slate-500">Returned · this label no longer works</p>
                      ) : isTagPrinted(label.tagCode) ? (
                        <p className="mt-2 text-xs font-bold text-emerald-800">
                          Printed ✓
                          <span className="mt-0.5 block text-[0.65rem] font-semibold text-slate-500">Need another? Use Reprint in Asset Labels.</span>
                        </p>
                      ) : (
                        <button type="button" disabled={!hasCompleteLabelSet || labelsToPrint.length > 0 || isRecordingPrint} onClick={() => previewBarcodeLabel(label)} className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">View one label</button>
                      )}
                    </article>)}
                  </div>
                  <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs leading-relaxed text-emerald-950">Use View all barcode labels to preview the whole issuance together. Each 50 x 30 mm label prints on its own page; check the preview before printing.</div>
                </>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={clearSubmittedBatch} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-800">
                    Start another issuance
                  </button>
                  <a href="/gso/issuance" className="rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100">
                    View issuance records
                  </a>
                </div>
              </section>
            )}
            {isShowingSentBatch && submitErrorAlert}
          </section>
        </form>
      </div>
      {reprintTarget && (
        <div className="fixed inset-0 z-90 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reprint-title"
            onKeyDown={(event) => { if (event.key === 'Escape' && !isReprinting) setReprintTarget(null) }}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <form onSubmit={(event) => void handleReprint(event)}>
              <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Reprint label</p>
              <h2 id="reprint-title" className="mt-1 text-base font-black text-slate-900">{reprintTarget.itemName}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {reprintTarget.itemCode} · Unit {reprintTarget.unitNumber} · with {reprintTarget.holderName}
              </p>

              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900">
                <p className="font-extrabold">The current barcode will stop working.</p>
                <p className="mt-1">
                  This creates a new barcode. <span className="font-mono font-bold">{reprintTarget.tagCode}</span> will no longer scan, so put the new label on the unit and throw the old one away.
                </p>
              </div>

              <fieldset className="mt-4" disabled={isReprinting}>
                <legend className="mb-2 text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Why does it need a new label?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {reprintReasons.map((reason) => (
                    <label key={reason} className="cursor-pointer">
                      <input type="radio" name="reprint-reason" value={reason} checked={reprintReason === reason} onChange={() => setReprintReason(reason)} className="peer sr-only" />
                      <span className="flex h-full items-center rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:border-slate-300 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-800 peer-focus-visible:ring-4 peer-focus-visible:ring-blue-100">
                        {reason}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">
                  Details <span className="normal-case text-slate-400">{isReprintDetailsRequired ? '(required)' : '(optional)'}</span>
                </span>
                <input
                  maxLength={400}
                  value={reprintDetails}
                  onChange={(event) => setReprintDetails(event.target.value)}
                  required={isReprintDetailsRequired}
                  disabled={isReprinting}
                  placeholder="e.g. Label torn while cleaning the unit"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              {reprintError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">{reprintError}</p>}
              <p className="mt-3 text-[0.65rem] text-slate-500">Saved to the audit log with your name.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" disabled={isReprinting} onClick={() => setReprintTarget(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60">Cancel</button>
                <button
                  type="submit"
                  disabled={isReprinting || !reprintReason || (isReprintDetailsRequired && !reprintDetails.trim())}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isReprinting ? 'Creating…' : 'Create new label'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {labelsToPrint.length > 0 && !shouldOpenPrintDialog && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="barcode-preview-title">
          <section className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="barcode-preview-title" className="text-sm font-black text-slate-900">Barcode label preview</h2>
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
            <p className="text-xs leading-relaxed text-slate-600">Each barcode label is 50 x 30 mm and prints on its own page. In the Windows dialog for CLabel-CT221B, use Paper size 50*30, Landscape, Actual size (100%), no margins, headers, or footers, and one copy.</p>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">All {labelsToPrint.length} label{labelsToPrint.length === 1 ? '' : 's'} will be marked as printed before the print dialog opens. Check that the printer is ready; a later replacement requires Reprint and creates a new barcode.</p>
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
   
