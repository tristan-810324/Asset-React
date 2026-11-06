import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getCurrentUser } from '../auth/authApi'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import {
  confirmTaggedAssetReturn,
  createEmployeeReturn,
  getAssetTagForInspection,
  listHoldings,
  sendBulkReturnOtp,
  sendTaggedReturnOtp,
  type AssetTagInspectionRecord,
  type TaggedReturnOtpChallenge,
} from './issuancesApi'

const assetTagCodePattern = /^(?:AST-(?:[A-Z0-9]{13}|[A-F0-9]{20})|[A-Z0-9]{13}|[A-F0-9]{20})$/i
const barcodeScanQuietPeriodMs = 220
// USB scanners type a label in a burst of a few ms per character; people take far longer.
const scannerMaxMsPerChar = 35
const returnReasons = ['Tapos na gamitin', 'Sira o may depekto', 'Lilipat ng opisina', 'Resigned o end of contract', 'Hindi na kailangan', 'Iba pa']
// Best to worst, to spot a return that lowers the condition on record.
const conditionRank = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable']
const repairConditionNames = ['Needs Repair', 'Under Maintenance', 'Unserviceable']
// Only count units physically returned to the GSO counter here.
const bulkLineConditions = conditionRank

type BulkReturnOption = {
  id: string
  employeeCode: string
  employeeName: string
  itemCode: string
  itemName: string
  quantity: number
  unitOfMeasure: string
  conditionAtIssue: string
  isOverdue: boolean
  dueAt: string | null
}

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

type BulkStep = 'employee' | 'item' | 'details' | 'confirm' | 'done'

const bulkSteps: { key: Exclude<BulkStep, 'done'>; label: string; prompt: string }[] = [
  { key: 'employee', label: 'Employee', prompt: 'Who is returning the stock?' },
  { key: 'item', label: 'Item', prompt: 'Which issued item is coming back?' },
  { key: 'details', label: 'Count', prompt: 'Count the units by the condition they came back in.' },
  { key: 'confirm', label: 'Confirm', prompt: "Review the return, then confirm it with the employee's code." },
]

const bulkConditionGroups = [
  { title: 'Back to stock', hint: 'Usable right away', conditions: ['New', 'Good', 'Fair'], dot: 'bg-emerald-500' },
  { title: 'For repair', hint: 'Goes to To Be Repaired', conditions: repairConditionNames, dot: 'bg-amber-500' },
]

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')

function StepBadge({ number, done }: { number: number; done: boolean }) {
  return (
    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.62rem] font-black ${done ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'}`}>
      {done ? (
        <svg aria-label="Done" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="m5 12 5 5 9-10" /></svg>
      ) : number}
    </span>
  )
}

function ChevronRight() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

