import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ProgressPath } from '../components/requestpath'
import { confirmBatchTaggedReturn, getAssetTagForInspection, sendBatchTaggedReturnOtp, type AssetTagInspectionRecord } from './issuancesApi'

// Shown inside Return Items when GSO Staff choose "Many units". The inspection rules match the single return.
const assetTagCodePattern = /^(?:AST-(?:[A-Z0-9]{13}|[A-F0-9]{20})|[A-Z0-9]{13}|[A-F0-9]{20})$/i
const barcodeScanQuietPeriodMs = 220
// USB scanners type a label in a burst of a few ms per character; people take far longer.
const scannerMaxMsPerChar = 35
const maxUnits = 50
const returnReasons = ['Tapos na gamitin', 'Sira o may depekto', 'Lilipat ng opisina', 'Resigned o end of contract', 'Hindi na kailangan', 'Iba pa']
const returnReasonLabels: Record<string, string> = {
  'Tapos na gamitin': 'Finished using it',
  'Sira o may depekto': 'Damaged or defective',
  'Lilipat ng opisina': 'Office transfer',
  'Resigned o end of contract': 'Resigned or end of contract',
  'Hindi na kailangan': 'No longer needed',
  'Iba pa': 'Other',
}
const repairReasons = ['Broken or cracked', 'Beyond repair', 'Missing parts', 'Water or fire damage', 'Electrical fault', 'Other']
// Best to worst, to spot a return that lowers the condition on record.
const conditionRank = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable']
const repairConditionNames = ['Needs Repair', 'Under Maintenance', 'Unserviceable']
const conditionGroups = [
  { title: 'Back to stock', conditions: ['New', 'Good', 'Fair'], dot: 'bg-emerald-500' },
  { title: 'For repair', conditions: ['Needs Repair'], dot: 'bg-amber-500' },
]
const historyDotTones = { blue: 'bg-blue-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500' }

type Unit = {
  tag: AssetTagInspectionRecord
  condition: string
  reason: string
  repairReason: string
  repairOwner: '' | 'GSO' | 'ITSS'
  serialLast4: string
  hasPhysicalCheck: boolean
  entryMethod: 'scan' | 'typed'
}
type Challenge = { units: Array<{ tagCode: string; otpChallengeId: string }>; sentTo: string; expiresAt: string }
type Outcome = { tagCode: string; ok: boolean; error?: string }

const isRepair = (condition: string) => repairConditionNames.includes(condition)
const serialTailLength = (tag: AssetTagInspectionRecord) => Math.min(4, (tag.serialNumber ?? '').replace(/[^A-Za-z0-9]/g, '').length)
const startCondition = (tag: AssetTagInspectionRecord) => (['New', 'Good', 'Fair', 'Needs Repair'].includes(tag.condition) ? tag.condition : 'Good')

// The first thing still missing before a unit can be saved, or an empty string when it is complete.
function missingFor(unit: Unit) {
  const repair = isRepair(unit.condition)
  if (!repair && !unit.reason) return 'Select the reason for return.'
  if (repair && !unit.repairReason) return 'Choose why the unit cannot be used.'
  if (repair && !unit.repairOwner) return 'Choose who checks it: GSO or ITSS.'
  const tail = serialTailLength(unit.tag)
  if (tail > 0 && unit.serialLast4.length !== tail) return 'Enter the last characters of the serial number on the unit.'
  if (!unit.hasPhysicalCheck) return 'Confirm the physical check.'
  return ''
}

// Same wording as the single return, so the audit log reads the same for both.
function reasonFor(unit: Unit) {
  if (!isRepair(unit.condition)) return unit.reason
  const owner = unit.repairOwner === 'ITSS' ? 'Sent to ITSS to check' : 'GSO checks'
  return `Sira o may depekto — ${unit.repairReason}: ${owner}`
}

