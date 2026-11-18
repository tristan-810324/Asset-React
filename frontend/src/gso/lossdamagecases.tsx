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
  review: { label: 'Under Review', hint: 'Choose one resolution for the whole report, and write the reason.', empty: 'No reports waiting for a decision.' },
  repair: { label: 'For Repair', hint: 'Repair or otherwise handle the item, then close the case.', empty: 'No items waiting for follow-up.' },
  closed: { label: 'Closed', hint: 'Finished cases, with no charge or completed follow-up.', empty: 'No closed cases yet.' },
}
const QUEUE_ORDER = Object.keys(QUEUES) as Queue[]

const RESOLUTIONS: Array<{ value: EditableLossDamageResolution; title: string; detail: string }> = [
  { value: 'NO_CHARGE', title: 'No charge', detail: 'The case closes now, and the requester is told.' },
  { value: 'FOR_REPAIR', title: 'For repair', detail: 'Repair or handle the item, then close the case.' },
]
const RESOLUTION_TITLE: Record<LossDamageResolution, string> = { NO_CHARGE: 'No charge', FOR_REPAIR: 'For repair', RESOLVED: 'Resolved' }
const STEPS = ['Submitted', 'Review', 'Decision', 'Follow-up', 'Closed']

// Same look as Facility Requests: primary blue, quiet outlines, emerald for the final step.
const primaryButton = 'rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
const successButton = 'rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50'
const quietButton = 'rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
const inputClass = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
const textAreaClass = 'min-h-24 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-xs font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
const sectionBorder = 'mt-5 border-t border-slate-200 pt-5'

// A name typed all in lowercase is shown with capitals; any other spelling is kept as typed (for example "dela Cruz").
function displayName(name: string | null | undefined) {
  const trimmed = (name || '').trim()
  return trimmed && trimmed === trimmed.toLowerCase() ? trimmed.replace(/(^|\s)(\p{L})/gu, (_match, space: string, letter: string) => space + letter.toUpperCase()) : trimmed
}

const requesterOf = (item: LossDamageCase) => displayName(item.requesterFullName) || formText(item.formData.requesterName) || item.requesterName
const itemsOf = (item: LossDamageCase): ItemRow[] => (Array.isArray(item.formData.items) ? item.formData.items as ItemRow[] : [])
const unitsOf = (item: LossDamageCase) => itemsOf(item).reduce((total, row) => total + (Number(row.quantity) || 0), 0)
const incidentOf = (item: LossDamageCase) => (formText(item.formData.incidentType) === 'DAMAGED' ? 'Damaged' : 'Lost')
const isClosed = (item: LossDamageCase) => item.status === 'Closed' || item.status === 'Completed'
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function queueOf(item: LossDamageCase): Queue {
  if (isClosed(item)) return 'closed'
  if (item.settlement?.status === 'FOR_REPAIR' || item.settlement?.status === 'RESOLVED') return 'repair'
  if (item.status === 'Submitted') return 'new'
  return 'review'
}

function chipFor(item: LossDamageCase) {
  if (isClosed(item)) return { label: item.settlement?.status === 'NO_CHARGE' ? 'No charge' : item.settlement?.status === 'RESOLVED' ? 'Resolved' : 'Closed', tone: 'bg-slate-100 text-slate-600' }
  if (item.settlement?.status === 'FOR_REPAIR') return { label: 'For repair', tone: 'bg-rose-50 text-rose-700' }
  if (item.settlement?.status === 'RESOLVED') return { label: 'Resolved', tone: 'bg-emerald-50 text-emerald-700' }
  if (item.status === 'Submitted') return { label: 'New', tone: 'bg-blue-50 text-blue-700' }
  return { label: 'Needs decision', tone: 'bg-amber-50 text-amber-800' }
}

// The step the case is on: 0 submitted, 2 waiting for the decision, 3 follow-up, 5 closed.
function currentStepOf(item: LossDamageCase) {
  if (isClosed(item)) return STEPS.length
  if (item.settlement?.status === 'FOR_REPAIR' || item.settlement?.status === 'RESOLVED') return 3
  return item.status === 'Submitted' ? 0 : 2
}

