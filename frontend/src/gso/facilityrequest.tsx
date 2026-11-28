import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import JsBarcode from 'jsbarcode'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import {
  listGsoRequests,
  recordFacilitySlipPrints,
  reprintFacilitySlip,
  saveFacilityDamageDecision,
  settleFacilityItem,
  updateGsoRequestStatus,
  type FacilitySettlement,
  type RequestAsset,
  type ServiceRequest,
} from '../requesters/requesterApi'
import { formatDate, formatDateTime } from '../requesters/requesterrequestutils'
import { listInventoryItems, type InventoryItemRecord } from './inventoryApi'
import { formText } from './requisitionFlow'
import { FacilitiesShortcuts } from './facilitiesShortcuts'
import { Banner, EmptyState, fieldLabel } from './requisitionParts'

type Tab = 'review' | 'approved' | 'out' | 'close'
type StepStatus = 'current' | 'upcoming' | 'done'
type EquipmentRow = { itemId?: string; itemCode?: string; name?: string; description?: string; quantity?: number | string; unit?: string }
type ReturnDraft = Record<string, { returned: string; damaged: string; condition: string; repairBy: string }>
type SaveHandler = (message: string, updated?: ServiceRequest) => void
type EntryMethod = 'scan' | 'typed'

// The queue follows the flow: check → approved (print slip, release) → out (return) → close (settle, complete).
const TABS: Record<Tab, { label: string; hint: string; empty: string; statuses: string[] }> = {
  review: { label: 'To check', hint: 'Check the venue and the items, then approve or reject.', empty: 'No new requests to check.', statuses: ['Submitted', 'Under Review', 'Needs Information'] },
  approved: { label: 'Approved', hint: 'Print the slip, then scan it when the requester picks up the items.', empty: 'No approved requests.', statuses: ['Approved'] },
  out: { label: 'Out now', hint: 'Items with the requester. Scan the slip when they come back.', empty: 'No items are out.', statuses: ['Issued'] },
  close: { label: 'To close', hint: 'Mark the request completed. Damaged items stay in repair until they are fixed.', empty: 'Nothing to close.', statuses: ['Returned', 'Completed'] },
}
const TAB_ORDER = Object.keys(TABS) as Tab[]

const REPAIR_CONDITIONS = ['Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired']
// What can be wrong with a damaged item on return. Damaged items send the request to For Repair.
// Every item that comes back damaged goes to To Be Repaired. What is wrong is decided there, not at the return.
const DAMAGE_CONDITION = 'Needs Repair'
// Who repairs an item that came back as Needs Repair: GSO staff here, or ITSS through the Service Operations.
const REPAIR_OWNERS: { value: 'GSO' | 'ITSS'; label: string; detail: string }[] = [
  { value: 'GSO', label: 'GSO checks it', detail: 'GSO staff checks if it can still be fixed.' },
  { value: 'ITSS', label: 'Send to ITSS', detail: 'ITSS checks if it can be fixed, then returns it to GSO.' },
]
// Same rule as Return Items: a scanner enters each character in under 35 ms; slower input or a paste counts as typed.
const SCANNER_MAX_MS_PER_CHAR = 35
const TYPED_REASONS = ['Scanner not working', 'Slip is damaged', 'Slip is lost']
// A venue stays booked from approval until the request is completed.
const BOOKED_STATUSES = ['Approved', 'Issued', 'For Repair', 'Returned']
const SLIP_REPRINT_REASONS = ['Damaged or unreadable', 'Torn or peeling', 'Slip lost or missing', 'Printer error', 'Other']
const FLOW_WITH_ITEMS = ['Check', 'Print slip', 'Release', 'Return', 'Close']
const FLOW_VENUE_ONLY = ['Check', 'Close']

const SETTLEMENT_CHOICES: Array<{ value: FacilitySettlement; detail: string }> = [
  { value: 'Replaced', detail: 'Same item given back. Goes back to stock.' },
  { value: 'Paid', detail: 'Requester paid for it. Stays out of stock.' },
  { value: 'Waived', detail: 'No payment. A reason is required.' },
]

const STATUS_CHIPS: Record<string, { label: string; tone: string }> = {
  Submitted: { label: 'New', tone: 'bg-blue-50 text-blue-700' },
  'Under Review': { label: 'Under review', tone: 'bg-amber-50 text-amber-800' },
  'Needs Information': { label: 'With requester', tone: 'bg-amber-50 text-amber-800' },
  Approved: { label: 'Approved', tone: 'bg-emerald-50 text-emerald-700' },
  'For Repair': { label: 'For repair', tone: 'bg-rose-50 text-rose-700' },
  Returned: { label: 'Returned', tone: 'bg-emerald-50 text-emerald-700' },
  Completed: { label: 'Completed', tone: 'bg-slate-100 text-slate-600' },
  Rejected: { label: 'Rejected', tone: 'bg-rose-50 text-rose-700' },
}

const NATURE_LABELS: Record<string, string> = { CURRICULAR: 'Curricular', CO_CURRICULAR: 'Co-curricular', OTHER: 'Others' }

const stepStyles: Record<StepStatus, { badge: string; label: string; suffix: string }> = {
  done: { badge: 'bg-emerald-600 text-white', label: 'text-emerald-700', suffix: ' · Done' },
  current: { badge: 'bg-blue-600 text-white ring-4 ring-blue-100', label: 'text-blue-700', suffix: '' },
  upcoming: { badge: 'bg-slate-200 text-slate-700', label: 'text-slate-600', suffix: '' },
}

const primaryButton = 'rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
const quietButton = 'rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
const inputClass = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
// Pop-up styles shared with the Item Master Data pop-ups, so every GSO pop-up looks the same.
const dialogSectionClass = 'rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-5'
const dialogLabelClass = 'mb-2 block text-sm font-extrabold text-slate-900'
const dialogControlClass = 'h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100'
// Pop-up footer buttons: one primary action on the right, Cancel on the left.
const dialogPrimaryButton = 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50'
const dialogCancelButton = 'rounded-xl border-2 border-slate-300 bg-white px-5 py-2.5 text-sm font-extrabold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-50'

// Field readers for a facility request. The form stores each answer as its own key.
// A name typed all in lowercase is shown with capitals ("tristan ivan bautista" → "Tristan Ivan Bautista");
// any other spelling is kept as typed, so names such as "dela Cruz" stay correct.
const displayName = (name: string | null | undefined) => {
  const trimmed = (name || '').trim()
  return trimmed && trimmed === trimmed.toLowerCase() ? trimmed.replace(/(^|\s)(\p{L})/gu, (_match, space: string, letter: string) => space + letter.toUpperCase()) : trimmed
}
// First and last name from the requester's identity; the account name can be a username.
const requesterName = (request: ServiceRequest) => displayName(request.requesterFullName) || formText(request.formData.requesterName) || request.requesterName
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'RQ'
const venueOf = (request: ServiceRequest) => formText(request.formData.venue)
const dateOf = (request: ServiceRequest) => formText(request.formData.date)
const startOf = (request: ServiceRequest) => formText(request.formData.startTime)
const endOf = (request: ServiceRequest) => formText(request.formData.endTime)
// 24-hour "14:30" shown as "2:30 PM" for staff; anything else is shown as typed.
const clockText = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return value
  const hour = Number(match[1])
  const period = hour < 12 ? 'AM' : 'PM'
  return `${hour % 12 || 12}:${match[2]} ${period}`
}
const timeRangeOf = (request: ServiceRequest) => (startOf(request) && endOf(request) ? `${clockText(startOf(request))} – ${clockText(endOf(request))}` : '')
// Approval turns the requested equipment into reserved rows; only those can be released.
const hasItems = (request: ServiceRequest) => request.assets.length > 0
const openAssets = (request: ServiceRequest) => request.assets.filter((asset) => !asset.returnedAt)
const pendingAssets = (request: ServiceRequest) => request.assets.filter((asset) => asset.settlementStatus === 'Pending')
const pendingDamageAssets = (request: ServiceRequest) => request.assets.filter((asset) => asset.settlementStatus === 'Pending' && Number(asset.damagedQuantity || 0) > 0 && asset.conditionIn === 'Unserviceable')
const pendingMissingAssets = (request: ServiceRequest) => request.assets.filter((asset) => asset.settlementStatus === 'Pending' && Number(asset.lostQuantity || 0) > 0)
const unitsOf = (assets: RequestAsset[]) => assets.reduce((total, asset) => total + Number(asset.quantity || 0), 0)

function tabOf(request: ServiceRequest): Tab | null {
  return TAB_ORDER.find((key) => TABS[key].statuses.includes(request.status)) ?? null
}

function equipmentOf(request: ServiceRequest): EquipmentRow[] {
  return Array.isArray(request.formData.equipment) ? request.formData.equipment as EquipmentRow[] : []
}

// The items are due back at the end of the activity.
function dueAt(request: ServiceRequest) {
  const date = dateOf(request)
  const end = endOf(request)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(end)) return null
  return new Date(`${date}T${end}:00`).getTime()
}

function isOverdue(request: ServiceRequest, now: number) {
  const due = dueAt(request)
  return request.status === 'Issued' && due !== null && now > due
}

function dueLabel(request: ServiceRequest) {
  return dateOf(request) ? `${formatDate(dateOf(request))} · ${endOf(request) ? clockText(endOf(request)) : 'end of activity'}` : 'End of activity'
}