// What the list shows. The stored reason keeps its original wording for the audit log.
function reasonText(unit: Unit) {
  if (isRepair(unit.condition)) return `${unit.repairReason} · ${unit.repairOwner === 'ITSS' ? 'Sent to ITSS to check' : 'GSO checks'}`
  return returnReasonLabels[unit.reason] ?? unit.reason
}

function formatDate(value: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(date)
}

const fieldClass = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60'

// Same step header as Main Issuance: a numbered badge, the step label, a title, and a short description.
type StepStatus = 'done' | 'current' | 'upcoming'
const stepStyles: Record<StepStatus, { badge: string; label: string; suffix: string }> = {
  done: { badge: 'bg-emerald-600 text-white', label: 'text-emerald-700', suffix: ' · Done' },
  current: { badge: 'bg-blue-600 text-white ring-4 ring-blue-100', label: 'text-blue-700', suffix: '' },
  upcoming: { badge: 'bg-slate-200 text-slate-700', label: 'text-slate-600', suffix: '' },
}

function StepHeader({ step, status, title, description }: { step: number; status: StepStatus; title: string; description: string }) {
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
        <p className={`text-xs font-extrabold uppercase tracking-wide ${styles.label}`}>Step {step} of 3{styles.suffix}</p>
        <h2 className="mt-0.5 text-base font-black leading-tight text-slate-900">{title}</h2>
        <p className="mt-1 text-sm leading-snug text-slate-600">{description}</p>
      </div>
    </div>
  )
}