// Step-by-step return of reusable quantity stock, shown inside the Return Items page: pick the
// employee, then the item, count the units by condition, and confirm with the emailed code.
function BulkReturnPanel({ options, onReturned }: { options: BulkReturnOption[]; onReturned: () => void }) {
  const [step, setStep] = useState<BulkStep>('employee')
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [employeeKey, setEmployeeKey] = useState('')
  const [issuanceId, setIssuanceId] = useState('')
  // Units per condition, e.g. { Good: '3', 'Needs Repair': '2' }; empty or 0 means none.
  const [lines, setLines] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [broughtBy, setBroughtBy] = useState('')
  const [otpChallenge, setOtpChallenge] = useState<TaggedReturnOtpChallenge | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const isFirstRender = useRef(true)

  // Move focus to the new step's question so keyboard and screen reader users follow along.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  const employeeGroups = [...options.reduce((groups, option) => {
    const key = option.employeeCode || option.employeeName
    const group = groups.get(key) ?? { key, name: option.employeeName, code: option.employeeCode, items: [] as BulkReturnOption[] }
    group.items.push(option)
    return groups.set(key, group)
  }, new Map<string, { key: string; name: string; code: string; items: BulkReturnOption[] }>()).values()]
    .sort((left, right) => left.name.localeCompare(right.name))
  const search = employeeSearch.trim().toLowerCase()
  const visibleEmployees = employeeGroups.filter((group) => !search || `${group.name} ${group.code}`.toLowerCase().includes(search))
  const employee = employeeGroups.find((group) => group.key === employeeKey)
  const selected = options.find((option) => option.id === issuanceId)
  const outstanding = selected?.quantity ?? 0
  const returnLines = bulkLineConditions
    .map((condition) => ({ condition, quantity: Number(lines[condition] || 0) }))
    .filter((line) => Number.isInteger(line.quantity) && line.quantity > 0)
  const total = returnLines.reduce((sum, line) => sum + line.quantity, 0)
  const isDamaged = returnLines.some((line) => repairConditionNames.includes(line.condition))
  const isNoteRequired = reason === 'Iba pa' || isDamaged
  const breakdown = returnLines.map((line) => `${line.quantity} ${line.condition}`).join(', ')
  const stepIndex = step === 'done' ? bulkSteps.length : bulkSteps.findIndex((entry) => entry.key === step)

  // The code is bound to the item, quantity, and condition, so changing any of them needs a new code.
  function resetOtp() {
    setOtpChallenge(null)
    setOtpCode('')
  }

  function goTo(next: BulkStep) {
    setError('')
    setStep(next)
  }

  function chooseEmployee(key: string) {
    if (key !== employeeKey) {
      setEmployeeKey(key)
      setIssuanceId('')
      resetOtp()
    }
    goTo('item')
  }

  function chooseItem(option: BulkReturnOption) {
    if (option.id !== issuanceId) {
      setIssuanceId(option.id)
      // Most returns bring everything back in good shape; staff adjust from there.
      setLines({ Good: String(option.quantity) })
      setReason('')
      setNote('')
      setBroughtBy('')
      resetOtp()
    }
    goTo('details')
  }

  function setLine(condition: string, value: string) {
    setLines((current) => ({ ...current, [condition]: value }))
    resetOtp()
  }

  function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    if (total < 1 || total > outstanding) {
      setError(`The units must add up to 1–${outstanding} ${selected.unitOfMeasure}.`)
      return
    }
    goTo('confirm')
  }

  async function sendCode() {
    if (!selected) return
    setIsSendingOtp(true)
    setError('')
    try {
      setOtpChallenge(await sendBulkReturnOtp({ issuanceId: selected.id, lines: returnLines }))
      setOtpCode('')
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : 'Could not send the code to the employee.')
    } finally {
      setIsSendingOtp(false)
    }
  }

  async function handleConfirmSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !otpChallenge) return
    setIsSubmitting(true)
    setError('')
    try {
      const trimmedNote = note.trim()
      const request = await createEmployeeReturn({
        employeeCode: selected.employeeCode,
        itemCode: selected.itemCode,
        issuanceId: selected.id,
        lines: returnLines,
        reason: trimmedNote ? `${reason} — ${trimmedNote}` : reason,
        returnedByName: broughtBy.trim(),
        otp: { challengeId: otpChallenge.challengeId, code: otpCode },
      })
      const summary = request.lines.map((line) => `${line.quantity} ${line.condition}`).join(', ')
      setResult(`${summary} ${request.unitOfMeasure} of ${request.itemName} recorded for ${request.employeeName}. ${request.emailQueued
        ? `A receipt is being emailed to ${request.employeeName}.`
        : 'No receipt email could be sent; inform the employee directly.'}`)
      resetOtp()
      goTo('done')
      onReturned()
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : 'Unable to record this return.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function startOver() {
    setEmployeeSearch('')
    setEmployeeKey('')
    setIssuanceId('')
    setLines({})
    setResult('')
    resetOtp()
    goTo('employee')
  }

  const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50'
  const labelClass = 'mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500'
  const choiceClass = 'group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40 focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100'
  const secondaryButton = 'rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50'
  const primaryButton = 'rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'

  if (!options.length && step !== 'done') {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs font-semibold text-slate-500">
        No reusable bulk stock is out with employees right now.
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol className="flex min-w-0 flex-1 items-center gap-2" aria-label="Bulk return steps">
          {bulkSteps.map((entry, index) => {
            const isDone = index < stepIndex
            const isCurrent = index === stepIndex
            return (
              <li key={entry.key} className="flex flex-1 items-center gap-2 last:flex-none" aria-current={isCurrent ? 'step' : undefined}>
                <button
                  type="button"
                  disabled={!isDone || step === 'done' || isSubmitting}
                  onClick={() => goTo(entry.key)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg disabled:cursor-default"
                >
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-[0.62rem] font-black ${isDone ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {isDone ? (
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="m5 12 5 5 9-10" /></svg>
                    ) : index + 1}
                  </span>
                  <span className={`hidden text-[0.68rem] font-extrabold sm:inline ${isCurrent ? 'text-slate-900' : isDone ? 'text-slate-600' : 'text-slate-400'}`}>{entry.label}</span>
                </button>
                {index < bulkSteps.length - 1 && <span aria-hidden="true" className={`h-px flex-1 ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
              </li>
            )
          })}
        </ol>
        {step !== 'employee' && step !== 'done' && (
          <button type="button" onClick={startOver} disabled={isSubmitting} className="text-[0.68rem] font-bold text-slate-500 transition hover:text-blue-700 disabled:opacity-50">
            Start over
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <h3 ref={headingRef} tabIndex={-1} className="mr-auto text-xs font-black text-slate-900 outline-none">
          {step === 'done' ? 'Return recorded' : bulkSteps[stepIndex].prompt}
        </h3>
        {employee && step !== 'employee' && step !== 'done' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[0.65rem] font-bold text-slate-700">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-blue-600 text-[0.45rem] font-black text-white">{initialsOf(employee.name)}</span>
            {employee.name}
          </span>
        )}
        {selected && (step === 'details' || step === 'confirm') && (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[0.65rem] font-bold text-blue-700">
            {selected.itemName} · {selected.quantity} {selected.unitOfMeasure} out · issued {selected.conditionAtIssue}
          </span>
        )}
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}

      {step === 'employee' && (
        <div className="mt-3">
          <label className="relative block">
            <span className="sr-only">Search employees</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              type="search"
              value={employeeSearch}
              onChange={(event) => setEmployeeSearch(event.target.value)}
              placeholder={`Search ${employeeGroups.length} employee${employeeGroups.length === 1 ? '' : 's'} by name or code`}
              className={`${fieldClass} h-11 pl-10`}
            />
          </label>
          <ul className="mt-3 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
            {visibleEmployees.map((group) => {
              const unitsOut = group.items.reduce((sum, item) => sum + item.quantity, 0)
              return (
                <li key={group.key}>
                  <button type="button" onClick={() => chooseEmployee(group.key)} className={choiceClass}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-[0.65rem] font-black text-blue-700">{initialsOf(group.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-slate-900">{group.name}</span>
                      <span className="block truncate text-[0.65rem] text-slate-500">
                        {group.code || 'No employee code'} · {group.items.length} item{group.items.length === 1 ? '' : 's'} · {unitsOut} out
                      </span>
                    </span>
                    {group.items.some((item) => item.isOverdue) && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[0.58rem] font-extrabold text-rose-700">Overdue</span>}
                    <ChevronRight />
                  </button>
                </li>
              )
            })}
            {!visibleEmployees.length && (
              <li className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs font-semibold text-slate-400 sm:col-span-2 xl:col-span-3">
                No employee matches “{employeeSearch.trim()}”.
              </li>
            )}
          </ul>
        </div>
      )}

      {step === 'item' && employee && (
        <>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {employee.items.map((option) => (
              <li key={option.id}>
                <button type="button" onClick={() => chooseItem(option)} className={choiceClass}>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-xs font-bold text-slate-900">{option.itemName}</span>
                      {option.isOverdue && <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[0.58rem] font-extrabold text-rose-700">Overdue</span>}
                    </span>
                    <span className="block truncate text-[0.65rem] text-slate-500">
                      {option.itemCode} · issued {option.conditionAtIssue}{option.dueAt ? ` · due ${new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(option.dueAt))}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-black text-slate-900">{option.quantity}</span>
                    <span className="block text-[0.55rem] font-extrabold uppercase text-slate-400">{option.unitOfMeasure} out</span>
                  </span>
                  <ChevronRight />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <button type="button" onClick={() => goTo('employee')} className={secondaryButton}>Back</button>
          </div>
        </>
      )}

      {step === 'details' && selected && (
        <form onSubmit={handleDetailsSubmit} className="mt-3">
          <div className="grid gap-3 lg:grid-cols-2">
            {bulkConditionGroups.map((group) => (
              <fieldset key={group.title} className="rounded-xl border border-slate-200 p-3">
                <legend className="sr-only">{group.title}</legend>
                <p className="flex items-center gap-2 text-[0.68rem] font-extrabold text-slate-800">
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${group.dot}`} />
                  {group.title}
                  <span className="truncate font-medium text-slate-400">{group.hint}</span>
                </p>
                <div className="mt-2 space-y-1.5">
                  {group.conditions.map((condition) => {
                    const value = Number(lines[condition] || 0)
                    return (
                      <div key={condition} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 py-1.5 pl-3 pr-1.5">
                        <span className="text-xs font-semibold text-slate-700">{condition}</span>
                        <span className="flex shrink-0 items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                          <button type="button" onClick={() => setLine(condition, value > 1 ? String(value - 1) : '')} disabled={value <= 0} aria-label={`One less ${condition}`} className="grid h-8 w-8 place-items-center text-sm font-black text-slate-500 hover:bg-slate-50 disabled:text-slate-200">−</button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max={outstanding}
                            step="1"
                            value={lines[condition] || ''}
                            onChange={(event) => setLine(condition, event.target.value)}
                            placeholder="0"
                            aria-label={`Units returned in ${condition} condition`}
                            className="h-8 w-10 border-x border-slate-200 text-center text-xs font-black text-slate-900 outline-none [appearance:textfield] focus:bg-blue-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          <button type="button" onClick={() => setLine(condition, String(value + 1))} disabled={total >= outstanding} aria-label={`One more ${condition}`} className="grid h-8 w-8 place-items-center text-sm font-black text-slate-500 hover:bg-slate-50 disabled:text-slate-200">+</button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 px-3.5 py-3" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-bold text-slate-700">Accounted for</span>
              <span className={`font-black ${total > outstanding ? 'text-rose-700' : 'text-slate-900'}`}>{total} of {outstanding} {selected.unitOfMeasure}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-all ${total > outstanding ? 'bg-rose-500' : total === outstanding ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, outstanding ? (total / outstanding) * 100 : 0)}%` }} />
            </div>
            <p className={`mt-1.5 text-[0.65rem] font-semibold ${total > outstanding || total < 1 ? 'text-rose-700' : 'text-slate-500'}`}>
              {total > outstanding
                ? `That is ${total - outstanding} more than the employee has.`
                : total < 1
                  ? 'Enter at least one unit.'
                  : total < outstanding
                    ? `${outstanding - total} ${selected.unitOfMeasure} will stay with the employee.`
                    : 'Every unit is accounted for.'}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Reason for return</span>
              <select value={reason} onChange={(event) => setReason(event.target.value)} required className={`${fieldClass} h-11`}>
                <option value="" disabled>Select a reason</option>
                {returnReasons.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Brought in by <span className="normal-case tracking-normal text-slate-400">(if not the borrower)</span></span>
              <input type="text" maxLength={200} value={broughtBy} onChange={(event) => setBroughtBy(event.target.value)} placeholder="Name of the person at the counter" className={`${fieldClass} h-11`} />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Notes {isNoteRequired ? <span className="text-rose-600">(required)</span> : <span className="normal-case tracking-normal text-slate-400">(optional)</span>}</span>
              {/* 900 leaves room for the reason prefix within the backend's 1000-character limit. */}
              <textarea
                maxLength={900}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                required={isNoteRequired}
                placeholder={isDamaged ? 'Describe the damage' : 'Anything worth noting about this return'}
                className={`${fieldClass} min-h-16 py-2.5 font-medium`}
              />
            </label>
          </div>

          <div className="mt-4 flex justify-between gap-2">
            <button type="button" onClick={() => goTo('item')} className={secondaryButton}>Back</button>
            <button type="submit" className={primaryButton}>Continue</button>
          </div>
        </form>
      )}

      {step === 'confirm' && selected && (
        <form onSubmit={(event) => void handleConfirmSubmit(event)} className="mt-3">
          <dl className="grid gap-2 sm:grid-cols-2">
            {([
              ['Employee', `${selected.employeeName}${selected.employeeCode ? ` (${selected.employeeCode})` : ''}`],
              ['Item', `${selected.itemName} · ${selected.itemCode}`],
              ['Returning', `${breakdown} ${selected.unitOfMeasure}${total < outstanding ? ` · ${outstanding - total} stay with the employee` : ''}`],
              ['Reason', note.trim() ? `${reason} — ${note.trim()}` : reason],
              ...(broughtBy.trim() ? [['Brought in by', broughtBy.trim()]] : []),
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <dt className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
                <dd className="mt-1 text-xs font-bold text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
          {isDamaged && (
            <p role="note" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[0.68rem] font-semibold leading-relaxed text-amber-900">
              Damaged units go to To Be Repaired and are not issued again until fixed.
            </p>
          )}

          <section aria-labelledby="bulk-otp-title" className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
            <h4 id="bulk-otp-title" className="text-xs font-extrabold text-blue-900">Employee confirmation code</h4>
            {otpChallenge ? (
              <>
                <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-600">
                  Sent to <strong>{otpChallenge.sentTo}</strong>. Ask the employee to read it out; it expires at {new Intl.DateTimeFormat('en-PH', { timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(otpChallenge.expiresAt))}.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ''))}
                    disabled={isSubmitting}
                    placeholder="6-digit code"
                    aria-label="Employee confirmation code"
                    className="h-11 w-44 rounded-xl border border-blue-200 bg-white px-3 text-center font-mono text-base font-black tracking-[0.35em] text-slate-900 outline-none placeholder:font-sans placeholder:text-xs placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                  <button type="button" onClick={() => void sendCode()} disabled={isSendingOtp || isSubmitting} className="text-[0.68rem] font-extrabold text-blue-700 hover:underline disabled:opacity-50">
                    {isSendingOtp ? 'Sending…' : 'Send a new code'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-600">
                  These exact details and a 6-digit code are emailed to the employee. They give you the code only if everything above is correct.
                </p>
                <button type="button" onClick={() => void sendCode()} disabled={isSendingOtp} className={`${primaryButton} mt-3`}>
                  {isSendingOtp ? 'Sending code…' : 'Send code to employee'}
                </button>
              </>
            )}
          </section>

          <div className="mt-4 flex justify-between gap-2">
            <button type="button" onClick={() => goTo('details')} disabled={isSubmitting} className={secondaryButton}>Back</button>
            <button type="submit" disabled={!otpChallenge || otpCode.length !== 6 || isSubmitting} className={primaryButton}>
              {isSubmitting ? 'Recording…' : 'Record return'}
            </button>
          </div>
        </form>
      )}

      {step === 'done' && (
        <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="flex items-start gap-2 text-xs font-semibold leading-relaxed text-emerald-900">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"><path d="m5 12 5 5 9-10" /></svg>
            {result}
          </p>
          <button type="button" onClick={startOver} className={primaryButton}>Return another item</button>
        </div>
      )}
    </div>
  )
}

export default function ReturnItems() {
  const [returnLoadError, setReturnLoadError] = useState('')
  const [returnsRefreshToken, setReturnsRefreshToken] = useState(0)
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
  const [returnMode, setReturnMode] = useState<'scan' | 'bulk'>('scan')
  const [bulkReturnOptions, setBulkReturnOptions] = useState<BulkReturnOption[]>([])
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

  useEffect(() => {
    let isMounted = true

    const loadReturnedItems = async () => {
      setReturnLoadError('')

      try {
        const holdingsResponse = await listHoldings()
        if (!isMounted) return
        const quantityReturnOptions: BulkReturnOption[] = holdingsResponse.items
          .filter((entry) => entry.source === 'GSO issuance' && entry.trackingMode === 'quantity')
          .map((entry) => ({
            id: entry.issuanceId,
            employeeCode: entry.employeeCode || '',
            employeeName: entry.employeeName,
            itemCode: entry.itemCode,
            itemName: entry.itemName,
            quantity: entry.quantity,
            unitOfMeasure: entry.unitOfMeasure,
            conditionAtIssue: entry.conditionAtIssue || '—',
            isOverdue: entry.isOverdue,
            dueAt: entry.dueAt,
          }))
        setBulkReturnOptions(quantityReturnOptions)
      } catch (error) {
        if (isMounted) setReturnLoadError(error instanceof Error ? error.message : 'Unable to load the items still with employees.')
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
        reason: note ? `${returnReason} — ${note}` : returnReason,
        entryMethod,
        returnedByName: returnedByName.trim(),
        ...(needsSerialCheck ? { serialLast4 } : {}),
        otpChallengeId: otpChallenge.challengeId,
        otp: otpCode,
      })
      setScannedTag(null)
      setScannerCode('')
      setReturnReason('')
      setReturnNote('')
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
      setReturnsRefreshToken((current) => current + 1)
      focusScannerInput(50)
    } catch (error) {
      setBarcodeError(error instanceof Error ? error.message : 'Could not confirm this item return.')
    } finally {
      setIsConfirmingReturn(false)
    }
  }

  const currentAssignment = scannedTag?.borrowerHistory?.find((entry) => entry.status === 'Issued')
  const previousBorrowers = scannedTag?.borrowerHistory?.filter((entry) => entry.status !== 'Issued') ?? []
  const recordedConditionRank = conditionRank.indexOf(scannedTag?.condition ?? '')
  const isConditionDowngrade = recordedConditionRank >= 0 && conditionRank.indexOf(returnCondition) > recordedConditionRank
  const isRepairTag = repairConditionNames.includes(returnCondition)
  // A unit with a serial on file is matched by the last characters read off the unit, not the screen.
  const serialTailLength = Math.min(4, (scannedTag?.serialNumber ?? '').replace(/[^A-Za-z0-9]/g, '').length)
  const needsSerialCheck = serialTailLength > 0
  const isSerialEntered = !needsSerialCheck || serialLast4.length === serialTailLength
  // A typed code or a condition downgrade needs a written explanation for the audit log.
  const isNoteRequired = returnReason === 'Iba pa' || isConditionDowngrade || entryMethod === 'typed'
  const missingForReturn = !returnReason
    ? 'Select the reason for return.'
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
  const isInspectionDone = Boolean(returnReason) && (!isNoteRequired || Boolean(returnNote.trim())) && isSerialEntered && hasPhysicalCheck

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
              Scan a unique per-unit asset tag for physical assets. Record bulk stock returns by quantity.
            </p>
          </div>
          
        </div>
        <nav className="relative mt-6 flex flex-wrap gap-2 border-t border-blue-400/20 pt-4" aria-label="Returns and records pages">
          <a href="/gso/return-items" aria-current="page" className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-blue-950 shadow-md">
            + Return Items
          </a>
          <a href="/gso/issuance" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-extrabold text-blue-100 transition hover:bg-white/12">
            + Issuances Records
          </a>
        </nav>
      </section>

      {returnLoadError && <p role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">{returnLoadError}</p>}

      <section className="mt-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6" aria-labelledby="return-process-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="return-process-title" className="text-sm font-black text-slate-900">Process an item return</h2>
            <p className="mt-1 text-xs text-slate-500">
              {returnMode === 'scan'
                ? 'Scan the barcode on an individually tagged unit, like a laptop.'
                : 'Return reusable stock tracked by quantity, like chairs or tools. The employee confirms with an emailed code.'}
            </p>
          </div>
          <div role="tablist" aria-label="Return type" className="inline-flex rounded-xl bg-slate-100 p-1">
            {([['scan', 'Tagged unit'], ['bulk', `Bulk stock (${bulkReturnOptions.length})`]] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="tab"
                id={`return-tab-${mode}`}
                aria-selected={returnMode === mode}
                aria-controls={`return-panel-${mode}`}
                onClick={() => {
                  setReturnMode(mode)
                  if (mode === 'scan') focusScannerInput(50)
                }}
                className={`rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${returnMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div role="tabpanel" id="return-panel-bulk" aria-labelledby="return-tab-bulk" hidden={returnMode !== 'bulk'} className="mt-4 border-t border-slate-100 pt-4">
          <BulkReturnPanel options={bulkReturnOptions} onReturned={() => setReturnsRefreshToken((current) => current + 1)} />
        </div>

        <div role="tabpanel" id="return-panel-scan" aria-labelledby="return-tab-scan" hidden={returnMode !== 'scan'}>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-extrabold text-blue-900" role="status" aria-live="polite">
                <span className={`h-2.5 w-2.5 rounded-full ${isLookingUpBarcode ? 'animate-pulse bg-amber-500' : hasScannerFocus ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {isLookingUpBarcode ? 'Reading barcode...' : scannedTag ? 'Inspection in progress' : hasScannerFocus ? 'Scanner ready' : 'Scanner waiting for focus'}
              </p>
              <p className="mt-1 text-[0.68rem] text-slate-600">Scan the label on one unit. The code appears in the box below and the item details pop up automatically. If the label is damaged, type the code and press Enter.</p>
            </div>
            <button type="button" onClick={() => focusScannerInput()} disabled={isLookingUpBarcode || Boolean(scannedTag)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-[0.68rem] font-extrabold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">
              Focus scanner
            </button>
          </div>
          <form onSubmit={handleBarcodeLookup} aria-label="USB barcode scanner input" className="mt-3 flex gap-2">
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
              aria-label="Scan an individual asset barcode"
              disabled={isLookingUpBarcode || Boolean(scannedTag) || isConfirmingReturn}
              className="h-12 min-w-0 flex-1 rounded-xl border-2 border-dashed border-blue-200 bg-white px-4 font-mono text-sm font-bold uppercase tracking-wider text-slate-800 outline-none transition placeholder:font-sans placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-solid focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
            />
            <button type="submit" disabled={isLookingUpBarcode || Boolean(scannedTag) || isConfirmingReturn || !scannerCode.trim()} className="h-12 shrink-0 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
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
                  <h2 id="return-confirm-title" className="mt-1 truncate text-lg font-black text-slate-950 sm:text-xl">{scannedTag.itemName}</h2>
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
                        This code was typed, not scanned. Explain why in the notes, for example a damaged label. The return is flagged in the audit log.
                      </p>
                    )}

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                      {([
                        ['Item code', `${scannedTag.itemCode} · Unit ${scannedTag.unitNumber}`],
                        ['Serial no.', scannedTag.serialNumber ? 'On file · check it on the unit' : 'Not recorded'],
                        ['Borrowed by', scannedTag.employeeName],
                        ['Employee', [scannedTag.employeeCode, currentAssignment?.department].filter(Boolean).join(' · ')],
                        ['Issued on', formatBorrowerHistoryDate(currentAssignment?.issuedAt ?? null)],
                        ['Condition on record', scannedTag.condition],
                      ] as const).map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
                          <dd className="mt-0.5 wrap-break-word text-xs font-bold text-slate-800">{value || '—'}</dd>
                        </div>
                      ))}
                    </dl>

                    <details className="group rounded-2xl border border-slate-200 bg-white">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
                        Previous borrowers ({previousBorrowers.length})
                        <span className="transition group-open:rotate-90"><ChevronRight /></span>
                      </summary>
                      <div className="border-t border-slate-100 px-4 py-3">
                        {previousBorrowers.length > 0 ? (
                          <ol className="max-h-48 space-y-2 overflow-y-auto pr-1">
                            {previousBorrowers.map((borrower, index) => (
                              <li key={`${borrower.employeeCode}-${borrower.issuedAt}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2">
                                <p className="text-xs font-extrabold text-slate-800">{borrower.employeeName} <span className="font-semibold text-slate-500">· {borrower.employeeCode}</span></p>
                                <p className="mt-0.5 text-[0.62rem] text-slate-500">
                                  Issued {formatBorrowerHistoryDate(borrower.issuedAt)}
                                  {borrower.returnedAt ? ` · Returned ${formatBorrowerHistoryDate(borrower.returnedAt)}` : ''}
                                  {borrower.returnCondition ? ` · ${borrower.returnCondition}` : ''}
                                </p>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="text-[0.68rem] text-slate-500">No one else has borrowed this unit yet.</p>
                        )}
                      </div>
                    </details>

                    <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[0.68rem] leading-relaxed text-slate-500">
                      <span className="font-extrabold text-slate-700">Giving it to another employee?</span> Record this return first, then issue the unit from{' '}
                      <a href="/gso/main-issuance" className="font-extrabold text-blue-700 underline underline-offset-2 hover:no-underline">Main Issuance</a>
                      {' '}so the new employee confirms receipt.
                    </p>
                  </aside>

                  <div className="space-y-4">
                    <section aria-labelledby="return-inspect-title" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                      <div className="flex items-center gap-2.5">
                        <StepBadge number={1} done={isInspectionDone} />
                        <h3 id="return-inspect-title" className="text-sm font-black text-slate-900">Inspect the unit</h3>
                      </div>

                      <fieldset className="mt-4" disabled={isConfirmingReturn}>
                        <legend className="mb-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Condition after inspection</legend>
                        <div className="space-y-2">
                          {bulkConditionGroups.map((group) => (
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
                                      {condition}
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
                      {isConditionDowngrade && (
                        <p role="note" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900">
                          Condition dropped from <strong>{scannedTag.condition}</strong> to <strong>{returnCondition}</strong>. Describe the damage in the notes.
                        </p>
                      )}

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Reason for return</span>
                          <select value={returnReason} onChange={(event) => setReturnReason(event.target.value)} required disabled={isConfirmingReturn} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                            <option value="" disabled>Select a reason</option>
                            {returnReasons.map((reason) => <option key={reason}>{reason}</option>)}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Brought in by <span className="normal-case text-slate-400">(if not the borrower)</span></span>
                          <input type="text" maxLength={200} value={returnedByName} onChange={(event) => setReturnedByName(event.target.value)} disabled={isConfirmingReturn} placeholder="Name of the person at the counter" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
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
                            ? 'Explain why the code was typed (for example, a damaged label)'
                            : isConditionDowngrade
                              ? 'Describe the damage or what changed'
                              : returnReason === 'Iba pa'
                                ? 'Explain why the item is being returned'
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
                        <span>The physical item is in front of me, and its barcode label matches this record.</span>
                      </label>
                    </section>

                    <section aria-labelledby="return-otp-title" className="rounded-2xl border border-blue-200 bg-white p-4 sm:p-5">
                      <div className="flex items-center gap-2.5">
                        <StepBadge number={2} done={otpCode.length === 6} />
                        <h3 id="return-otp-title" className="text-sm font-black text-slate-900">Employee confirmation</h3>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-500">
                        Every return is confirmed by the borrower. A 6-digit code is emailed to {scannedTag.employeeName}, who reads it out to you only if they are returning this unit now.
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
