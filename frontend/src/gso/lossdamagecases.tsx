import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { formatDate, formatDateTime } from '../requesters/requesterrequestutils'
import { formText } from './requisitionFlow'
import { Banner, EmptyState, fieldLabel } from './requisitionParts'
import {
  closeLossDamageCase,
  listLossDamageCases,
  saveLossDamageDecision,
  startLossDamageReview,
  type LossDamageCase,
  type LossDamageCaseResult,
  type EditableLossDamageResolution,
  type LossDamageResolution,
  type LossDamageSettlement,
  type ChargeEstimate,
  type LossDamageRepairOwner,
} from './lossDamageCasesApi'

type Queue = 'new' | 'review' | 'repair' | 'closed'
type Notice = { tone: 'success' | 'info' | 'warning'; text: string }
type CandidateUnit = { tagCode?: string }
type ItemRow = {
  quantity?: number | string
  description?: string
  assetCode?: string
  tagCode?: string
  issuanceId?: string
  identityUnknown?: boolean
  candidateUnits?: CandidateUnit[]
  remarks?: string
  unitOfMeasure?: string
}

// Cases progress from submission through review and a decision, then repair when needed.
const QUEUES: Record<Queue, { label: string; hint: string; empty: string }> = {
  new: { label: 'New Reports', hint: 'Start the review to read the whole report before you decide.', empty: 'No new reports.' },
  review: { label: 'Under Review', hint: 'Choose one resolution for the report.', empty: 'No reports waiting for a decision.' },
  repair: { label: 'Follow-up', hint: 'Charged or repair cases: finish the physical follow-up, then close the case.', empty: 'No cases waiting for follow-up.' },
  closed: { label: 'Closed', hint: 'Finished cases, with no charge or completed follow-up.', empty: 'No closed cases yet.' },
}
const QUEUE_ORDER = Object.keys(QUEUES) as Queue[]

// A lost item is waived (the reason is asked) or charged (calculated, paid at Finance).
const LOST_RESOLUTIONS: Array<{ value: EditableLossDamageResolution; title: string; detail: string }> = [
  { value: 'NO_CHARGE', title: 'Waive', detail: 'No payment.' },
  { value: 'CHARGED', title: 'Charge', detail: 'Calculated from item costs. Paid at Finance.' },
]
// A damaged item goes straight to To Be Repaired; GSO picks who repairs it.
const DAMAGED_RESOLUTIONS: Array<{ value: EditableLossDamageResolution; title: string; detail: string }> = [
  { value: 'FOR_REPAIR', title: 'Send to repair', detail: 'Moves to To Be Repaired now.' },
]
const REPAIR_OWNERS: Array<{ value: LossDamageRepairOwner; title: string; detail: string }> = [
  { value: 'GSO', title: 'GSO', detail: 'GSO repairs it.' },
  { value: 'ITSS', title: 'ITSS', detail: 'IT Admin repairs it.' },
]
// The reason list follows the action and, for a repair, the owner GSO picked.
const OTHER_REASON = 'Other'
const REASON_OPTIONS: Record<string, string[]> = {
  NO_CHARGE: ['Normal wear from approved use', 'Found intact, not lost', 'Caused by the school, not the requester', OTHER_REASON],
  CHARGED: ['Not returned after notice', 'Lost through the requester’s negligence', 'Lost while not used as instructed', OTHER_REASON],
  FOR_REPAIR_GSO: ['Minor repair or cleaning', 'Replacement part needed', 'Needs a check first', OTHER_REASON],
  FOR_REPAIR_ITSS: ['Hardware problem', 'Software or system problem', 'Needs IT diagnosis', OTHER_REASON],
}
const RESOLUTION_TITLE: Record<LossDamageResolution, string> = { NO_CHARGE: 'Waived', CHARGED: 'Charged', FOR_REPAIR: 'For repair', RESOLVED: 'Resolved' }
const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
const STEPS = ['Submitted', 'Review', 'Decision', 'Follow-up', 'Closed']

// Same look as Facility Requests: primary blue, quiet outlines, emerald for the final step.
const primaryButton = 'rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
const successButton = 'rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50'
const quietButton = 'rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
const inputClass = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
const textAreaClass = 'min-h-24 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-xs font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
const sectionBorder = 'mt-4 border-t border-slate-200 pt-4'