function chipFor(request: ServiceRequest, now: number) {
  if (request.status === 'Approved' && hasItems(request)) {
    return request.slipPrintedAt ? { label: 'Ready to release', tone: 'bg-emerald-50 text-emerald-700' } : { label: 'Print slip', tone: 'bg-amber-50 text-amber-800' }
  }
  if (request.status === 'Issued') return isOverdue(request, now) ? { label: 'Overdue', tone: 'bg-rose-50 text-rose-700' } : { label: 'Out', tone: 'bg-blue-50 text-blue-700' }
  if (request.status === 'For Repair' && pendingDamageAssets(request).length > 0) return { label: 'Decision needed', tone: 'bg-amber-50 text-amber-800' }
  if (request.status === 'Returned' && pendingAssets(request).length > 0) return { label: 'Missing items', tone: 'bg-rose-50 text-rose-700' }
  return STATUS_CHIPS[request.status] ?? { label: request.status, tone: 'bg-slate-100 text-slate-600' }
}

// Where a request is in the flow, for the step trail at the top of the panel.
function flowOf(request: ServiceRequest) {
  const inReview = TABS.review.statuses.includes(request.status)
  const withItems = hasItems(request) || (inReview && equipmentOf(request).length > 0)
  if (!withItems) return { steps: FLOW_VENUE_ONLY, current: inReview ? 0 : request.status === 'Completed' ? 2 : 1 }
  if (inReview) return { steps: FLOW_WITH_ITEMS, current: 0 }
  if (request.status === 'Approved') return { steps: FLOW_WITH_ITEMS, current: request.slipPrintedAt ? 2 : 1 }
  if (request.status === 'Issued' || request.status === 'For Repair') return { steps: FLOW_WITH_ITEMS, current: 3 }
  return { steps: FLOW_WITH_ITEMS, current: request.status === 'Completed' ? 5 : 4 }
}

// One participant count. Requests sent before 2026-11-15 have male and female counts, which are added up.
function participantsOf(request: ServiceRequest) {
  const countOf = (value: unknown) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : Number.NaN)
  const total = countOf(request.formData.participants)
  const parts = [countOf(request.formData.participantsMale), countOf(request.formData.participantsFemale)].filter(Number.isFinite)
  const count = Number.isFinite(total) ? total : parts.length > 0 ? parts.reduce((sum, part) => sum + part, 0) : Number.NaN
  return Number.isFinite(count) ? `${count} participant${count === 1 ? '' : 's'}` : 'Not set'
}

function natureOf(request: ServiceRequest) {
  const type = formText(request.formData.activityType)
  if (type === 'OTHER') {
    const other = formText(request.formData.otherActivityType)
    return other ? `Others: ${other}` : 'Others'
  }
  return NATURE_LABELS[type] ?? 'Not set'
}

// Two requests clash when they book the same venue on the same date and their times overlap.
function clashes(request: ServiceRequest, other: ServiceRequest) {
  return other.id !== request.id && BOOKED_STATUSES.includes(other.status)
    && venueOf(other).toLowerCase() === venueOf(request).toLowerCase()
    && dateOf(other) === dateOf(request)
    && startOf(request) < endOf(other) && startOf(other) < endOf(request)
}

// Compares the requested quantity with what the Item Master has available for that item.
function stockCheck(row: EquipmentRow, stockById: Map<string, InventoryItemRecord> | null) {
  const requested = Number(row.quantity) || 0
  if (!stockById) return { requested, label: 'Checking stock…', tone: 'bg-slate-100 text-slate-600' }
  const item = row.itemId ? stockById.get(String(row.itemId)) : undefined
  if (!item) return { requested, label: 'Not in Item Master', tone: 'bg-rose-50 text-rose-700' }
  if (REPAIR_CONDITIONS.includes(item.condition)) return { requested, label: `Under repair (${item.condition})`, tone: 'bg-rose-50 text-rose-700' }
  if (requested > item.availableQuantity) return { requested, label: `Short by ${requested - item.availableQuantity}`, tone: 'bg-amber-50 text-amber-800' }
  return { requested, label: 'Enough stock', tone: 'bg-emerald-50 text-emerald-700' }
}

// Same print setup as Asset Labels: one 50 × 30 mm label per page, everything else hidden.
const SLIP_PRINT_CSS = `
  @media print {
    @page { size: 50mm 30mm; margin: 0; }
    html, body { margin: 0 !important; padding: 0 !important; }
    body.printing-facility-slips > *:not(#facility-slip-labels) { display: none !important; }
    body.printing-facility-slips > #facility-slip-labels {
      display: block !important; position: static !important; inset: auto !important;
      width: 50mm !important; margin: 0 !important; padding: 0 !important; overflow: visible !important;
    }
    body.printing-facility-slips .facility-slip-label {
      box-sizing: border-box !important; display: flex !important; width: 50mm !important; height: 30mm !important;
      flex-direction: column; align-items: center; justify-content: flex-start; gap: 0.3mm;
      padding: 0.5mm 0.5mm 0 !important; border: 0 !important; overflow: hidden !important;
      page-break-inside: avoid; break-inside: avoid; page-break-after: always; break-after: page;
    }
    body.printing-facility-slips .facility-slip-label:last-child { page-break-after: auto; break-after: auto; }
    body.printing-facility-slips .facility-slip-label p {
      max-width: 49mm; margin: 0 !important; color: #000 !important; line-height: 1.1;
      white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;
    }
    body.printing-facility-slips .slip-reference { font-size: 4mm !important; font-weight: 800; }
    body.printing-facility-slips .slip-details { font-size: 2mm !important; font-weight: 700; }
    body.printing-facility-slips .slip-note { font-size: 1.7mm !important; font-weight: 900; letter-spacing: 0.1mm; }
    body.printing-facility-slips .slip-barcode { width: 49mm !important; max-width: 100% !important; margin: 0 auto !important; }
    body.printing-facility-slips .slip-barcode svg {
      display: block !important; width: 100% !important; height: auto !important; max-height: 17mm !important; margin: 0 auto;
    }
  }
`

