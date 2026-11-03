import JsBarcode from 'jsbarcode'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import {
  createEmployeeIssuanceBatch,
  getEmployeeIssuanceBatch,
  listApprovedIssuanceBatches,
  type EmployeeIssuanceBatchDetails,
} from './issuancesApi'
import { listEmployees, type EmployeeProfile } from './employeesApi'
import { listInventoryItems, type InventoryItemRecord } from './inventoryApi'

type SelectionMode = 'single' | 'multiple'

type SubmittedBatch = {
  id: string
  status: string
  employeeCode: string
  employeeName: string
  employeeEmail: string
  items: Array<{
    itemCode: string
    itemName: string
    trackingMode: 'individual' | 'quantity'
    quantity: number
    unitOfMeasure: string
    tags: Array<{ tagCode: string; unitNumber: number }>
  }>
}

type PrintableBarcodeLabel = {
  tagCode: string
  itemCode: string
  itemName: string
}

const employeeCodeFromUrl = new URLSearchParams(window.location.search).get('employeeCode')?.trim() ?? ''
const batchIdFromUrl = new URLSearchParams(window.location.search).get('batchId')?.trim() ?? ''

function employeeName(employee: EmployeeProfile) {
  return [employee.firstName, employee.middleName, employee.lastName, employee.suffix]
    .filter(Boolean)
    .join(' ')
}

function isCompactAssetTagCode(tagCode: string) {
  return /^AST-[A-Z0-9]{13}$/i.test(tagCode)
}

function barcodePayload(tagCode: string) {
  // The GSO scan API restores AST- for these compact unique tag suffixes.
  const match = tagCode.match(/^AST-([A-Z0-9]{13}|[A-F0-9]{20})$/i)
  return match?.[1] ?? tagCode
}