// A name typed all in lowercase is shown with capitals; any other spelling is kept as typed (for example "dela Cruz").
function displayName(name: string | null | undefined) {
  const trimmed = (name || '').trim()
  return trimmed && trimmed === trimmed.toLowerCase() ? trimmed.replace(/(^|\s)(\p{L})/gu, (_match, space: string, letter: string) => space + letter.toUpperCase()) : trimmed
}

const requesterOf = (item: LossDamageCase) => displayName(item.requesterFullName) || formText(item.formData.requesterName) || item.requesterName
const itemsOf = (item: LossDamageCase): ItemRow[] => (Array.isArray(item.formData.items) ? item.formData.items as ItemRow[] : [])
const unitsOf = (item: LossDamageCase) => itemsOf(item).reduce((total, row) => total + (Number(row.quantity) || 0), 0)
const incidentOf = (item: LossDamageCase) => (formText(item.formData.incidentType) === 'DAMAGED' ? 'Damaged' : 'Lost')
// A repair whose item already left the holdings is done for GSO, even if the old case still reads In Progress.
const isClosed = (item: LossDamageCase) => item.status === 'Closed' || item.status === 'Completed'
  || (item.settlement?.status === 'FOR_REPAIR' && Boolean(item.settlement.custodyResolvedAt))
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function queueOf(item: LossDamageCase): Queue {
  if (isClosed(item)) return 'closed'
  if (item.settlement?.status === 'FOR_REPAIR' || item.settlement?.status === 'CHARGED' || item.settlement?.status === 'RESOLVED') return 'repair'
  if (item.status === 'Submitted') return 'new'
  return 'review'
}

function chipFor(item: LossDamageCase) {
  if (isClosed(item)) return { label: item.settlement?.status === 'NO_CHARGE' ? 'Waived' : item.settlement?.status === 'RESOLVED' ? 'Resolved' : 'Closed', tone: 'bg-slate-100 text-slate-600' }
  if (item.settlement?.status === 'CHARGED') return { label: 'Charged', tone: 'bg-amber-50 text-amber-800' }
  if (item.settlement?.status === 'FOR_REPAIR') return { label: 'For repair', tone: 'bg-rose-50 text-rose-700' }
  if (item.settlement?.status === 'RESOLVED') return { label: 'Resolved', tone: 'bg-emerald-50 text-emerald-700' }
  if (item.status === 'Submitted') return { label: 'New', tone: 'bg-blue-50 text-blue-700' }
  return { label: 'Needs decision', tone: 'bg-amber-50 text-amber-800' }
}

// The step the case is on: 0 submitted, 2 waiting for the decision, 3 follow-up, 5 closed.
function currentStepOf(item: LossDamageCase) {
  if (isClosed(item)) return STEPS.length
  if (item.settlement?.status === 'FOR_REPAIR' || item.settlement?.status === 'CHARGED' || item.settlement?.status === 'RESOLVED') return 3
  return item.status === 'Submitted' ? 0 : 2
}

function decisionNotice(resolution: EditableLossDamageResolution, result: LossDamageCaseResult): Notice {
  if (resolution === 'NO_CHARGE') return { tone: 'success', text: `${result.case.referenceNo} is waived and closed. The requester has been told.` }
  if (resolution === 'FOR_REPAIR') return { tone: 'success', text: `${result.case.referenceNo} is closed. Sent to ${result.case.settlement?.repairOwner ?? 'GSO'} for repair.` }
  return { tone: 'success', text: `${result.case.referenceNo} is closed. ${peso(result.case.settlement?.chargeAmount ?? 0)} reported to Finance.` }
}

