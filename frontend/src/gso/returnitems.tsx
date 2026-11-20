import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getCurrentUser } from '../auth/authApi'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { ProgressPath } from '../components/requestpath'
import {
  confirmTaggedAssetReturn,
  getAssetTagForInspection,
  sendTaggedReturnOtp,
  type AssetTagInspectionRecord,
  type TaggedReturnOtpChallenge,
} from './issuancesApi'

const assetTagCodePattern = /^(?:AST-(?:[A-Z0-9]{13}|[A-F0-9]{20})|[A-Z0-9]{13}|[A-F0-9]{20})$/i
const barcodeScanQuietPeriodMs = 220
// USB scanners type a label in a burst of a few ms per character; people take far longer.
const scannerMaxMsPerChar = 35
const returnReasons = ['Tapos na gamitin', 'Sira o may depekto', 'Lilipat ng opisina', 'Resigned o end of contract', 'Hindi na kailangan', 'Iba pa']
// Stored values stay as they are (audit records use them). Only the labels shown on screen are in English.
const returnReasonLabels: Record<string, string> = {
  'Tapos na gamitin': 'Finished using it',
  'Sira o may depekto': 'Damaged or defective',
  'Lilipat ng opisina': 'Office transfer',
  'Resigned o end of contract': 'Resigned or end of contract',
  'Hindi na kailangan': 'No longer needed',
  'Iba pa': 'Other',
}
// Best to worst, to spot a return that lowers the condition on record.
const conditionRank = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable']
const repairConditionNames = ['Needs Repair', 'Under Maintenance', 'Unserviceable']
// Why a unit cannot be used. Required when the unit goes to repair, so the reason is recorded, not just the condition.
const repairReasons = ['Broken or cracked', 'Beyond repair', 'Missing parts', 'Water or fire damage', 'Electrical fault', 'Other']
const conditionGroups = [
  { title: 'Back to stock', hint: 'Usable right away', conditions: ['New', 'Good', 'Fair'], dot: 'bg-emerald-500' },
  { title: 'For repair', hint: 'Goes to To Be Repaired', conditions: ['Needs Repair'], dot: 'bg-amber-500' },
]