function submittedBatchFromDetails(batch: EmployeeIssuanceBatchDetails): SubmittedBatch {
  return {
    id: batch.id,
    status: batch.status,
    employeeCode: batch.employeeCode,
    employeeName: batch.employeeName,
    employeeEmail: batch.employeeEmail,
    items: batch.items.map((item) => ({
      itemCode: item.itemCode,
      itemName: item.itemName,
      trackingMode: item.trackingMode,
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

export default function MainIssuance() {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([])
  const [inventory, setInventory] = useState<InventoryItemRecord[]>([])
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState(employeeCodeFromUrl)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('single')
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, string>>({})
  const [itemSearch, setItemSearch] = useState('')
  const [notes, setNotes] = useState('Acknowledged by employee')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submittedBatch, setSubmittedBatch] = useState<SubmittedBatch | null>(null)
  const [isRefreshingBatch, setIsRefreshingBatch] = useState(Boolean(batchIdFromUrl))
  const [batchDetailsError, setBatchDetailsError] = useState('')
  const [approvedBatches, setApprovedBatches] = useState<EmployeeIssuanceBatchDetails[]>([])
  const [isLoadingApprovedLabels, setIsLoadingApprovedLabels] = useState(true)
  const [approvedLabelsError, setApprovedLabelsError] = useState('')
  const [approvedLabelsRefresh, setApprovedLabelsRefresh] = useState(0)
  const [labelToPrint, setLabelToPrint] = useState<PrintableBarcodeLabel | null>(null)
  const [shouldOpenPrintDialog, setShouldOpenPrintDialog] = useState(false)
  const pendingBatchId = submittedBatch?.status === 'Pending' ? submittedBatch.id : null

  useEffect(() => {
    let active = true

    Promise.all([listEmployees(), listInventoryItems()])
      .then(([employeeResult, inventoryResult]) => {
        if (!active) return
        setEmployees(employeeResult.employees)
        setInventory(inventoryResult.filter((item) => item.status.toLowerCase() === 'available' && item.availableQuantity > 0))
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
  }, [])

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
        const batches = await listApprovedIssuanceBatches()
        if (!active) return
        setApprovedBatches(batches)
        setApprovedLabelsError('')
      } catch (error) {
        if (active) setApprovedLabelsError(error instanceof Error ? error.message : 'Unable to load approved barcode labels.')
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
    if (!labelToPrint || !shouldOpenPrintDialog) return
    const clearPrintMode = () => {
      setShouldOpenPrintDialog(false)
      setLabelToPrint(null)
    }
    document.body.classList.add('printing-asset-labels')
    window.addEventListener('afterprint', clearPrintMode, { once: true })
    const timer = window.setTimeout(() => window.print(), 50)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', clearPrintMode)
      document.body.classList.remove('printing-asset-labels')
    }
  }, [labelToPrint, shouldOpenPrintDialog])

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
  const filteredInventory = useMemo(() => {
    const query = itemSearch.trim().toLowerCase()
    if (!query) return inventory
    return inventory.filter((item) => `${item.itemCode} ${item.itemName} ${item.description} ${item.category}`.toLowerCase().includes(query))
  }, [inventory, itemSearch])
  const inventoryById = useMemo(() => new Map(inventory.map((item) => [item.id, item])), [inventory])
  const selectedItems = Object.entries(selectedQuantities).flatMap(([itemId, quantityText]) => {
    const item = inventoryById.get(itemId)
    return item ? [{ item, quantity: Number(quantityText || 0) }] : []
  })
  const selectedUnitCount = selectedItems.reduce((total, selection) => total + selection.quantity, 0)
  const hasInvalidQuantity = selectedItems.some(({ item, quantity }) =>
    !Number.isInteger(quantity) || quantity < 1 || quantity > item.availableQuantity
  )
  const generatedLabels = submittedBatch?.items.flatMap((item) => item.tags.map((tag) => ({ ...item, tag }))) ?? []
  const approvedBarcodeLabels = approvedBatches.flatMap((batch) => batch.items.flatMap((item) => item.tags.map((tag) => ({
    batchId: batch.id,
    approvedAt: batch.decidedAt || batch.requestedAt,
    employeeCode: batch.employeeCode,
    employeeName: batch.employeeName,
    itemCode: item.itemCode,
    itemName: item.itemName,
    tagCode: tag.tagCode,
    unitNumber: tag.unitNumber,
  }))))
  const approvedLabelGaps = approvedBatches.flatMap((batch) => batch.items
    .filter((item) => item.trackingMode === 'individual' && item.tags.length < item.quantity)
    .map((item) => `${item.itemCode} in request #${batch.id}`))
  const submittedBarcodeLabels: PrintableBarcodeLabel[] = generatedLabels.map(({ itemCode, itemName, tag }) => ({
    tagCode: tag.tagCode,
    itemCode,
    itemName,
  }))
  const expectedLabelCount = submittedBatch?.items.reduce((total, item) =>
    total + (item.trackingMode === 'individual' ? item.quantity : 0), 0) ?? 0
  const hasCompleteLabelSet = generatedLabels.length === expectedLabelCount && expectedLabelCount > 0

  function clearSubmittedBatch() {
    setSubmittedBatch(null)
    setBatchDetailsError('')
    const currentUrl = new URL(window.location.href)
    currentUrl.searchParams.delete('batchId')
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
      setSubmitError(`No available item matches barcode ${value.trim()}.`)
      return
    }
    if (selectedQuantities[item.id] !== undefined) {
      setSubmitError(`${item.itemCode} is already selected for this issuance.`)
      return
    }
    if (selectionMode === 'multiple' && Object.keys(selectedQuantities).length >= 100) {
      setSubmitError('Select up to 100 items for one approval email.')
      return
    }

    clearSubmittedBatch()
    setSubmitError('')
    setSelectedQuantities((current) => selectionMode === 'single'
      ? { [item.id]: '1' }
      : { ...current, [item.id]: '1' })
    setItemSearch('')
  }

  function toggleItem(item: InventoryItemRecord) {
    clearSubmittedBatch()
    if (selectedQuantities[item.id] !== undefined) {
      setSelectedQuantities((current) => {
        const next = { ...current }
        delete next[item.id]
        return next
      })
    } else if (selectionMode === 'single') {
      setSelectedQuantities({ [item.id]: '1' })
    } else if (Object.keys(selectedQuantities).length >= 100) {
      setSubmitError('Select up to 100 items for one approval email.')
      return
    } else {
      setSelectedQuantities((current) => ({ ...current, [item.id]: '1' }))
    }
    setSubmitError('')
  }

  function changeSelectionMode(mode: SelectionMode) {
    setSelectionMode(mode)
    clearSubmittedBatch()
    if (mode === 'single') {
      setSelectedQuantities((current) => {
        const firstEntry = Object.entries(current)[0]
        return firstEntry ? { [firstEntry[0]]: firstEntry[1] } : {}
      })
    }
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

  function previewBarcodeLabel(label: PrintableBarcodeLabel) {
    if (labelToPrint) return
    setShouldOpenPrintDialog(false)
    setLabelToPrint(label)
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
    if (hasInvalidQuantity) {
      setSubmitError('Check the requested quantities. Each quantity must be a whole number within the available stock.')
      return
    }

    setIsSubmitting(true)
    setSubmitError('')
    clearSubmittedBatch()
    try {
      const batch = await createEmployeeIssuanceBatch(
        selectedEmployee.id,
        selectedItems.map(({ item, quantity }) => ({ itemId: item.id, quantity })),
        notes,
      )
      setSubmittedBatch({
        id: batch.id,
        status: batch.status,
        employeeCode: batch.employeeCode,
        employeeName: batch.employeeName,
        employeeEmail: batch.employeeEmail,
        items: batch.items.map((item) => ({
          itemCode: item.itemCode,
          itemName: item.itemName,
          trackingMode: item.trackingMode,
          quantity: item.quantity,
          unitOfMeasure: item.unitOfMeasure,
          tags: [],
        })),
      })
      const currentUrl = new URL(window.location.href)
      currentUrl.searchParams.set('batchId', batch.id)
      window.history.replaceState({}, '', currentUrl)
      setSelectedQuantities({})
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to create the issuance approval request.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
    <GsoPageFrame activePage="Issuance & Returned" searchPlaceholder="Search employees or inventory...">
      <style>{`
        @media print {
          @page { size: 50mm 30mm; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; }
          body.printing-asset-labels > *:not(#asset-barcode-labels) { display: none !important; }
          body.printing-asset-labels > #asset-barcode-labels {
            display: block !important; position: static !important; inset: auto !important;
            width: 50mm !important; height: 30mm !important; margin: 0 !important; padding: 0 !important; overflow: visible !important;
          }
          body.printing-asset-labels .asset-barcode-label {
            box-sizing: border-box !important; display: flex !important; width: 50mm !important; height: 30mm !important;
            min-height: 30mm !important; flex-direction: column; align-items: center; justify-content: flex-start; gap: 0.2mm;
            padding: 0.3mm 0.5mm 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
            overflow: hidden !important; page-break-inside: avoid; break-inside: avoid;
          }
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
          <span className="inline-flex rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
            Asset custody &amp; tracking
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Main Issuance</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
            Create an issuance request for an employee. After they approve it in the Requester Dashboard, print the unique barcode labels here.
          </p>
          <nav className="mt-6 flex flex-wrap gap-2 border-t border-blue-300/20 pt-4" aria-label="Issuance and return records">
            <a href="/gso/issuance" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-extrabold text-blue-100 transition hover:bg-white/12">
              + Issuances Records
            </a>
            <a href="/gso/main-issuance" aria-current="page" className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-blue-950 shadow-md">
              + Main Issuance
            </a>
            <a href="/gso/return-items" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-extrabold text-blue-100 transition hover:bg-white/12">
              + Returned Items
            </a>
          </nav>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm" aria-labelledby="approved-labels-title">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
            <div>
              <h2 id="approved-labels-title" className="text-sm font-black text-slate-900">Issued Asset Labels · Reprint</h2>
              <p className="mt-1 text-xs text-slate-500">Reprint a unique unit label if it was lost or damaged. New per-unit labels are printed when inventory is registered.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[0.62rem] font-extrabold text-blue-700">
                {isLoadingApprovedLabels ? 'Loading…' : `${approvedBarcodeLabels.length} label${approvedBarcodeLabels.length === 1 ? '' : 's'}`}
              </span>
              <button type="button" disabled={isLoadingApprovedLabels} onClick={() => { setIsLoadingApprovedLabels(true); setApprovedLabelsRefresh((current) => current + 1) }} className="rounded-lg border border-slate-200 px-3 py-2 text-[0.68rem] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Refresh list
              </button>
            </div>
          </div>
          {approvedLabelsError && <p role="alert" className="mx-5 mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 sm:mx-6">{approvedLabelsError}</p>}
          {!isLoadingApprovedLabels && approvedLabelGaps.length > 0 && <p role="alert" className="mx-5 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 sm:mx-6">May kulang na barcode tags para sa: {approvedLabelGaps.join(', ')}. I-refresh ang listahan bago mag-print ng lahat.</p>}
          <div className="max-h-[42vh] overflow-auto border-t border-slate-100">
            <table className="min-w-190 w-full text-left">
              <thead className="sticky top-0 bg-slate-50 text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3.5 sm:px-6">Approved</th>
                  <th className="px-5 py-3.5">Employee</th>
                  <th className="px-5 py-3.5">Item / Unit</th>
                  <th className="px-5 py-3.5">Unique Barcode</th>
                  <th className="px-5 py-3.5 sm:px-6">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingApprovedLabels && <tr><td colSpan={5} className="px-5 py-7 text-center text-xs font-semibold text-slate-400">Loading approved barcode labels…</td></tr>}
                {!isLoadingApprovedLabels && approvedBarcodeLabels.map((label) => (
                  <tr key={label.tagCode} className="border-t border-slate-100">
                    <td className="px-5 py-3.5 text-xs font-semibold text-slate-600 sm:px-6">{Number.isNaN(new Date(label.approvedAt).getTime()) ? label.approvedAt : new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(label.approvedAt))}</td>
                    <td className="px-5 py-3.5">
                      <span className="block text-xs font-bold text-slate-800">{label.employeeName}</span>
                      <span className="mt-0.5 block text-[0.62rem] text-slate-400">{label.employeeCode} · Request #{label.batchId}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="block text-xs font-bold text-slate-800">{label.itemName}</span>
                      <span className="mt-0.5 block text-[0.62rem] text-slate-400">{label.itemCode} · Unit {label.unitNumber}</span>
                    </td>
                    <td className="px-5 py-2.5">
                      <BarcodeSvg value={label.tagCode} />
                      <span className="mt-0.5 block text-center text-[0.58rem] font-bold tracking-wide text-slate-500">{label.tagCode}</span>
                    </td>
                    <td className="px-5 py-3.5 sm:px-6">
                      <button type="button" onClick={() => previewBarcodeLabel(label)} className="rounded-lg bg-emerald-700 px-3 py-2 text-[0.68rem] font-extrabold text-white hover:bg-emerald-800">Preview label</button>
                    </td>
                  </tr>
                ))}
                {!isLoadingApprovedLabels && !approvedLabelsError && approvedBarcodeLabels.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">No issued per-unit asset labels are available to reprint yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4">
                <h2 className="text-sm font-black text-slate-900">Employee</h2>
                <p className="mt-1 text-xs text-slate-500">Choose who will receive the selected items.</p>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Employee</span>
                <select
                  value={selectedEmployeeCode}
                  onChange={(event) => {
                    setSelectedEmployeeCode(event.target.value)
                    setSubmitError('')
                clearSubmittedBatch()
                  }}
                  disabled={isLoading || isSubmitting}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50"
                >
                  <option value="">Select an employee</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employeeName(employee)} · {employee.id}
                    </option>
                  ))}
                </select>
              </label>
              {selectedEmployee && (
                <div className="mt-4 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 sm:grid-cols-2">
                  <div>
                    <span className="block text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-500">Employee</span>
                    <p className="mt-1 text-sm font-extrabold text-slate-900">{employeeName(selectedEmployee)}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">{selectedEmployee.id}</p>
                  </div>
                  <div>
                    <span className="block text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-500">Department &amp; position</span>
                    <p className="mt-1 text-xs font-bold text-slate-800">{selectedEmployee.department}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{selectedEmployee.position}</p>
                  </div>
                  <div>
                    <span className="block text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-500">School email</span>
                    <p className="mt-1 break-all text-xs font-semibold text-slate-700">{selectedEmployee.email}</p>
                  </div>
                  <div>
                    <span className="block text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-500">Employment status</span>
                    <p className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[0.65rem] font-extrabold ${selectedEmployee.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                      {selectedEmployee.status}
                    </p>
                  </div>
                </div>
              )}
              {employeeCodeFromUrl && !isLoading && !selectedEmployee && (
                <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-semibold text-amber-900">
                  Hindi makita sa Employee Master Data ang employee code na {employeeCodeFromUrl}. Pumili ng employee sa listahan para magpatuloy.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black text-slate-900">Items for issuance</h2>
                  <p className="mt-1 text-xs text-slate-500">Only inventory with available quantity can be selected.</p>
                </div>
                <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Issuance selection mode">
                  <button
                    type="button"
                    aria-pressed={selectionMode === 'single'}
                    disabled={isSubmitting}
                    onClick={() => changeSelectionMode('single')}
                    className={`rounded-lg px-3 py-2 text-[0.68rem] font-extrabold transition ${selectionMode === 'single' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    One item
                  </button>
                  <button
                    type="button"
                    aria-pressed={selectionMode === 'multiple'}
                    disabled={isSubmitting}
                    onClick={() => changeSelectionMode('multiple')}
                    className={`rounded-lg px-3 py-2 text-[0.68rem] font-extrabold transition ${selectionMode === 'multiple' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Multiple items
                  </button>
                </div>
              </div>

              <label className="mt-4 block">
                <span className="sr-only">Search available inventory</span>
                <input
                  type="search"
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    addScannedInventoryCode(event.currentTarget.value)
                  }}
                  placeholder="Search or scan an asset / stock barcode"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <p className="mt-1.5 text-[0.62rem] text-slate-400">USB scanners send the code as text. Press Enter to add the matching item.</p>

              {loadError && (
                <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">{loadError}</p>
              )}
              {isLoading ? (
                <p role="status" className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-xs font-semibold text-slate-500">Loading employees and available inventory...</p>
              ) : !loadError && filteredInventory.length > 0 ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {filteredInventory.map((item) => {
                    const isSelected = selectedQuantities[item.id] !== undefined
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={isSubmitting}
                        onClick={() => toggleItem(item)}
                        className={`rounded-xl border p-3.5 text-left transition disabled:opacity-60 ${isSelected ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'}`}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-extrabold text-slate-800">{item.itemName || item.description}</span>
                            <span className="mt-1 block text-[0.65rem] font-semibold text-slate-500">{item.itemCode} · {item.category}</span>
                            <span className={`mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[0.58rem] font-extrabold ${item.trackingMode === 'individual' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                              {item.trackingMode === 'individual' ? 'Per-unit asset' : 'Bulk quantity'}
                            </span>
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[0.6rem] font-extrabold ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                            {isSelected ? 'Selected' : 'Select'}
                          </span>
                        </span>
                        <span className="mt-3 flex items-center justify-between text-[0.65rem] font-semibold text-slate-500">
                          <span>{item.condition}</span>
                          <span>Available: {item.availableQuantity} {item.unitOfMeasure}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : !loadError ? (
                <p className="mt-4 rounded-xl bg-slate-50 px-4 py-7 text-center text-xs font-semibold text-slate-500">
                  {inventory.length === 0 ? 'No available inventory items were found.' : 'No items match your search.'}
                </p>
              ) : null}
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-black text-slate-900">Review issuance</h2>
                  <p className="mt-1 text-xs text-slate-500">Check the recipient and quantities before sending.</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">
                  {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'} · {selectedUnitCount} unit{selectedUnitCount === 1 ? '' : 's'}
                </span>
              </div>

              {selectedItems.length > 0 ? (
                <ul className="mt-2 divide-y divide-slate-100">
                  {selectedItems.map(({ item }) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-slate-800">{item.itemName || item.description}</p>
                        <p className="mt-0.5 text-[0.65rem] font-semibold text-slate-500">{item.itemCode} · max {item.availableQuantity} {item.unitOfMeasure}</p>
                      </div>
                      <label className="w-24 shrink-0">
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
                          className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-7 text-center text-xs font-medium text-slate-400">Choose an available item to add it here.</p>
              )}
              {hasInvalidQuantity && (
                <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[0.68rem] font-semibold text-amber-800">
                  Enter a whole quantity from 1 up to the available stock for each selected item.
                </p>
              )}

              <label className="mt-3 block border-t border-slate-100 pt-4">
                <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Issuance notes</span>
                <input
                  type="text"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={1000}
                  disabled={isSubmitting}
                  placeholder="Add a note for this issuance request"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              {submitError && (
                <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">{submitError}</p>
              )}

              <button
                type="submit"
                disabled={isLoading || isSubmitting || !selectedEmployee || selectedItems.length === 0 || hasInvalidQuantity || Boolean(loadError)}
                className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-extrabold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Sending notification...' : `Send issuance notification (${selectedUnitCount} unit${selectedUnitCount === 1 ? '' : 's'})`}
              </button>
              <p className="mt-3 text-[0.68rem] leading-relaxed text-slate-500">
                Per-unit assets receive unique tags. Bulk stock remains quantity-tracked and does not receive per-unit labels.
              </p>
            </section>

            {submittedBatch && (
              <section role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-emerald-700">Issuance batch · {submittedBatch.status}</p>
                    <h2 className="mt-1 text-sm font-black text-emerald-950">{submittedBatch.status === 'Pending' ? `Waiting for ${submittedBatch.employeeName} to decide` : submittedBatch.status === 'Issued' ? `Approved by ${submittedBatch.employeeName}` : `Request ${submittedBatch.status.toLowerCase()}`}</h2>
                  </div>
                  <button type="button" disabled={isRefreshingBatch} onClick={() => void refreshSubmittedBatch()} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-[0.68rem] font-extrabold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
                    {isRefreshingBatch ? 'Checking...' : 'Refresh approval status'}
                  </button>
                </div>
                <p className="mt-1 break-all text-xs font-semibold text-emerald-800">{submittedBatch.employeeEmail}</p>
                <ul className="mt-3 space-y-1.5 border-t border-emerald-200 pt-3 text-xs text-emerald-900">
                  {submittedBatch.items.map((item) => (
                    <li key={`${item.itemCode}-${item.itemName}`} className="flex justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate">{item.itemCode} · {item.itemName}</span>
                        {item.tags.map((tag) => <span key={tag.tagCode} className="mt-2 block rounded-lg border border-emerald-100 bg-white px-2.5 py-2 text-[0.62rem] font-bold text-emerald-800">
                          <span className="block">Barcode · Unit {tag.unitNumber}: {tag.tagCode}</span>
                          <span className="mt-1 block"><BarcodeSvg value={tag.tagCode} /></span>
                        </span>)}
                      </span>
                      <span className="shrink-0 font-bold">{item.quantity} {item.unitOfMeasure}</span>
                    </li>
                  ))}
                </ul>
                {submittedBatch.status === 'Pending' && <p className="mt-3 text-[0.68rem] leading-relaxed text-emerald-800">Email notified the employee. They approve or reject in the Requester Dashboard. Batch #{submittedBatch.id}</p>}
                {submittedBatch.status === 'Issued' && expectedLabelCount > 0 && !hasCompleteLabelSet && <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[0.68rem] font-semibold text-amber-900">Expected {expectedLabelCount} unit tags but found {generatedLabels.length}. Refresh and reconcile the issuance before printing labels.</p>}
                {batchDetailsError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[0.68rem] font-semibold text-rose-700">{batchDetailsError}</p>}
                {generatedLabels.length > 0 && <>
                  <p className="mt-3 text-[0.68rem] font-bold text-emerald-900">{generatedLabels.length} unique per-unit barcode label{generatedLabels.length === 1 ? '' : 's'} linked to this issuance.</p>
                  <p className="mt-1 text-[0.65rem] leading-relaxed text-emerald-800">The full AST tag stays printed below the barcode. The barcode carries its shorter unique suffix so the bars can print wider; the GSO return scanner resolves it to the full tag automatically.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {submittedBarcodeLabels.map((label) => <article key={label.tagCode} className="asset-barcode-label rounded-lg border border-emerald-200 bg-white p-3 text-center">
                      <div className="barcode-preview"><BarcodeSvg value={label.tagCode} /></div>
                      <p className="label-barcode-value mt-1 text-[0.55rem] font-bold tracking-wide text-slate-600">{label.tagCode}</p>
                      <button type="button" disabled={!hasCompleteLabelSet} onClick={() => previewBarcodeLabel(label)} className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-[0.68rem] font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Preview label</button>
                    </article>)}
                  </div>
                  <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-[0.65rem] leading-relaxed text-emerald-900">Bawat label ay may sariling preview. Sa Windows print dialog para sa CLabel-CT221B, piliin ang driver Paper size na 50*30 (huwag 40*60) at Layout na Landscape. Itakda ang Scale sa Actual size (100%), Margins: None, Headers and footers: Off, at Copies: 1. Suriin ang preview bago pindutin ang Print.</div>
                </>}
                {submittedBatch.status === 'Issued' && expectedLabelCount === 0 && submittedBatch.items.every((item) => item.trackingMode === 'quantity') && (
                  <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[0.68rem] font-semibold text-blue-800">Quantity-tracked stock was issued without per-unit barcode labels.</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={clearSubmittedBatch} className="rounded-lg bg-emerald-700 px-3 py-2 text-[0.68rem] font-extrabold text-white hover:bg-emerald-800">
                    Start another issuance
                  </button>
                  <a href="/gso/issuance" className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-[0.68rem] font-extrabold text-emerald-800 hover:bg-emerald-100">
                    View issuance records
                  </a>
                </div>
              </section>
            )}
          </aside>
        </form>
      </div>
      {labelToPrint && !shouldOpenPrintDialog && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="barcode-preview-title">
          <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 id="barcode-preview-title" className="text-sm font-black text-slate-900">Barcode label preview</h2>
              <button type="button" onClick={() => setLabelToPrint(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
            </div>
            <div className="my-4 overflow-auto rounded-xl bg-slate-100 p-4">
              <article className="mx-auto flex h-[30mm] w-[50mm] box-border flex-col items-center justify-start gap-[0.2mm] bg-white px-[0.5mm] pb-0 pt-[0.3mm] text-center shadow-md">
                <div className="w-[49mm] flex-none"><BarcodeSvg value={labelToPrint.tagCode} height={64} className="mx-auto h-auto w-full max-h-[19mm] max-w-full object-contain" /></div>
                <p className="max-w-[49mm] flex-none whitespace-nowrap text-[4mm] font-extrabold leading-none text-black">{labelToPrint.tagCode}</p>
                <p className="label-removal-warning flex-none whitespace-nowrap text-[2mm] font-black leading-none tracking-[0.12mm] text-black">PROPERTY OF DYCI-DO NOT REMOVE</p>
                <p className="label-item-details flex-none whitespace-nowrap text-[1.7mm] font-bold leading-none text-black"><span className="label-item-name inline-block max-w-[32mm] truncate align-bottom">{labelToPrint.itemName}</span> - {labelToPrint.itemCode}</p>
              </article>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">Isang label lang ang ipi-preview sa sukat na 50 x 30 mm. Sa Windows print dialog para sa CLabel-CT221B, piliin ang driver Paper size na 50*30 (huwag 40*60) at Layout na Landscape. Piliin ang Actual size (100%), Margins: None, Headers and footers: Off, at Copies: 1. Ikaw ang pipindot ng Print pagkatapos suriin ang preview.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setLabelToPrint(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => setShouldOpenPrintDialog(true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-800">Open printer preview</button>
            </div>
          </section>
        </div>
      )}

    </GsoPageFrame>
    {labelToPrint && createPortal(
      <div id="asset-barcode-labels" aria-hidden="true" className="fixed left-[-10000px] top-0">
        <article className="asset-barcode-label bg-white text-center">
          <div className="barcode-preview"><BarcodeSvg value={labelToPrint.tagCode} height={64} /></div>
          <p className="label-barcode-value">{labelToPrint.tagCode}</p>
          <p className="label-removal-warning">PROPERTY OF DYCI-DO NOT REMOVE</p>
          <p className="label-item-details"><span className="label-item-name">{labelToPrint.itemName}</span> - {labelToPrint.itemCode}</p>
        </article>
      </div>,
      document.body,
    )}
    </>
  )
}
   
