import { useCallback, useEffect, useState } from 'react'
import { getMyLossDamageCase, type MyLossDamageCase, type MyLossDamageSettlement } from '../gso/lossDamageCasesApi'
import { formText } from '../gso/requisitionFlow'
import { formatDateTime } from './requesterrequestutils'
import type { ServiceRequest } from './requesterApi'

type View = { title: string; badge: string; tone: string; body: string }

// What the requester reads at each stage of a Loss / Damage Report.
function viewOf(settlement: MyLossDamageSettlement | null): View {
  if (!settlement) {
    return {
      title: 'GSO is reviewing your report',
      badge: 'In review',
      tone: 'border-blue-200 bg-blue-50 text-blue-800',
      body: 'GSO will decide what happens to the item. The decision appears here and in your notifications.',
    }
  }
  if (settlement.resolution === 'NO_CHARGE') {
    return {
      title: 'No charge',
      badge: 'Closed',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      body: 'GSO decided that you do not need to pay for this report. The case is closed.',
    }
  }
  if (settlement.resolution === 'CHARGED') {
    const amount = settlement.chargeAmount == null ? '' : ` ₱${settlement.chargeAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
    return {
      title: `Payment needed:${amount}`,
      badge: 'To pay',
      tone: 'border-rose-300 bg-rose-600 text-white',
      body: 'Pay this at the Finance office in person. This report is closed.',
    }
  }
  if (settlement.resolution === 'FOR_REPAIR') {
    return {
      title: 'For repair',
      badge: 'For repair',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      body: 'GSO will repair or otherwise handle the item, then close this request.',
    }
  }
  if (settlement.resolution === 'RESOLVED') {
    return {
      title: 'Resolved',
      badge: 'Closed',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      body: 'GSO completed the earlier resolution for this report. The case is closed.',
    }
  }
  return {
    title: 'Decision recorded',
    badge: 'In progress',
    tone: 'border-blue-200 bg-blue-50 text-blue-800',
    body: 'GSO is completing the follow-up for this report.',
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm shadow-slate-200/60">
    <dt className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1 wrap-break-word text-xs font-black text-slate-800">{value}</dd>
  </div>
}

// The decision panel on a Loss / Damage Report. It reads the server's state.
export default function LossDamageDecisionPanel({ requestId, requestStatus }: { requestId: string; requestStatus: string }) {
  const [data, setData] = useState<MyLossDamageCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const next = await getMyLossDamageCase(requestId)
      setData(next)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the decision for this report.')
    } finally {
      setLoading(false)
    }
  }, [requestId])

  useEffect(() => {
    // Deferred like the request page's own load, so the first render stays quiet.
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const settlement = data?.settlement ?? null
  const view = viewOf(settlement)
  const complete = requestStatus === 'Completed'
  const closed = requestStatus === 'Closed'
  // A charged report uses the same red panel as the facility charge, so the amount to pay stands out.
  const charged = settlement?.resolution === 'CHARGED'

  return <section aria-labelledby="loss-decision-heading" className={`mt-5 rounded-2xl border-2 p-4 shadow-md ring-1 sm:p-5 ${charged ? 'border-rose-300 bg-rose-50/70 shadow-rose-900/5 ring-rose-100' : 'border-slate-300/80 bg-white shadow-slate-300/35 ring-slate-900/5'}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={`text-[0.62rem] font-extrabold uppercase tracking-[0.14em] ${charged ? 'text-rose-700' : 'text-blue-700'}`}>GSO decision</p>
        <h2 id="loss-decision-heading" className={`mt-1 text-sm font-black ${charged ? 'text-rose-950' : 'text-slate-900'}`}>{view.title}</h2>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[0.62rem] font-extrabold ${view.tone}`}>{view.badge}</span>
        <button type="button" onClick={() => { setLoading(true); void refresh() }} disabled={loading} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[0.62rem] font-extrabold text-slate-600 transition hover:border-blue-300 hover:text-blue-800 disabled:opacity-50">{loading ? 'Checking…' : 'Refresh'}</button>
      </div>
    </div>

    {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}

    {loading && !data
      ? <p className="mt-3 text-xs font-semibold text-slate-400">Loading the decision…</p>
      : <>
        <p className="mt-3 text-xs leading-relaxed text-slate-700">{view.body}</p>

        {settlement && <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          <Fact label="Reason from GSO" value={formText(settlement.reason) || 'Not given'} />
          <Fact label="Decided" value={formatDateTime(settlement.decidedAt)} />
        </dl>}

        {complete && <p className="mt-3 text-[0.68rem] font-semibold text-emerald-800">This request is complete.</p>}
        {closed && <p className="mt-3 text-[0.68rem] font-semibold text-slate-600">This request is closed.</p>}
      </>}
  </section>
}

// The items on a Loss / Damage Report, as the requester sent them.
// What Repair & Maintenance did with a unit: repaired, written off (waived or to pay), or still at the repair owner.
function repairStatusOf(repair: MyLossDamageCase['repairs'][number] | undefined): { label: string; tone: string } | null {
  if (!repair) return null
  if (repair.outcome === 'Repaired') return { label: `Repaired${repair.owner ? ` by ${repair.owner}` : ''} · back in stock`, tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' }
  if (repair.outcome === 'Written Off') {
    if (repair.writeOffDecision === 'CHARGED') {
      const amount = repair.estimatedValue == null ? '' : ` ₱${Number(repair.estimatedValue).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
      return { label: `Written off · to pay${amount}`, tone: 'bg-rose-600 text-white ring-rose-600' }
    }
    return { label: 'Written off · waived', tone: 'bg-slate-100 text-slate-700 ring-slate-200' }
  }
  if (repair.owner) return { label: `At ${repair.owner} for repair`, tone: 'bg-amber-50 text-amber-900 ring-amber-200' }
  return null
}

export function LossDamageItemList({ request }: { request: ServiceRequest }) {
  const rows = Array.isArray(request.formData.items) ? request.formData.items as Array<Record<string, unknown>> : []
  const [repairs, setRepairs] = useState<MyLossDamageCase['repairs']>([])
  useEffect(() => {
    let active = true
    getMyLossDamageCase(request.id)
      .then((result) => { if (active) setRepairs(result.repairs) })
      .catch(() => undefined)
    return () => { active = false }
  }, [request.id])
  if (rows.length === 0) return null
  return <div className="mt-6">
    <h3 className="text-sm font-extrabold text-slate-800">Reported items</h3>
    <ul className="mt-3 space-y-2">
      {rows.map((row, index) => { const status = repairStatusOf(repairs.find((repair) => repair.tagCode === formText(row.assetCode))); return <li key={index} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-slate-50 p-3">
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-slate-800">{formText(row.description) || 'Item'}</p>
          {row.identityUnknown === true
            ? <p className="mt-1 text-[0.65rem] font-semibold text-amber-700">Exact unit not identified; GSO will review it.</p>
            : <p className="mt-1 text-[0.65rem] text-slate-500">{formText(row.assetCode) || 'No asset code'}</p>}
          {status && <span className={`mt-1.5 inline-block rounded-md px-2 py-0.5 text-[0.62rem] font-extrabold ring-1 ${status.tone}`}>{status.label}</span>}
          {formText(row.remarks) && <p className="mt-1 text-[0.65rem] leading-relaxed text-slate-600">{formText(row.remarks)}</p>}
        </div>
        <p className="shrink-0 text-xs font-extrabold text-slate-800">{String(row.quantity ?? '')} {formText(row.unitOfMeasure)}</p>
      </li> })}
    </ul>
  </div>
}
