import { useEffect, useMemo, useState } from 'react'
import { formatDate } from '../requesters/requesterrequestutils'
import {
  listAwaitingDeliveries,
  recordPurchaseDeliveries,
  type AwaitingDeliveryLine,
  type DeliveryInput,
} from './purchaseRequisitionsApi'
import { categoryLabel } from './requisitionFlow'
import { Banner, EmptyState, fieldInput, fieldLabel } from './requisitionParts'

type PlannedPick = { itemId: string; itemCode: string; quantity: number; similar: boolean }
type LinePlan = { taking: number; short: number; picks: PlannedPick[]; needsConfirm: boolean }

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

// Spreads each checked request over the inventory records that can fill it, oldest request first, so the same
// stock is never counted twice. A record with a similar name is used only after the staff member confirms it.
function planDeliveries(lines: AwaitingDeliveryLine[], checked: ReadonlySet<string>, confirmed: ReadonlySet<string>) {
  const left = new Map<string, number>()
  for (const line of lines) for (const candidate of line.candidates) left.set(candidate.itemId, candidate.availableQuantity)
  const plans = new Map<string, LinePlan>()
  for (const line of lines) {
    const exact = line.candidates.filter((candidate) => candidate.match === 'EXACT')
    const needsConfirm = exact.length === 0 && line.candidates.length > 0
    const usable = exact.length ? exact : confirmed.has(line.lineId) ? line.candidates : []
    const picks: PlannedPick[] = []
    let need = checked.has(line.lineId) ? line.remainingQuantity : 0
    for (const candidate of usable) {
      const take = Math.min(need, left.get(candidate.itemId) ?? 0)
      if (take <= 0) continue
      left.set(candidate.itemId, (left.get(candidate.itemId) ?? 0) - take)
      picks.push({ itemId: candidate.itemId, itemCode: candidate.itemCode, quantity: take, similar: candidate.match === 'SIMILAR' })
      need -= take
    }
    const taking = picks.reduce((total, pick) => total + pick.quantity, 0)
    plans.set(line.lineId, { taking, short: line.remainingQuantity - taking, picks, needsConfirm })
  }
  return plans
}

// Oldest first: a request starts checked only when the stock left can fill all of it.
function defaultChecked(lines: AwaitingDeliveryLine[], confirmed: ReadonlySet<string>) {
  const checked = new Set<string>()
  for (const line of lines) {
    if (!line.candidates.some((candidate) => candidate.match === 'EXACT') && !confirmed.has(line.lineId)) continue
    const plan = planDeliveries(lines, new Set(checked).add(line.lineId), confirmed).get(line.lineId)
    if (plan && plan.short === 0) checked.add(line.lineId)
  }
  return checked
}

type Group = { key: string; itemName: string; category: string; lines: AwaitingDeliveryLine[]; records: Map<string, { itemCode: string; availableQuantity: number }> }

function groupByItem(lines: AwaitingDeliveryLine[]) {
  const groups = new Map<string, Group>()
  for (const line of lines) {
    const key = `${line.itemName.trim().toLowerCase()}|${line.category}`
    const group: Group = groups.get(key) ?? { key, itemName: line.itemName, category: line.category, lines: [], records: new Map() }
    group.lines.push(line)
    for (const candidate of line.candidates) group.records.set(candidate.itemId, { itemCode: candidate.itemCode, availableQuantity: candidate.availableQuantity })
    groups.set(key, group)
  }
  return [...groups.values()]
}

