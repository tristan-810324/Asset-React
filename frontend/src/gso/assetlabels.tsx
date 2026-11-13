import JsBarcode from 'jsbarcode'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { getEmployeeIssuanceBatch, listUnitLabels, recordLabelPrintBatch, reprintUnitLabel, type EmployeeIssuanceBatchDetails, type UnitLabel } from './issuancesApi'
import { RequisitionIssuanceShortcuts } from './requisitionIssuanceShortcuts'

type PrintableBarcodeLabel = Pick<UnitLabel, 'tagCode' | 'itemCode' | 'itemName' | 'unitNumber'> & Pick<UnitLabel, 'holderName' | 'holderCode'>
type LabelFilter = 'toPrint' | 'printed' | 'all' | 'returned'

type UnitLabelGroup = {
  id: string
  batchId: string | null
  holderName: string
  holderCode: string
  purchaseRequisitionReference: string | null
  issuedAt: string | null
  labels: UnitLabel[]
}

const labelFilters: Array<{ value: LabelFilter; label: string }> = [
  { value: 'toPrint', label: 'To print' },
  { value: 'printed', label: 'Printed' },
  { value: 'all', label: 'All issued' },
  { value: 'returned', label: 'Returned history' },
]

const reprintReasons = ['Damaged or unreadable', 'Torn or peeling', 'Label lost or missing', 'Printer error', 'Other']

function formatLabelDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(value))
}

function toPrintableLabel(label: UnitLabel): PrintableBarcodeLabel {
  return {
    tagCode: label.tagCode,
    itemCode: label.itemCode,
    itemName: label.itemName,
    unitNumber: label.unitNumber,
    holderName: label.holderName,
    holderCode: label.holderCode,
  }
}

function escapePrintText(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character)
}

function recipientSheetHtml(batch: EmployeeIssuanceBatchDetails, requisitionReference: string | null) {
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
  const rows = batch.items.flatMap((item) => {
    const tags = item.tags.length > 0 ? item.tags : [{ tagCode: `Quantity · ${item.quantity} ${item.unitOfMeasure}`, unitNumber: 0 }]
    return tags.map((tag) => '<tr><td><strong>' + escapePrintText(item.itemName) + '</strong><br><small>' + escapePrintText(item.itemCode) + (tag.unitNumber ? ' · Unit ' + tag.unitNumber : ' · ' + item.quantity + ' ' + escapePrintText(item.unitOfMeasure)) + '</small></td>'
      + '<td>' + escapePrintText(tag.tagCode) + '</td>'
      + '<td>' + escapePrintText(item.recipientEmployeeName) + '<br><small>' + escapePrintText(item.recipientEmployeeCode) + '</small></td>'
      + '<td>' + escapePrintText(item.recipientLocation || 'Not specified') + '</td>'
      + '<td>' + escapePrintText(item.recipientPurpose || 'Not specified') + '</td><td>[ ] Received</td></tr>')
  }).join('')
  const reference = requisitionReference ? escapePrintText(requisitionReference) : 'Issuance batch #' + escapePrintText(batch.id)
  const logoUrl = escapePrintText(`${window.location.origin}/dyci_img/dual_logo.jpg`)
  return '<!doctype html><html><head><meta charset="utf-8"><title>Asset Recipient Sheet</title><style>'
    + '@page { size: A4 landscape; margin: 14mm; } body { font: 12px Arial, sans-serif; color: #0f172a; }'
    + 'h1 { margin: 0 0 6px; font-size: 20px; } p { margin: 4px 0; color: #475569; }'
    + '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
    + '.header { border-bottom: 2px solid #09244a; padding-bottom: 10px; margin-bottom: 14px; } .logo { height: 62px; display: block; }'
    + '.meta { margin: 16px 0; display: flex; gap: 40px; } table { width: 100%; border-collapse: collapse; margin-top: 14px; }'
    + 'th,td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; } th { background: #eff6ff; font-size: 10px; text-transform: uppercase; }'
    + 'small { color: #64748b; } .signature-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 28px 36px; margin-top: 34px; } .signature { min-width: 0; break-inside: avoid; } .signature-line { height: 22px; border-bottom: 1px solid #64748b; margin-bottom: 6px; } .signature strong,.signature span { display: block; } .signature strong { font-size: 11px; } .signature span { margin-top: 2px; color: #475569; font-size: 10px; }'
    + '</style></head><body><div class="header"><img class="logo" src="' + logoUrl + '" alt="DYCI and A.S.SET logo"></div><h1>Asset Recipient Sheet</h1>'
    + '<div class="meta"><p><strong>Request:</strong> ' + reference + '</p><p><strong>Physical handover:</strong> ' + escapePrintText(batch.employeeName) + ' (' + escapePrintText(batch.employeeCode) + ')</p><p><strong>Date:</strong> ' + new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date()) + '</p></div>'
    + '<table><thead><tr><th>Item</th><th>Barcode</th><th>Assigned to</th><th>Location</th><th>Purpose</th><th>Received</th></tr></thead><tbody>' + rows + '</tbody></table>'
    + '<div class="signature-grid">' + signatureBlocks + '</div></body></html>'
}