export function ReturnManyPanel({ active }: { active: boolean }) {
  const [scannerCode, setScannerCode] = useState('')
  const [units, setUnits] = useState<Unit[]>([])
  // The unit being inspected. Scanning is locked until it is saved or cancelled.
  const [draft, setDraft] = useState<Unit | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [otp, setOtp] = useState('')
  const [outcomes, setOutcomes] = useState<Outcome[]>([])
  // One name for the whole return: the person at the counter who brings the units.
  const [returnedBy, setReturnedBy] = useState('')
  const scannerRef = useRef<HTMLInputElement>(null)
  const otpRef = useRef<HTMLInputElement>(null)
  const lookupTimerRef = useRef<number | null>(null)
  const lookupInFlightRef = useRef(false)
  const timingRef = useRef({ startedAt: 0, lastAt: 0, multiCharInsert: false })
  const busy = isLookingUp || isSendingOtp || isConfirming
  const inspecting = draft !== null

  useEffect(() => {
    if (active) window.setTimeout(() => scannerRef.current?.focus(), 0)
  }, [active])

  useEffect(() => () => {
    if (lookupTimerRef.current !== null) window.clearTimeout(lookupTimerRef.current)
  }, [])

  function focusScanner() {
    window.setTimeout(() => scannerRef.current?.focus(), 30)
  }

  function patchDraft(patch: Partial<Unit>) {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  async function lookup(value: string) {
    const tagCode = value.trim().toUpperCase()
    if (!tagCode || lookupInFlightRef.current || inspecting || isConfirming) return
    if (lookupTimerRef.current !== null) {
      window.clearTimeout(lookupTimerRef.current)
      lookupTimerRef.current = null
    }
    const { startedAt, lastAt, multiCharInsert } = timingRef.current
    const msPerChar = (lastAt - startedAt) / Math.max(tagCode.length - 1, 1)
    const entryMethod: 'scan' | 'typed' = !multiCharInsert && startedAt > 0 && tagCode.length > 1 && msPerChar < scannerMaxMsPerChar ? 'scan' : 'typed'
    setError('')
    setNotice('')
    setScannerCode('')
    // A unit is scanned once per return; a second scan would add the same unit twice.
    if (units.some((unit) => unit.tag.tagCode === tagCode)) {
      setError(`${tagCode} is already in this return. Each unit is scanned once.`)
      return
    }
    if (units.length >= maxUnits) {
      setError(`Up to ${maxUnits} units per return.`)
      return
    }
    lookupInFlightRef.current = true
    setIsLookingUp(true)
    try {
      const tag = await getAssetTagForInspection(tagCode)
      if (tag.custodyStatus !== 'Issued' || !tag.employeeCode) {
        setError(`${tag.tagCode} is not currently assigned to an employee.`)
        return
      }
      if (units.length && units[0].tag.employeeCode !== tag.employeeCode) {
        setError(`${tag.tagCode} belongs to another employee. Scan units from one employee at a time.`)
        return
      }
      setDraft({
        tag,
        condition: startCondition(tag),
        reason: '',
        repairReason: '',
        repairOwner: '',
        serialLast4: '',
        hasPhysicalCheck: false,
        entryMethod,
      })
      setEditingIndex(null)
      setChallenge(null)
      setOtp('')
    } catch (reason) {
      setError(`${tagCode}: ${reason instanceof Error ? reason.message : 'Could not find that item barcode.'}`)
    } finally {
      lookupInFlightRef.current = false
      setIsLookingUp(false)
      focusScanner()
    }
  }

  function handleScannerChange(value: string) {
    const now = performance.now()
    if (value.length <= 1) {
      timingRef.current = { startedAt: now, lastAt: now, multiCharInsert: false }
    } else {
      // A paste changes more than one character at a time; a scanner adds exactly one.
      if (value.length - scannerCode.length !== 1) timingRef.current.multiCharInsert = true
      timingRef.current.lastAt = now
    }
    setScannerCode(value)
    if (lookupTimerRef.current !== null) {
      window.clearTimeout(lookupTimerRef.current)
      lookupTimerRef.current = null
    }
    if (!assetTagCodePattern.test(value.trim())) return
    lookupTimerRef.current = window.setTimeout(() => {
      lookupTimerRef.current = null
      void lookup(value)
    }, barcodeScanQuietPeriodMs)
  }

  function saveDraft() {
    if (!draft) return
    const missing = missingFor(draft)
    if (missing) {
      setError(missing)
      return
    }
    if (editingIndex === null && units.some((unit) => unit.tag.tagCode === draft.tag.tagCode)) {
      setError(`${draft.tag.tagCode} is already in this return.`)
      setDraft(null)
      focusScanner()
      return
    }
    const saved = draft.tag.tagCode
    setUnits((current) => (editingIndex === null ? [...current, draft] : current.map((unit, index) => (index === editingIndex ? draft : unit))))
    setDraft(null)
    setEditingIndex(null)
    setError('')
    setNotice(`${saved} saved. Scan the next unit.`)
    // A code already sent covers only the earlier units, so it must be sent again.
    setChallenge(null)
    setOtp('')
    focusScanner()
  }

  function cancelDraft() {
    setDraft(null)
    setEditingIndex(null)
    setError('')
    focusScanner()
  }

  function editUnit(index: number) {
    setDraft({ ...units[index] })
    setEditingIndex(index)
    setError('')
    setNotice('')
  }

  function removeUnit(index: number) {
    setUnits((current) => current.filter((_, position) => position !== index))
    setChallenge(null)
    setOtp('')
  }

  async function sendCode() {
    setError('')
    setNotice('')
    if (units.length === 0) return setError('Scan at least one unit.')
    setIsSendingOtp(true)
    try {
      const sent = await sendBatchTaggedReturnOtp(units.map((unit) => unit.tag.tagCode))
      setChallenge({ units: sent.units.map((row) => ({ tagCode: row.tagCode, otpChallengeId: row.otpChallengeId })), sentTo: sent.sentTo, expiresAt: sent.expiresAt })
      setOtp('')
      setOutcomes([])
      window.setTimeout(() => otpRef.current?.focus(), 50)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send the code to the employee.')
    } finally {
      setIsSendingOtp(false)
    }
  }

  async function confirmAll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!challenge || busy) return
    setIsConfirming(true)
    setError('')
    try {
      const challengeByTag = new Map(challenge.units.map((row) => [row.tagCode, row.otpChallengeId]))
      const result = await confirmBatchTaggedReturn({
        otp: otp.trim(),
        units: units.map((unit) => ({
          tagCode: unit.tag.tagCode,
          otpChallengeId: challengeByTag.get(unit.tag.tagCode) ?? '',
          condition: unit.condition,
          reason: reasonFor(unit),
          entryMethod: unit.entryMethod,
          returnedByName: returnedBy.trim(),
          ...(isRepair(unit.condition) && unit.repairOwner ? { repairOwner: unit.repairOwner } : {}),
          ...(serialTailLength(unit.tag) > 0 ? { serialLast4: unit.serialLast4.toUpperCase() } : {}),
        })),
      })
      const returned = new Set(result.results.filter((row) => row.ok).map((row) => row.tagCode))
      setOutcomes(result.results)
      setUnits((current) => current.filter((unit) => !returned.has(unit.tag.tagCode)))
      setChallenge(null)
      setOtp('')
      setNotice(`${result.returned} unit(s) returned${result.failed ? `. ${result.failed} need attention; send a new code for those.` : '.'}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The return could not be confirmed.')
    } finally {
      setIsConfirming(false)
    }
  }

  // Inspection side panel data, read from the unit being inspected.
  const inspectTag = draft?.tag ?? null
  const currentAssignment = inspectTag?.borrowerHistory?.find((entry) => entry.status === 'Issued')
  const issuerCode = inspectTag?.issuedByCode ?? inspectTag?.employeeCode ?? ''
  const issuerName = inspectTag?.issuedByName ?? inspectTag?.employeeName ?? '—'
  const holderIsIssuer = inspectTag?.employeeCode === issuerCode
  const custodyEvents = (inspectTag?.borrowerHistory ?? [])
    .flatMap((entry) => {
      const issued = {
        key: `issued-${entry.employeeCode}-${entry.issuedAt}`,
        at: entry.issuedAt,
        title: `Issued to ${entry.employeeName}`,
        detail: [entry.employeeCode, entry.department].filter(Boolean).join(' · '),
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
  const recordedRank = conditionRank.indexOf(inspectTag?.condition ?? '')
  const isDowngrade = Boolean(draft) && recordedRank >= 0 && conditionRank.indexOf(draft?.condition ?? '') > recordedRank
  const missing = draft ? missingFor(draft) : ''
  const tail = inspectTag ? serialTailLength(inspectTag) : 0
  // Three steps: scan and inspect, the optional brought-in name, then confirm with the employee.
  const currentStep = !units.length || inspecting ? 1 : challenge ? 3 : 2
  const stepStatus = (step: number): StepStatus => (step < currentStep ? 'done' : step === currentStep ? 'current' : 'upcoming')

  return (
    <div className="space-y-5">
      <section className="space-y-5 rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-6">
        <StepHeader step={1} status={stepStatus(1)} title="Scan and inspect each unit" description="Scan a unit's label and complete its inspection. Save it to add it to this return; the scanner unlocks for the next unit." />
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-blue-200 bg-blue-50/70 px-5 py-4">
        <div>
          <p className="flex items-center gap-2.5 text-sm font-extrabold text-blue-900" role="status" aria-live="polite">
            <span className={`h-3 w-3 rounded-full ${isLookingUp ? 'animate-pulse bg-amber-500' : inspecting ? 'bg-slate-400' : 'bg-emerald-500'}`} />
            {isLookingUp ? 'Reading barcode...' : inspecting ? 'Finish this unit first' : `Ready for the next unit (${units.length} in this return)`}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
            Scan one unit's label. Its inspection opens below. Save it, then the scanner is ready for the next unit. A unit already in the list cannot be scanned again.
          </p>
        </div>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void lookup(scannerCode) }} aria-label="Many units scanner input" className="flex gap-3">
        <input
          ref={scannerRef}
          type="text"
          value={scannerCode}
          onChange={(event) => handleScannerChange(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          autoComplete="off"
          spellCheck={false}
          placeholder="Scan the barcode here…"
          aria-label="Scan an individually tracked item barcode"
          disabled={busy || inspecting || isConfirming}
          className="h-16 min-w-0 flex-1 rounded-xl border-2 border-dashed border-blue-300 bg-white px-5 font-mono text-lg font-bold uppercase tracking-wider text-slate-800 outline-none transition placeholder:font-sans placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-solid focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
        />
        <button type="submit" disabled={busy || inspecting || !scannerCode.trim()} className="h-16 shrink-0 rounded-xl bg-blue-600 px-8 text-sm font-extrabold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          {isLookingUp ? 'Reading…' : 'Find'}
        </button>
      </form>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">{notice}</p>}
      </section>

      {draft && inspectTag && (
        <section aria-labelledby="many-inspect-title" className="overflow-hidden rounded-2xl border-2 border-blue-200 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">
                {editingIndex === null ? 'Inspecting unit' : 'Editing unit'} · <span className="font-mono tracking-normal">{inspectTag.tagCode}</span>
              </p>
              <h3 id="many-inspect-title" className="mt-1 truncate text-base font-black text-slate-950">{inspectTag.itemName}</h3>
              {currentAssignment && <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">Issued</span>}
              <p className="mt-0.5 text-xs text-slate-500">From <span className="font-bold text-slate-700">{inspectTag.employeeName}</span></p>
            </div>
            {draft.entryMethod === 'typed' && (
              <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Typed, not scanned. It is flagged in the audit log.</p>
            )}
          </header>

          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <aside className="space-y-4">
              <dl className="grid grid-cols-2 gap-2">
                {([
                  { label: 'Item code', value: inspectTag.itemCode, note: '' },
                  { label: 'Issued by', value: issuerName, note: [issuerCode, inspectTag.issuedByDepartment].filter(Boolean).join(' · ') },
                  { label: 'Used by', value: inspectTag.employeeName ?? '—', note: holderIsIssuer ? 'Same as issued by' : [inspectTag.employeeCode, currentAssignment?.department].filter(Boolean).join(' · ') },
                  { label: 'Location', value: inspectTag.assignedLocation || 'No room recorded', note: '' },
                  { label: 'Issued on', value: formatDate(currentAssignment?.issuedAt ?? null), note: '' },
                  { label: 'Condition on record', value: inspectTag.condition, note: '' },
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

              <ProgressPath steps={['Inspect', 'Save', 'Confirm']} current={missing ? 0 : 1} />

              <section aria-labelledby="many-history-title">
                <h4 id="many-history-title" className="text-[0.65rem] font-black uppercase tracking-wide text-slate-500">History</h4>
                {custodyEvents.length > 0 ? (
                  <ol className="mt-3 space-y-4 border-l-2 border-slate-100 pl-4">
                    {custodyEvents.map((event) => (
                      <li key={event.key} className="relative">
                        <span aria-hidden="true" className={`absolute -left-5.5 top-1 h-2.5 w-2.5 rounded-full ${historyDotTones[event.tone]}`} />
                        <p className="text-xs font-bold text-slate-800">{event.title}</p>
                        <p className="text-[0.62rem] font-semibold text-slate-400">{formatDate(event.at)}</p>
                        {event.detail && <p className="mt-0.5 text-[0.65rem] leading-relaxed text-slate-600">{event.detail}</p>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-[0.68rem] text-slate-500">No custody history recorded for this unit yet.</p>
                )}
              </section>
            </aside>

            <div className="space-y-4">
              <fieldset className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5">
                <legend className="px-1 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">1 · Condition after inspection</legend>
                <div className="mt-2 space-y-2">
                  {conditionGroups.map((group) => (
                    <div key={group.title} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                      <span className="flex w-28 shrink-0 items-center gap-1.5 text-[0.65rem] font-bold text-slate-500">
                        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${group.dot}`} />
                        {group.title}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {group.conditions.map((condition) => (
                          <label key={condition} className="cursor-pointer">
                            <input type="radio" name="many-return-condition" value={condition} checked={draft.condition === condition} onChange={() => patchDraft({ condition })} className="peer sr-only" />
                            <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 peer-checked:border-blue-600 peer-checked:bg-blue-600 peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-blue-100">
                              {condition === 'Needs Repair' ? 'To check' : condition}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className={`mt-3 rounded-xl border px-3 py-2.5 text-xs font-semibold ${isRepair(draft.condition) ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
                  {isRepair(draft.condition) ? 'Goes to To Be Repaired.' : 'Goes back to GSO Storage.'}
                </p>
                {isRepair(draft.condition) && (
                  <div className="mt-3 rounded-xl border-2 border-rose-200 bg-rose-50/60 p-3.5">
                    <p className="text-sm font-black text-rose-900">Why can't it be used? <span className="text-xs font-semibold text-rose-700">(required)</span></p>
                    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Reason for repair">
                      {repairReasons.map((reason) => <button key={reason} type="button" onClick={() => patchDraft({ repairReason: reason })} className={`rounded-full border-2 px-3 py-1.5 text-xs font-extrabold transition ${draft.repairReason === reason ? 'border-rose-500 bg-white text-rose-800 ring-2 ring-rose-200' : 'border-rose-200 bg-white text-rose-800 hover:border-rose-300'}`}>{reason}</button>)}
                    </div>
                    <p className="mt-3 text-sm font-black text-rose-900">Who checks if it can be fixed? <span className="text-xs font-semibold text-rose-700">(required)</span></p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Who checks the unit">
                      {([
                        ['GSO', 'GSO checks it', 'GSO staff checks if it can still be fixed.'],
                        ['ITSS', 'Send to ITSS', 'ITSS checks if it can be fixed, then returns it to GSO.'],
                      ] as const).map(([value, label, detail]) => (
                        <button key={value} type="button" role="radio" aria-checked={draft.repairOwner === value} onClick={() => patchDraft({ repairOwner: value })} className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${draft.repairOwner === value ? 'border-rose-500 bg-white ring-2 ring-rose-200' : 'border-rose-200 bg-white hover:border-rose-300'}`}>
                          <span className="block text-xs font-extrabold text-slate-900">{label}</span>
                          <span className="mt-0.5 block text-[0.7rem] font-semibold text-slate-600">{detail}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {isDowngrade && (
                  <p role="note" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900">
                    <strong>{inspectTag.condition}</strong> → <strong>{draft.condition}</strong>
                  </p>
                )}
              </fieldset>

              {!isRepair(draft.condition) && (
                <label className="block">
                  <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Reason for return</span>
                  <select value={draft.reason} onChange={(event) => patchDraft({ reason: event.target.value })} className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100">
                    <option value="">Select a reason</option>
                    {returnReasons.map((reason) => <option key={reason} value={reason}>{returnReasonLabels[reason]}</option>)}
                  </select>
                </label>
              )}

              {tail > 0 && (
                <label className="block rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                  <span className="block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Serial number check</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-600">Type the last {tail} characters of the serial printed on the unit itself, not on the barcode label.</span>
                  <input
                    type="text"
                    value={draft.serialLast4}
                    onChange={(event) => patchDraft({ serialLast4: event.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, tail) })}
                    maxLength={tail}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={'•'.repeat(tail)}
                    aria-label="Last characters of the unit's serial number"
                    className="mt-2 h-10 w-32 rounded-xl border border-slate-200 bg-white px-3 text-center font-mono text-sm font-bold uppercase tracking-[0.3em] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              )}

              <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs font-semibold leading-relaxed text-slate-700">
                <input type="checkbox" checked={draft.hasPhysicalCheck} onChange={(event) => patchDraft({ hasPhysicalCheck: event.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                <span>I have the item, and the barcode matches.</span>
              </label>
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
            <p className="text-xs font-semibold text-slate-500" aria-live="polite">{missing || 'Ready to save this unit.'}</p>
            <div className="flex gap-2">
              <button type="button" onClick={cancelDraft} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={saveDraft} disabled={Boolean(missing)} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                {editingIndex === null ? 'Save unit and scan next' : 'Save changes'}
              </button>
            </div>
          </footer>
        </section>
      )}

      <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-6">
        <h3 className="text-base font-black tracking-tight text-slate-900">Units to return ({units.length})</h3>
        {units.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-xs font-semibold text-slate-500">No units saved yet. Scan the first unit above.</p>}
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {units.map((unit, index) => (
            <li key={unit.tag.tagCode} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-slate-900">{unit.tag.itemName}{unit.tag.itemDescription && unit.tag.itemDescription.trim().toLowerCase() !== unit.tag.itemName.trim().toLowerCase() ? <span className="font-semibold text-slate-600"> · {unit.tag.itemDescription}</span> : null}</p>
                <p className="mt-0.5 text-[0.68rem] font-semibold text-slate-500"><span className="font-mono">{unit.tag.itemCode}</span> · <span className="font-mono">{unit.tag.tagCode}</span></p>
                <p className="mt-1 text-[0.68rem] font-semibold text-slate-500">
                  <span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold ${isRepair(unit.condition) ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{unit.condition === 'Needs Repair' ? 'To check' : unit.condition}</span>
                  {reasonText(unit)}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => editUnit(index)} disabled={busy || inspecting} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[0.68rem] font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Edit</button>
                <button type="button" onClick={() => removeUnit(index)} disabled={busy || inspecting} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[0.68rem] font-extrabold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
      <section className="flex flex-col rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-6">
        <StepHeader step={2} status={stepStatus(2)} title="Brought in by" description="Optional. One name for all the units in this return, if someone other than the borrower brings them." />
        <input type="text" maxLength={200} value={returnedBy} onChange={(event) => setReturnedBy(event.target.value)} disabled={isConfirming} placeholder="Name of the person at the counter" className="mt-3 h-11 w-full max-w-md rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 placeholder:text-slate-500 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50" />
      </section>

      <section className="flex flex-col rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-6">
        <StepHeader step={3} status={stepStatus(3)} title="Confirm with the employee" description="Send one code to the employee, then enter it to return all the units together." />
        {!challenge ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-500">One code is sent to the employee for all these units.</p>
            <button type="button" onClick={() => void sendCode()} disabled={busy || inspecting || units.length === 0} className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50">
              {isSendingOtp ? 'Sending code…' : 'Send code to employee'}
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void confirmAll(event)} className="mt-3 space-y-3">
            <p className="text-xs font-semibold text-slate-600">
              Code sent to {challenge.sentTo}, expires {new Intl.DateTimeFormat('en-PH', { timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(challenge.expiresAt))}. Enter it to confirm {units.length} unit(s).
            </p>
            <input ref={otpRef} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" disabled={isConfirming} className={`${fieldClass} h-11 max-w-xs tracking-[0.3em]`} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={isConfirming || otp.length !== 6 || units.length === 0} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50">
                {isConfirming ? 'Saving returns…' : `Confirm ${units.length} return(s)`}
              </button>
              <button type="button" onClick={() => void sendCode()} disabled={busy} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Send a new code</button>
            </div>
          </form>
        )}
        {outcomes.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {outcomes.map((row) => (
              <li key={row.tagCode} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                <span className="font-extrabold text-slate-800">{row.tagCode}</span>
                {row.ok
                  ? <span className="font-extrabold text-emerald-700">Returned</span>
                  : <span className="font-semibold text-rose-700">{row.error || 'Could not return this unit.'}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  )
}