function Checkbox({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={onChange} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-40" />
}

// The checklist behind both ways to link a delivery: the pop-up right after a restock in Item Master Data, and the
// "Ready to link" tab on Purchase Requisitions. Pick the requests, type the receipt once, and record everything in one step.
export function DeliveryChecklist({ lines, receiptDefault = '', restocked, skipLabel = 'Skip for now', onSkip, onLinked, onRefresh }: {
  lines: AwaitingDeliveryLine[]
  receiptDefault?: string
  restocked?: { quantity: number; unit: string; name: string }
  skipLabel?: string
  onSkip?: () => void
  onLinked: (message: string) => void
  onRefresh?: () => void
}) {
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(() => new Set())
  const [declined, setDeclined] = useState<ReadonlySet<string>>(() => new Set())
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => defaultChecked(lines, new Set()))
  const [receipt, setReceipt] = useState(receiptDefault)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const plans = useMemo(() => planDeliveries(lines, checked, confirmed), [lines, checked, confirmed])
  const groups = useMemo(() => groupByItem(lines), [lines])
  const rows = lines.filter((line) => checked.has(line.lineId) && (plans.get(line.lineId)?.taking ?? 0) > 0)
  const deliveries: DeliveryInput[] = rows.flatMap((line) => (plans.get(line.lineId)?.picks ?? [])
    .map((pick) => ({ lineId: line.lineId, itemId: pick.itemId, quantity: pick.quantity, confirmSimilarName: pick.similar })))
  const units = deliveries.reduce((total, delivery) => total + delivery.quantity, 0)
  const unitNames = new Set(lines.flatMap((line) => line.candidates.map((candidate) => candidate.unitOfMeasure)))
  const unitLabel = unitNames.size === 1 ? [...unitNames][0] : 'units'

  // What a request would get if it were checked now. It can be checked only while some stock is left for it
  // (and its similar name, if any, is confirmed).
  const trialFor = (line: AwaitingDeliveryLine) => {
    if (checked.has(line.lineId)) return plans.get(line.lineId)
    const needsConfirm = !line.candidates.some((candidate) => candidate.match === 'EXACT')
    if (needsConfirm && !confirmed.has(line.lineId)) return undefined
    return planDeliveries(lines, new Set(checked).add(line.lineId), confirmed).get(line.lineId)
  }

  const toggle = (lineId: string) => {
    setAsking(false)
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })
  }

  const answerSimilar = (lineId: string, same: boolean) => {
    setAsking(false)
    setConfirmed((current) => { const next = new Set(current); if (same) next.add(lineId); else next.delete(lineId); return next })
    setDeclined((current) => { const next = new Set(current); if (same) next.delete(lineId); else next.add(lineId); return next })
    setChecked((current) => { const next = new Set(current); if (same) next.add(lineId); else next.delete(lineId); return next })
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      await recordPurchaseDeliveries({ deliveries, receiptReference: receipt.trim() })
      const references = [...new Set(rows.map((line) => line.referenceNo))]
      onLinked(`Linked ${units} ${unitLabel} to ${plural(references.length, 'request')} (${references.join(', ')}). They are now in “Ready to issue”; hand them over in Main Issuance.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to record the deliveries.')
      setAsking(false)
    } finally {
      setBusy(false)
    }
  }

  return <div>
    {restocked && <p className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-indigo-900">You just added <span className="font-extrabold">{restocked.quantity} {restocked.unit} of {restocked.name}</span> to Item Master Data. {plural(lines.length, 'request')} {lines.length === 1 ? 'is' : 'are'} waiting for it. Choose which ones this delivery is for.</p>}

    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-[0.68rem] font-semibold text-slate-500">Oldest requests come first. Stock is never counted twice.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => { setAsking(false); setChecked(defaultChecked(lines, confirmed)) }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[0.65rem] font-extrabold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700">Select all that fit</button>
        <button type="button" onClick={() => { setAsking(false); setChecked(new Set()) }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[0.65rem] font-extrabold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">Clear</button>
      </div>
    </div>

    <div className="mt-3 space-y-3">
      {groups.map((group) => {
        const available = [...group.records.values()].reduce((total, record) => total + record.availableQuantity, 0)
        const needed = group.lines.reduce((total, line) => total + line.remainingQuantity, 0)
        const selected = group.lines.reduce((total, line) => total + (plans.get(line.lineId)?.taking ?? 0), 0)
        return <section key={group.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label={`${group.itemName} requests`}>
          <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3.5 py-3">
            <div className="min-w-0">
              <h4 className="text-sm font-extrabold text-slate-900">{group.itemName} <span className="text-xs font-semibold text-slate-500">· {categoryLabel(group.category)}</span></h4>
              <p className="mt-0.5 text-[0.65rem] text-slate-500">In Item Master Data: {[...group.records.values()].map((record) => `${record.itemCode} (${record.availableQuantity} available)`).join(', ')}</p>
            </div>
            <span aria-live="polite" className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${selected > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>Selected {selected} / {available} available</span>
          </header>
          {needed > available && <div className="border-b border-amber-100 bg-amber-50 px-3.5 py-2 text-[0.68rem] font-semibold leading-relaxed text-amber-900">Not enough stock for everyone: {needed} needed, {available} available. The oldest requests are checked first; the rest keep waiting for the next restock.</div>}
          <ul className="divide-y divide-slate-100">
            {group.lines.map((line) => {
              const plan = plans.get(line.lineId)
              const isChecked = checked.has(line.lineId)
              const similar = line.candidates.find((candidate) => candidate.match === 'SIMILAR')
              const asksName = Boolean(plan?.needsConfirm && similar)
              const trial = trialFor(line)
              const enabled = (trial?.taking ?? 0) > 0
              const taking = plan?.taking ?? 0
              return <li key={line.lineId} className={`px-3.5 py-3 ${isChecked && taking > 0 ? 'bg-indigo-50/30' : ''}`}>
                <div className="flex items-start gap-3">
                  <Checkbox checked={isChecked} disabled={!enabled} label={`Link delivery to ${line.referenceNo}`} onChange={() => toggle(line.lineId)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="text-xs font-extrabold text-slate-900">{line.referenceNo} <span className="font-semibold text-slate-500">· {line.requesterName}{line.department ? ` · ${line.department}` : ''}</span></p>
                      <p className="text-[0.62rem] font-semibold text-slate-400">Requested {formatDate(line.createdAt)}</p>
                    </div>
                    <p className="mt-0.5 text-[0.68rem] font-semibold text-slate-600">Needs {line.remainingQuantity}{line.remainingQuantity !== line.requestedQuantity ? ` of ${line.requestedQuantity}` : ''}</p>
                    {isChecked && taking > 0 && <p className={`mt-1 text-[0.68rem] font-extrabold ${plan && plan.short > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {plan && plan.short > 0 ? `Links ${taking} of ${line.remainingQuantity} · ${plan.short} still to buy` : `Links ${taking}`}
                      <span className="font-semibold text-slate-500"> from {plan?.picks.map((pick) => pick.itemCode).join(', ')}</span>
                    </p>}
                    {!isChecked && !enabled && !asksName && <p className="mt-1 text-[0.65rem] font-semibold text-slate-400">No stock left for this request.</p>}
                    {!isChecked && enabled && trial && trial.short > 0 && <p className="mt-1 text-[0.65rem] font-semibold text-amber-700">Only {trial.taking} of {line.remainingQuantity} in stock. Check it to link that part; the rest keeps waiting.</p>}
                    {asksName && similar && !declined.has(line.lineId) && !confirmed.has(line.lineId) && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <p className="text-[0.68rem] font-semibold leading-relaxed text-amber-900">Item Master Data has <span className="font-extrabold">{similar.name}</span> ({similar.itemCode}, {similar.availableQuantity} available), but the request is for <span className="font-extrabold">{line.itemName}</span>. The names don’t match exactly. Is this the same item?</p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => answerSimilar(line.lineId, true)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-[0.65rem] font-extrabold text-white transition hover:bg-amber-700">Yes, link it</button>
                        <button type="button" onClick={() => answerSimilar(line.lineId, false)} className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-[0.65rem] font-extrabold text-amber-900 transition hover:bg-amber-100">No</button>
                      </div>
                    </div>}
                    {asksName && similar && confirmed.has(line.lineId) && <p className="mt-1 text-[0.65rem] font-semibold text-amber-800">You confirmed {similar.name} is the same item. <button type="button" onClick={() => answerSimilar(line.lineId, false)} className="font-extrabold underline underline-offset-2">Change</button></p>}
                    {asksName && declined.has(line.lineId) && <p className="mt-1 text-[0.65rem] font-semibold text-slate-500">Marked as a different item, so it is not linked. <button type="button" onClick={() => setDeclined((current) => { const next = new Set(current); next.delete(line.lineId); return next })} className="font-extrabold text-slate-700 underline underline-offset-2">Ask again</button></p>}
                  </div>
                </div>
              </li>
            })}
          </ul>
        </section>
      })}
    </div>

    <div className="sticky bottom-0 mt-4 rounded-2xl border border-slate-200 bg-white/95 p-3.5 shadow-lg shadow-slate-300/30 backdrop-blur">
      <label className="block">
        <span className={fieldLabel}>Receipt / invoice no. <span className="font-bold normal-case text-slate-400">(optional · one receipt for everything selected)</span></span>
        <input value={receipt} onChange={(event) => setReceipt(event.target.value)} maxLength={120} placeholder="e.g. OR-004512" className={fieldInput} />
      </label>
      {error && <div className="mt-3 space-y-2"><Banner tone="error">{error}</Banner>{onRefresh && <button type="button" onClick={onRefresh} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[0.65rem] font-extrabold text-rose-700 transition hover:bg-rose-50">Refresh the list</button>}</div>}
      {asking
        ? <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-3">
          <p className="text-xs font-semibold leading-relaxed text-indigo-950">You are about to record the delivery for <span className="font-extrabold">{plural(rows.length, 'request')}</span> ({units} {unitLabel} in total){receipt.trim() ? <>, receipt <span className="font-extrabold">{receipt.trim()}</span></> : ''}. Continue?</p>
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={busy} onClick={() => setAsking(false)} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Back</button>
            <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{busy ? 'Saving…' : 'Yes, record delivery'}</button>
          </div>
        </div>
        : <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite" className={`text-[0.68rem] leading-relaxed ${rows.length ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>{rows.length ? <><span className="font-extrabold text-slate-900">{plural(rows.length, 'request')}</span> · {units} {unitLabel} selected. Saved with your account and the time.</> : 'Check the requests this delivery is for.'}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {onSkip && <button type="button" onClick={onSkip} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50">{skipLabel}</button>}
            <button type="button" disabled={rows.length === 0} onClick={() => setAsking(true)} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">Link selected deliveries</button>
          </div>
        </div>}
    </div>
  </div>
}