function decisionNotice(resolution: EditableLossDamageResolution, result: LossDamageCaseResult): Notice {
  if (resolution === 'NO_CHARGE') return { tone: 'success', text: `${result.case.referenceNo} is closed with no charge. The requester has been told.` }
  return { tone: 'success', text: `${result.case.referenceNo} is for repair. Close it after the follow-up is done.` }
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
        const wanted = new URLSearchParams(window.location.search).get('case')
        const found = result.cases.find((item) => item.id === wanted)
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
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
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
                      <span className="mt-1.5 block truncate text-xs font-semibold text-slate-700">{requesterOf(item)} · {incidentOf(item)}</span>
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
            <p className="mt-1 text-sm leading-snug text-slate-600">Read the report, then take the next step.</p>
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
  const canChangeDecision = !closed && settlement?.status === 'FOR_REPAIR' && item.status === 'In Progress'
  const canClose = !closed && item.status === 'In Progress' && (settlement?.status === 'FOR_REPAIR' || settlement?.status === 'RESOLVED')

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
    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5"><CaseSummary item={item} /></div>
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white px-3.5 pb-3 pt-1"><FlowTrail steps={STEPS} current={currentStepOf(item)} /></div>

    {error && <div className="mt-4"><Banner tone="error">{error}</Banner></div>}

    <IncidentItems item={item} />
    {settlement && <DecisionCard settlement={settlement} />}

    {needsStart && <section className={sectionBorder} aria-labelledby="case-start-title">
      <SectionHeading id="case-start-title" title="Start the review" detail="Read the whole report first. The requester is told that GSO is reviewing it." />
      <div className="flex justify-end">
        <button type="button" disabled={busy} onClick={() => void run(() => startLossDamageReview(item.id), (result) => ({ tone: 'success', text: `${result.case.referenceNo} is under review. The requester has been told.` }))} className={primaryButton}>{busy ? 'Starting…' : 'Start review'}</button>
      </div>
    </section>}

    {(needsDecision || (canChangeDecision && editing)) && <section className={sectionBorder} aria-labelledby="case-decision-title">
      <SectionHeading id="case-decision-title" title={needsDecision ? 'Choose the decision' : 'Change the decision'} detail={needsDecision ? 'Pick one resolution for the whole report, and write the reason.' : 'Update the decision before the follow-up is complete.'} />
      <DecisionForm
        initial={editing && settlement ? settlement : null}
        busy={busy}
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

    <HistoryList item={item} />
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
        <p className="mt-0.5 text-xs font-semibold text-slate-600">{item.requesterEmail}</p>
        <p className="mt-0.5 text-[0.65rem] text-slate-500">Submitted {formatDateTime(item.createdAt)}</p>
      </div>
      <span className={`rounded-full px-2.5 py-1.5 text-[0.62rem] font-extrabold ${chip.tone}`}>{chip.label}</span>
    </div>
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{facts.map(([label, value]) => <Fact key={label} label={label} value={value} />)}</dl>
    {remarks && <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm shadow-slate-200/60">
      <p className="text-[0.68rem] leading-relaxed text-slate-600"><span className="font-extrabold text-slate-500">Requester remarks: </span>{remarks}</p>
    </div>}
  </div>
}

function IncidentItems({ item }: { item: LossDamageCase }) {
  const rows = itemsOf(item)
  return <section className={sectionBorder} aria-labelledby="case-items-title">
    <SectionHeading id="case-items-title" title="Items reported" detail="Issued to the requester and still with them when the report was sent." />
    {rows.length === 0
      ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4 text-center text-xs font-semibold text-slate-500">No items on this report.</p>
      : <ul className="space-y-2">{rows.map((row, index) => <li key={index} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-slate-900">{formText(row.description) || 'Item'}</p>
          {row.identityUnknown
            ? <p className="mt-0.5 text-[0.68rem] font-bold text-amber-700">Exact asset tag not identified yet</p>
            : <p className="mt-0.5 text-[0.68rem] text-slate-500">{formText(row.assetCode) || 'No asset code'}</p>}
          {row.identityUnknown && row.candidateUnits?.length ? <p className="mt-1 text-[0.65rem] leading-relaxed text-slate-500">Possible units: {row.candidateUnits.map((unit) => unit.tagCode).filter(Boolean).join(', ')}</p> : null}
          {formText(row.remarks) && <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-600">{formText(row.remarks)}</p>}
        </div>
        <span className="shrink-0 text-xs font-extrabold text-slate-800">{row.quantity ?? ''} {formText(row.unitOfMeasure)}</span>
      </li>)}</ul>}
  </section>
}

function DecisionCard({ settlement }: { settlement: LossDamageSettlement }) {
  return <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm shadow-slate-200/60">
    <p className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-500">Current decision</p>
    <p className="mt-1 text-sm font-black text-slate-900">{RESOLUTION_TITLE[settlement.resolution]}</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-700"><span className="font-extrabold text-slate-500">Reason: </span>{settlement.reason}</p>
    <p className="mt-1 text-[0.65rem] text-slate-500">{settlement.assessedBy || 'GSO Staff'} · {formatDateTime(settlement.assessedAt)}</p>
  </div>
}

function DecisionForm({ initial, busy, unidentifiedItems, onSave, onCancel }: {
  initial: LossDamageSettlement | null
  busy: boolean
  unidentifiedItems: ItemRow[]
  onSave: (payload: { resolution: EditableLossDamageResolution; reason: string; resolvedUnits?: Array<{ issuanceId: string; tagCodes: string[] }> }) => void
  onCancel?: () => void
}) {
  const [resolution, setResolution] = useState<EditableLossDamageResolution | ''>(
    initial?.resolution === 'NO_CHARGE' || initial?.resolution === 'FOR_REPAIR' ? initial.resolution : '',
  )
  const [reason, setReason] = useState(initial?.reason ?? '')
  const [resolvedTags, setResolvedTags] = useState<Record<string, string[]>>({})
  const allUnitsIdentified = unidentifiedItems.every((row) => {
    const chosen = resolvedTags[String(row.issuanceId || '')] || []
    const candidates = new Set((row.candidateUnits || []).map((unit) => String(unit.tagCode || '')).filter(Boolean))
    return chosen.length === Number(row.quantity) && new Set(chosen).size === chosen.length && chosen.every((tagCode) => candidates.has(tagCode))
  })
  const ready = resolution !== '' && reason.trim() !== '' && allUnitsIdentified
  const footnote = resolution === ''
    ? 'Choose one resolution to continue.'
    : resolution === 'NO_CHARGE' ? 'This closes the case now and tells the requester.'
      : 'The case stays open until the follow-up is done.'

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || busy) return
    onSave({
      resolution,
      reason: reason.trim(),
      ...(unidentifiedItems.length ? { resolvedUnits: unidentifiedItems.map((row) => ({ issuanceId: String(row.issuanceId || ''), tagCodes: resolvedTags[String(row.issuanceId || '')] || [] })) } : {}),
    })
  }

  return <form onSubmit={submit} className="space-y-4">
    <div role="radiogroup" aria-label="Resolution" className="grid gap-2 sm:grid-cols-2">
      {RESOLUTIONS.map((option) => {
        const picked = resolution === option.value
        return <button key={option.value} type="button" role="radio" aria-checked={picked} disabled={busy} onClick={() => setResolution(option.value)} className={`rounded-xl border-2 p-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:opacity-60 ${picked ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
          <span className="block text-xs font-extrabold text-slate-900">{option.title}</span>
          <span className="mt-1 block text-[0.65rem] leading-snug text-slate-600">{option.detail}</span>
        </button>
      })}
    </div>

    {unidentifiedItems.length > 0 && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
      <div>
        <p className="text-xs font-extrabold text-amber-950">Identify the exact unit before deciding</p>
        <p className="mt-1 text-[0.68rem] leading-relaxed text-amber-900">The requester could not identify the asset tag. Select the matching issued unit(s) from the report and review the incident details. The decision cannot be saved until each reported unit is identified.</p>
      </div>
      {unidentifiedItems.map((row) => {
        const issuanceId = String(row.issuanceId || '')
        const selected = resolvedTags[issuanceId] || []
        const candidates = (row.candidateUnits || []).map((unit) => String(unit.tagCode || '')).filter(Boolean)
        return <fieldset key={issuanceId} className="rounded-lg border border-amber-200 bg-white p-3">
          <legend className="px-1 text-[0.68rem] font-extrabold text-slate-800">{formText(row.description) || 'Reported item'} · choose {plural(Number(row.quantity) || 0, 'unit')}</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {candidates.map((tagCode) => <label key={tagCode} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold transition ${selected.includes(tagCode) ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
              <input type="checkbox" checked={selected.includes(tagCode)} disabled={busy || (!selected.includes(tagCode) && selected.length >= Number(row.quantity))} onChange={() => setResolvedTags((current) => {
                const currentTags = current[issuanceId] || []
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

    <label className="block">
      <span className={fieldLabel}>Reason <span className="text-rose-600">*</span></span>
      <textarea value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} maxLength={1000} placeholder="Say what was found and why this decision was made." className={textAreaClass} />
    </label>

    <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[0.68rem] leading-relaxed text-slate-500">{footnote}</p>
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
    <SectionHeading id="case-close-title" title="Close the case" detail="Finish the follow-up for the item, then close the case." />
    <CheckCard checked={done} onChange={setDone} title="The physical follow-up is done" detail="The item was repaired, replaced, disposed of, or needs no further action." />
    <label className="mt-3 block">
      <span className={fieldLabel}>Closing note (optional)</span>
      <input value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} maxLength={1000} placeholder="For example: screen replaced" className={inputClass} />
    </label>
    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {onChangeDecision && <button type="button" disabled={busy} onClick={onChangeDecision} className={quietButton}>Change decision</button>}
      <button type="button" disabled={!done || busy} onClick={() => onClose(note.trim())} className={successButton}>{busy ? 'Closing…' : 'Close case'}</button>
    </div>
  </section>
}

function HistoryList({ item }: { item: LossDamageCase }) {
  const entries = [...item.history].reverse()
  return <section className={sectionBorder} aria-labelledby="case-history-title">
    <SectionHeading id="case-history-title" title="Case history" detail="Every review, decision, and change, newest first." />
    {entries.length === 0
      ? <p className="text-xs font-semibold text-slate-500">No history yet.</p>
      : <ol className="space-y-2">{entries.map((entry) => <li key={entry.id} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-extrabold text-slate-800">{entry.status}</span>
          <time className="text-[0.62rem] font-semibold text-slate-500">{formatDateTime(entry.changedAt)}</time>
        </div>
        {entry.note && <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-600">{entry.note}</p>}
        <p className="mt-0.5 text-[0.62rem] font-bold text-slate-400">{entry.changedBy || 'System'}</p>
      </li>)}</ol>}
  </section>
}

function SectionHeading({ id, title, detail }: { id: string; title: string; detail: string }) {
  return <div className="mb-4 border-b border-slate-100 pb-3">
    <h3 id={id} className="text-sm font-extrabold text-slate-900">{title}</h3>
    <p className="mt-1 text-sm leading-relaxed text-slate-600">{detail}</p>
  </div>
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg border border-slate-100 bg-white p-2.5">
    <dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="mt-1 wrap-break-word text-xs font-semibold text-slate-700">{value}</dd>
  </div>
}

// The same choice card as the other GSO pop-ups and pages, with a checkbox.
function CheckCard({ checked, onChange, title, detail }: { checked: boolean; onChange: (checked: boolean) => void; title: string; detail: string }) {
  return <label className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition ${checked ? 'border-blue-400 bg-blue-50/70 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
    <span>
      <span className="block text-sm font-extrabold text-slate-900">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-slate-600">{detail}</span>
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