function barcodePayload(tagCode: string) {
  const match = tagCode.match(/^AST-([A-Z0-9]{13}|[A-F0-9]{20})$/i)
  return match?.[1] ?? tagCode
}

function isCompactAssetTagCode(tagCode: string) {
  return /^AST-[A-Z0-9]{13}$/i.test(tagCode)
}

function BarcodeSvg({ value, height = 64, className = 'mx-auto h-11 max-w-full' }: { value: string; height?: number; className?: string }) {
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

export default function AssetLabels() {
  const [unitLabels, setUnitLabels] = useState<UnitLabel[]>([])
  const [labelSearch, setLabelSearch] = useState('')
  const [labelStatusFilter, setLabelStatusFilter] = useState<LabelFilter>('all')
  const [isLabelsExpanded, setIsLabelsExpanded] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [labelsToPrint, setLabelsToPrint] = useState<PrintableBarcodeLabel[]>([])
  const [shouldOpenPrintDialog, setShouldOpenPrintDialog] = useState(false)
  const [isRecordingPrint, setIsRecordingPrint] = useState(false)
  const [printError, setPrintError] = useState('')
  const [recipientSheetLoadingId, setRecipientSheetLoadingId] = useState('')
  const [recipientSheetError, setRecipientSheetError] = useState('')
  const [reprintTarget, setReprintTarget] = useState<UnitLabel | null>(null)
  const [reprintReason, setReprintReason] = useState('')
  const [reprintDetails, setReprintDetails] = useState('')
  const [reprintError, setReprintError] = useState('')
  const [isReprinting, setIsReprinting] = useState(false)

  useEffect(() => {
    let active = true
    const refreshLabels = async () => {
      try {
        const labels = await listUnitLabels()
        if (!active) return
        setUnitLabels(labels)
        setLoadError('')
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Unable to load asset labels.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void refreshLabels()
    const timer = window.setInterval(() => { void refreshLabels() }, 15000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [refreshKey])

  useEffect(() => {
    if (!labelsToPrint.length || !shouldOpenPrintDialog) return
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

  const activeUnitLabels = unitLabels.filter((label) => !label.isReturned)
  const returnedUnitLabels = unitLabels.filter((label) => label.isReturned)
  const toPrintCount = activeUnitLabels.filter((label) => label.needsPrinting).length
  const labelSearchText = labelSearch.trim().toLowerCase()
  const visibleUnitLabels = unitLabels.filter((label) => {
    const matchesFilter = labelStatusFilter === 'returned'
      ? label.isReturned
      : !label.isReturned && (labelStatusFilter === 'all'
        || (labelStatusFilter === 'toPrint' ? label.needsPrinting : !label.needsPrinting))
    const matchesSearch = !labelSearchText || [
      label.itemName,
      label.itemCode,
      label.tagCode,
      label.holderName,
      label.holderCode,
      label.batchId,
      label.purchaseRequisitionReference,
      label.returnCondition,
      label.returnReason,
      label.returnedByName,
    ].some((value) => value?.toLowerCase().includes(labelSearchText))
    return matchesFilter && matchesSearch
  })

  const visibleGroups = useMemo(() => {
    const groups = new Map<string, UnitLabelGroup>()
    for (const label of visibleUnitLabels) {
      const groupId = label.batchId
        ? `batch-${label.batchId}`
        : label.purchaseRequisitionReference
          ? `requisition-${label.purchaseRequisitionReference}-${label.holderCode}`
          : `label-${label.tagCode}`
      const existing = groups.get(groupId)
      if (existing) {
        existing.labels.push(label)
      } else {
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
    }
    return [...groups.values()].map((group) => ({
      ...group,
      labels: [...group.labels].sort((first, second) => first.itemName.localeCompare(second.itemName) || first.unitNumber - second.unitNumber),
    })).sort((first, second) => (Date.parse(second.issuedAt || '') || 0) - (Date.parse(first.issuedAt || '') || 0))
  }, [visibleUnitLabels])

  function previewBarcodeLabels(labels: PrintableBarcodeLabel[]) {
    if (labelsToPrint.length) return
    const uniqueLabels = [...new Map(labels.map((label) => [label.tagCode, label])).values()]
    if (!uniqueLabels.length) return
    setShouldOpenPrintDialog(false)
    setPrintError('')
    setLabelsToPrint(uniqueLabels)
  }

  async function printRecipientSheet(group: UnitLabelGroup) {
    if (!group.batchId || recipientSheetLoadingId) return
    const printWindow = window.open('', '_blank', 'width=960,height=760')
    if (!printWindow) {
      setRecipientSheetError('Allow pop-ups to open the recipient sheet.')
      return
    }
    printWindow.document.write('<!doctype html><title>Preparing recipient sheet</title><p style="font:14px Arial;padding:24px">Preparing recipient sheet…</p>')
    setRecipientSheetLoadingId(group.id)
    setRecipientSheetError('')
    try {
      const batch = await getEmployeeIssuanceBatch(group.batchId)
      if (!batch.items.length) throw new Error('No issued items were found for this issuance.')
      printWindow.document.open()
      printWindow.document.write(recipientSheetHtml(batch, group.purchaseRequisitionReference))
      printWindow.document.close()
      // Print after the logo has loaded, so the sheet is not printed without it.
      const printSheet = () => { if (!printWindow.closed) { printWindow.focus(); printWindow.print() } }
      const logo = printWindow.document.querySelector('img')
      if (logo && !logo.complete) {
        logo.addEventListener('load', () => window.setTimeout(printSheet, 150), { once: true })
        logo.addEventListener('error', () => window.setTimeout(printSheet, 150), { once: true })
      } else {
        window.setTimeout(printSheet, 300)
      }
    } catch (error) {
      printWindow.close()
      setRecipientSheetError(error instanceof Error ? error.message : 'Unable to prepare the recipient sheet. Please try again.')
    } finally {
      setRecipientSheetLoadingId('')
    }
  }

  async function handleReprintSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reprintTarget || !reprintReason || isReprinting) return
    if (reprintReason === 'Other' && !reprintDetails.trim()) {
      setReprintError('Add a short reason for this reprint.')
      return
    }

    const reason = [reprintReason, reprintDetails.trim()].filter(Boolean).join(': ')
    setIsReprinting(true)
    setReprintError('')
    try {
      const replacement = await reprintUnitLabel(reprintTarget.tagCode, reason)
      setReprintTarget(null)
      setReprintReason('')
      setReprintDetails('')
      setRefreshKey((current) => current + 1)
      previewBarcodeLabels([{
        tagCode: replacement.tagCode,
        itemCode: replacement.itemCode,
        itemName: replacement.itemName,
        unitNumber: replacement.unitNumber,
        holderName: reprintTarget.holderName,
        holderCode: reprintTarget.holderCode,
      }])
    } catch (error) {
      setReprintError(error instanceof Error ? error.message : 'Unable to replace this barcode label. Please try again.')
    } finally {
      setIsReprinting(false)
    }
  }

  function closeLabelPreview() {
    if (isRecordingPrint) return
    setLabelsToPrint([])
    setPrintError('')
  }

  async function confirmPrint() {
    if (!labelsToPrint.length || isRecordingPrint) return
    setIsRecordingPrint(true)
    setPrintError('')
    try {
      await recordLabelPrintBatch(labelsToPrint.map((label) => label.tagCode))
      setRefreshKey((current) => current + 1)
      setShouldOpenPrintDialog(true)
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Unable to print these labels. Please try again.')
    } finally {
      setIsRecordingPrint(false)
    }
  }

  const emptyMessage = labelStatusFilter === 'returned' && !returnedUnitLabels.length
    ? 'No returned labels yet.'
    : !activeUnitLabels.length
      ? 'No issued asset labels yet.'
      : labelStatusFilter === 'toPrint' && !labelSearchText
        ? 'All labels are printed.'
        : 'No labels match your search or filter.'

  return (
    <>
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
          body.printing-asset-labels .asset-barcode-label .label-removal-warning { font-size: 2mm !important; font-weight: 900; letter-spacing: 0.12mm; line-height: 1 !important; }
          body.printing-asset-labels .asset-barcode-label .label-item-details { max-width: 49mm; font-size: 1.7mm !important; font-weight: 700; line-height: 1 !important; }
          body.printing-asset-labels .asset-barcode-label .label-item-name {
            display: inline-block; max-width: 32mm; overflow: hidden !important; text-overflow: ellipsis !important; vertical-align: bottom;
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
      <GsoPageFrame activePage="Asset Labels" searchPlaceholder="Search asset labels...">
        <div className="mx-auto max-w-7xl space-y-6 pb-8">
          <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
            <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GSO Staff workspace</span>
              <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Print Asset Labels</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-blue-100">Search issuance records and print labels that are ready.</p>
              <RequisitionIssuanceShortcuts active="labels" />
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="asset-labels-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <h2 id="asset-labels-title" className="text-sm font-black text-slate-900">Asset Labels</h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">Each barcode shows its item, assigned user, and print status.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {toPrintCount > 0 && <button type="button" onClick={() => { setIsLabelsExpanded(true); setLabelStatusFilter('toPrint') }} className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-[0.65rem] font-extrabold text-amber-900 ring-1 ring-amber-300 transition hover:bg-amber-200"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />{toPrintCount} to print</button>}
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[0.62rem] font-extrabold text-blue-700">{isLoading ? 'Loading…' : `${activeUnitLabels.length} issued`}</span>
                <button type="button" aria-expanded={isLabelsExpanded} aria-controls="asset-label-list" onClick={() => setIsLabelsExpanded((expanded) => !expanded)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[0.68rem] font-bold text-blue-700 transition hover:bg-blue-100">{isLabelsExpanded ? 'Hide labels' : 'View labels'}</button>
                <button type="button" disabled={isLoading} onClick={() => { setIsLoading(true); setRefreshKey((current) => current + 1) }} className="rounded-lg border border-slate-200 px-3 py-2 text-[0.68rem] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Refresh list</button>
              </div>
            </div>

            {recipientSheetError && <p role="alert" className="mx-5 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 sm:mx-6">{recipientSheetError}</p>}
            {isLabelsExpanded && <div id="asset-label-list">
              {loadError && <p role="alert" className="mx-5 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 sm:mx-6">{loadError}</p>}
              <div className="flex flex-wrap items-center gap-3 border-b border-blue-100 bg-blue-50/50 px-5 py-3 sm:px-6">
                <input type="search" value={labelSearch} onChange={(event) => setLabelSearch(event.target.value)} placeholder="Search item, barcode, or employee" aria-label="Search asset labels" className="h-10 w-full min-w-0 rounded-xl border-2 border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-900 shadow-sm outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:w-80" />
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter asset labels">
                  {labelFilters.map((filter) => <button key={filter.value} type="button" aria-pressed={labelStatusFilter === filter.value} onClick={() => setLabelStatusFilter(filter.value)} className={`rounded-full px-3.5 py-2 text-xs font-bold transition ${labelStatusFilter === filter.value ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'border border-blue-200 bg-white text-blue-800 hover:bg-blue-100'}`}>
                    {filter.label}{filter.value === 'toPrint' && toPrintCount > 0 ? ` · ${toPrintCount}` : filter.value === 'returned' && returnedUnitLabels.length > 0 ? ` · ${returnedUnitLabels.length}` : ''}
                  </button>)}
                </div>
              </div>
              <div className="max-h-[58vh] overflow-y-auto bg-slate-50 p-3 sm:p-4">
                {isLoading && <p role="status" className="rounded-xl bg-white px-4 py-8 text-center text-xs font-semibold text-slate-400">Loading asset labels…</p>}
                {!isLoading && !loadError && visibleGroups.length > 0 && <div className="space-y-3">
                  {visibleGroups.map((group, index) => {
                    const printableLabels = group.labels.filter((label) => label.needsPrinting)
                    const printedLabels = group.labels.filter((label) => !label.needsPrinting && !label.isReturned)
                    const returnedLabels = group.labels.filter((label) => label.isReturned)
                    const assignedRecipients = [...new Map(group.labels.map((label) => [
                      label.holderCode.trim().toLowerCase(),
                      { name: label.holderName, code: label.holderCode },
                    ])).values()]
                    const groupReference = group.purchaseRequisitionReference
                      ? `Request ${group.purchaseRequisitionReference}`
                      : group.batchId ? `Issuance #${group.batchId}` : 'Direct issuance'
                    const groupTitle = group.batchId ? groupReference : `Issued to ${group.holderName}`
                    const batchEmailStatus = group.labels[0]?.emailSent
                    const batchEmailName = group.labels[0]?.batchEmployeeName
                    const batchEmail = group.labels[0]?.batchEmployeeEmail
                    const isReturnedGroup = returnedLabels.length === group.labels.length
                    return <article key={group.id} className={`overflow-hidden rounded-2xl border-2 border-slate-300/80 ${index % 2 === 0 ? 'bg-blue-50/70' : 'bg-white'} shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5`}>
                      <div className="p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                          <div className="min-w-0">
                            <p className={`text-xs font-extrabold uppercase tracking-wide ${isReturnedGroup ? 'text-slate-500' : 'text-blue-700'}`}>{isReturnedGroup ? 'Returned history' : 'Issuance complete'}</p>
                            <h3 className="mt-1 truncate text-base font-black text-slate-900">{groupTitle}</h3>
                            <p className="mt-1 text-sm font-medium text-slate-700">{group.batchId ? `${assignedRecipients.length} assigned recipient${assignedRecipients.length === 1 ? '' : 's'}` : group.holderCode} <span className="px-1 text-slate-400">·</span> {groupReference}{group.issuedAt ? ` · ${formatLabelDate(group.issuedAt)}` : ''}</p>
                            {group.batchId && <p className={`mt-1 text-sm font-semibold ${batchEmailStatus ? 'text-blue-700' : 'text-slate-600'}`}>{batchEmailStatus === undefined ? 'Head email status unavailable' : `Head email ${batchEmailStatus ? 'sent' : 'not sent'}`}{batchEmailName ? ` · ${batchEmailName}` : ''}{batchEmail ? ` · ${batchEmail}` : ''}</p>}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{group.labels.length} {group.labels.length === 1 ? 'unit' : 'units'}</span>
                            {printableLabels.length > 0 && <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">{printableLabels.length} to print</span>}
                            {printedLabels.length > 0 && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{printedLabels.length} printed</span>}
                            {isReturnedGroup && <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">Returned</span>}
                          </div>
                        </div>

                        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">Individual barcode labels · {group.labels.length}</div>
                          <div className="divide-y divide-slate-100">
                            {group.labels.map((label) => <div key={label.tagCode} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                              <div className="min-w-0">
                                <p className="break-all font-mono text-sm font-extrabold text-slate-900">{label.tagCode}</p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-800">{label.itemName} · {label.itemCode} · Unit {label.unitNumber}</p>
                                <p className="mt-0.5 text-sm text-slate-700">Assigned to: <span className="font-bold">{label.holderName}</span> · {label.holderCode}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${label.isReturned ? 'bg-slate-100 text-slate-600' : label.needsPrinting ? 'bg-blue-600 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                                  {label.isReturned ? 'Returned' : label.needsPrinting ? 'To print' : 'Printed'}
                                </span>
                                {!label.isReturned && !label.needsPrinting && <button type="button" disabled={isReprinting || labelsToPrint.length > 0} onClick={() => { setReprintTarget(label); setReprintReason(''); setReprintDetails(''); setReprintError('') }} className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">Reprint</button>}
                              </div>
                            </div>)}
                          </div>
                        </div>
                        <p className="mt-3 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-800">Assigned to: {assignedRecipients.map((recipient) => `${recipient.name} (${recipient.code})`).join(', ')}</p>

                        <div className="mt-4">
                          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Print steps</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-700 text-xs font-black text-white">1</span>
                                <div><h4 className="text-sm font-extrabold text-slate-900">Full issuance sheet</h4><p className="mt-0.5 text-sm text-slate-700">All items and assigned users</p></div>
                              </div>
                              <button type="button" disabled={!group.batchId || isReturnedGroup || recipientSheetLoadingId === group.id} onClick={() => void printRecipientSheet(group)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{recipientSheetLoadingId === group.id ? 'Preparing…' : isReturnedGroup ? 'History only' : group.batchId ? 'Print full sheet' : 'Unavailable'}</button>
                            </section>
                            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-700 text-xs font-black text-white">2</span>
                                <div><h4 className="text-sm font-extrabold text-slate-900">Barcode labels</h4><p className="mt-0.5 text-sm text-slate-700">{printableLabels.length ? `${printableLabels.length} ready to print` : 'All labels are printed'}</p></div>
                              </div>
                              <button type="button" disabled={!printableLabels.length || labelsToPrint.length > 0 || isRecordingPrint} onClick={() => previewBarcodeLabels(printableLabels.map(toPrintableLabel))} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{printableLabels.length ? `Print ${printableLabels.length === 1 ? 'label' : 'all labels'}` : 'Printed'}</button>
                            </section>
                          </div>
                        </div>

                      </div>
                    </article>
                  })}
                </div>}
                {!isLoading && !loadError && visibleGroups.length === 0 && <p className="rounded-xl bg-white px-4 py-8 text-center text-xs font-semibold text-slate-400">{emptyMessage}</p>}
              </div>
            </div>}
          </section>
        </div>
      </GsoPageFrame>

      {reprintTarget && <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="reprint-label-title">
        <section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
          <form onSubmit={(event) => void handleReprintSubmit(event)}>
            <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-blue-700">Replace barcode label</p>
            <h2 id="reprint-label-title" className="mt-1 text-base font-black text-slate-900">Reprint this label?</h2>
            <p className="mt-1 text-xs text-slate-600">{reprintTarget.itemName} · {reprintTarget.itemCode} · Unit {reprintTarget.unitNumber}</p>
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
              <p className="font-mono text-xs font-extrabold text-slate-900">{reprintTarget.tagCode}</p>
              <p className="mt-1 text-xs text-slate-700">Assigned to: <strong>{reprintTarget.holderName}</strong> · {reprintTarget.holderCode}</p>
            </div>
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">A replacement barcode will be created. The current barcode will stop working.</p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-extrabold text-slate-700">Why does this label need reprinting? *</span>
              <select required value={reprintReason} onChange={(event) => setReprintReason(event.target.value)} disabled={isReprinting} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                <option value="">Choose a reason</option>
                {reprintReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-extrabold text-slate-700">Details {reprintReason === 'Other' ? '*' : '(optional)'}</span>
              <input maxLength={400} required={reprintReason === 'Other'} value={reprintDetails} onChange={(event) => setReprintDetails(event.target.value)} disabled={isReprinting} placeholder="Add a short note" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
            </label>
            {reprintError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{reprintError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={isReprinting} onClick={() => setReprintTarget(null)} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isReprinting || !reprintReason || (reprintReason === 'Other' && !reprintDetails.trim())} className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{isReprinting ? 'Creating replacement…' : 'Create and print new label'}</button>
            </div>
          </form>
        </section>
      </div>}

      {labelsToPrint.length > 0 && !shouldOpenPrintDialog && <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="barcode-preview-title">
        <section className="w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div><h2 id="barcode-preview-title" className="text-sm font-black text-slate-900">Print barcode labels</h2><p className="mt-0.5 text-xs font-semibold text-slate-500">{labelsToPrint.length} label{labelsToPrint.length === 1 ? '' : 's'} ready to print</p></div>
            <button type="button" disabled={isRecordingPrint} onClick={closeLabelPreview} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          </div>
          <div className="my-4 max-h-[56vh] overflow-auto rounded-xl bg-slate-100 p-4"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {labelsToPrint.map((label) => <div key={label.tagCode}>
              <p className="mb-1 text-center text-[0.65rem] font-bold text-slate-600">For {label.holderName} · {label.holderCode}</p>
              <article className="mx-auto flex h-[30mm] w-[50mm] box-border flex-col items-center justify-start gap-[0.2mm] bg-white px-[0.5mm] pb-0 pt-[0.3mm] text-center shadow-md">
                <div className="w-[49mm] flex-none"><BarcodeSvg value={label.tagCode} className="mx-auto h-auto w-full max-h-[19mm] max-w-full object-contain" /></div>
                <p className="max-w-[49mm] flex-none whitespace-nowrap text-[4mm] font-extrabold leading-none text-black">{label.tagCode}</p>
                <p className="label-removal-warning flex-none whitespace-nowrap text-[2mm] font-black leading-none tracking-[0.12mm] text-black">PROPERTY OF DYCI-DO NOT REMOVE</p>
                <p className="label-item-details flex-none whitespace-nowrap text-[1.7mm] font-bold leading-none text-black"><span className="label-item-name inline-block max-w-[32mm] truncate align-bottom">{label.itemName}</span> - {label.itemCode}</p>
              </article>
            </div>)}
          </div></div>
          <p className="text-xs text-slate-600">Printer: 50 × 30 mm · Landscape · 100% · No margins · 1 copy</p>
          <p className="mt-2 text-xs text-slate-600">Printing records the label status.</p>
          {printError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{printError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" disabled={isRecordingPrint} onClick={closeLabelPreview} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            <button type="button" disabled={isRecordingPrint} onClick={() => void confirmPrint()} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{isRecordingPrint ? 'Saving…' : `Print ${labelsToPrint.length} label${labelsToPrint.length === 1 ? '' : 's'}`}</button>
          </div>
        </section>
      </div>}

      {labelsToPrint.length > 0 && createPortal(<div id="asset-barcode-labels" aria-hidden="true" className="fixed left-[-10000px] top-0">
          {labelsToPrint.map((label) => <article key={label.tagCode} className="asset-barcode-label bg-white text-center">
          <div className="barcode-preview"><BarcodeSvg value={label.tagCode} /></div>
          <p className="label-barcode-value">{label.tagCode}</p>
          <p className="label-removal-warning">PROPERTY OF DYCI-DO NOT REMOVE</p>
          <p className="label-item-details"><span className="label-item-name">{label.itemName}</span> - {label.itemCode}</p>
        </article>)}
      </div>, document.body)}
    </>
  )
}