export default function LossDamageCases() {
  const [cases, setCases] = useState<LossDamageCase[]>([])
  const [chosenQueue, setChosenQueue] = useState<Queue | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  // A notification link opens its case once, on the first load.
  const focusHandled = useRef(false)

  const loadCases = useCallback(async () => {
    try {
      const result = await listLossDamageCases()
      setCases(result.cases)
      setError('')
      if (!focusHandled.current) {
        focusHandled.current = true
        // Notices link with ?case= (or ?request= from the shared notice builder). Ids come back as strings.
        const params = new URLSearchParams(window.location.search)
        const wanted = params.get('case') ?? params.get('request')
        const found = result.cases.find((item) => String(item.id) === wanted)
        if (found) {
          setChosenQueue(queueOf(found))
          setSelectedId(found.id)
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load Loss & Damage Cases.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Deferred like the request page's own load, so the first render stays quiet.
    const timer = window.setTimeout(() => { void loadCases() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadCases])

  const counts = useMemo(() => {
    const totals: Record<Queue, number> = { new: 0, review: 0, repair: 0, closed: 0 }
    for (const item of cases) totals[queueOf(item)] += 1
    return totals
  }, [cases])
  // Open the first queue that has work until a staff member picks one.
  const queue: Queue = chosenQueue ?? QUEUE_ORDER.find((key) => counts[key] > 0) ?? 'new'
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return cases.filter((item) => queueOf(item) === queue
      && (!query || `${item.referenceNo} ${requesterOf(item)} ${formText(item.formData.keyArea)} ${formText(item.formData.responsiblePerson)}`.toLowerCase().includes(query)))
  }, [cases, queue, search])
  const selected = visible.find((item) => item.id === selectedId) || visible[0] || null

  function chooseQueue(next: Queue) {
    setChosenQueue(next)
    setSelectedId('')
    setNotice(null)
  }

  // After a change, the case is shown in the queue it moved to, so the next step is in view.
  async function afterChange(updated: LossDamageCase, message: Notice) {
    setNotice(message)
    setChosenQueue(queueOf(updated))
    setSelectedId(updated.id)
    await loadCases()
  }

  return <GsoPageFrame activePage="Loss & Damage Cases" searchPlaceholder="Search reference, requester, location...">
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" /><div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border-18 border-white/4" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-[40%] h-64 w-64 rounded-full border-22 border-white/3" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Review, decision, and follow-up</span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Loss &amp; Damage Cases</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-blue-100">Review each loss or damage report, choose no charge or repair, and record the completed follow-up.</p>
        </div>
      </section>

      <section className="space-y-3" aria-label="Loss and damage case queues">
        <QueueSelector active={queue} counts={counts} onChange={chooseQueue} />
        <p className="min-h-5 text-[0.68rem] leading-relaxed text-slate-500">{QUEUES[queue].hint}</p>
        {error && <Banner tone="error">{error}</Banner>}
        {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}
      </section>

      <section className="grid gap-5 xl:grid-cols-2" aria-label="Loss and damage case workflow">
        <section className="flex min-w-0 flex-col rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-wide text-blue-700">Cases</p>
                <h2 className="mt-0.5 text-base font-black leading-tight text-slate-900">{QUEUES[queue].label}</h2>
              </div>
              <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">{plural(visible.length, 'case')}</span>
            </div>

            <div className="mt-4 flex w-full gap-2">
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, requester, location" aria-label="Search loss and damage cases" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              <button type="button" onClick={() => { setLoading(true); void loadCases() }} disabled={loading} className="h-11 shrink-0 rounded-xl border border-slate-300 bg-white px-4 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-wait disabled:opacity-60">{loading ? 'Loading…' : 'Refresh'}</button>
            </div>

            <div className="inventory-list-scrollbar mt-3 max-h-[60vh] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
              {loading && cases.length === 0 ? <p className="p-8 text-center text-xs font-semibold text-slate-400">Loading cases…</p>
                : visible.length === 0 ? <p className="p-8 text-center text-xs font-semibold text-slate-500">{search ? 'No cases match your search.' : QUEUES[queue].empty}</p>
                  : visible.map((item) => {
                    const chip = chipFor(item)
                    const isSelected = selected?.id === item.id
                    const date = formText(item.formData.incidentDate)
                    return <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setNotice(null) }} aria-current={isSelected ? 'true' : undefined} className={`block w-full rounded-xl border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${isSelected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'}`}>
                      <span className="flex items-center justify-between gap-2"><span className="text-sm font-extrabold text-slate-900">{item.referenceNo}</span><span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${chip.tone}`}>{chip.label}</span></span>
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-wide ${incidentOf(item) === 'Lost' ? 'bg-rose-100 text-rose-800 ring-1 ring-rose-200' : 'bg-orange-100 text-orange-800 ring-1 ring-orange-200'}`}>{incidentOf(item) === 'Lost' ? 'Lost item' : 'Damaged item'}</span>
                        <span className="min-w-0 truncate text-xs font-semibold text-slate-700">{requesterOf(item)}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{formText(item.formData.keyArea) || 'Location not set'} · {date ? formatDate(date) : 'Date not set'}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{plural(unitsOf(item), 'item')} · Submitted {formatDate(item.createdAt)}</span>
                    </button>
                  })}
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-col rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-5">
          <div className="border-b border-slate-200 pb-4">
            <p className="text-xs font-extrabold uppercase tracking-wide text-blue-700">Case</p>
            <h2 className="mt-0.5 text-base font-black leading-tight text-slate-900">Case details</h2>
          </div>
          {!selected
            ? <EmptyState title={QUEUES[queue].empty} detail="Choose another queue, or search for a case." />
            : <CaseDetail
              key={`${selected.id}:${selected.status}:${selected.updatedAt}:${selected.settlement?.status ?? 'none'}`}
              item={selected}
              onChanged={(updated, message) => void afterChange(updated, message)}
            />}
        </section>
      </section>
    </div>
  </GsoPageFrame>
}