export default function FacilityRequests() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [inventory, setInventory] = useState<InventoryItemRecord[] | null>(null)
  const [chosenTab, setChosenTab] = useState<Tab | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [scanError, setScanError] = useState('')
  // The slip that opened the current request, and whether its number was scanned or typed.
  const [scannedSlip, setScannedSlip] = useState<{ reference: string; method: EntryMethod } | null>(null)
  const entryTimingRef = useRef({ startedAt: 0, lastAt: 0, multiCharInsert: false })
  const [slipsToPrint, setSlipsToPrint] = useState<ServiceRequest[]>([])
  const [printing, setPrinting] = useState(false)
  const [now, setNow] = useState(0)
  // The request whose release pop-up is open (opened by scanning its printed slip).
  const [releaseId, setReleaseId] = useState('')
  // The request whose return pop-up is open (opened by scanning the slip of released items).
  const [returnId, setReturnId] = useState('')
  const scanInputRef = useRef<HTMLInputElement>(null)

  // State is set in promise callbacks, so the first load can start from an effect.
  const loadRequests = useCallback(() => listGsoRequests({ type: 'FACILITY_USE' })
    .then((rows) => { setRequests(rows); setError('') })
    .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load facility requests.'))
    .finally(() => setLoading(false)), [])

  const loadInventory = useCallback(() => listInventoryItems()
    .then(setInventory)
    .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load the Item Master.')), [])

  useEffect(() => { void loadRequests() }, [loadRequests])
  useEffect(() => { void loadInventory() }, [loadInventory])

  // A notification's Open link (?request=ID) opens that request in its stage, once after the first load.
  const deepLinkDone = useRef(false)
  useEffect(() => {
    if (deepLinkDone.current || loading || !requests.length) return
    deepLinkDone.current = true
    const id = new URLSearchParams(window.location.search).get('request')
    const match = id ? requests.find((request) => request.id === id) : undefined
    const matchTab = match ? tabOf(match) : null
    if (!match || !matchTab) return
    setChosenTab(matchTab)
    setSelectedId(match.id)
    setSearch('')
  }, [requests, loading])

  // Overdue depends on the clock, so it is refreshed every minute.
  useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0)
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [])

  // Printing works like Asset Labels: render the slips off-screen, then open the print dialog.
  useEffect(() => {
    if (!slipsToPrint.length) return
    const clearPrintMode = () => setSlipsToPrint([])
    document.body.classList.add('printing-facility-slips')
    window.addEventListener('afterprint', clearPrintMode, { once: true })
    const timer = window.setTimeout(() => window.print(), 50)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', clearPrintMode)
      document.body.classList.remove('printing-facility-slips')
    }
  }, [slipsToPrint])

  const counts = useMemo(() => {
    const totals: Record<Tab, number> = { review: 0, approved: 0, out: 0, close: 0 }
    for (const request of requests) {
      const key = tabOf(request)
      if (key) totals[key] += 1
    }
    return totals
  }, [requests])
  // Open the first stage that has work until a staff member picks one.
  const tab: Tab = chosenTab ?? TAB_ORDER.find((key) => counts[key] > 0) ?? 'review'
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return requests.filter((request) => tabOf(request) === tab
      && (!query || `${request.referenceNo} ${requesterName(request)} ${formText(request.formData.activity)} ${venueOf(request)}`.toLowerCase().includes(query)))
  }, [requests, search, tab])
  const selected = visible.find((request) => request.id === selectedId) || visible[0] || null
  const stockById = useMemo(() => inventory ? new Map(inventory.map((item) => [String(item.id), item] as const)) : null, [inventory])
  const clashing = useMemo(() => selected ? requests.filter((other) => clashes(selected, other)) : [], [requests, selected])
  const releaseRequest = requests.find((request) => request.id === releaseId && request.status === 'Approved' && hasItems(request)) ?? null
  const returnRequest = requests.find((request) => request.id === returnId && request.status === 'Issued' && openAssets(request).length > 0) ?? null

  function chooseTab(next: Tab) {
    setChosenTab(next)
    setSelectedId('')
    setNotice('')
  }

  // Times the input like Return Items does, to tell a scanner from typing.
  function handleScanInput(value: string) {
    const at = performance.now()
    if (value.length <= 1) {
      entryTimingRef.current = { startedAt: at, lastAt: at, multiCharInsert: false }
    } else {
      // A paste, autofill, or edit changes more than one character at a time; a scanner adds exactly one.
      if (value.length - scanCode.length !== 1) entryTimingRef.current.multiCharInsert = true
      entryTimingRef.current.lastAt = at
    }
    setScanCode(value)
    setScanError('')
  }

  // A scanned (or typed) slip opens its request in the right stage, ready for the next step.
  function handleScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = scanCode.trim().toUpperCase()
    const { startedAt, lastAt, multiCharInsert } = entryTimingRef.current
    const msPerChar = (lastAt - startedAt) / Math.max(code.length - 1, 1)
    const method: EntryMethod = !multiCharInsert && startedAt > 0 && code.length > 1 && msPerChar < SCANNER_MAX_MS_PER_CHAR ? 'scan' : 'typed'
    entryTimingRef.current = { startedAt: 0, lastAt: 0, multiCharInsert: false }
    setScanCode('')
    if (!code) return
    const match = requests.find((request) => request.referenceNo.toUpperCase() === code)
    const matchTab = match ? tabOf(match) : null
    if (!match || !matchTab) {
      setScanError(match ? `${match.referenceNo} is already ${match.status.toLowerCase()}.` : `${code} is not a facility request.`)
      return
    }
    setScanError('')
    setNotice('')
    setSearch('')
    setChosenTab(matchTab)
    setSelectedId(match.id)
    setScannedSlip({ reference: match.referenceNo, method })
    if (match.status === 'Approved' && hasItems(match) && match.slipPrintedAt) setReleaseId(match.id)
    if (match.status === 'Issued') setReturnId(match.id)
  }

  function closeRelease() {
    setReleaseId('')
    scanInputRef.current?.focus()
  }

  function closeReturn() {
    setReturnId('')
    scanInputRef.current?.focus()
  }

  async function afterChange(message: string, updated?: ServiceRequest) {
    setNotice(message)
    setScannedSlip(null)
    const nextTab = updated ? tabOf(updated) : null
    if (updated && nextTab) {
      setChosenTab(nextTab)
      setSelectedId(updated.id)
    } else {
      setSelectedId('')
    }
    await Promise.all([loadRequests(), loadInventory()])
    scanInputRef.current?.focus()
  }

  async function printSlips(targets: ServiceRequest[], reprint?: { reason: string; details: string }) {
    if (!targets.length || printing || slipsToPrint.length) return false
    setPrinting(true)
    setError('')
    try {
      if (reprint) await reprintFacilitySlip(targets[0].id, reprint)
      else await recordFacilitySlipPrints(targets.map((request) => request.id))
      setSlipsToPrint(targets)
      setNotice(reprint ? `Reprinting the slip for ${targets[0].referenceNo}.` : `Printing ${targets.length} slip${targets.length === 1 ? '' : 's'}.`)
      void loadRequests()
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The slip could not be printed. Try again.')
      return false
    } finally {
      setPrinting(false)
    }
  }

  return <GsoPageFrame activePage="Facilities and equipment" searchPlaceholder="Search reference, requester, venue...">
    <style>{SLIP_PRINT_CSS}</style>
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" /><div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border-18 border-white/4" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-[40%] h-64 w-64 rounded-full border-22 border-white/3" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GSO staff checks first</span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Facility Requests</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-blue-100">Check, release, and take back facility items in order.</p>
          <FacilitiesShortcuts active="requests" />
        </div>
      </section>

      <section className="space-y-3" aria-label="Facility request stages">
        <StageSelector active={tab} counts={counts} onChange={chooseTab} />
        <p className="min-h-5 text-[0.68rem] leading-relaxed text-slate-500">{TABS[tab].hint}</p>
        {error && <Banner tone="error">{error}</Banner>}
        {notice && <Banner tone="success">{notice}</Banner>}
      </section>

      <section className="grid gap-5 xl:grid-cols-2" aria-label="Facility request workflow">
        <section className="flex min-w-0 flex-col rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
          <div className="p-4 sm:p-5">
            <StepHeader step={1} total={2} status={selected ? 'done' : 'current'} titleId="facility-queue-title" title="Choose a request" description="Scan a slip, or pick a request from the list.">
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">{visible.length} request{visible.length === 1 ? '' : 's'}</span>
            </StepHeader>

            <form onSubmit={handleScan} className="mt-4 rounded-xl border-2 border-blue-200 bg-blue-50/60 p-3">
              <label htmlFor="facility-slip-scan" className={fieldLabel}>Scan slip</label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <BarcodeIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-600" />
                  <input id="facility-slip-scan" ref={scanInputRef} autoFocus autoComplete="off" value={scanCode} onChange={(event) => handleScanInput(event.target.value)} placeholder="Scan or type the REQ number" className="h-11 w-full rounded-xl border border-blue-300 bg-white pl-9 pr-3 text-xs font-bold uppercase tracking-wide text-slate-900 outline-none transition placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                </div>
                <button type="submit" disabled={!scanCode.trim()} className="h-11 shrink-0 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Open</button>
              </div>
              {scanError && <p role="alert" className="mt-2 text-[0.68rem] font-bold text-rose-700">{scanError}</p>}
            </form>

            <div className="mt-3 flex w-full gap-2">
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, requester, venue, or activity" aria-label="Search facility requests" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              <button type="button" onClick={() => { setLoading(true); void loadRequests() }} disabled={loading} className="h-11 shrink-0 rounded-xl border border-slate-300 bg-white px-4 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-wait disabled:opacity-60">{loading ? 'Loading…' : 'Refresh'}</button>
            </div>


            <div className="inventory-list-scrollbar mt-3 max-h-[58vh] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
              {loading && requests.length === 0 ? <p className="p-8 text-center text-xs font-semibold text-slate-400">Loading facility requests…</p>
                : visible.length === 0 ? <p className="p-8 text-center text-xs font-semibold text-slate-500">{search ? 'No requests match your search.' : TABS[tab].empty}</p>
                  : visible.map((request) => {
                    const chip = chipFor(request, now)
                    const isSelected = selected?.id === request.id
                    return <button key={request.id} type="button" onClick={() => { setSelectedId(request.id); setNotice('') }} aria-current={isSelected ? 'true' : undefined} className={`block w-full rounded-xl border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${isSelected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'}`}>
                      <span className="flex items-center justify-between gap-2"><span className="text-sm font-extrabold text-slate-900">{request.referenceNo}</span><span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${chip.tone}`}>{chip.label}</span></span>
                      <span className="mt-1.5 block truncate text-xs font-semibold text-slate-700">{requesterName(request)} · {formText(request.formData.departmentOrganization) || request.requesterEmail}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{venueOf(request) || 'Venue not set'} · {dateOf(request) ? formatDate(dateOf(request)) : 'Date not set'} · {timeRangeOf(request)}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{hasItems(request) ? `${unitsOf(request.assets)} item${unitsOf(request.assets) === 1 ? '' : 's'}` : 'Venue only'}{request.status === 'Issued' ? ` · Due ${dueLabel(request)}` : ''}</span>
                    </button>
                  })}
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-col rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-wide text-blue-700">Request</p><h2 className="mt-0.5 text-base font-black leading-tight text-slate-900">Request details</h2><p className="mt-1 text-sm leading-snug text-slate-600">Follow the steps from left to right.</p></div>
            <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">{TABS[tab].label}</span>
          </div>
          {!selected
            ? <EmptyState title={TABS[tab].empty} detail="Scan a slip or choose another stage." />
            : <ReviewPanel
              key={`${selected.id}:${selected.status}:${selected.updatedAt}`}
              request={selected}
              clashing={clashing}
              stockById={stockById}
              scanned={scannedSlip?.reference === selected.referenceNo}
              entryMethod={scannedSlip?.reference === selected.referenceNo ? scannedSlip.method : 'scan'}
              now={now}
              printing={printing}
              onPrint={printSlips}
              onRelease={() => setReleaseId(selected.id)}
              onReturn={() => setReturnId(selected.id)}
              onSaved={(message, updated) => void afterChange(message, updated)}
            />}
        </section>
      </section>
    </div>

    {releaseRequest && <ReleaseDialog
      key={releaseRequest.id}
      request={releaseRequest}
      entryMethod={scannedSlip?.method ?? 'scan'}
      onClose={closeRelease}
      onReleased={(message, updated) => {
        setReleaseId('')
        void afterChange(message, updated)
      }}
    />}

    {returnRequest && <ReturnDialog
      key={returnRequest.id}
      request={returnRequest}
      entryMethod={scannedSlip?.method ?? 'scan'}
      now={now}
      onClose={closeReturn}
      onReturned={(message, updated) => {
        setReturnId('')
        void afterChange(message, updated)
      }}
    />}

    {slipsToPrint.length > 0 && createPortal(<div id="facility-slip-labels" aria-hidden="true" className="fixed left-[-10000px] top-0">
      {slipsToPrint.map((request) => <SlipLabel key={request.id} request={request} />)}
    </div>, document.body)}
  </GsoPageFrame>
}

// Opens when a printed slip is scanned: confirm the requester is here, then hand over the slip.
// The requester brings the same slip back, and GSO scans it again for the return.
function ReleaseDialog({ request, entryMethod, onClose, onReleased }: { request: ServiceRequest; entryMethod: EntryMethod; onClose: () => void; onReleased: SaveHandler }) {
  const [isHere, setIsHere] = useState(false)
  const [slipGiven, setSlipGiven] = useState(false)
  const fullName = requesterName(request)
  const [receivedBy, setReceivedBy] = useState(fullName)
  const [typedReason, setTypedReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const firstCheckRef = useRef<HTMLInputElement>(null)
  // The receiver is recorded by first and last name.
  const receiverHasFullName = receivedBy.trim().split(/\s+/).filter(Boolean).length >= 2
  const ready = isHere && slipGiven && receiverHasFullName && (entryMethod === 'scan' || typedReason.trim().length > 0)
  const gaps = [
    !isHere && 'confirm the requester is here',
    !receiverHasFullName && 'enter the first and last name of the person taking the items',
    !slipGiven && 'confirm you gave the slip',
    entryMethod === 'typed' && !typedReason.trim() && 'give a reason for the typed REQ number',
  ].filter((gap): gap is string => Boolean(gap))
  const units = unitsOf(request.assets)

  useEffect(() => { firstCheckRef.current?.focus() }, [])
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  async function release() {
    if (!ready || busy) return
    const receiver = receivedBy.trim()
    setBusy(true)
    setError('')
    try {
      const updated = await updateGsoRequestStatus(request.id, {
        status: 'Issued',
        note: `Received by ${receiver}. Slip given for the return.`,
        entryMethod,
        ...(entryMethod === 'typed' ? { typedReason: typedReason.trim() } : {}),
      })
      onReleased(`${request.referenceNo} released to ${receiver}. Due ${dueLabel(request)}.`, updated)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The items were not released. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5" onClick={() => { if (!busy) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="release-dialog-title" onClick={(event) => event.stopPropagation()} className="flex max-h-[94vh] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-8 sm:py-5">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[#d6b333] bg-[#17377f] text-sm font-black text-white shadow-sm">{initialsOf(fullName)}</span>
          <div className="min-w-0">
            <EntryEyebrow method={entryMethod} action="Release items" />
            <h2 id="release-dialog-title" className="mt-0.5 text-base font-black text-slate-900 sm:text-lg">{request.referenceNo}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{[venueOf(request), dateOf(request) ? formatDate(dateOf(request)) : '', timeRangeOf(request)].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} disabled={busy} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:opacity-50">Close</button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-5 sm:px-7 sm:py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {entryMethod === 'typed' && <TypedNotice reason={typedReason} onChange={setTypedReason} />}
          <section aria-labelledby="release-requester" className={dialogSectionClass}>
            <DialogSectionHeader id="release-requester" title="1. Requester" detail="Release the items only when the requester is here." />
            <div className="flex items-center gap-3 rounded-xl border-2 border-slate-200 bg-slate-50/70 p-3.5">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-black text-blue-800">{initialsOf(fullName)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-slate-900">{fullName}</p>
                <p className="truncate text-xs font-semibold text-slate-500">{[formText(request.formData.departmentOrganization), request.requesterEmail].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <div className="mt-4"><CheckCard inputRef={firstCheckRef} checked={isHere} onChange={setIsHere} title="The requester is here" detail="They came to the GSO office to take the items." /></div>
            <label className="mt-4 block">
              <span className={dialogLabelClass}>Received by <span className="text-rose-600">*</span></span>
              <input value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)} maxLength={120} placeholder="First and last name" aria-invalid={!receiverHasFullName} className={dialogControlClass} />
              <span className={`mt-2 block text-xs ${receiverHasFullName ? 'text-slate-500' : 'font-semibold text-rose-700'}`}>{receiverHasFullName ? 'First and last name. Change it if someone else takes the items.' : 'Enter the first and last name of the person taking the items.'}</span>
            </label>
          </section>

          <section aria-labelledby="release-items" className={dialogSectionClass}>
            <DialogSectionHeader id="release-items" title="2. Items to release" detail={`${units} item${units === 1 ? '' : 's'} on this slip.`} />
            <ul className="space-y-2">
              {request.assets.map((asset) => <li key={asset.id} className="flex items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-white px-4 py-3">
                <span className="min-w-0"><span className="block truncate text-sm font-extrabold text-slate-900">{asset.itemName}</span><span className="block text-xs text-slate-500">{asset.itemCode}</span></span>
                <span className="shrink-0 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-blue-800">{asset.quantity} {asset.unitOfMeasure}</span>
              </li>)}
            </ul>
          </section>

          <section aria-labelledby="release-slip" className={dialogSectionClass}>
            <DialogSectionHeader id="release-slip" title="3. Give the slip" detail="The requester keeps the slip and brings it back with the items." />
            <CheckCard checked={slipGiven} onChange={setSlipGiven} title="I gave the slip to the requester" detail={`Return by ${dueLabel(request)}. GSO scans the slip again for the return.`} />
          </section>

          <DialogHint gaps={gaps} />
          {error && <Banner tone="error">{error}</Banner>}
        </div>
      </div>

      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-between sm:px-7">
        <button type="button" onClick={onClose} disabled={busy} className={dialogCancelButton}>Cancel</button>
        <button type="button" onClick={() => void release()} disabled={!ready || busy} className={dialogPrimaryButton}>{busy ? 'Releasing…' : 'Release items'}</button>
      </div>
    </section>
  </div>
}

function EntryEyebrow({ method, action }: { method: EntryMethod; action: string }) {
  return <p className={`inline-flex items-center gap-1.5 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] ${method === 'typed' ? 'text-amber-700' : 'text-blue-600'}`}>
    <BarcodeIcon className="h-3.5 w-3.5" /> {method === 'typed' ? 'REQ number typed' : 'Slip scanned'} · {action}
  </p>
}

// Shown when the REQ number was typed instead of scanned, like Return Items does for a typed code.
function TypedNotice({ reason, onChange }: { reason: string; onChange: (value: string) => void }) {
  return <section aria-labelledby="typed-slip-title" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-md shadow-slate-300/35 sm:p-5">
    <div className="mb-3 border-b border-amber-200 pb-3">
      <h3 id="typed-slip-title" className="text-sm font-extrabold text-amber-950">The REQ number was typed, not scanned</h3>
      <p className="mt-1 text-sm leading-relaxed text-amber-900">The audit log marks this action as typed. Choose a reason below, or write your own.</p>
    </div>
    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Quick reasons">
      {TYPED_REASONS.map((option) => <button key={option} type="button" onClick={() => onChange(option)} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold transition ${reason === option ? 'border-amber-500 bg-white text-amber-950 ring-2 ring-amber-200' : 'border-amber-300 bg-white/70 text-amber-900 hover:bg-white'}`}>{option}</button>)}
    </div>
    <label className="block">
      <span className={dialogLabelClass}>Reason <span className="text-rose-600">*</span></span>
      <input value={reason} onChange={(event) => onChange(event.target.value)} maxLength={300} placeholder="For example: the scanner is not working" className={dialogControlClass} />
    </label>
  </section>
}

