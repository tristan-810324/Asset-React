import { useCallback, useEffect, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { formatDateTime } from '../requesters/requesterrequestutils'
import { listFacilityFinanceReport, resolveFacilityRepair, type FacilityFinanceRow } from '../requesters/requesterApi'
import { listEmployees } from './employeesApi'
import { completeTaggedAssetRepair, listEmployeeIssuances, markReturnRepaired, resolveTaggedRepair } from './issuancesApi'
import { listInventoryItems, updateInventoryItem, type InventoryItemRecord } from './inventoryApi'

type RepairQueueItem = {
  code: string
  itemCode: string
  tagCode: string | null
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
  // The return record this repair belongs to; it closes the repair for exactly these units.
  returnId?: string | null
  // Why IT Admin turned down the last write-off request, if they did.
  declinedNote?: string | null
}

const completedRepairStatuses = ['Repaired / Complete', 'Written Off']
const writeOffRequestedStatus = 'Write-off requested'
const writeOffRequestedTone = 'bg-rose-50 text-rose-700'

const TAGGED_WRITE_OFF_REASONS = ['Beyond repair', 'Missing parts', 'Water or fire damage', 'Broken or cracked', 'Electrical fault', 'Other']

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


// Units of a facility row that still wait for the GSO check.
const openUnits = (row: FacilityFinanceRow) => row.damagedQuantity - row.repairedQuantity - row.unserviceableQuantity

// A plain-language reason the counts cannot be saved yet, or null when they can (an empty entry is handled by the caller).
// Why a unit is unserviceable. A reason is required before the write-off is saved.
const UNSERVICEABLE_REASONS = ['Beyond repair', 'Missing parts', 'Water or fire damage', 'Broken or cracked', 'Electrical fault', 'Other']

function repairCheckProblem(open: number, entry: { repaired: string; unserviceable: string }): string | null {
  const counts = [entry.repaired, entry.unserviceable].map((value) => (value.trim() === '' ? 0 : Number(value)))
  if (counts.some((count) => !Number.isInteger(count) || count < 0)) return 'Use whole numbers only, like 0, 1, or 2.'
  const total = counts[0] + counts[1]
  if (total > open) return `You entered ${total} in total, but only ${open} ${open === 1 ? 'unit is' : 'units are'} still waiting for a check.`
  return null
}

// GSO sees the units GSO checks; IT Admin's page (owner "ITSS") sees the units sent to ITSS.
export default function ToRepaired({ embedded = false, owner = 'GSO' }: { embedded?: boolean; owner?: 'GSO' | 'ITSS' } = {}) {
  const isItssView = owner === 'ITSS'
  const [activeRepairSection, setActiveRepairSection] = useState<'queue' | 'history'>('queue')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedReportDate, setSelectedReportDate] = useState('')
  const [repairItems, setRepairItems] = useState<RepairQueueItem[]>([])
  // Completed repairs are no longer shown here; the History page will read them.
  const [, setRepairHistoryItems] = useState<RepairQueueItem[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRecord[]>([])
  const [isLoadingRepairs, setIsLoadingRepairs] = useState(true)
  const [repairLoadError, setRepairLoadError] = useState('')
  const [selectedRepairItem, setSelectedRepairItem] = useState<RepairQueueItem | null>(null)
  const [repairCompletionItem, setRepairCompletionItem] = useState<RepairQueueItem | null>(null)
  const [isCompletingRepair, setIsCompletingRepair] = useState(false)
  const [writeOffNote, setWriteOffNote] = useState('')
  const [completionChoice, setCompletionChoice] = useState<'repaired' | 'writeOff'>('repaired')
  const [tagWriteOffReason, setTagWriteOffReason] = useState('')
  const [tagWriteOffDecision, setTagWriteOffDecision] = useState<'waive' | 'charge' | ''>('')
  // Same as the facility check: a waiver needs the GSO staff who checked the item and why.
  const [tagWaiverNote, setTagWaiverNote] = useState('')
  const [repairActionError, setRepairActionError] = useState('')
  const [repairActionMessage, setRepairActionMessage] = useState('')

  // Facility items returned as Needs Repair that still wait for the GSO check. They leave the facility page at return.
  const [facilityRepairs, setFacilityRepairs] = useState<FacilityFinanceRow[]>([])
  const [repairingAssetId, setRepairingAssetId] = useState('')
  // Which group the page shows: all, facility items, or tagged units.
  const [repairSource, setRepairSource] = useState<'all' | 'facility' | 'tagged'>('all')
  const [facilityRepairError, setFacilityRepairError] = useState('')
  // The reason for each unserviceable count, and the row waiting for the write-off confirmation.
  const [unserviceableReasons, setUnserviceableReasons] = useState<Record<string, string>>({})
  const [unserviceableOther, setUnserviceableOther] = useState<Record<string, string>>({})
  const [confirmingAssetId, setConfirmingAssetId] = useState('')
  // Whether the write-off is waived (no charge) or the requester is charged. Chosen on the confirmation.
  const [writeOffDecision, setWriteOffDecision] = useState<Record<string, 'waive' | 'charge'>>({})
  // A waiver needs the GSO staff who checked the items and why; saved with the write-off reason.
  const [waiverNotes, setWaiverNotes] = useState<Record<string, string>>({})
  const loadFacilityRepairs = useCallback(() => listFacilityFinanceReport()
    .then((rows) => setFacilityRepairs(rows.filter((row) => row.condition === 'Needs Repair' && row.damagedQuantity > 0 && row.requestStatus === 'For Repair' && openUnits(row) > 0 && (row.repairOwner === 'ITSS') === isItssView)))
    .catch(() => setFacilityRepairs([])), [isItssView])
  useEffect(() => { void loadFacilityRepairs() }, [loadFacilityRepairs])

  // Per-row inputs: how many of the units still open were repaired, and how many are unserviceable.
  const [repairInputs, setRepairInputs] = useState<Record<string, { repaired: string; unserviceable: string }>>({})
  // The facility row whose repair check is open in the pop-up.
  const [checkingAssetId, setCheckingAssetId] = useState('')
  const checkingRow = facilityRepairs.find((row) => row.assetId === checkingAssetId)
  const openFacilityCheck = (row: FacilityFinanceRow) => {
    setFacilityRepairError('')
    setConfirmingAssetId('')
    setCheckingAssetId(row.assetId)
  }

  const unserviceableReasonText = (assetId: string) => {
    const reason = unserviceableReasons[assetId] || ''
    if (reason === 'Other') return (unserviceableOther[assetId] || '').trim()
    return reason
  }

  // Estimated value of the write-off: unit cost from the Item Master × units. Shown only, not saved yet.
  const estimatedWriteOff = (row: FacilityFinanceRow, count: number) => {
    const unit = Number(inventoryItems.find((item) => item.itemCode === row.itemCode)?.unitCost)
    if (!(unit > 0)) return 'No unit cost in the Item Master, so no estimate yet.'
    const money = (value: number) => value.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
    return `Estimated value: ${money(unit * count)} (${count} × ${money(unit)} unit cost)`
  }

  // Unserviceable needs a reason and a confirmation first; everything else saves straight away.
  function askSaveFacilityRepair(row: FacilityFinanceRow, unserviceable: number) {
    if (unserviceable > 0 && confirmingAssetId !== row.assetId) {
      setConfirmingAssetId(row.assetId)
      return
    }
    void saveFacilityRepair(row)
  }

  async function saveFacilityRepair(row: FacilityFinanceRow) {
    const entry = repairInputs[row.assetId] ?? { repaired: '', unserviceable: '' }
    const problem = repairCheckProblem(openUnits(row), entry)
    if (problem) {
      setFacilityRepairError(problem)
      return
    }
    const repaired = Number(entry.repaired || 0)
    const unserviceable = Number(entry.unserviceable || 0)
    if (repaired + unserviceable === 0) {
      setFacilityRepairError('Enter how many were repaired, or how many are unserviceable.')
      return
    }
    const reason = unserviceableReasonText(row.assetId)
    if (unserviceable > 0 && !reason) {
      setFacilityRepairError('Choose why the unserviceable units cannot be fixed.')
      return
    }
    const waiverNote = (waiverNotes[row.assetId] || '').trim()
    if (unserviceable > 0 && writeOffDecision[row.assetId] === 'waive' && !waiverNote) {
      setFacilityRepairError('Write who checked the items at GSO, and why.')
      return
    }
    setRepairingAssetId(row.assetId)
    setFacilityRepairError('')
    try {
      const unitCost = Number(inventoryItems.find((item) => item.itemCode === row.itemCode)?.unitCost)
      await resolveFacilityRepair(row.assetId, {
        repaired,
        unserviceable,
        writeOffReason: unserviceable > 0 ? (waiverNote ? `${reason}. Checked by: ${waiverNote}` : reason) : undefined,
        writeOffDecision: unserviceable > 0 ? (writeOffDecision[row.assetId] === 'charge' ? 'CHARGED' : 'WAIVED') : undefined,
        writeOffEstimatedValue: unserviceable > 0 && unitCost > 0 ? Math.round(unitCost * unserviceable * 100) / 100 : null,
      })
      setConfirmingAssetId('')
      setCheckingAssetId('')
      await loadFacilityRepairs()
      setRepairInputs((current) => {
        const next = { ...current }
        delete next[row.assetId]
        return next
      })
      setRepairActionMessage(`${row.itemName}: ${repaired} repaired, ${unserviceable} unserviceable recorded.`)
    } catch (reason) {
      setFacilityRepairError(reason instanceof Error ? reason.message : 'The repair check was not saved. Try again.')
    } finally {
      setRepairingAssetId('')
    }
  }

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
            const tagCode = entry.assetTagCode || null
            const completionRecords = item?.changeHistory.filter((change) =>
              change.reason === repairCompletionReason
              && (!tagCode || change.newValues.assetTagCode === tagCode),
            ) ?? []
            const latestCompletionRecord = [...completionRecords].sort(
              (left, right) => repairHistoryTimestamp(left.changedAt) - repairHistoryTimestamp(right.changedAt),
            )[completionRecords.length - 1]
            const reportTimestamp = repairHistoryTimestamp(entry.date)
            const completionTimestamp = latestCompletionRecord ? repairHistoryTimestamp(latestCompletionRecord.changedAt) : 0
            // Returns closed through their own record say so directly; older ones fall back to the audit trail.
            const isRepairCompleted = Boolean(entry.repairOutcome)
              || (entry.event === 'Returned' && completionTimestamp > 0 && reportTimestamp > 0 && completionTimestamp >= reportTimestamp)

            if (!isRepairCondition(condition) && !isRepairCompleted) return []
            // A unit sent to ITSS stays off GSO's list, and GSO's units stay off the ITSS page.
            if ((entry.repairOwner === 'ITSS') !== isItssView) return []
            const isPendingApproval = entry.event === 'Return Pending Approval'
            const isWriteOffRequested = entry.approvalAction === 'Written Off' && !isRepairCompleted
            const priority = priorityFromReturnNote(entry.note, condition)
            const repairStatus = isPendingApproval
              ? 'Awaiting Return Approval'
              : entry.repairOutcome === 'Written Off'
                ? 'Written Off'
                : isRepairCompleted
                  ? 'Repaired / Complete'
                  : isWriteOffRequested
                    ? writeOffRequestedStatus
                    : 'Pending Repair'

            return [{
              code: tagCode || entry.code,
              itemCode: entry.code,
              tagCode,
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
                : entry.repairOutcome === 'Written Off'
                  ? 'bg-slate-100 text-slate-600'
                  : isRepairCompleted
                    ? 'bg-emerald-50 text-emerald-700'
                    : isWriteOffRequested
                      ? writeOffRequestedTone
                      : 'bg-amber-50 text-amber-700',
              dateCompleted: isRepairCompleted
                ? formatRepairCompletionDate(entry.repairResolvedAt || latestCompletionRecord?.changedAt)
                : undefined,
              returnId: entry.returnId || null,
              declinedNote: isRepairCompleted ? null : entry.approvalDecisionNote || null,
            }]
          })
        })
          .sort((left, right) => {
            const leftDate = new Date(left.dateReported).getTime() || 0
            const rightDate = new Date(right.dateReported).getTime() || 0
            return rightDate - leftDate
          })

        setRepairItems(returnedForRepair.filter((item) => !completedRepairStatuses.includes(item.repairStatus)))
        setRepairHistoryItems(returnedForRepair.filter((item) => completedRepairStatuses.includes(item.repairStatus)))
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
  }, [isItssView])

  // Tagged units still waiting for a repair check show in the check table above, not in the list below.
  const taggedChecks = repairItems.filter((item) => item.returnId && item.repairStatus === 'Pending Repair')
  const filteredRepairs = repairItems.filter((item) => {
    if (item.returnId && item.repairStatus === 'Pending Repair') return false
    const matchesSearch = item.asset.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.reportedBy.toLowerCase().includes(searchQuery.toLowerCase())
    const itemDate = reportDateParts(item.dateReported)
    const matchesDate = !selectedReportDate || itemDate === selectedReportDate

    return matchesSearch && matchesDate
  })

  const beginRepairCompletion = (item: RepairQueueItem) => {
    setSelectedRepairItem(null)
    setRepairActionError('')
    setRepairActionMessage('')
    setWriteOffNote('')
    setTagWaiverNote('')
    setCompletionChoice('repaired')
    setRepairCompletionItem(item)
  }

  // GSO decides a write-off directly: reason, waive or charge, and the estimate. Written Off leaves the stock.
  const handleGsoWriteOff = async () => {
    if (!repairCompletionItem?.returnId || isCompletingRepair) return
    const reason = tagWriteOffReason === 'Other' ? writeOffNote.trim() : tagWriteOffReason
    const waiverNote = tagWaiverNote.trim()
    if (!reason || !tagWriteOffDecision) {
      setRepairActionError('Choose the reason and whether to waive or charge.')
      return
    }
    if (tagWriteOffDecision === 'waive' && !waiverNote) {
      setRepairActionError('Write who checked the items at GSO, and why.')
      return
    }
    const { returnId, asset, tagCode, itemCode } = repairCompletionItem
    const unitCost = Number(inventoryItems.find((item) => item.itemCode.toLowerCase() === itemCode.toLowerCase())?.unitCost)
    setIsCompletingRepair(true)
    setRepairActionError('')
    try {
      await resolveTaggedRepair(returnId, {
        outcome: 'Written Off',
        writeOffReason: tagWriteOffDecision === 'waive' ? `${reason}. Checked by: ${waiverNote}` : reason,
        writeOffDecision: tagWriteOffDecision === 'charge' ? 'CHARGED' : 'WAIVED',
        writeOffEstimatedValue: unitCost > 0 ? Math.round(unitCost * 100) / 100 : null,
      })
      const isSameRepair = (item: RepairQueueItem) => item.returnId === returnId
      setRepairItems((currentItems) => currentItems.filter((item) => !isSameRepair(item)))
      setRepairHistoryItems((currentItems) => [
        { ...repairCompletionItem, repairStatus: 'Written Off', repairStatusTone: 'bg-slate-100 text-slate-600', dateCompleted: formatRepairCompletionDate(new Date().toISOString()) },
        ...currentItems.filter((item) => !isSameRepair(item)),
      ])
      setRepairActionMessage(`${asset}${tagCode ? ` (${tagCode})` : ''} written off. ${tagWriteOffDecision === 'charge' ? 'The requester is notified to pay at the Finance office.' : 'No charge.'}`)
      setRepairCompletionItem(null)
      setWriteOffNote('')
      setTagWriteOffReason('')
      setTagWriteOffDecision('')
      setTagWaiverNote('')
    } catch (error) {
      setRepairActionError(error instanceof Error ? error.message : 'Unable to write off this unit. Please try again.')
    } finally {
      setIsCompletingRepair(false)
    }
  }

  const handleMarkAsRepaired = async () => {
    if (!repairCompletionItem || isCompletingRepair) return

    const inventoryItem = inventoryItems.find((item) => item.itemCode.toLowerCase() === repairCompletionItem.itemCode.toLowerCase())
    if (!inventoryItem) {
      setRepairActionError('The matching inventory record could not be found. Refresh the page and try again.')
      return
    }

    setIsCompletingRepair(true)
    setRepairActionError('')
    try {
      let completionTimestamp = new Date().toISOString()
      if (repairCompletionItem.returnId) {
        // Puts exactly the units of this return back in stock.
        await markReturnRepaired(repairCompletionItem.returnId)
      } else if (repairCompletionItem.tagCode) {
        await completeTaggedAssetRepair(repairCompletionItem.tagCode)
      } else {
        const updatedInventoryItem = await updateInventoryItem(inventoryItem.id, {
          itemCode: inventoryItem.itemCode,
          category: inventoryItem.category,
          itemName: inventoryItem.itemName,
          description: inventoryItem.description,
          trackingMode: inventoryItem.trackingMode,
          issueBehavior: inventoryItem.issueBehavior,
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
        const completionRecords = updatedInventoryItem.changeHistory.filter((change) => change.reason === repairCompletionReason)
        const latestCompletionRecord = [...completionRecords].sort(
          (left, right) => repairHistoryTimestamp(left.changedAt) - repairHistoryTimestamp(right.changedAt),
        )[completionRecords.length - 1]
        completionTimestamp = latestCompletionRecord?.changedAt || completionTimestamp
      }

      const isSameRepair = (item: RepairQueueItem) => (repairCompletionItem.returnId
        ? item.returnId === repairCompletionItem.returnId
        : item.code.toLowerCase() === repairCompletionItem.code.toLowerCase() && item.dateReported === repairCompletionItem.dateReported)
      setRepairItems((currentItems) => currentItems.filter((item) => !isSameRepair(item)))
      const completedRepair: RepairQueueItem = {
        ...repairCompletionItem,
        repairStatus: 'Repaired / Complete',
        repairStatusTone: 'bg-emerald-50 text-emerald-700',
        dateCompleted: formatRepairCompletionDate(completionTimestamp),
        declinedNote: null,
      }
      setRepairHistoryItems((currentItems) => [completedRepair, ...currentItems.filter((item) => !isSameRepair(item))])
      setRepairActionMessage(repairCompletionItem.tagCode
        ? `${repairCompletionItem.asset} (${repairCompletionItem.tagCode}) is repaired and returned to GSO Storage.`
        : `${repairCompletionItem.asset} is repaired and its units are available again.`)
      setRepairCompletionItem(null)
      setWriteOffNote('')
    } catch (error) {
      setRepairActionError(error instanceof Error ? error.message : 'Unable to complete this repair. Please try again.')
    } finally {
      setIsCompletingRepair(false)
    }
  }

  const page = (
    <>
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
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
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
      <div className="mt-6 space-y-5">
        <section className="overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Items To Be Repaired</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Defective equipment flagged for repair. Select a row to review its details.
            </p>
            <div role="group" aria-label="Show" className="mt-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {([
                ['all', 'All'],
                ['facility', 'Facility'],
                ['tagged', 'Tagged'],
              ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={repairSource === value} onClick={() => setRepairSource(value)} className={`h-9 rounded-lg px-4 text-xs font-extrabold transition ${repairSource === value ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>{label}</button>)}
            </div>
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
            <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-[0.65rem] font-extrabold text-blue-700">
              {repairSource !== 'tagged' && `${facilityRepairs.length} facility`}{repairSource === 'all' && ' · '}{repairSource !== 'facility' && `${taggedChecks.length} tagged`}
            </span>
          </div>
        </div>
        </section>

        {repairSource !== 'tagged' && facilityRepairs.length > 0 && <section className="overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
          <div className="flex items-center justify-between gap-3 bg-amber-50/60 px-5 py-3 sm:px-6">
            <p className="text-xs font-extrabold text-amber-900">Facility items <span className="font-semibold text-amber-800">· counted by quantity</span></p>
            <span className="text-[0.62rem] font-extrabold text-amber-800">{facilityRepairs.length} to check</span>
          </div>
          {facilityRepairError && <p role="alert" className="px-5 pt-3 text-xs font-bold text-rose-700 sm:px-6">{facilityRepairError}</p>}
          <div className="overflow-auto">
            <table className="min-w-220 w-full text-left">
              <thead className="bg-slate-50 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 sm:px-6">Item</th>
                  <th className="px-5 py-3">Damaged</th>
                  <th className="px-5 py-3">Reported by</th>
                  <th className="px-5 py-3">Returned</th>
                  <th className="px-5 py-3">Who repairs</th>
                  <th className="px-5 py-3 sm:px-6">Repair check</th>
                </tr>
              </thead>
              <tbody>
                {facilityRepairs.map((row) => {
                  // GSO and ITSS items both get the same check here; the owner only shows who is responsible for the repair.
                  const forGso = true
                  const open = openUnits(row)
                  return <tr key={`${row.requestId}-${row.itemCode}-${row.assetId}`} className="border-t border-slate-100">
                    <td className="px-5 py-4 sm:px-6">
                      <span className="block text-xs font-extrabold text-slate-800">{row.itemName}</span>
                      <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{row.itemCode} · {row.referenceNo}</span>
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-700">{row.damagedQuantity}</td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-700">{row.accountableName}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-600">{row.returnedAt ? formatDateTime(row.returnedAt) : '—'}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[0.62rem] font-extrabold text-slate-700">{forGso ? 'GSO' : 'ITSS'}</span>
                    </td>
                    <td className="px-5 py-4 sm:px-6">
                      {forGso ? <div>
                        <button type="button" onClick={() => openFacilityCheck(row)} className="h-9 whitespace-nowrap rounded-lg bg-blue-600 px-3.5 text-xs font-extrabold text-white transition hover:bg-blue-700">Repair check</button>
                        <p className="mt-1.5 text-[0.62rem] font-bold text-slate-500">{open} of {row.damagedQuantity} left to check.</p>
                      </div> : <span className="text-[0.65rem] font-bold text-slate-500">With ITSS. Waits for their return.</span>}
                    </td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        </section>}
        {repairSource !== 'facility' && taggedChecks.length > 0 && <section className="overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
          <div className="flex items-center justify-between gap-3 bg-amber-50/60 px-5 py-3 sm:px-6">
            <p className="text-xs font-extrabold text-amber-900">Tagged units <span className="font-semibold text-amber-800">· one barcode each</span></p>
            <span className="text-[0.62rem] font-extrabold text-amber-800">{taggedChecks.length} to check</span>
          </div>
          <div className="overflow-auto">
            <table className="min-w-220 w-full text-left">
              <thead className="bg-slate-50 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 sm:px-6">Item</th>
                  <th className="px-5 py-3">Unit</th>
                  <th className="px-5 py-3">Reported by</th>
                  <th className="px-5 py-3">Returned</th>
                  <th className="px-5 py-3">Who repairs</th>
                  <th className="px-5 py-3">Repair check</th>
                </tr>
              </thead>
              <tbody>
                {taggedChecks.map((item) => (
                  <tr key={`${item.returnId}-${item.code}`} className="border-t border-slate-100">
                    <td className="px-5 py-4 sm:px-6">
                      <span className="block text-xs font-extrabold text-slate-800">{item.asset}</span>
                      <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{item.itemCode}</span>
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-700">{item.tagCode || item.code}</td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-700">{item.reportedBy}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-600">{item.dateReported}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[0.62rem] font-extrabold text-slate-700">GSO</span>
                    </td>
                    <td className="px-5 py-4 sm:px-6">
                      <button type="button" onClick={() => { setCompletionChoice('repaired'); setRepairActionError(''); setRepairCompletionItem(item) }} className="h-9 whitespace-nowrap rounded-lg bg-blue-600 px-3.5 text-xs font-extrabold text-white transition hover:bg-blue-700">Repair check</button>
                      <p className="mt-1.5 text-[0.62rem] font-bold text-slate-500">1 left to check.</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>}
        {repairSource === 'all' && (isLoadingRepairs || filteredRepairs.length > 0 || Boolean(repairLoadError)) && <section className="overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5"><div className="max-h-[65vh] overflow-auto overscroll-contain">
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
        </div></section>}
      </div>
      )}


      {selectedRepairItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Repair Ticket Details</h3>
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
                {selectedRepairItem.repairStatus === writeOffRequestedStatus && (
                  <p className="mt-2 text-[0.68rem] leading-relaxed text-slate-600">Waiting for IT Admin to approve the write-off. If the item gets fixed first, you can still mark it as repaired.</p>
                )}
                {selectedRepairItem.declinedNote && (
                  <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[0.68rem] font-semibold text-rose-800">IT Admin declined the last write-off request: {selectedRepairItem.declinedNote}</p>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              {(selectedRepairItem.repairStatus === 'Pending Repair' || selectedRepairItem.repairStatus === writeOffRequestedStatus) && (
                <button
                  type="button"
                  onClick={() => beginRepairCompletion(selectedRepairItem)}
                  className="mr-auto inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2"
                >
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 4 4L19 6" />
                    <path d="M12 22a10 10 0 1 0-10-10" />
                  </svg>
                  Close repair
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

      {checkingRow && (() => {
        const row = checkingRow
        const open = openUnits(row)
        const busy = repairingAssetId === row.assetId
        const entry = repairInputs[row.assetId] ?? { repaired: '', unserviceable: '' }
        const problem = repairCheckProblem(open, entry)
        const unserviceableCount = Number(entry.unserviceable || 0)
        const isConfirming = confirmingAssetId === row.assetId
        const closeCheck = () => {
          if (busy) return
          setCheckingAssetId('')
          setConfirmingAssetId('')
          setFacilityRepairError('')
        }
        return (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="facility-check-title"
              onKeyDown={(event) => { if (event.key === 'Escape') closeCheck() }}
              className="flex max-h-[94vh] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30"
            >
              <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-8 sm:py-5">
                <div className="min-w-0">
                  <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">GSO repair check</p>
                  <h2 id="facility-check-title" className="mt-0.5 text-base font-black text-slate-900 sm:text-lg">Repair check</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{row.itemName} · {row.itemCode}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Reported by {row.accountableName}{row.returnedAt ? ` · returned ${formatDateTime(row.returnedAt)}` : ''}
                  </p>
                </div>
                <button type="button" onClick={closeCheck} disabled={busy} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:opacity-50">Close</button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-5 sm:px-7 sm:py-6 scrollbar-thin">

              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm font-semibold text-slate-700">
                {row.damagedQuantity} damaged · {open} still waiting for a check
              </div>

              <fieldset className="mt-4 grid gap-3 sm:grid-cols-2" disabled={busy}>
                <label className="block">
                  <span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-emerald-700">Repaired · to stock</span>
                  <input type="number" min={0} max={open} inputMode="numeric" value={entry.repaired} onChange={(event) => setRepairInputs((current) => ({ ...current, [row.assetId]: { ...entry, repaired: event.target.value } }))} aria-label={`Repaired units of ${row.itemName}`} className="h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-lg font-bold text-slate-900 outline-none focus:border-blue-600" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-rose-700">Unserviceable · to history</span>
                  <input type="number" min={0} max={open} inputMode="numeric" value={entry.unserviceable} onChange={(event) => setRepairInputs((current) => ({ ...current, [row.assetId]: { ...entry, unserviceable: event.target.value } }))} aria-label={`Unserviceable units of ${row.itemName}`} className="h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-lg font-bold text-slate-900 outline-none focus:border-blue-600" />
                </label>
              </fieldset>

              {unserviceableCount > 0 && (
                <div className="mt-4">
                  <p className="text-base font-black text-slate-900">Why can't it be fixed? <span className="text-xs font-semibold text-rose-600">(required)</span></p>
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Reason for ${row.itemName}`}>
                    {UNSERVICEABLE_REASONS.map((reason) => <button key={reason} type="button" disabled={busy} onClick={() => setUnserviceableReasons((current) => ({ ...current, [row.assetId]: reason }))} className={`rounded-full border-2 px-4 py-2.5 text-sm font-extrabold transition ${unserviceableReasons[row.assetId] === reason ? 'border-rose-500 bg-white text-rose-800 ring-2 ring-rose-200' : 'border-slate-300 bg-white text-slate-700 hover:border-rose-300'}`}>{reason}</button>)}
                  </div>
                  {unserviceableReasons[row.assetId] === 'Other' && <input value={unserviceableOther[row.assetId] || ''} onChange={(event) => setUnserviceableOther((current) => ({ ...current, [row.assetId]: event.target.value }))} maxLength={300} disabled={busy} placeholder="Write the reason" className="mt-2 h-14 w-full rounded-xl border-2 border-slate-300 px-4 text-base font-semibold text-slate-900 outline-none focus:border-blue-600" />}
                </div>
              )}

              {isConfirming && (
                <div role="alert" className="mt-4 rounded-xl border-2 border-rose-300 bg-rose-50/40 p-4">
                  <p className="text-sm font-black text-rose-800">Write off {entry.unserviceable} unserviceable {row.itemName}?</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">They leave the stock and go to History. Reason: {unserviceableReasonText(row.assetId)}.</p>
                  <p className="mt-1 text-xs font-extrabold text-rose-800">{estimatedWriteOff(row, unserviceableCount)}</p>
                  <div className="mt-3 grid gap-2" role="radiogroup" aria-label={`Charge decision for ${row.itemName}`}>
                    {([
                      ['waive', 'Waive, no charge', 'The damage is not charged to the requester.'],
                      ['charge', 'Charge the requester', 'Finance collects the amount in person.'],
                    ] as const).map(([value, label, detail]) => <button key={value} type="button" role="radio" aria-checked={writeOffDecision[row.assetId] === value} disabled={busy} onClick={() => setWriteOffDecision((current) => ({ ...current, [row.assetId]: value }))} className={`rounded-xl border-2 bg-white px-4 py-3.5 text-left transition ${writeOffDecision[row.assetId] === value ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-200 hover:border-rose-200'}`}>
                      <span className="block text-sm font-extrabold text-slate-900">{label}</span>
                      <span className="block text-xs font-semibold text-slate-500">{detail}</span>
                    </button>)}
                  </div>
                  {writeOffDecision[row.assetId] === 'waive' && (
                    <label className="mt-3 block">
                      <span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Who checked the items at GSO, and why <span className="text-rose-600">*</span></span>
                      <input value={waiverNotes[row.assetId] || ''} onChange={(event) => setWaiverNotes((current) => ({ ...current, [row.assetId]: event.target.value }))} maxLength={500} disabled={busy} placeholder="e.g. Checked by Juan Dela Cruz, GSO staff, unit is beyond repair" className="h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-semibold text-slate-900 outline-none focus:border-blue-600" />
                    </label>
                  )}
                </div>
              )}

              {facilityRepairError &&<p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900">{facilityRepairError}</p>}
              {!facilityRepairError && problem && <p role="alert" className="mt-4 text-xs font-extrabold text-rose-700">{problem}</p>}
              {!problem && !isConfirming && (entry.repaired.trim() !== '' || entry.unserviceable.trim() !== '') && (
                <p className="mt-4 text-xs font-bold text-slate-500">
                  {Number(entry.repaired || 0) > 0 && <span className="text-emerald-700">{entry.repaired} go back to Item Master stock. </span>}
                  {unserviceableCount > 0 && <span className="text-rose-700">{entry.unserviceable} unserviceable go to History.</span>}
                </p>
              )}

              </div>
              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                {isConfirming ? (
                  <>
                    <button type="button" onClick={() => setConfirmingAssetId('')} disabled={busy} className="rounded-xl border-2 border-slate-300 bg-white px-6 py-3.5 text-base font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                    <button type="button" onClick={() => void saveFacilityRepair(row)} disabled={busy || !writeOffDecision[row.assetId] || (writeOffDecision[row.assetId] === 'waive' && !(waiverNotes[row.assetId] || '').trim())} className="rounded-xl bg-rose-600 px-6 py-3.5 text-base font-extrabold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Saving…' : 'Yes, write off'}</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={closeCheck} disabled={busy} className="rounded-xl border-2 border-slate-300 bg-white px-6 py-3.5 text-base font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                    <button type="button" disabled={busy || Boolean(problem) || (entry.repaired.trim() === '' && entry.unserviceable.trim() === '') || (unserviceableCount > 0 && !unserviceableReasonText(row.assetId))} onClick={() => askSaveFacilityRepair(row, unserviceableCount)} className="rounded-xl bg-blue-600 px-6 py-3.5 text-base font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Saving…' : 'Save check'}</button>
                  </>
                )}
              </div>
            </section>
          </div>
        )
      })()}

      {repairCompletionItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="repair-completion-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !isCompletingRepair) { setRepairCompletionItem(null); setRepairActionError('') }
            }}
            className="flex max-h-[94vh] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-8 sm:py-5">
              <div className="min-w-0">
                <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Tagged unit</p>
                <h2 id="repair-completion-title" className="mt-0.5 text-base font-black text-slate-900 sm:text-lg">Repair check</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {repairCompletionItem.asset} · {repairCompletionItem.tagCode || repairCompletionItem.code}
                </p>
              </div>
              <button type="button" onClick={() => { if (!isCompletingRepair) { setRepairCompletionItem(null); setRepairActionError('') } }} disabled={isCompletingRepair} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:opacity-50">Close</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-5 sm:px-7 sm:py-6 scrollbar-thin">

            <fieldset className="mt-4 grid gap-2" disabled={isCompletingRepair}>
              <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3.5 transition ${completionChoice === 'repaired' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                <input type="radio" name="repair-outcome" checked={completionChoice === 'repaired'} onChange={() => { setCompletionChoice('repaired'); setRepairActionError('') }} className="h-4 w-4 accent-emerald-600" />
                <span className="text-base font-extrabold text-slate-900">Repaired · to stock</span>
              </label>
              {repairCompletionItem.returnId && (
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3.5 transition ${completionChoice === 'writeOff' ? 'border-rose-500 bg-rose-50' : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                  <input type="radio" name="repair-outcome" checked={completionChoice === 'writeOff'} onChange={() => { setCompletionChoice('writeOff'); setRepairActionError('') }} className="h-4 w-4 accent-rose-600" />
                  <span className="text-base font-extrabold text-slate-900">Unserviceable · to history</span>
                </label>
              )}
            </fieldset>

            {completionChoice === 'writeOff' && (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-base font-black text-slate-900">Why can't it be fixed?</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Reason">
                    {TAGGED_WRITE_OFF_REASONS.map((reason) => <button key={reason} type="button" onClick={() => setTagWriteOffReason(reason)} disabled={isCompletingRepair} className={`rounded-full border-2 px-4 py-2.5 text-sm font-extrabold transition ${tagWriteOffReason === reason ? 'border-rose-500 bg-white text-rose-800 ring-2 ring-rose-200' : 'border-slate-300 bg-white text-slate-700 hover:border-rose-300'}`}>{reason}</button>)}
                  </div>
                  {tagWriteOffReason === 'Other' && <input value={writeOffNote} onChange={(event) => setWriteOffNote(event.target.value)} maxLength={300} disabled={isCompletingRepair} placeholder="Write the reason" className="mt-2 h-14 w-full rounded-xl border-2 border-slate-300 px-4 text-base font-semibold text-slate-900 outline-none focus:border-blue-600" />}
                </div>
                {tagWriteOffReason && (
                  <div role="alert" className="rounded-xl border-2 border-rose-300 bg-rose-50/40 p-4">
                    <p className="text-sm font-black text-rose-800">Write off this unserviceable {repairCompletionItem.asset}?</p>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">They leave the stock and go to History. Reason: {tagWriteOffReason === 'Other' ? (writeOffNote.trim() || '—') : tagWriteOffReason}.</p>
                    <p className="mt-1 text-xs font-extrabold text-rose-800">
                      Estimated value: {(() => {
                        const unit = Number(inventoryItems.find((item) => item.itemCode.toLowerCase() === repairCompletionItem.itemCode.toLowerCase())?.unitCost)
                        return unit > 0 ? `${unit.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })} (1 × ${unit.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })} unit cost)` : 'No unit cost in the Item Master, so no estimate yet.'
                      })()}
                    </p>
                    <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Charge decision">
                      {([
                        ['waive', 'Waive, no charge', 'The damage is not charged to the requester.'],
                        ['charge', 'Charge the requester', 'Finance collects the amount in person.'],
                      ] as const).map(([value, label, detail]) => <button key={value} type="button" role="radio" aria-checked={tagWriteOffDecision === value} onClick={() => setTagWriteOffDecision(value)} disabled={isCompletingRepair} className={`rounded-xl border-2 bg-white px-4 py-3.5 text-left transition ${tagWriteOffDecision === value ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-200 hover:border-rose-200'}`}>
                        <span className="block text-sm font-extrabold text-slate-900">{label}</span>
                        <span className="block text-xs font-semibold text-slate-500">{detail}</span>
                      </button>)}
                    </div>
                    {tagWriteOffDecision === 'waive' && (
                      <label className="mt-3 block">
                        <span className="mb-1.5 block text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Who checked the items at GSO, and why <span className="text-rose-600">*</span></span>
                        <input value={tagWaiverNote} onChange={(event) => setTagWaiverNote(event.target.value)} maxLength={300} disabled={isCompletingRepair} placeholder="e.g. Checked by Juan Dela Cruz, GSO staff, unit is beyond repair" className="h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-semibold text-slate-900 outline-none focus:border-blue-600" />
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}

            {repairActionError && (
              <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-900">
                {repairActionError}
              </p>
            )}
            </div>
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
              <button
                type="button"
                disabled={isCompletingRepair}
                onClick={() => { setRepairCompletionItem(null); setRepairActionError('') }}
                className="rounded-xl border-2 border-slate-300 bg-white px-6 py-3.5 text-base font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCompletingRepair || (completionChoice === 'writeOff' && (!tagWriteOffReason || !tagWriteOffDecision || (tagWriteOffReason === 'Other' && !writeOffNote.trim()) || (tagWriteOffDecision === 'waive' && !tagWaiverNote.trim())))}
                onClick={() => { void (completionChoice === 'writeOff' ? handleGsoWriteOff() : handleMarkAsRepaired()) }}
                className={`rounded-xl px-6 py-3.5 text-base font-extrabold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${completionChoice === 'writeOff' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {isCompletingRepair ? 'Saving…' : completionChoice === 'writeOff' ? 'Yes, write off' : 'Save check'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
  if (embedded) return page
  return <GsoPageFrame activePage="Repair & Maintenance" searchPlaceholder="Search asset, code, or reporter...">{page}</GsoPageFrame>
}