// The pop-up shown right after GSO Staff add or restock an item in Item Master Data that purchase requests are waiting for.
export function DeliveryLinkDialog({ itemIds, initialLines, restocked, receiptReference, onClose, onLinked }: {
  itemIds: string[]
  initialLines: AwaitingDeliveryLine[]
  restocked: { quantity: number; unit: string; name: string }
  receiptReference: string
  onClose: () => void
  onLinked: (message: string) => void
}) {
  const [lines, setLines] = useState(initialLines)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const refresh = () => {
    setRefreshing(true)
    listAwaitingDeliveries(itemIds)
      .then(setLines)
      .catch(() => undefined)
      .finally(() => setRefreshing(false))
  }

  return <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
    <section role="dialog" aria-modal="true" aria-labelledby="delivery-link-title" tabIndex={-1} autoFocus className="flex max-h-[94vh] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30 outline-none">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-indigo-600">Purchase requisitions</p>
          <h2 id="delivery-link-title" className="mt-0.5 text-base font-black text-slate-900 sm:text-lg">{plural(lines.length, 'request')} waiting for {restocked.name}</h2>
          <p className="mt-1 text-xs text-slate-600">Link this delivery now, or do it later from Purchase Requisitions → Ready to link.</p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">Close</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-5 sm:px-6">
        {refreshing ? <p className="py-10 text-center text-xs font-semibold text-slate-400">Checking the list…</p>
          : lines.length === 0 ? <div className="space-y-3"><EmptyState title="Nothing is waiting for this delivery anymore" detail="Another staff member may have linked it already." /><div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-indigo-700">Close</button></div></div>
            : <DeliveryChecklist key={lines.map((line) => `${line.lineId}:${line.remainingQuantity}`).join('|')} lines={lines} restocked={restocked} receiptDefault={receiptReference} onSkip={onClose} onRefresh={refresh} onLinked={onLinked} />}
      </div>
    </section>
  </div>
}