function QueueSelector({ active, counts, onChange }: { active: Queue; counts: Record<Queue, number>; onChange: (queue: Queue) => void }) {
  return <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="group" aria-label="Case queues">
    {QUEUE_ORDER.map((key, index) => {
      const selected = key === active
      return <button key={key} type="button" aria-pressed={selected} onClick={() => onChange(key)} className={`rounded-xl border-2 p-3 text-left shadow-md transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${selected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-300/80 bg-white shadow-slate-300/35 ring-1 ring-slate-900/5 hover:border-blue-300 hover:bg-blue-50/40'}`}>
        <span className={`block text-xs font-extrabold ${selected ? 'text-blue-800' : 'text-slate-900'}`}><span className={selected ? 'text-blue-600' : 'text-slate-400'}>{index + 1}.</span> {QUEUES[key].label}</span>
        <span className={`mt-1 block text-[0.68rem] font-semibold ${selected ? 'text-blue-700' : 'text-slate-500'}`}>{plural(counts[key], 'case')}</span>
      </button>
    })}
  </div>
}

type ChangeHandler = (updated: LossDamageCase, message: Notice) => void

function CaseDetail({ item, onChanged }: { item: LossDamageCase; onChanged: ChangeHandler }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const settlement = item.settlement
  const unidentifiedItems = itemsOf(item).filter((row) => row.identityUnknown === true)
  const closed = isClosed(item)
  const needsStart = !closed && !settlement && (item.status === 'Submitted' || item.status === 'Needs Information')
  const needsDecision = !closed && !settlement && ['Under Review', 'Approved', 'In Progress'].includes(item.status)
  // A charge can still change until the follow-up; a repair is already in To Be Repaired, so it is final.
  const canChangeDecision = !closed && settlement?.status === 'CHARGED' && item.status === 'In Progress'
  const canClose = !closed && item.status === 'In Progress' && (settlement?.status === 'FOR_REPAIR' || settlement?.status === 'CHARGED' || settlement?.status === 'RESOLVED')

  // Runs one change and hands the saved case to the page.
  async function run<T extends LossDamageCaseResult>(action: () => Promise<T>, message: (result: T) => Notice) {
    setBusy(true)
    setError('')
    try {
      const result = await action()
      setEditing(false)
      onChanged(result.case, message(result))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The change was not saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"><CaseSummary item={item} /></div>
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white px-3.5 pb-3 pt-1"><FlowTrail steps={STEPS} current={currentStepOf(item)} /></div>

    {error && <div className="mt-4"><Banner tone="error">{error}</Banner></div>}

    <IncidentItems item={item} />
    {settlement && <DecisionCard settlement={settlement} />}

    {needsStart && <section className={sectionBorder} aria-labelledby="case-start-title">
      <SectionHeading id="case-start-title" title="Start the review" detail="The requester is told." />
      <div className="flex justify-end">
        <button type="button" disabled={busy} onClick={() => void run(() => startLossDamageReview(item.id), (result) => ({ tone: 'success', text: `${result.case.referenceNo} is under review. The requester has been told.` }))} className={primaryButton}>{busy ? 'Starting…' : 'Start review'}</button>
      </div>
    </section>}

    {(needsDecision || (canChangeDecision && editing)) && <section className={sectionBorder} aria-labelledby="case-decision-title">
      <SectionHeading id="case-decision-title" title={needsDecision ? 'Choose the decision' : 'Change the decision'} detail={needsDecision ? 'One resolution for the whole report.' : 'Change before the follow-up is done.'} />
      <DecisionForm
        initial={editing && settlement ? settlement : null}
        busy={busy}
        estimate={item.chargeEstimate}
        lost={incidentOf(item) === 'Lost'}
        unidentifiedItems={unidentifiedItems}
        onCancel={editing ? () => setEditing(false) : undefined}
        onSave={(payload) => void run(() => saveLossDamageDecision(item.id, payload), (result) => decisionNotice(payload.resolution, result))}
      />
    </section>}

    {canClose && <CloseSection
      busy={busy}
      onChangeDecision={canChangeDecision && !editing ? () => setEditing(true) : undefined}
      onClose={(note) => void run(() => closeLossDamageCase(item.id, { handled: true, note }), () => ({ tone: 'success', text: `${item.referenceNo} is closed. The requester has been told.` }))}
    />}

    {closed && <section className={sectionBorder}>
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
        <p className="text-xs font-extrabold text-slate-800">This case is closed.</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{settlement ? RESOLUTION_TITLE[settlement.resolution] : 'Closed without a decision record.'}</p>
      </div>
    </section>}

  </>
}

function CaseSummary({ item }: { item: LossDamageCase }) {
  const chip = chipFor(item)
  const date = formText(item.formData.incidentDate)
  const remarks = formText(item.formData.remarks)
  const facts: Array<[string, string]> = [
    ['Incident', `${incidentOf(item)}${date ? ` · ${formatDate(date)}` : ''}`],
    ['Location', formText(item.formData.keyArea) || 'Not set'],
    ['Responsible person', formText(item.formData.responsiblePerson) || 'Not set'],
    ['Items', plural(unitsOf(item), 'item')],
  ]
  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
      <div className="min-w-0">
        <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">{item.referenceNo}</p>
        <h3 className="mt-1 text-lg font-black text-slate-900">{requesterOf(item)}</h3>
        <p className="mt-0.5 text-[0.65rem] text-slate-500">Submitted {formatDateTime(item.createdAt)}</p>
      </div>
      <span className="flex flex-wrap items-center gap-2"><span className={`rounded-md px-2 py-1 text-[0.62rem] font-black uppercase tracking-wide ${incidentOf(item) === 'Lost' ? 'bg-rose-100 text-rose-800 ring-1 ring-rose-200' : 'bg-orange-100 text-orange-800 ring-1 ring-orange-200'}`}>{incidentOf(item) === 'Lost' ? 'Lost item' : 'Damaged item'}</span><span className={`rounded-full px-2.5 py-1.5 text-[0.62rem] font-extrabold ${chip.tone}`}>{chip.label}</span></span>
    </div>
    <dl className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">{facts.map(([label, value]) => <Fact key={label} label={label} value={value} />)}</dl>
    {remarks && <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm shadow-slate-200/60">
      <p className="text-[0.68rem] leading-relaxed text-slate-600"><span className="font-extrabold text-slate-500">Requester remarks: </span>{remarks}</p>
    </div>}
  </div>
}

// One card per item: the barcodes sit in a compact list, and unidentified units are counted once.
type ItemGroup = { name: string; unit: string; quantity: number; codes: string[]; unidentified: number; possible: string[]; remarks: string[] }

function groupReportedItems(rows: ItemRow[]): ItemGroup[] {
  const groups = new Map<string, ItemGroup>()
  for (const row of rows) {
    const name = formText(row.description) || 'Item'
    const group = groups.get(name) ?? { name, unit: formText(row.unitOfMeasure), quantity: 0, codes: [], unidentified: 0, possible: [], remarks: [] }
    const count = Number(row.quantity) || 0
    group.quantity += count
    if (row.identityUnknown) {
      group.unidentified += count
      for (const unit of row.candidateUnits ?? []) {
        if (unit.tagCode && !group.possible.includes(unit.tagCode)) group.possible.push(unit.tagCode)
      }
    } else if (formText(row.assetCode)) {
      group.codes.push(formText(row.assetCode))
    }
    const remark = formText(row.remarks)
    if (remark && !group.remarks.includes(remark)) group.remarks.push(remark)
    groups.set(name, group)
  }
  return [...groups.values()]
}

function IncidentItems({ item }: { item: LossDamageCase }) {
  const groups = groupReportedItems(itemsOf(item))
  return <section className={sectionBorder} aria-labelledby="case-items-title">
    <SectionHeading id="case-items-title" title="Items reported" detail="Still with the requester." />
    {groups.length === 0
      ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4 text-center text-xs font-semibold text-slate-500">No items on this report.</p>
      : <ul className="space-y-2">{groups.map((group) => <li key={group.name} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/60">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-extrabold text-slate-900">{group.name}</p>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-800">{plural(group.quantity, group.unit || 'piece')}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[0.65rem] font-bold">
          {group.codes.length > 0 && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-800">{group.codes.length} identified</span>}
          {group.unidentified > 0 && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-800">{group.unidentified} not identified yet</span>}
        </div>
        {group.codes.length > 0 && <div className="inventory-list-scrollbar mt-2 grid max-h-28 gap-1 overflow-y-auto rounded-lg bg-slate-50 p-1.5 sm:grid-cols-2">
          {group.codes.map((code) => <span key={code} title={code} className="truncate rounded-md bg-white px-2 py-1 font-mono text-[0.65rem] font-semibold text-slate-700 ring-1 ring-slate-200">{code}</span>)}
        </div>}
        {group.possible.length > 0 && <p className="mt-2 text-[0.65rem] leading-relaxed text-slate-500">Possible units: {group.possible.join(', ')}</p>}
        {group.remarks.map((remark) => <p key={remark} className="mt-1.5 text-[0.68rem] leading-relaxed text-slate-600">{remark}</p>)}
      </li>)}</ul>}
  </section>
}

function DecisionCard({ settlement }: { settlement: LossDamageSettlement }) {
  return <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm shadow-slate-200/60">
    <p className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-500">Current decision</p>
    <p className="mt-1 text-sm font-black text-slate-900">{RESOLUTION_TITLE[settlement.resolution]}{settlement.chargeAmount ? ` · ${peso(settlement.chargeAmount)}` : ''}{settlement.repairOwner ? ` · repaired by ${settlement.repairOwner}` : ''}</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-700"><span className="font-extrabold text-slate-500">Reason: </span>{settlement.reason}</p>
    <p className="mt-1 text-[0.65rem] text-slate-500">{settlement.assessedBy || 'GSO Staff'} · {formatDateTime(settlement.assessedAt)}</p>
  </div>
}

function DecisionForm({ initial, busy, estimate, lost, unidentifiedItems, onSave, onCancel }: {
  initial: LossDamageSettlement | null
  busy: boolean
  estimate: ChargeEstimate
  lost: boolean
  unidentifiedItems: ItemRow[]
  onSave: (payload: { resolution: EditableLossDamageResolution; reason: string; repairOwner?: LossDamageRepairOwner; resolvedUnits?: Array<{ issuanceId: string; tagCodes: string[] }> }) => void
  onCancel?: () => void
}) {
  const options = lost ? LOST_RESOLUTIONS : DAMAGED_RESOLUTIONS
  const [resolution, setResolution] = useState<EditableLossDamageResolution | ''>(
    initial && options.some((option) => option.value === initial.resolution) ? initial.resolution as EditableLossDamageResolution : '',
  )
  const [repairOwner, setRepairOwner] = useState<LossDamageRepairOwner | ''>(initial?.repairOwner ?? '')
  const [reasonChoice, setReasonChoice] = useState('')
  const [otherReason, setOtherReason] = useState('')
  const [resolvedTags, setResolvedTags] = useState<Record<string, string[]>>({})
  // If the requester's item count equals the units still issued on that issuance, every candidate is the lost one,
  // so they are ticked automatically. Otherwise GSO ticks them.
  const chosenTagsOf = (row: ItemRow): string[] => {
    const issuanceId = String(row.issuanceId || '')
    if (resolvedTags[issuanceId]) return resolvedTags[issuanceId]
    const candidates = (row.candidateUnits || []).map((unit) => String(unit.tagCode || '')).filter(Boolean)
    return candidates.length === Number(row.quantity) ? candidates : []
  }
  const allUnitsIdentified = unidentifiedItems.every((row) => {
    const chosen = chosenTagsOf(row)
    const candidates = new Set((row.candidateUnits || []).map((unit) => String(unit.tagCode || '')).filter(Boolean))
    return chosen.length === Number(row.quantity) && new Set(chosen).size === chosen.length && chosen.every((tagCode) => candidates.has(tagCode))
  })
  const chargeable = (estimate?.total ?? 0) > 0
  const needsOwner = resolution === 'FOR_REPAIR'
  const reasonOptions = resolution === '' || (resolution === 'FOR_REPAIR' && !repairOwner)
    ? []
    : REASON_OPTIONS[resolution === 'FOR_REPAIR' ? `FOR_REPAIR_${repairOwner}` : resolution] ?? []
  const reason = reasonChoice === OTHER_REASON ? otherReason.trim() : reasonChoice
  const ready = resolution !== '' && reason !== '' && allUnitsIdentified
    && (resolution !== 'CHARGED' || chargeable) && (!needsOwner || repairOwner !== '')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || busy) return
    onSave({
      resolution,
      reason,
      ...(needsOwner && repairOwner ? { repairOwner } : {}),
      ...(unidentifiedItems.length ? { resolvedUnits: unidentifiedItems.map((row) => ({ issuanceId: String(row.issuanceId || ''), tagCodes: chosenTagsOf(row) })) } : {}),
    })
  }

  return <form onSubmit={submit} className="space-y-4">
    <div role="radiogroup" aria-label="Resolution" className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const picked = resolution === option.value
        return <button key={option.value} type="button" role="radio" aria-checked={picked} disabled={busy} onClick={() => { setResolution(option.value); setReasonChoice('') }} className={`rounded-xl border-2 p-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:opacity-60 ${picked ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
          <span className="block text-xs font-extrabold text-slate-900">{option.title}</span>
          <span className="mt-1 block text-[0.65rem] leading-snug text-slate-600">{option.detail}</span>
        </button>
      })}
    </div>

    {resolution === 'FOR_REPAIR' && <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3.5">
      <p className="text-[0.58rem] font-extrabold uppercase tracking-wide text-blue-900">Who repairs it?</p>
      <div role="radiogroup" aria-label="Repair owner" className="grid gap-2 sm:grid-cols-2">
        {REPAIR_OWNERS.map((owner) => {
          const picked = repairOwner === owner.value
          return <button key={owner.value} type="button" role="radio" aria-checked={picked} disabled={busy} onClick={() => { setRepairOwner(owner.value); setReasonChoice('') }} className={`rounded-xl border-2 bg-white p-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:opacity-60 ${picked ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300'}`}>
            <span className="block text-xs font-extrabold text-slate-900">{owner.title}</span>
            <span className="mt-1 block text-[0.65rem] leading-snug text-slate-600">{owner.detail}</span>
          </button>
        })}
      </div>
    </div>}

    {resolution === 'CHARGED' && <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
      <p className="text-[0.58rem] font-extrabold uppercase tracking-wide text-amber-900">Calculated charge</p>
      {chargeable ? <>
        <ul className="mt-2 space-y-1">{(estimate?.lines ?? []).map((line, index) => <li key={index} className="flex justify-between gap-3 text-xs text-slate-700">
          <span className="min-w-0 truncate">{line.description} <span className="text-slate-500">× {line.quantity} · {peso(line.unitCost)} each</span></span>
          <span className="shrink-0 font-bold text-slate-900">{peso(line.amount)}</span>
        </li>)}</ul>
        <p className="mt-2 flex justify-between border-t border-amber-200 pt-2 text-sm font-black text-slate-900"><span>Total to pay at Finance</span><span>{peso(estimate?.total ?? 0)}</span></p>
      </> : <p className="mt-2 text-xs font-semibold text-rose-700">These items have no cost on record, so there is nothing to charge. Choose Waive instead.</p>}
    </div>}

    {unidentifiedItems.length > 0 && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
      <div>
        <p className="text-xs font-extrabold text-amber-950">Identify the exact unit before deciding</p>
        <p className="mt-1 text-[0.68rem] leading-relaxed text-amber-900">The requester could not identify the asset tag. Select the matching issued unit(s) from the report and review the incident details. The decision cannot be saved until each reported unit is identified.</p>
      </div>
      {unidentifiedItems.map((row) => {
        const issuanceId = String(row.issuanceId || '')
        const selected = chosenTagsOf(row)
        const candidates = (row.candidateUnits || []).map((unit) => String(unit.tagCode || '')).filter(Boolean)
        return <fieldset key={issuanceId} className="rounded-lg border border-amber-200 bg-white p-3">
          <legend className="px-1 text-[0.68rem] font-extrabold text-slate-800">{formText(row.description) || 'Reported item'} · choose {plural(Number(row.quantity) || 0, 'unit')}</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {candidates.map((tagCode) => <label key={tagCode} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold transition ${selected.includes(tagCode) ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
              <input type="checkbox" checked={selected.includes(tagCode)} disabled={busy || (!selected.includes(tagCode) && selected.length >= Number(row.quantity))} onChange={() => setResolvedTags((current) => {
                const currentTags = current[issuanceId] ?? chosenTagsOf(row)
                const next = currentTags.includes(tagCode) ? currentTags.filter((value) => value !== tagCode) : [...currentTags, tagCode]
                return { ...current, [issuanceId]: next }
              })} className="h-4 w-4 shrink-0 accent-blue-600" />
              <span>{tagCode}</span>
            </label>)}
          </div>
          <p className={`mt-2 text-[0.65rem] font-semibold ${selected.length === Number(row.quantity) ? 'text-emerald-700' : 'text-amber-800'}`}>{selected.length} of {Number(row.quantity) || 0} selected</p>
        </fieldset>
      })}
    </div>}

    <div className="space-y-2">
      <label className="block">
        <span className={fieldLabel}>Reason <span className="text-rose-600">*</span></span>
        <select value={reasonChoice} onChange={(event) => setReasonChoice(event.target.value)} disabled={busy || reasonOptions.length === 0} className={inputClass}>
          <option value="">{resolution === 'FOR_REPAIR' && !repairOwner ? 'Choose GSO or ITSS first' : resolution === '' ? 'Choose a resolution first' : 'Choose a reason'}</option>
          {reasonOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      {reasonChoice === OTHER_REASON && <textarea value={otherReason} onChange={(event) => setOtherReason(event.target.value)} disabled={busy} maxLength={1000} placeholder="Write the reason" className={textAreaClass} />}
    </div>

    <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        {onCancel && <button type="button" disabled={busy} onClick={onCancel} className={quietButton}>Cancel</button>}
        <button type="submit" disabled={!ready || busy} className={primaryButton}>{busy ? 'Saving…' : 'Save decision'}</button>
      </div>
    </div>
  </form>
}

function CloseSection({ busy, onChangeDecision, onClose }: { busy: boolean; onChangeDecision?: () => void; onClose: (note: string) => void }) {
  const [done, setDone] = useState(false)
  const [note, setNote] = useState('')
  return <section className={sectionBorder} aria-labelledby="case-close-title">
    <SectionHeading id="case-close-title" title="Close the case" />
    <CheckCard checked={done} onChange={setDone} title="Follow-up is done" />
    <label className="mt-3 block">
      <span className={fieldLabel}>Note (optional)</span>
      <input value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} maxLength={1000} placeholder="e.g. screen replaced" className={inputClass} />
    </label>
    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {onChangeDecision && <button type="button" disabled={busy} onClick={onChangeDecision} className={quietButton}>Change decision</button>}
      <button type="button" disabled={!done || busy} onClick={() => onClose(note.trim())} className={successButton}>{busy ? 'Closing…' : 'Close case'}</button>
    </div>
  </section>
}

function SectionHeading({ id, title, detail }: { id: string; title: string; detail?: string }) {
  return <div className={`mb-3 ${detail ? 'border-b border-slate-100 pb-2.5' : ''}`}>
    <h3 id={id} className="text-sm font-extrabold text-slate-900">{title}</h3>
    {detail && <p className="mt-1 text-xs leading-relaxed text-slate-600">{detail}</p>}
  </div>
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg border border-slate-100 bg-white p-2">
    <dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="mt-1 wrap-break-word text-xs font-semibold text-slate-700">{value}</dd>
  </div>
}

// The same choice card as the other GSO pop-ups and pages, with a checkbox.
function CheckCard({ checked, onChange, title, detail }: { checked: boolean; onChange: (checked: boolean) => void; title: string; detail?: string }) {
  return <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition ${checked ? 'border-blue-400 bg-blue-50/70 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 shrink-0 accent-blue-600" />
    <span>
      <span className="block text-xs font-extrabold text-slate-900">{title}</span>
      {detail && <span className="mt-0.5 block text-[0.68rem] leading-relaxed text-slate-600">{detail}</span>}
    </span>
  </label>
}

// Same look as the Facility Requests trail: circles joined by a line, finished steps checked.
function FlowTrail({ steps, current }: { steps: string[]; current: number }) {
  return <ol aria-label="Case steps" className="mt-3 flex min-w-[18rem] items-start">
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
