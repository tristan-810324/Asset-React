import { useCallback, useEffect, useState } from 'react'
import { formatPesos, getMyLossDamageCase, type MyLossDamageCase, type MyLossDamageSettlement } from '../gso/lossDamageCasesApi'
import { formText } from '../gso/requisitionFlow'
import { formatDateTime } from './requesterrequestutils'
import { getMyFacilityDamageCase, type FacilityDamageSettlement, type ServiceRequest } from './requesterApi'

type View = { title: string; badge: string; tone: string; body: string }

// What the requester reads at each stage. The words follow the agreed plan.
function viewOf(settlement: MyLossDamageSettlement | FacilityDamageSettlement | null, facility = false, requestStatus = ''): View {
  if (!settlement) {
    return {
      title: facility ? 'GSO is reviewing the returned item' : 'GSO is reviewing your report',
      badge: 'In review',
      tone: 'border-blue-200 bg-blue-50 text-blue-800',
      body: facility ? 'GSO will decide whether the charge for the unserviceable item is waived or requires payment.' : 'GSO will decide what happens to the item. The decision appears here and in your notifications.',
    }
  }
  if (settlement.status === 'NO_CHARGE') {
    return {
      title: 'No charge',
      badge: 'Closed',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      body: facility ? 'GSO waived the charge for the unserviceable returned item. The item remains recorded as Unserviceable.' : 'GSO decided that you do not need to pay for this report. The case is closed.',
    }
  }
  if (settlement.status === 'FOR_REPAIR') {
    return {
      title: facility ? 'Item resolution recorded' : 'For repair',
      badge: facility ? 'Resolved' : 'For repair',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      body: facility ? 'GSO recorded the next step for the returned item.' : 'No payment is needed. GSO will repair the item, then close this request.',
    }
  }
  if (settlement.status === 'PENDING_LINK') {
    return {
      title: 'Payment required',
      badge: 'Being prepared',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      body: 'GSO decided that you need to pay. GSO is preparing your GCash payment. Check back here.',
    }
  }
  if (settlement.status === 'AWAITING_PAYMENT') {
    return {
      title: 'Payment required',
      badge: 'Awaiting payment',
      tone: 'border-sky-200 bg-sky-50 text-sky-700',
      body: 'Pay the amount below with GCash on the test page. Your payment is confirmed automatically.',
    }
  }
  return {
    title: 'Payment confirmed',
    badge: 'Paid',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    body: facility
      ? requestStatus === 'Completed'
        ? 'PayMongo verified your test payment automatically. This facility request is now complete, and the remaining usable stock is available in Item Master Data.'
        : 'PayMongo verified your test payment automatically. The damage payment is recorded; GSO will finish any other settlement still shown on this request.'
      : 'PayMongo verified your test payment automatically. GSO will close this request after the follow-up.',
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm shadow-slate-200/60">
    <dt className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1 wrap-break-word text-xs font-black text-slate-800">{value}</dd>
  </div>
}

// The decision and payment panel on a Loss / Damage Report. It reads the server's state; the browser's
// return from PayMongo never changes it.
export default function LossDamageDecisionPanel({ requestId, requestStatus, requestType = 'LOSS_DAMAGE_REPORT', onRequestUpdated }: { requestId: string; requestStatus: string; requestType?: 'LOSS_DAMAGE_REPORT' | 'FACILITY_USE'; onRequestUpdated?: () => void | Promise<void> }) {
  const facility = requestType === 'FACILITY_USE'
  const [data, setData] = useState<MyLossDamageCase | { requestStatus: string; settlement: FacilityDamageSettlement | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const next = facility ? await getMyFacilityDamageCase(requestId) : await getMyLossDamageCase(requestId)
      setData(next)
      if (facility && next.requestStatus !== requestStatus) void onRequestUpdated?.()
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the decision for this report.')
    } finally {
      setLoading(false)
    }
  }, [facility, onRequestUpdated, requestId, requestStatus])

  useEffect(() => {
    // Deferred like the request page's own load, so the first render stays quiet.
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const settlement = data?.settlement ?? null
  const settlementStatus = settlement?.status
  useEffect(() => {
    if (settlementStatus !== 'PENDING_LINK' && settlementStatus !== 'AWAITING_PAYMENT') return
    const checkWhenFocused = () => { void refresh() }
    window.addEventListener('focus', checkWhenFocused)
    const interval = window.setInterval(checkWhenFocused, 10_000)
    return () => {
      window.removeEventListener('focus', checkWhenFocused)
      window.clearInterval(interval)
    }
  }, [settlementStatus, refresh])

  const view = viewOf(settlement, facility, requestStatus)
  const complete = requestStatus === 'Completed'
  const closed = requestStatus === 'Closed'
  // The Pay now button appears only for a valid checkout link while the payment can still be made.
  const checkoutUrl = settlement?.status === 'AWAITING_PAYMENT' && settlement.checkoutUrl?.startsWith('https://') ? settlement.checkoutUrl : null

  return <section aria-labelledby="loss-decision-heading" className="mt-5 rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Decision and payment</p>
        <h2 id="loss-decision-heading" className="mt-1 text-sm font-black text-slate-900">{view.title}</h2>
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

        {settlement && <dl className="mt-4 grid gap-2 sm:grid-cols-3">
          <Fact label="Amount" value={settlement.resolution === 'PAYMENT_REQUIRED' ? formatPesos(settlement.amountCentavos) : 'No payment'} />
          <Fact label="Reason from GSO" value={formText(settlement.reason) || 'Not given'} />
          <Fact label="Decided" value={formatDateTime(settlement.decidedAt)} />
        </dl>}

        {checkoutUrl && <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 p-3.5">
          <p className="text-xs font-extrabold text-sky-900">Test mode: no real money will be charged.</p>
          <p className="mt-1 text-xs leading-relaxed text-sky-900">The GCash checkout opens in a new tab. On the GCash test page, choose Authorize Test Payment, then return here. This page checks for PayMongo confirmation automatically; you can also press Refresh.</p>
          <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700">Pay now</a>
        </div>}

        {settlement?.status === 'PAID' && settlement.paidAt && <p className="mt-3 text-[0.68rem] font-semibold text-emerald-800">Payment confirmed on {formatDateTime(settlement.paidAt)}.</p>}
        {complete && <p className="mt-3 text-[0.68rem] font-semibold text-emerald-800">This request is complete.</p>}
        {closed && <p className="mt-3 text-[0.68rem] font-semibold text-slate-600">This request is closed.</p>}
      </>}
  </section>
}

// The items on a Loss / Damage Report, as the requester sent them.
export function LossDamageItemList({ request }: { request: ServiceRequest }) {
  const rows = Array.isArray(request.formData.items) ? request.formData.items as Array<Record<string, unknown>> : []
  if (rows.length === 0) return null
  return <div className="mt-6">
    <h3 className="text-sm font-extrabold text-slate-800">Reported items</h3>
    <ul className="mt-3 space-y-2">
      {rows.map((row, index) => <li key={index} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-slate-50 p-3">
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-slate-800">{formText(row.description) || 'Item'}</p>
          {row.identityUnknown === true
            ? <p className="mt-1 text-[0.65rem] font-semibold text-amber-700">Exact unit not identified; GSO will review it.</p>
            : <p className="mt-1 text-[0.65rem] text-slate-500">{formText(row.assetCode) || 'No asset code'}</p>}
          {formText(row.remarks) && <p className="mt-1 text-[0.65rem] leading-relaxed text-slate-600">{formText(row.remarks)}</p>}
        </div>
        <p className="shrink-0 text-xs font-extrabold text-slate-800">{String(row.quantity ?? '')} {formText(row.unitOfMeasure)}</p>
      </li>)}
    </ul>
  </div>
}