// Tells the staff member what is still missing before the primary button can be pressed.
function DialogHint({ gaps }: { gaps: string[] }) {
  if (gaps.length === 0) return null
  return <div role="status" className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-900">
    <span className="font-extrabold">To continue, please:</span> {gaps.join('; ')}.
  </div>
}

function DialogSectionHeader({ id, title, detail }: { id: string; title: string; detail: string }) {
  return <div className="mb-4 border-b border-slate-100 pb-3">
    <h3 id={id} className="text-sm font-extrabold text-slate-900">{title}</h3>
    <p className="mt-1 text-sm text-slate-600">{detail}</p>
  </div>
}

// The same choice card as the Item Master Data pop-ups, with a checkbox.
function CheckCard({ checked, onChange, title, detail, inputRef }: {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  detail: string
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  return <label className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition ${checked ? 'border-blue-400 bg-blue-50/70 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
    <input ref={inputRef} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
    <span>
      <span className="block text-sm font-extrabold text-slate-900">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-slate-600">{detail}</span>
    </span>
  </label>
}

const completeCount = (asset: RequestAsset) => ({ returned: String(asset.quantity), damaged: '0', condition: DAMAGE_CONDITION, repairBy: '' })

// Opens when the slip of released items is scanned: confirm the items are being returned, then check each item.
// Missing units wait for settlement; damaged units send the request to For Repair until they are fixed.
function ReturnDialog({ request, entryMethod, now, onClose, onReturned }: { request: ServiceRequest; entryMethod: EntryMethod; now: number; onClose: () => void; onReturned: SaveHandler }) {
  const [typedReason, setTypedReason] = useState('')
  const fullName = requesterName(request)
  const open = openAssets(request)
  const [isReturning, setIsReturning] = useState(false)
  const [returnedBy, setReturnedBy] = useState(fullName)
  const [checkedAll, setCheckedAll] = useState(false)
  const [counts, setCounts] = useState<ReturnDraft>(() => Object.fromEntries(open.map((asset) => [String(asset.id), completeCount(asset)])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const firstCheckRef = useRef<HTMLInputElement>(null)

  const lines = open.map((asset) => {
    const entry = counts[String(asset.id)] ?? completeCount(asset)
    const returned = Number(entry.returned)
    const damaged = Number(entry.damaged)
    const returnedValid = entry.returned.trim() !== '' && Number.isInteger(returned) && returned >= 0 && returned <= Number(asset.quantity)
    const damagedValid = returnedValid && entry.damaged.trim() !== '' && Number.isInteger(damaged) && damaged >= 0 && damaged <= returned
    // A Needs Repair item must say who repairs it (GSO or ITSS).
    const needsRepairOwner = damagedValid && damaged > 0
    const repairByValid = !needsRepairOwner || REPAIR_OWNERS.some((owner) => owner.value === entry.repairBy)
    return { asset, entry, returned, damaged, returnedValid, damagedValid, needsRepairOwner, repairByValid, missing: returnedValid ? Number(asset.quantity) - returned : 0 }
  })
  const allValid = lines.every((line) => line.returnedValid && line.damagedValid && line.repairByValid)
  const missingTotal = lines.reduce((total, line) => total + line.missing, 0)
  const damagedTotal = lines.reduce((total, line) => total + (line.damagedValid ? line.damaged : 0), 0)
  const receiverHasFullName = returnedBy.trim().split(/\s+/).filter(Boolean).length >= 2
  const ready = isReturning && checkedAll && allValid && receiverHasFullName && (entryMethod === 'scan' || typedReason.trim().length > 0)
  const gaps = [
    !isReturning && 'confirm the items are being returned now',
    !receiverHasFullName && 'enter the first and last name of the person returning the items',
    !allValid && 'fix the counts in step 2 (numbers must fit the released quantity)',
    !checkedAll && 'tick "I checked every item"',
    entryMethod === 'typed' && !typedReason.trim() && 'give a reason for the typed REQ number',
  ].filter((gap): gap is string => Boolean(gap))
  const outcome = damagedTotal > 0 ? 'For Repair' : 'Returned'
  const findings = [missingTotal > 0 ? `${missingTotal} missing` : '', damagedTotal > 0 ? `${damagedTotal} damaged` : ''].filter(Boolean).join(', ')
  // What happens to each unit: the good ones go back to stock now, the damaged ones wait in To Be Repaired.
  const backToStock = lines.reduce((total, line) => total + (line.returnedValid && line.damagedValid ? line.returned - line.damaged : 0), 0)
  const recorded = [backToStock > 0 ? `${backToStock} back to stock` : '', damagedTotal > 0 ? `${damagedTotal} to repair` : '', missingTotal > 0 ? `${missingTotal} missing` : ''].filter(Boolean).join(', ')

  useEffect(() => { firstCheckRef.current?.focus() }, [])
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  function setCount(assetId: string, change: Partial<ReturnDraft[string]>) {
    setCheckedAll(false)
    setCounts((current) => ({ ...current, [assetId]: { ...(current[assetId] ?? { returned: '0', damaged: '0', condition: DAMAGE_CONDITION, repairBy: '' }), ...change } }))
  }

  async function confirm() {
    if (!ready || busy) return
    const receiver = returnedBy.trim()
    setBusy(true)
    setError('')
    try {
      const updated = await updateGsoRequestStatus(request.id, {
        status: outcome,
        note: `Returned by ${receiver}. ${findings ? `Items: ${findings}.` : 'All items complete.'}`,
        entryMethod,
        ...(entryMethod === 'typed' ? { typedReason: typedReason.trim() } : {}),
        returns: lines.map((line) => ({
          assetId: String(line.asset.id),
          returned: line.returned,
          damaged: line.damaged,
          condition: line.damaged > 0 ? DAMAGE_CONDITION : 'Good',
          ...(line.needsRepairOwner ? { repairBy: line.entry.repairBy } : {}),
        })),
      })
      onReturned(`${request.referenceNo} returned by ${receiver}. ${findings ? `${findings[0].toUpperCase()}${findings.slice(1)}.` : 'All items complete.'}`, updated)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The return was not saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5" onClick={() => { if (!busy) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="return-dialog-title" onClick={(event) => event.stopPropagation()} className="flex max-h-[94vh] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-8 sm:py-5">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[#d6b333] bg-[#17377f] text-sm font-black text-white shadow-sm">{initialsOf(fullName)}</span>
          <div className="min-w-0">
            <EntryEyebrow method={entryMethod} action="Return items" />
            <h2 id="return-dialog-title" className="mt-0.5 text-base font-black text-slate-900 sm:text-lg">{request.referenceNo}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{[venueOf(request), dateOf(request) ? formatDate(dateOf(request)) : '', timeRangeOf(request)].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} disabled={busy} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:opacity-50">Close</button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-5 sm:px-7 sm:py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {entryMethod === 'typed' && <TypedNotice reason={typedReason} onChange={setTypedReason} />}
          <section aria-labelledby="return-who" className={dialogSectionClass}>
            <DialogSectionHeader id="return-who" title="1. Returning the items" detail="Confirm that the items are being returned now." />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-slate-50/70 p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-black text-blue-800">{initialsOf(fullName)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-900">{fullName}</p>
                  <p className="truncate text-xs font-semibold text-slate-500">{[formText(request.formData.departmentOrganization), request.requesterEmail].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${isOverdue(request, now) ? 'bg-rose-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>{isOverdue(request, now) ? 'Overdue' : 'Due'} · {dueLabel(request)}</span>
            </div>
            <div className="mt-4"><CheckCard inputRef={firstCheckRef} checked={isReturning} onChange={setIsReturning} title="The items are being returned now" detail="The requester, or someone for them, brought the items and the slip." /></div>
            <label className="mt-4 block">
              <span className={dialogLabelClass}>Returned by <span className="text-rose-600">*</span></span>
              <input value={returnedBy} onChange={(event) => setReturnedBy(event.target.value)} maxLength={120} placeholder="First and last name" aria-invalid={!receiverHasFullName} className={dialogControlClass} />
              <span className={`mt-2 block text-xs ${receiverHasFullName ? 'text-slate-500' : 'font-semibold text-rose-700'}`}>{receiverHasFullName ? 'First and last name. Change it if someone else brought the items.' : 'Enter the first and last name of the person returning the items.'}</span>
            </label>
          </section>

          <section aria-labelledby="return-check" className={dialogSectionClass}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <h3 id="return-check" className="text-sm font-extrabold text-slate-900">2. Check each item</h3>
                <p className="mt-1 text-sm text-slate-600">Count what came back. Items that need repair go to Repair &amp; Maintenance, where the repair check is done.</p>
              </div>
              <button type="button" onClick={() => { setCounts(Object.fromEntries(open.map((asset) => [String(asset.id), completeCount(asset)]))); setCheckedAll(false) }} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800">Mark all complete</button>
            </div>
            <div className="space-y-3">
              {lines.map((line) => {
                const id = String(line.asset.id)
                const complete = line.returnedValid && line.damagedValid && line.missing === 0 && line.damaged === 0
                return <div key={id} className={`rounded-xl border-2 p-4 transition ${complete ? 'border-emerald-200 bg-white' : 'border-amber-200 bg-amber-50/40'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-slate-900">{line.asset.itemName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{line.asset.itemCode} · Released {line.asset.quantity} {line.asset.unitOfMeasure}</p>
                    </div>
                    <span className="flex flex-wrap gap-1.5">
                      {complete && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-emerald-700">Complete</span>}
                      {line.returnedValid && line.missing > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-rose-700">{line.missing} missing</span>}
                      {line.damagedValid && line.damaged > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[0.62rem] font-extrabold text-amber-800">{line.damaged} to repair</span>}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className={dialogLabelClass}>Returned</span>
                      <input type="number" min={0} max={line.asset.quantity} step={1} inputMode="numeric" value={line.entry.returned} onChange={(event) => setCount(id, { returned: event.target.value })} aria-invalid={!line.returnedValid} className={`${dialogControlClass} ${line.returnedValid ? '' : 'border-rose-400'}`} />
                    </label>
                    <label className="block">
                      <span className={dialogLabelClass}>Needs repair</span>
                      <input type="number" min={0} max={line.returnedValid ? line.returned : undefined} step={1} inputMode="numeric" value={line.entry.damaged} onChange={(event) => setCount(id, { damaged: event.target.value })} aria-invalid={!line.damagedValid} className={`${dialogControlClass} ${line.damagedValid ? '' : 'border-rose-400'}`} />
                    </label>
                  </div>
                  {line.needsRepairOwner && <div className="mt-3">
                    <span className={dialogLabelClass}>Who checks if it can be fixed?</span>
                    <div role="radiogroup" aria-label={`Who checks ${line.asset.itemName}`} className="mt-2 grid gap-2 sm:grid-cols-2">
                      {REPAIR_OWNERS.map((owner) => {
                        const chosen = line.entry.repairBy === owner.value
                        return <button key={owner.value} type="button" role="radio" aria-checked={chosen} onClick={() => setCount(id, { repairBy: owner.value })} className={`rounded-xl border-2 px-3.5 py-2.5 text-left transition ${chosen ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
                          <span className="block text-xs font-extrabold text-slate-900">{owner.label}</span>
                          <span className="mt-0.5 block text-[0.68rem] font-medium text-slate-500">{owner.detail}</span>
                        </button>
                      })}
                    </div>
                    {!line.repairByValid && <p className="mt-2 text-xs font-semibold text-rose-700">Choose who checks it: GSO or ITSS.</p>}
                  </div>}
                  {line.returnedValid && line.damagedValid && <p className="mt-2 text-xs font-semibold text-slate-600">
                    <span className="text-emerald-700">{line.returned - line.damaged} back to stock</span>
                    {line.damaged > 0 && <span className="text-amber-800"> · {line.damaged} to repair</span>}
                    {line.missing > 0 && <span className="text-rose-700"> · {line.missing} missing</span>}
                  </p>}
                  {!line.returnedValid && <p className="mt-2 text-xs font-semibold text-rose-700">Enter a number from 0 to {line.asset.quantity}.</p>}
                  {line.returnedValid && !line.damagedValid && <p className="mt-2 text-xs font-semibold text-rose-700">Damaged must be a number from 0 to {line.returned} (the number returned).</p>}
                </div>
              })}
            </div>
          </section>

          <section aria-labelledby="return-confirm" className={dialogSectionClass}>
            <DialogSectionHeader id="return-confirm" title="3. Confirm" detail={outcome === 'For Repair' ? 'Items that need repair are saved as For Repair. They stay out of stock until the repair check is done.' : 'Everything came back. The items go back to stock.'} />
            {missingTotal > 0 && <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800"><span className="font-extrabold">{missingTotal} missing.</span> They are recorded as missing and are not added back to stock.</p>}
            <CheckCard checked={checkedAll} onChange={setCheckedAll} title="I checked every item" detail={recorded ? `Recorded: ${recorded}.` : 'Nothing counted yet.'} />
          </section>

          <DialogHint gaps={gaps} />
          {error && <Banner tone="error">{error}</Banner>}
        </div>
      </div>

      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-between sm:px-7">
        <button type="button" onClick={onClose} disabled={busy} className={dialogCancelButton}>Cancel</button>
        <button type="button" onClick={() => void confirm()} disabled={!ready || busy} className={dialogPrimaryButton}>{busy ? 'Saving return…' : 'Confirm return'}</button>
      </div>
    </section>
  </div>
}

function ReviewPanel({ request, clashing, stockById, scanned, entryMethod, now, printing, onPrint, onRelease, onReturn, onSaved }: {
  request: ServiceRequest
  clashing: ServiceRequest[]
  stockById: Map<string, InventoryItemRecord> | null
  scanned: boolean
  entryMethod: EntryMethod
  now: number
  printing: boolean
  onPrint: (targets: ServiceRequest[], reprint?: { reason: string; details: string }) => Promise<boolean>
  onRelease: () => void
  onReturn: () => void
  onSaved: SaveHandler
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const reference = request.referenceNo
  const flow = flowOf(request)
  const rows = equipmentOf(request)
  const inReview = TABS.review.statuses.includes(request.status)
  const pending = pendingAssets(request)
  const pendingDamage = pendingDamageAssets(request)
  const unserviceableDamage = request.assets.filter((asset) => Number(asset.damagedQuantity || 0) > 0 && asset.conditionIn === 'Unserviceable')
  // Items the Item Master cannot cover right now. Approval would fail, so it is blocked here with the reason.
  const stockProblems = rows.flatMap((row) => {
    const check = stockCheck(row, stockById)
    return ['Enough stock', 'Checking stock…'].includes(check.label) ? [] : [`${row.name || 'Item'} (${check.label.toLowerCase()})`]
  })
  const rejectReasons = [
    { label: 'Not enough stock', text: stockProblems.length > 0 ? `Not enough stock: ${stockProblems.join(', ')}.` : 'Not enough stock for the items requested.' },
    { label: 'Venue not available', text: 'The venue is not available at this time. Please choose another time or venue.' },
    { label: 'Missing details', text: 'Some details are missing or unclear. Please send a new request.' },
  ]

  function reject() {
    if (!note.trim()) {
      setError('Add a reason before you reject. Pick one above or type your own.')
      noteRef.current?.focus()
      return
    }
    void changeStatus('Rejected', `${reference} was rejected.`)
  }

  async function changeStatus(status: string, message: string) {
    setBusy(true)
    setError('')
    try {
      const updated = await updateGsoRequestStatus(request.id, { status, note: note.trim() })
      onSaved(message, updated)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The change was not saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"><FacilitySummary request={request} now={now} /></div>
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white px-3.5 pb-3 pt-1"><FlowTrail steps={flow.steps} current={flow.current} /></div>

    {inReview && <>
      <section className="mt-5 border-t border-slate-200 pt-5">
        <StepHeader step={2} total={2} status="current" titleId={`facility-step-${request.id}`} title="Check venue and items" description="Venue free and stock enough?" />
        <div className={`mt-4 rounded-xl border px-3.5 py-3 text-xs font-semibold leading-relaxed ${clashing.length > 0 ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {clashing.length > 0
            ? <><span className="font-extrabold">Venue clash:</span> {venueOf(request)} on {formatDate(dateOf(request))} from {clockText(startOf(request))} to {clockText(endOf(request))} overlaps {clashing.map((other) => other.referenceNo).join(', ')}.</>
            : <><span className="font-extrabold">Venue is free</span> at this time.</>}
        </div>
        <div className="mt-3 space-y-2">
          {rows.length === 0
            ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4 text-center text-xs font-semibold text-slate-500">No items requested.</p>
            : rows.map((row, index) => {
              const check = stockCheck(row, stockById)
              return <div key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-slate-900">{row.name || 'Item'}</p>
                  <p className="mt-0.5 truncate text-[0.68rem] text-slate-500">{[row.description, row.itemCode].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex items-center gap-2 text-[0.68rem] font-semibold text-slate-600">
                  <span>{check.requested} {row.unit || 'pcs'}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${check.tone}`}>{check.label}</span>
                </div>
              </div>
            })}
        </div>
      </section>

      <section className="mt-5 border-t border-slate-200 pt-5" aria-label="Decide">
        {(clashing.length > 0 || stockProblems.length > 0) && <div role="status" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold leading-relaxed text-rose-800">
          <span className="font-extrabold">Approve blocked:</span> {clashing.length > 0 ? 'venue already booked.' : `not enough stock (${stockProblems.join(', ')}).`}
        </div>}
        <p className={fieldLabel}>Reject reason</p>
        <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Quick reasons">
          {rejectReasons.map((reason) => <button key={reason.label} type="button" onClick={() => { setNote(reason.text); setError('') }} className={`rounded-full border px-3 py-1.5 text-[0.68rem] font-extrabold transition ${note === reason.text ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'}`}>{reason.label}</button>)}
        </div>
        <textarea ref={noteRef} value={note} onChange={(event) => { setNote(event.target.value); setError('') }} maxLength={2000} aria-label="Reason" className="min-h-20 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-xs font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Pick one above or type it." />
        <ActionBar error={error}>
          <button type="button" disabled={busy} onClick={reject} className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-extrabold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50">Reject</button>
          <button type="button" disabled={busy || clashing.length > 0 || stockProblems.length > 0} onClick={() => void changeStatus('Approved', rows.length > 0 ? `${reference} approved. Print its slip next.` : `${reference} approved.`)} className={primaryButton}>{busy ? 'Saving…' : 'Approve'}</button>
        </ActionBar>
      </section>
    </>}

    {request.status === 'Approved' && hasItems(request) && !request.slipPrintedAt && <section className="mt-5 border-t border-slate-200 pt-5">
      <StepHeader step={2} total={2} status="current" titleId={`facility-step-${request.id}`} title="Print the slip" description="Print the 50 × 30 mm slip and attach it to the items." />
      <div className="mt-4 flex flex-wrap items-start gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
        <div className="w-52.5 shrink-0 rounded-lg border border-slate-300 bg-white p-2 shadow-sm"><SlipLabel request={request} /></div>
        <AssetList assets={request.assets} />
      </div>
      <ActionBar error={error}>
        <button type="button" disabled={printing} onClick={() => void onPrint([request])} className={primaryButton}>{printing ? 'Preparing…' : 'Print slip'}</button>
      </ActionBar>
    </section>}

    {request.status === 'Approved' && hasItems(request) && request.slipPrintedAt && <section className="mt-5 border-t border-slate-200 pt-5">
      <StepHeader step={2} total={2} status="current" titleId={`facility-step-${request.id}`} title="Release the items" description="When the requester arrives, scan the slip. A pop-up asks you to confirm the release." />
      <ScanCheck scanned={scanned} reference={reference} method={entryMethod} />
      <div className="mt-3"><AssetList assets={request.assets} /></div>
      <SlipPrinted request={request} printing={printing} onReprint={(reprint) => onPrint([request], reprint)} />
      <ActionBar error={error}>
        <button type="button" disabled={!scanned} onClick={onRelease} className={primaryButton}>Release items</button>
      </ActionBar>
    </section>}

    {request.status === 'Issued' && <section className="mt-5 border-t border-slate-200 pt-5">
      <StepHeader step={2} total={2} status="current" titleId={`facility-step-${request.id}`} title="Take back the items" description="When the requester brings the items back, scan the slip. A pop-up asks you to check each item." />
      <DueLine request={request} now={now} />
      <ScanCheck scanned={scanned} reference={reference} method={entryMethod} />
      <div className="mt-3"><AssetList assets={openAssets(request)} /></div>
      <ActionBar error={error}>
        <button type="button" disabled={!scanned} onClick={onReturn} className={primaryButton}>Return items</button>
      </ActionBar>
    </section>}

    {request.status === 'For Repair' && <section className="mt-5 border-t border-slate-200 pt-5">
      <StepHeader step={2} total={2} status="current" titleId={`facility-step-${request.id}`} title={pendingDamage.length > 0 ? 'Resolve the unserviceable item' : 'Items under repair'} description={pendingDamage.length > 0 ? 'Record the no-charge decision for the unserviceable item. The new workflow will define the next settlement step.' : 'Mark them repaired when they are fixed. The stock comes back then.'} />
      <div className="mt-4"><ReturnedList assets={request.assets} /></div>
      {pendingDamage.length > 0
        ? <div className="mt-4"><DamageSettlementRow request={request} assets={pendingDamage} onSettled={onSaved} /></div>
        : <ActionBar error={error}>
          <button type="button" disabled={busy} onClick={() => void changeStatus('Returned', `${reference}: ${unserviceableDamage.length > 0 ? 'the unserviceable item settlement is complete.' : 'repaired items are back in stock.'}`)} className={primaryButton}>{busy ? 'Saving…' : unserviceableDamage.length > 0 ? 'Mark return resolved' : 'Mark repaired'}</button>
        </ActionBar>}
    </section>}

    {request.status === 'Returned' && <section className="mt-5 border-t border-slate-200 pt-5">
      {pending.length > 0
        ? <StepHeader step={2} total={2} status="current" titleId={`facility-step-${request.id}`} title={pendingDamage.length > 0 ? 'Resolve returned item issues' : 'Settle missing items'} description={pendingDamage.length > 0 ? 'Resolve any unserviceable returned item, then settle missing items.' : 'Choose how each missing item was settled.'} />
        : <StepHeader step={2} total={2} status="current" titleId={`facility-step-${request.id}`} title="Everything is back or settled" description="The request closes by itself." />}
      {pendingDamage.length > 0 && <div className="mt-4"><DamageSettlementRow request={request} assets={pendingDamage} onSettled={onSaved} /></div>}
      {pendingMissingAssets(request).length > 0 && <div className="mt-4 space-y-3">
        {pendingMissingAssets(request).map((asset) => <SettleRow key={asset.id} request={request} asset={asset} onSettled={onSaved} />)}
      </div>}
      <div className="mt-4"><ReturnedList assets={request.assets} /></div>
    </section>}
  </>
}

function DamageSettlementRow({ request, assets, onSettled }: { request: ServiceRequest; assets: RequestAsset[]; onSettled: SaveHandler }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ready = Boolean(reason.trim())

  async function save() {
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      const updated = await saveFacilityDamageDecision(request.id, reason.trim())
      onSettled(`No-charge decision recorded for the unserviceable item in ${request.referenceNo}.`, updated)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The damage decision was not saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="rounded-xl border-2 border-amber-200 bg-amber-50/50 p-3.5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-extrabold text-slate-900">Unserviceable returned item{assets.length === 1 ? '' : 's'}</p>
        <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-600">{assets.map((asset) => `${asset.itemName} · ${asset.damagedQuantity || 0} ${asset.unitOfMeasure}`).join('; ')}</p>
      </div>
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[0.62rem] font-extrabold text-amber-800">Decision needed</span>
    </div>
    <div className="mt-3">
      <p className="mb-2 text-[0.68rem] font-semibold leading-relaxed text-slate-600">Record the no-charge decision to complete this settlement step.</p>
      <label className="block"><span className={fieldLabel}>Reason for no charge <span className="text-rose-600">*</span></span><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Why is the charge waived for now?" className={inputClass} /></label>
    </div>
    {error && <div className="mt-3"><Banner tone="error">{error}</Banner></div>}
    <div className="mt-3 flex justify-end"><button type="button" disabled={!ready || busy} onClick={() => void save()} className={primaryButton}>{busy ? 'Saving…' : 'Record no-charge decision'}</button></div>
  </div>
}

function SettleRow({ request, asset, onSettled }: { request: ServiceRequest; asset: RequestAsset; onSettled: SaveHandler }) {
  const [choice, setChoice] = useState<FacilitySettlement | ''>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const needsNote = choice === 'Waived'

  async function save() {
    if (!choice) return
    setBusy(true)
    setError('')
    try {
      const updated = await settleFacilityItem(request.id, String(asset.id), { status: choice, note: note.trim() || undefined })
      onSettled(`${asset.itemName}: ${choice}.`, updated)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The settlement was not saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="rounded-xl border-2 border-rose-200 bg-rose-50/40 p-3.5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-extrabold text-slate-900">{asset.itemName}</p>
        <p className="mt-0.5 text-[0.68rem] text-slate-500">{asset.itemCode}</p>
      </div>
      <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[0.62rem] font-extrabold text-rose-700">{asset.lostQuantity} {asset.unitOfMeasure} missing</span>
    </div>
    <div role="radiogroup" aria-label={`Settle ${asset.itemName}`} className="mt-3 grid gap-2 sm:grid-cols-3">
      {SETTLEMENT_CHOICES.map((option) => {
        const picked = choice === option.value
        return <button key={option.value} type="button" role="radio" aria-checked={picked} onClick={() => setChoice(option.value)} className={`rounded-xl border-2 p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${picked ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
          <span className="block text-xs font-extrabold text-slate-900">{option.value}</span>
          <span className="mt-0.5 block text-[0.62rem] leading-snug text-slate-600">{option.detail}</span>
        </button>
      })}
    </div>
    {choice && <label className="mt-3 block">
      <span className={fieldLabel}>{choice === 'Waived' ? 'Reason (required)' : choice === 'Paid' ? 'Payment details' : 'Note'}</span>
      <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder={choice === 'Paid' ? 'OR number and amount' : choice === 'Waived' ? 'Why no payment is needed' : 'Optional'} className={inputClass} />
    </label>}
    {error && <div className="mt-3"><Banner tone="error">{error}</Banner></div>}
    <div className="mt-3 flex justify-end">
      <button type="button" disabled={busy || !choice || (needsNote && !note.trim())} onClick={() => void save()} className={primaryButton}>{busy ? 'Saving…' : 'Save settlement'}</button>
    </div>
  </div>
}

function SlipPrinted({ request, printing, onReprint }: { request: ServiceRequest; printing: boolean; onReprint: (reprint: { reason: string; details: string }) => Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const ready = reason && (reason !== 'Other' || details.trim())

  async function reprint() {
    if (!ready) return
    if (await onReprint({ reason, details: details.trim() })) {
      setOpen(false)
      setReason('')
      setDetails('')
    }
  }

  return <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[0.68rem] font-semibold text-slate-600"><span className="font-extrabold text-slate-800">Slip printed</span>{request.slipPrintedBy ? ` by ${request.slipPrintedBy}` : ''}{request.slipPrintedAt ? ` · ${formatDateTime(request.slipPrintedAt)}` : ''}</p>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="text-[0.68rem] font-extrabold text-blue-700 hover:text-blue-900">{open ? 'Cancel reprint' : 'Reprint'}</button>
    </div>
    {open && <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label className="block">
        <span className={fieldLabel}>Reason</span>
        <select value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass}>
          <option value="">Choose a reason</option>
          {SLIP_REPRINT_REASONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={fieldLabel}>Details{reason === 'Other' ? ' (required)' : ''}</span>
        <input value={details} onChange={(event) => setDetails(event.target.value)} maxLength={300} placeholder="Optional" className={inputClass} />
      </label>
      <button type="button" disabled={!ready || printing} onClick={() => void reprint()} className={quietButton}>{printing ? 'Preparing…' : 'Reprint slip'}</button>
    </div>}
  </div>
}

function ScanCheck({ scanned, reference, method }: { scanned: boolean; reference: string; method: EntryMethod }) {
  const typed = scanned && method === 'typed'
  return <div role="status" className={`mt-4 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${scanned && !typed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
    <BarcodeIcon className="h-4 w-4 shrink-0" />
    {typed
      ? <span><span className="font-extrabold">REQ number typed.</span> {reference} matches. It is flagged in the audit log.</span>
      : scanned
        ? <span><span className="font-extrabold">Slip scanned.</span> {reference} matches.</span>
        : <span><span className="font-extrabold">Scan the slip for {reference}</span> in the Scan slip box above. If the scanner is not working, type the REQ number instead.</span>}
  </div>
}

function ActionBar({ error, children }: { error: string; children: ReactNode }) {
  return <>
    {error && <div className="mt-4"><Banner tone="error">{error}</Banner></div>}
    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">{children}</div>
  </>
}

function AssetList({ assets }: { assets: RequestAsset[] }) {
  return <ul className="min-w-0 flex-1 space-y-2">
    {assets.map((asset) => <li key={asset.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
      <span className="min-w-0"><span className="block truncate text-xs font-extrabold text-slate-900">{asset.itemName}</span><span className="block text-[0.68rem] text-slate-500">{asset.itemCode}</span></span>
      <span className="shrink-0 text-xs font-extrabold text-slate-800">{asset.quantity} {asset.unitOfMeasure}</span>
    </li>)}
  </ul>
}

function ReturnedList({ assets }: { assets: RequestAsset[] }) {
  return <ul className="space-y-2">
    {assets.map((asset) => {
      const lost = Number(asset.lostQuantity || 0)
      const damaged = Number(asset.damagedQuantity || 0)
      return <li key={asset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
        <span className="min-w-0"><span className="block truncate text-xs font-extrabold text-slate-900">{asset.itemName}</span><span className="block text-[0.68rem] text-slate-500">{asset.itemCode} · Returned {asset.returnedQuantity ?? 0} of {asset.quantity}</span>
          {damaged > 0 && <span className="mt-0.5 block text-[0.68rem] font-semibold text-slate-600">{damaged} damaged · {Number(asset.repairedQuantity || 0)} repaired · {Number(asset.unserviceableQuantity || 0)} unserviceable · {Math.max(0, damaged - Number(asset.repairedQuantity || 0) - Number(asset.unserviceableQuantity || 0))} still waiting{asset.repairOwner ? ` · repair by ${asset.repairOwner}` : ''}</span>}
        </span>
        <span className="flex flex-wrap gap-1.5">
          {damaged > 0 && <span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${asset.settlementStatus === 'Pending' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{damaged} damaged · {asset.conditionIn}{asset.settlementStatus ? ` · ${asset.settlementStatus}` : ''}</span>}
          {lost > 0 && <span className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${asset.settlementStatus === 'Pending' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>
            {lost} missing · {asset.settlementStatus === 'Pending' ? 'Not settled' : `${asset.settlementStatus}${asset.settledBy ? ` by ${asset.settledBy}` : ''}`}
          </span>}
          {damaged === 0 && lost === 0 && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-emerald-700">Complete</span>}
        </span>
      </li>
    })}
  </ul>
}

function DueLine({ request, now }: { request: ServiceRequest; now: number }) {
  const overdue = isOverdue(request, now)
  return <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${overdue ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-700'}`}>
    <span><span className="font-extrabold">Due:</span> {dueLabel(request)}</span>
    {overdue && <span className="rounded-full bg-rose-600 px-2.5 py-1 text-[0.62rem] font-extrabold text-white">Overdue · the requester gets a reminder about once a day</span>}
  </div>
}

function FacilitySummary({ request, now }: { request: ServiceRequest; now: number }) {
  const chip = chipFor(request, now)
  const purpose = formText(request.formData.purpose)
  const remarks = formText(request.formData.remarks)
  const itemCount = hasItems(request) ? unitsOf(request.assets) : equipmentOf(request).reduce((total, row) => total + (Number(row.quantity) || 0), 0)
  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
      <div className="min-w-0">
        <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">{request.referenceNo}</p>
        <h3 className="mt-1 text-lg font-black text-slate-900">{requesterName(request)}</h3>
        <p className="mt-0.5 text-xs font-semibold text-slate-600">{[formText(request.formData.requesterEmployeeCode), formText(request.formData.departmentOrganization) || 'Department not set'].filter(Boolean).join(' · ')}</p>
        <p className="mt-0.5 text-[0.65rem] text-slate-500">{request.requesterEmail}</p>
      </div>
      <span className={`rounded-full px-2.5 py-1.5 text-[0.62rem] font-extrabold ${chip.tone}`}>{chip.label}</span>
    </div>
    <div className="mt-2 rounded-xl border border-blue-100 bg-white px-3.5 py-3">
      <p className="text-sm font-black leading-snug text-slate-900">{formText(request.formData.venue) || 'Venue not set'} <span className="font-semibold text-slate-400">·</span> {dateOf(request) ? formatDate(dateOf(request)) : 'Date not set'} <span className="font-semibold text-slate-400">·</span> {timeRangeOf(request) || 'Time not set'}</p>
      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{participantsOf(request)} <span className="text-slate-300">·</span> {natureOf(request)} <span className="text-slate-300">·</span> {itemCount > 0 ? `${itemCount} item${itemCount === 1 ? '' : 's'}` : 'Venue only'}</p>
    </div>
    <div className="mt-2 space-y-1 text-xs leading-relaxed text-slate-700">
      <p><span className="font-extrabold text-slate-500">Activity: </span>{formText(request.formData.activity) || 'Not set'}</p>
      {purpose && <p><span className="font-extrabold text-slate-500">Purpose: </span>{purpose}</p>}
      {remarks && <p className="text-slate-600"><span className="font-extrabold text-slate-500">Remarks: </span>{remarks}</p>}
    </div>
  </div>
}

// Same look as the request progress path: circles joined by a line, finished steps checked.
function FlowTrail({ steps, current }: { steps: string[]; current: number }) {
  return <ol aria-label="Request steps" className="mt-3 flex min-w-[18rem] items-start">
    {steps.map((step, index) => {
      const done = index < current
      const active = index === current
      return <li key={step} aria-current={active ? 'step' : undefined} className="flex min-w-0 flex-1 items-start last:flex-none">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <span className={`grid h-6 w-6 place-items-center rounded-full border-2 text-[0.6rem] font-black ${done ? 'border-emerald-500 bg-emerald-500 text-white' : active ? 'border-blue-600 bg-white text-blue-700 ring-4 ring-blue-100' : 'border-slate-300 bg-white text-slate-400'}`}>{done ? '✓' : index + 1}</span>
          <span className={`whitespace-nowrap text-[0.6rem] font-extrabold ${done || active ? 'text-slate-800' : 'text-slate-400'}`}>{step}</span>
        </div>
        {index < steps.length - 1 && <span aria-hidden="true" className={`mx-1.5 mt-3 h-0.5 min-w-4 flex-1 rounded-full ${done ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
      </li>
    })}
  </ol>
}

function SlipBarcode({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    JsBarcode(svgRef.current, value, {
      format: 'CODE128',
      displayValue: false,
      lineColor: '#000000',
      background: '#ffffff',
      width: 1,
      height: 64,
      margin: 10,
    })
  }, [value])

  return <svg ref={svgRef} role="img" aria-label={`Barcode ${value}`} className="mx-auto h-11 max-w-full" />
}

// One 50 × 30 mm slip: the barcode is the REQ number, so a scan opens the request.
function SlipLabel({ request }: { request: ServiceRequest }) {
  const units = unitsOf(request.assets)
  return <article className="facility-slip-label bg-white text-center text-black">
    <div className="slip-barcode"><SlipBarcode value={request.referenceNo} /></div>
    <p className="slip-reference text-sm font-extrabold">{request.referenceNo}</p>
    <p className="slip-details truncate text-[0.6rem] font-bold">{[venueOf(request), dateOf(request) ? formatDate(dateOf(request)) : ''].filter(Boolean).join(' · ')}</p>
    <p className="slip-note text-[0.5rem] font-black tracking-wide">GSO SLIP · {units} ITEM{units === 1 ? '' : 'S'} · RETURN AFTER USE</p>
  </article>
}

function BarcodeIcon({ className }: { className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12" />
  </svg>
}

function StepHeader({ step, total, status, titleId, title, description, children }: {
  step: number
  total: number
  status: StepStatus
  titleId: string
  title: string
  description: string
  children?: ReactNode
}) {
  const styles = stepStyles[status]
  return <div className="flex items-start gap-3">
    <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black ${styles.badge}`}>
      {status === 'done'
        ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
        : step}
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className={`text-xs font-extrabold uppercase tracking-wide ${styles.label}`}>Step {step} of {total}{styles.suffix}</p>
          <h2 id={titleId} className="mt-0.5 text-base font-black leading-tight text-slate-900">{title}</h2>
        </div>
        {children}
      </div>
      <p className="mt-1 text-sm leading-snug text-slate-600">{description}</p>
    </div>
  </div>
}

function StageSelector({ active, counts, onChange }: { active: Tab; counts: Record<Tab, number>; onChange: (tab: Tab) => void }) {
  return <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="group" aria-label="Facility request stages">
    {TAB_ORDER.map((key, index) => {
      const selected = key === active
      return <button key={key} type="button" aria-pressed={selected} onClick={() => onChange(key)} className={`rounded-xl border-2 p-3 text-left shadow-md transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${selected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-300/80 bg-white shadow-slate-300/35 ring-1 ring-slate-900/5 hover:border-blue-300 hover:bg-blue-50/40'}`}>
        <span className={`block text-xs font-extrabold ${selected ? 'text-blue-800' : 'text-slate-900'}`}><span className={selected ? 'text-blue-600' : 'text-slate-400'}>{index + 1}.</span> {TABS[key].label}</span>
        <span className={`mt-1 block text-[0.68rem] font-semibold ${selected ? 'text-blue-700' : 'text-slate-500'}`}>{counts[key]} request{counts[key] === 1 ? '' : 's'}</span>
      </button>
    })}
  </div>
}