type ReturnScanNotice = {
  kind: 'success' | 'alreadyReturned'
  message: string
  employeeLinks: Array<{ employeeCode: string; employeeName: string; label: string }>
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

const historyDotTones = { blue: 'bg-blue-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500' }

function StepBadge({ number, done }: { number: number; done: boolean }) {
  return (
    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.62rem] font-black ${done ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'}`}>
      {done ? (
        <svg aria-label="Done" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="m5 12 5 5 9-10" /></svg>
      ) : number}
    </span>
  )
}

export default function ReturnItems() {
  const [scannerCode, setScannerCode] = useState('')
  const scannerInputRef = useRef<HTMLInputElement>(null)
  const scannerLookupTimerRef = useRef<number | null>(null)
  const barcodeLookupInFlightRef = useRef(false)
  const entryTimingRef = useRef({ startedAt: 0, lastAt: 0, multiCharInsert: false })
  const [entryMethod, setEntryMethod] = useState<'scan' | 'typed'>('scan')
  const [staffName, setStaffName] = useState('')
  const [hasPhysicalCheck, setHasPhysicalCheck] = useState(false)
  const [otpChallenge, setOtpChallenge] = useState<TaggedReturnOtpChallenge | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const otpInputRef = useRef<HTMLInputElement>(null)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [hasScannerFocus, setHasScannerFocus] = useState(false)
  const [scannedTag, setScannedTag] = useState<AssetTagInspectionRecord | null>(null)
  const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false)
  const [isConfirmingReturn, setIsConfirmingReturn] = useState(false)
  const [barcodeError, setBarcodeError] = useState('')
  const [returnMessage, setReturnMessage] = useState<ReturnScanNotice | null>(null)
  const [returnCondition, setReturnCondition] = useState('Good')
  const [returnReason, setReturnReason] = useState('')
  const [returnNote, setReturnNote] = useState('')
  const [repairReason, setRepairReason] = useState('')
  // Who checks whether the unit can still be fixed: GSO or ITSS.
  const [repairOwner, setRepairOwner] = useState<'GSO' | 'ITSS' | ''>('')
  const [writeOffConfirmed, setWriteOffConfirmed] = useState(false)
  const [returnedByName, setReturnedByName] = useState('')
  const [serialLast4, setSerialLast4] = useState('')

  useEffect(() => () => {
    if (scannerLookupTimerRef.current !== null) {
      window.clearTimeout(scannerLookupTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let active = true
    getCurrentUser()
      .then((user) => { if (active) setStaffName(user.name || user.email) })
      .catch(() => { /* The popup falls back to a generic label. */ })
    return () => { active = false }
  }, [])

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

    const code = value.trim()
    const { startedAt, lastAt, multiCharInsert } = entryTimingRef.current
    const msPerChar = (lastAt - startedAt) / Math.max(code.length - 1, 1)
    const method = !multiCharInsert && startedAt > 0 && code.length > 1 && msPerChar < scannerMaxMsPerChar ? 'scan' : 'typed'

    barcodeLookupInFlightRef.current = true
    setIsLookingUpBarcode(true)
    setBarcodeError('')
    setReturnMessage(null)
    let foundTag = false
    try {
      const tag = await getAssetTagForInspection(tagCode)
      if (tag.custodyStatus !== 'Issued' || !tag.employeeCode) {
        setScannerCode('')
        setScannedTag(null)
        const latestReturn = tag.borrowerHistory?.find((borrower) => borrower.status === 'Returned' && borrower.returnedAt)
        if (latestReturn || tag.lifecycleStatus === 'Disposed') {
          setReturnMessage({
            kind: 'alreadyReturned',
            message: latestReturn
              ? `${tag.tagCode} was already returned on ${formatBorrowerHistoryDate(latestReturn.returnedAt)}${latestReturn.returnCondition ? ` in ${latestReturn.returnCondition} condition` : ''}.`
              : `${tag.tagCode} was already recorded as lost or written off and is not available to return again.`,
            employeeLinks: latestReturn
              ? [{ employeeCode: latestReturn.employeeCode, employeeName: latestReturn.employeeName, label: 'View return history' }]
              : [],
          })
          setBarcodeError('')
        } else {
          setBarcodeError(`${tag.tagCode} is not currently assigned to an employee.`)
        }
        return
      }
      setScannedTag(tag)
      foundTag = true
      setEntryMethod(method)
      setReturnCondition(['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable'].includes(tag.condition) ? tag.condition : 'Good')
      setReturnReason('')
      setReturnNote('')
    setRepairReason('')
    setRepairOwner('')
    setWriteOffConfirmed(false)
      setHasPhysicalCheck(false)
      setOtpChallenge(null)
      setOtpCode('')
      setReturnedByName('')
      setSerialLast4('')
    } catch (error) {
      setScannedTag(null)
      // Clear the box so the next scan starts fresh; the error keeps the code that failed.
      setScannerCode('')
      setBarcodeError(`${tagCode}: ${error instanceof Error ? error.message : 'Could not find that item barcode.'}`)
    } finally {
      barcodeLookupInFlightRef.current = false
      setIsLookingUpBarcode(false)
      if (!foundTag) focusScannerInput()
    }
  }

  function handleScannerInputChange(value: string) {
    const now = performance.now()
    if (value.length <= 1) {
      entryTimingRef.current = { startedAt: now, lastAt: now, multiCharInsert: false }
    } else {
      // A paste, autofill, or edit changes more than one character at a time; a scanner adds exactly one.
      if (value.length - scannerCode.length !== 1) entryTimingRef.current.multiCharInsert = true
      entryTimingRef.current.lastAt = now
    }
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
    setReturnReason('')
    setReturnNote('')
    setRepairReason('')
    setRepairOwner('')
    setWriteOffConfirmed(false)
    setHasPhysicalCheck(false)
    setOtpChallenge(null)
    setOtpCode('')
    setReturnedByName('')
    setSerialLast4('')
    setBarcodeError('')
    focusScannerInput()
  }

  async function handleSendReturnOtp() {
    if (!scannedTag) return
    setIsSendingOtp(true)
    setBarcodeError('')
    try {
      setOtpChallenge(await sendTaggedReturnOtp(scannedTag.tagCode))
      setOtpCode('')
      window.setTimeout(() => otpInputRef.current?.focus(), 50)
    } catch (error) {
      setBarcodeError(error instanceof Error ? error.message : 'Could not send the code to the employee.')
    } finally {
      setIsSendingOtp(false)
    }
  }

  async function handleReturnConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!scannedTag || !otpChallenge) return

    setIsConfirmingReturn(true)
    setBarcodeError('')
    try {
      const note = returnNote.trim()
      const result = await confirmTaggedAssetReturn(scannedTag.tagCode, {
        condition: returnCondition,
        reason: [isRepairTag ? repairReason : '', isRepairTag && repairOwner ? (repairOwner === 'ITSS' ? 'Sent to ITSS to check' : 'GSO checks') : '', note].filter(Boolean).length > 0
          ? `${effectiveReturnReason} — ${[isRepairTag ? repairReason : '', isRepairTag && repairOwner ? (repairOwner === 'ITSS' ? 'Sent to ITSS to check' : 'GSO checks') : '', note].filter(Boolean).join(': ')}`
          : effectiveReturnReason,
        entryMethod,
        ...(isRepairTag && repairOwner ? { repairOwner } : {}),
        returnedByName: returnedByName.trim(),
        ...(needsSerialCheck ? { serialLast4 } : {}),
        otpChallengeId: otpChallenge.challengeId,
        otp: otpCode,
      })
      setScannedTag(null)
      setScannerCode('')
      setReturnReason('')
      setReturnNote('')
    setRepairReason('')
    setRepairOwner('')
    setWriteOffConfirmed(false)
      setHasPhysicalCheck(false)
      setOtpChallenge(null)
      setOtpCode('')
      setReturnedByName('')
      setSerialLast4('')
      const completedMessage = `${result.tagCode} was returned for ${result.employeeName} and routed to ${result.destination}. This label no longer works; peel it off the unit. A new label prints when the unit is issued again.`
      setReturnMessage({
        kind: 'success',
        message: `${completedMessage} ${result.emailQueued ? `A receipt is being emailed to ${result.employeeName}.` : 'No receipt email could be sent; inform the employee directly.'}`,
        employeeLinks: [
          { employeeCode: result.employeeCode, employeeName: result.employeeName, label: 'View return history' },
        ],
      })
      focusScannerInput(50)
    } catch (error) {
      setBarcodeError(error instanceof Error ? error.message : 'Could not confirm this item return.')
    } finally {
      setIsConfirmingReturn(false)
    }
  }

  const currentAssignment = scannedTag?.borrowerHistory?.find((entry) => entry.status === 'Issued')
  const issuerCode = scannedTag?.issuedByCode ?? scannedTag?.employeeCode ?? ''
  const issuerName = scannedTag?.issuedByName ?? scannedTag?.employeeName ?? '—'
  const holderIsIssuer = scannedTag?.employeeCode === issuerCode
  const roomDesignated = Boolean(scannedTag?.assignedLocation)
  const custodyEvents = (scannedTag?.borrowerHistory ?? [])
    .flatMap((entry) => {
      const issued = {
        key: `issued-${entry.employeeCode}-${entry.issuedAt}`,
        at: entry.issuedAt,
        title: `Issued to ${entry.employeeName}`,
        detail: [entry.employeeCode, entry.department, entry.status === 'Issued' ? (holderIsIssuer && roomDesignated ? 'Designated to the room, under this employee' : 'Currently with this employee') : ''].filter(Boolean).join(' · '),
        tone: 'blue' as const,
      }
      if (!entry.returnedAt) return [issued]
      const returned = {
        key: `returned-${entry.employeeCode}-${entry.returnedAt}`,
        at: entry.returnedAt,
        title: `Returned by ${entry.employeeName}`,
        detail: entry.returnCondition ? `Came back in ${entry.returnCondition} condition` : '',
        tone: repairConditionNames.includes(entry.returnCondition ?? '') ? ('amber' as const) : ('emerald' as const),
      }
      return [issued, returned]
    })
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
  const recordedConditionRank = conditionRank.indexOf(scannedTag?.condition ?? '')
  const isConditionDowngrade = recordedConditionRank >= 0 && conditionRank.indexOf(returnCondition) > recordedConditionRank
  const isRepairTag = repairConditionNames.includes(returnCondition)
  // A unit with a serial on file is matched by the last characters read off the unit, not the screen.
  const serialTailLength = Math.min(4, (scannedTag?.serialNumber ?? '').replace(/[^A-Za-z0-9]/g, '').length)
  const needsSerialCheck = serialTailLength > 0
  const isSerialEntered = !needsSerialCheck || serialLast4.length === serialTailLength
  // A typed code or a condition downgrade needs a written explanation for the audit log.
  // A unit that goes to repair is recorded as damaged; its reason comes from the repair reason chips.
  const effectiveReturnReason = isRepairTag ? 'Sira o may depekto' : returnReason
  const isNoteRequired = effectiveReturnReason === 'Iba pa' || isConditionDowngrade || entryMethod === 'typed'
  const missingForReturn = !effectiveReturnReason
    ? 'Select the reason for return.'
    : isRepairTag && !repairReason
      ? 'Choose why the unit cannot be used.'
    : isRepairTag && !repairOwner
      ? 'Choose who checks it: GSO or ITSS.'
    : returnCondition === 'Unserviceable' && !writeOffConfirmed
      ? 'Confirm the write-off for the unserviceable unit.'
    : isNoteRequired && !returnNote.trim()
      ? 'Add the return notes.'
      : !isSerialEntered
        ? 'Enter the last characters of the serial number on the unit.'
      : !hasPhysicalCheck
        ? 'Confirm the physical check.'
        : !otpChallenge
          ? "Send the code to the employee."
          : otpCode.length !== 6
            ? "Enter the employee's 6-digit code."
            : ''
  const isInspectionDone = Boolean(effectiveReturnReason) && (!isNoteRequired || Boolean(returnNote.trim())) && isSerialEntered && hasPhysicalCheck

  return (
    <GsoPageFrame activePage="Return Items" searchPlaceholder="Search returned asset, code, or employee...">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              Asset Custody &amp; Tracking
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Returned Items</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
              Scan the unique barcode for an individually tracked item. Record returns for items tracked by quantity by count.
            </p>
          </div>
          
        </div>
        <nav className="relative mt-6 flex flex-wrap gap-2 border-t border-blue-400/20 pt-4" aria-label="Returns and records pages">
          <a href="/gso/return-items" aria-current="page" className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-blue-950 shadow-md">
            + Return Items
          </a>
        </nav>
      </section>

      <section className="mt-6 rounded-2xl border-2 border-slate-300/80 bg-white p-6 sm:p-8 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="return-process-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="return-process-title" className="text-lg font-black tracking-tight text-slate-900">Process an item return</h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Scan the barcode on an individually tagged unit, like a laptop.
            </p>
          </div>
        </div>

        <div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-blue-200 bg-blue-50/70 px-5 py-4">
            <div>
              <p className="flex items-center gap-2.5 text-sm font-extrabold text-blue-900" role="status" aria-live="polite">
                <span className={`h-3 w-3 rounded-full ${isLookingUpBarcode ? 'animate-pulse bg-amber-500' : hasScannerFocus ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {isLookingUpBarcode ? 'Reading barcode...' : scannedTag ? 'Inspection in progress' : hasScannerFocus ? 'Scanner ready' : 'Scanner waiting for focus'}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">Scan the label on one unit. The code appears in the box below and the item details pop up automatically. If the label is damaged, type the code and press Enter.</p>
            </div>
            <button type="button" onClick={() => focusScannerInput()} disabled={isLookingUpBarcode || Boolean(scannedTag)} className="rounded-xl border-2 border-blue-200 bg-white px-4 py-2.5 text-xs font-extrabold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">
              Focus scanner
            </button>
          </div>
          <form onSubmit={handleBarcodeLookup} aria-label="USB barcode scanner input" className="mt-4 flex gap-3">
            <input
              ref={scannerInputRef}
              type="text"
              value={scannerCode}
              onChange={(event) => handleScannerInputChange(event.target.value)}
              onFocus={(event) => {
                setHasScannerFocus(true)
                // Select any leftover code so the next scan replaces it instead of appending.
                event.currentTarget.select()
              }}
              onBlur={() => setHasScannerFocus(false)}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              placeholder="Scan the barcode here…"
              aria-label="Scan an individually tracked item barcode"
              disabled={isLookingUpBarcode || Boolean(scannedTag) || isConfirmingReturn}
              className="h-16 min-w-0 flex-1 rounded-xl border-2 border-dashed border-blue-300 bg-white px-5 font-mono text-lg font-bold uppercase tracking-wider text-slate-800 outline-none transition placeholder:font-sans placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-solid focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
            />
            <button type="submit" disabled={isLookingUpBarcode || Boolean(scannedTag) || isConfirmingReturn || !scannerCode.trim()} className="h-16 shrink-0 rounded-xl bg-blue-600 px-8 text-sm font-extrabold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {isLookingUpBarcode ? 'Reading…' : 'Find'}
            </button>
          </form>
          {barcodeError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{barcodeError}</p>}
          {returnMessage && (
            <div role="status" className={`mt-3 rounded-xl border px-3.5 py-3 text-xs font-semibold ${returnMessage.kind === 'alreadyReturned' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
              <p>{returnMessage.message}</p>
              {returnMessage.employeeLinks.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {returnMessage.employeeLinks.map((employee) => (
                    <a
                      key={`${employee.employeeCode}-${employee.label}`}
                      href={`/gso/employees?employeeCode=${encodeURIComponent(employee.employeeCode)}&view=history`}
                      className="font-extrabold underline underline-offset-2 hover:no-underline"
                    >
                      {employee.label}: {employee.employeeName}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {scannedTag && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-confirm-title"
            onKeyDown={(event) => { if (event.key === 'Escape') closeScannedTagDialog() }}
            className="flex max-h-[94vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/30"
          >
            <form onSubmit={(event) => void handleReturnConfirmation(event)} className="flex min-h-0 flex-1 flex-col">
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/80 px-5 py-4 sm:px-7">
                <div className="min-w-0">
                  <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">
                    Item return · <span className="font-mono tracking-normal">{scannedTag.tagCode}</span>
                  </p>
                  <h2 id="return-confirm-title" className="mt-1 truncate text-lg font-black text-slate-950 sm:text-xl">{scannedTag.itemName}{scannedTag.itemDescription && scannedTag.itemDescription.trim().toLowerCase() !== scannedTag.itemName.trim().toLowerCase() ? <span className="font-semibold text-slate-600"> · {scannedTag.itemDescription}</span> : null}</h2>
                  {currentAssignment && <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">Issued</span>}
                  <p className="mt-0.5 text-xs text-slate-500">
                    From <span className="font-bold text-slate-700">{scannedTag.employeeName}</span> · processed by <span className="font-bold text-slate-700">{staffName || 'your account'}</span>
                  </p>
                </div>
                <button type="button" disabled={isConfirmingReturn} onClick={closeScannedTagDialog} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">Close</button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/80">
                <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                  <aside className="space-y-4">
                    {entryMethod === 'typed' && (
                      <p role="note" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-900">
                        Typed, not scanned. Add a note why. It is flagged in the audit log.
                      </p>
                    )}

                    <dl className="grid grid-cols-2 gap-2">
                      {([
                        { label: 'Item code', value: `${scannedTag.itemCode} · Unit ${scannedTag.unitNumber}`, note: '' },
                        { label: 'Issued by', value: issuerName, note: [issuerCode, scannedTag.issuedByDepartment].filter(Boolean).join(' · ') },
                        holderIsIssuer && roomDesignated
                          ? { label: 'Used by', value: 'Not assigned to a person', note: `Designated to the room. Under ${issuerName}.` }
                          : { label: 'Used by', value: scannedTag.employeeName ?? '—', note: holderIsIssuer ? 'Same as issued by' : [scannedTag.employeeCode, currentAssignment?.department].filter(Boolean).join(' · ') },
                        { label: 'Location', value: scannedTag.assignedLocation || 'No room recorded', note: '' },
                        { label: 'Issued on', value: formatBorrowerHistoryDate(currentAssignment?.issuedAt ?? null), note: '' },
                        { label: 'Condition on record', value: scannedTag.condition, note: '' },
                      ]).map((tile) => (
                        <div key={tile.label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                          <dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">{tile.label}</dt>
                          <dd className="mt-0.5 wrap-break-word text-xs font-bold text-slate-800">
                            {tile.value || '—'}
                            {tile.note && <span className="mt-0.5 block text-[0.62rem] font-semibold text-slate-500">{tile.note}</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    {/* Return steps, not the issuance lifecycle: inspect the unit, confirm with the employee, then it is returned. */}
                    <ProgressPath steps={['Inspect', 'Confirm', 'Returned']} current={isInspectionDone ? 1 : 0} />

                    <section aria-labelledby="return-history-title">
                      <h3 id="return-history-title" className="text-[0.65rem] font-black uppercase tracking-wide text-slate-500">History</h3>
                      {custodyEvents.length > 0 ? (
                        <ol className="mt-3 space-y-4 border-l-2 border-slate-100 pl-4">
                          {custodyEvents.map((event) => (
                            <li key={event.key} className="relative">
                              <span aria-hidden="true" className={`absolute -left-5.5 top-1 h-2.5 w-2.5 rounded-full ${historyDotTones[event.tone]}`} />
                              <p className="text-xs font-bold text-slate-800">{event.title}</p>
                              <p className="text-[0.62rem] font-semibold text-slate-400">{formatBorrowerHistoryDate(event.at)}</p>
                              {event.detail && <p className="mt-0.5 text-[0.65rem] leading-relaxed text-slate-600">{event.detail}</p>}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-2 text-[0.68rem] text-slate-500">No custody history recorded for this unit yet.</p>
                      )}
                    </section>

                    <p className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3 text-[0.68rem] leading-relaxed text-slate-600">
                      <span className="font-extrabold text-slate-700">New holder?</span> Issue it from{' '}
                      <a href="/gso/main-issuance" className="font-extrabold text-blue-700 underline underline-offset-2 hover:no-underline">Main Issuance</a>
                      {' '}after this return.
                    </p>
                  </aside>

                  <div className="space-y-4">
                    <section aria-labelledby="return-inspect-title" className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                      <div className="flex items-center gap-2.5">
                        <StepBadge number={1} done={isInspectionDone} />
                        <h3 id="return-inspect-title" className="text-sm font-black text-slate-900">Inspect the unit</h3>
                      </div>

                      <fieldset className="mt-4" disabled={isConfirmingReturn}>
                        <legend className="mb-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Condition after inspection</legend>
                        <div className="space-y-2">
                          {conditionGroups.map((group) => (
                            <div key={group.title} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                              <span className="flex w-28 shrink-0 items-center gap-1.5 text-[0.65rem] font-bold text-slate-500">
                                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${group.dot}`} />
                                {group.title}
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {group.conditions.map((condition) => (
                                  <label key={condition} className="cursor-pointer">
                                    <input
                                      type="radio"
                                      name="return-condition"
                                      value={condition}
                                      checked={returnCondition === condition}
                                      onChange={() => setReturnCondition(condition)}
                                      className="peer sr-only"
                                    />
                                    <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 peer-checked:border-blue-600 peer-checked:bg-blue-600 peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-blue-100">
                                      {condition === 'Needs Repair' && group.title === 'For repair' ? 'To check' : condition}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </fieldset>

                      <p className={`mt-3 rounded-xl border px-3 py-2.5 text-xs font-semibold ${isRepairTag ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
                        {isRepairTag ? 'Goes to To Be Repaired.' : 'Goes back to GSO Storage.'}
                      </p>
                      {isRepairTag && (
                        <div className="mt-3 rounded-xl border-2 border-rose-200 bg-rose-50/60 p-3.5">
                          <p className="text-sm font-black text-rose-900">Why can't it be used? <span className="text-xs font-semibold text-rose-700">(required)</span></p>
                          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Reason for repair">
                            {repairReasons.map((reason) => <button key={reason} type="button" onClick={() => setRepairReason(reason)} disabled={isConfirmingReturn} className={`rounded-full border-2 px-3 py-1.5 text-xs font-extrabold transition ${repairReason === reason ? 'border-rose-500 bg-white text-rose-800 ring-2 ring-rose-200' : 'border-rose-200 bg-white text-rose-800 hover:border-rose-300'}`}>{reason}</button>)}
                          </div>
                          <p className="mt-3 text-sm font-black text-rose-900">Who checks if it can be fixed? <span className="text-xs font-semibold text-rose-700">(required)</span></p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Who checks the unit">
                            {([
                              ['GSO', 'GSO checks it', 'GSO staff checks if it can still be fixed.'],
                              ['ITSS', 'Send to ITSS', 'ITSS checks if it can be fixed, then returns it to GSO.'],
                            ] as const).map(([value, label, detail]) => <button key={value} type="button" role="radio" aria-checked={repairOwner === value} onClick={() => setRepairOwner(value)} disabled={isConfirmingReturn} className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${repairOwner === value ? 'border-rose-500 bg-white ring-2 ring-rose-200' : 'border-rose-200 bg-white hover:border-rose-300'}`}>
                              <span className="block text-xs font-extrabold text-slate-900">{label}</span>
                              <span className="mt-0.5 block text-[0.7rem] font-semibold text-slate-600">{detail}</span>
                            </button>)}
                          </div>
                          {returnCondition === 'Unserviceable' && (
                            <label className="mt-3 flex items-start gap-2.5 rounded-lg border-2 border-rose-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900">
                              <input type="checkbox" checked={writeOffConfirmed} onChange={(event) => setWriteOffConfirmed(event.target.checked)} disabled={isConfirmingReturn} className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600" />
                              <span>I confirm this unit is unserviceable. It will be written off.</span>
                            </label>
                          )}
                        </div>
                      )}
                      {isConditionDowngrade && (
                        <p role="note" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900">
                          <strong>{scannedTag.condition}</strong> → <strong>{returnCondition}</strong>
                        </p>
                      )}

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {!isRepairTag && (
                        <label className="block">
                          <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Reason for return</span>
                          <select value={returnReason} onChange={(event) => setReturnReason(event.target.value)} required disabled={isConfirmingReturn} className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 placeholder:text-slate-500 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50">
                            <option value="" disabled>Select a reason</option>
                            {returnReasons.map((reason) => <option key={reason} value={reason}>{returnReasonLabels[reason]}</option>)}
                          </select>
                        </label>
                        )}
                        <label className={`block ${isRepairTag ? 'sm:col-span-2' : ''}`}>
                          <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Brought in by <span className="normal-case text-slate-400">(if not the borrower)</span></span>
                          <input type="text" maxLength={200} value={returnedByName} onChange={(event) => setReturnedByName(event.target.value)} disabled={isConfirmingReturn} placeholder="Name of the person at the counter" className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 placeholder:text-slate-500 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50" />
                        </label>
                      </div>
                      <label className="mt-3 block">
                        <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Notes <span className="normal-case text-slate-400">{isNoteRequired ? '(required)' : '(optional)'}</span></span>
                        {/* 900 leaves room for the reason prefix within the backend's 1000-character limit. */}
                        <textarea
                          maxLength={900}
                          value={returnNote}
                          onChange={(event) => setReturnNote(event.target.value)}
                          required={isNoteRequired}
                          disabled={isConfirmingReturn}
                          placeholder={entryMethod === 'typed'
                            ? 'Why was the code typed?'
                            : isConditionDowngrade
                              ? 'Describe the damage'
                              : returnReason === 'Iba pa'
                                ? 'Why is it being returned?'
                                : "Anything worth noting about the unit's condition"}
                          className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                        />
                      </label>
                      {needsSerialCheck && (
                        <label className="mt-3 block rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                          <span className="block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Serial number check</span>
                          <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                            Type the last {serialTailLength} characters of the serial printed on the unit itself (its sticker or engraving), not on the barcode label.
                          </span>
                          <input
                            type="text"
                            value={serialLast4}
                            onChange={(event) => setSerialLast4(event.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, serialTailLength))}
                            maxLength={serialTailLength}
                            required
                            disabled={isConfirmingReturn}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder={'•'.repeat(serialTailLength)}
                            aria-label="Last characters of the unit's serial number"
                            className="mt-2 h-10 w-32 rounded-xl border border-slate-200 bg-white px-3 text-center font-mono text-sm font-bold uppercase tracking-[0.3em] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                          />
                        </label>
                      )}
                      <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs font-semibold leading-relaxed text-slate-700">
                        <input type="checkbox" checked={hasPhysicalCheck} onChange={(event) => setHasPhysicalCheck(event.target.checked)} required disabled={isConfirmingReturn} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                        <span>I have the item, and the barcode matches.</span>
                      </label>
                    </section>

                    <section aria-labelledby="return-otp-title" className="rounded-2xl border-2 border-blue-200 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
                      <div className="flex items-center gap-2.5">
                        <StepBadge number={2} done={otpCode.length === 6} />
                        <h3 id="return-otp-title" className="text-sm font-black text-slate-900">Employee confirmation</h3>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-500">
                        A 6-digit code was emailed to {scannedTag.employeeName}. Ask for it only if they are returning this unit.
                      </p>
                      {otpChallenge ? (
                        <div className="mt-3">
                          <p className="text-xs text-slate-600">
                            Sent to <strong>{otpChallenge.sentTo}</strong> · expires {new Intl.DateTimeFormat('en-PH', { timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(otpChallenge.expiresAt))}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <input
                              ref={otpInputRef}
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              pattern="\d{6}"
                              maxLength={6}
                              required
                              value={otpCode}
                              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ''))}
                              disabled={isConfirmingReturn}
                              placeholder="••••••"
                              aria-label="Employee confirmation code"
                              className="h-11 w-40 rounded-xl border border-slate-200 bg-white px-3 text-center font-mono text-base font-bold tracking-[0.35em] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                            />
                            <button type="button" onClick={() => void handleSendReturnOtp()} disabled={isSendingOtp || isConfirmingReturn} className="rounded-xl px-3 py-2 text-xs font-extrabold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50">
                              {isSendingOtp ? 'Sending…' : 'Resend code'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => void handleSendReturnOtp()} disabled={isSendingOtp || isConfirmingReturn} className="mt-3 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-blue-700 disabled:opacity-50">
                          {isSendingOtp ? 'Sending code…' : 'Send code to employee'}
                        </button>
                      )}
                    </section>

                    {barcodeError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">{barcodeError}</p>}
                  </div>
                </div>
              </div>

              <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
                <p className="text-xs font-semibold text-slate-500" aria-live="polite">{missingForReturn || 'Ready to save.'}</p>
                <div className="flex gap-2">
                  <button type="button" disabled={isConfirmingReturn} onClick={closeScannedTagDialog} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={isConfirmingReturn || Boolean(missingForReturn)} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {isConfirmingReturn ? 'Saving return…' : 'Confirm return'}
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}
    </GsoPageFrame>
  )
}
