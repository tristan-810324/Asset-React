import { useEffect, useState, type FormEvent } from 'react'
import { clearAuthSession } from '../auth/authApi'
import AdminNavbar, { AdminPageHeader } from '../components/navbars/adminnavbar'
import {
  decideApprovalRequest,
  listApprovalRequests,
  listHoldings,
  waiveLostItem,
  type AccountabilityEntry,
  type ApprovalAction,
  type ApprovalRequest,
} from '../gso/issuancesApi'

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(date)
}

const actionDetails: Record<ApprovalAction, { label: string; tone: string; effect: string; approveLabel: string }> = {
  'Written Off': {
    label: 'Write off',
    tone: 'bg-rose-50 text-rose-700 ring-rose-200',
    effect: 'Approving removes the item from stock for good.',
    approveLabel: 'Approve write-off',
  },
  Paid: {
    label: 'Settle as paid',
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    effect: 'Approving clears the employee of this lost item.',
    approveLabel: 'Approve payment',
  },
  Replaced: {
    label: 'Settle as replaced',
    tone: 'bg-blue-50 text-blue-700 ring-blue-200',
    effect: 'Approving adds the replacement to stock and clears the employee.',
    approveLabel: 'Approve replacement',
  },
}

const fieldClass = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100'

export default function ReturnsReview() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [accountabilities, setAccountabilities] = useState<AccountabilityEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [isBusy, setIsBusy] = useState(false)
  const [decision, setDecision] = useState<{ returnId: string; kind: 'approve' | 'reject' } | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [waiveTarget, setWaiveTarget] = useState<string | null>(null)
  const [waiveNote, setWaiveNote] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([listApprovalRequests(), listHoldings()])
      .then(([nextRequests, holdings]) => {
        if (!active) return
        setRequests(nextRequests)
        setAccountabilities(holdings.accountabilities)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load the return records.')
      })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [reloadKey])

  const handleSignOut = () => {
    clearAuthSession()
    window.location.replace('/login')
  }

  async function runAction(action: () => Promise<string>) {
    setIsBusy(true)
    setError('')
    setMessage('')
    try {
      setMessage(await action())
      setReloadKey((key) => key + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The action could not be completed.')
    } finally {
      setIsBusy(false)
    }
  }

  function openDecision(returnId: string, kind: 'approve' | 'reject') {
    setDecision({ returnId, kind })
    setDecisionNote('')
    setWaiveTarget(null)
  }

  function handleDecision(event: FormEvent<HTMLFormElement>, request: ApprovalRequest) {
    event.preventDefault()
    if (!decision) return
    const { kind } = decision
    void runAction(async () => {
      await decideApprovalRequest(request.returnId, kind, decisionNote.trim())
      setDecision(null)
      setDecisionNote('')
      return kind === 'approve'
        ? `Approved: ${actionDetails[request.action].label.toLowerCase()} for ${request.itemName}.`
        : `Declined. GSO will see your reason on ${request.itemName}.`
    })
  }

  function handleWaive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!waiveTarget) return
    void runAction(async () => {
      await waiveLostItem(waiveTarget, waiveNote.trim())
      setWaiveTarget(null)
      setWaiveNote('')
      return 'Lost item waived. The employee can be issued items again if nothing else is pending.'
    })
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
      <AdminNavbar activePath="/admin/returns" mobileMenuOpen={mobileMenuOpen} onMobileMenuClose={() => setMobileMenuOpen(false)} />
      <section className="min-h-screen lg:pl-72">
        <AdminPageHeader pageName="Returns review" subtitle="Approvals and lost-item waivers" onOpenMenu={() => setMobileMenuOpen(true)} onSignOut={handleSignOut} />

        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</p>}
          {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">{message}</p>}

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="approvals-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="approvals-title" className="text-sm font-black text-slate-900">Waiting for your approval</h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">GSO cannot write off items or settle lost ones on their own. Check each request before approving; the person who asked cannot approve it.</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-extrabold ring-1 ${requests.length ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-slate-50 text-slate-500 ring-slate-200'}`}>
                {requests.length} pending
              </span>
            </div>

            <ul className="mt-4 space-y-3">
              {requests.map((request) => {
                const details = actionDetails[request.action]
                const isOpen = decision?.returnId === request.returnId
                return (
                  <li key={request.returnId} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[0.62rem] font-extrabold ring-1 ${details.tone}`}>{details.label}</span>
                        <p className="mt-2 text-sm font-extrabold text-slate-900">
                          {request.itemName}
                          <span className="font-semibold text-slate-500"> · {request.quantity} {request.unitOfMeasure}{request.tagCode ? ` · ${request.tagCode}` : ''}</span>
                        </p>
                        <p className="mt-0.5 text-[0.68rem] text-slate-500">
                          {request.employeeName} ({request.employeeCode}) · {request.action === 'Written Off' ? `returned ${request.condition}` : 'reported lost'} {formatDateTime(request.returnedAt)}
                        </p>
                      </div>
                      {!isOpen && !request.requestedByYou && (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => openDecision(request.returnId, 'reject')} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50">Decline</button>
                          <button type="button" onClick={() => openDecision(request.returnId, 'approve')} className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-blue-700">Review &amp; approve</button>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3">
                      <p className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">GSO note</p>
                      <p className="mt-1 text-xs font-semibold text-slate-800">{request.note}</p>
                      <p className="mt-1.5 text-[0.65rem] text-slate-500">Requested by {request.requestedBy || 'a deleted account'} · {formatDateTime(request.requestedAt)}</p>
                      {request.action === 'Written Off' && <p className="mt-1 text-[0.65rem] text-slate-500">Return note: {request.reason}</p>}
                    </div>

                    {request.requestedByYou && (
                      <p className="mt-3 text-[0.68rem] font-semibold text-slate-500">You made this request, so another IT Admin has to decide it.</p>
                    )}

                    {isOpen && decision && (
                      <form onSubmit={(event) => handleDecision(event, request)} className={`mt-3 rounded-xl border p-3.5 ${decision.kind === 'approve' ? 'border-blue-100 bg-blue-50/50' : 'border-rose-100 bg-rose-50/50'}`}>
                        <p className="text-xs font-semibold text-slate-700">
                          {decision.kind === 'approve' ? details.effect : 'The request is closed and GSO sees your reason. Nothing else changes.'}
                        </p>
                        <label className="mt-3 block">
                          <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">
                            {decision.kind === 'approve' ? 'Note (optional)' : 'Reason for declining'}
                          </span>
                          <input
                            autoFocus
                            required={decision.kind === 'reject'}
                            maxLength={1000}
                            value={decisionNote}
                            onChange={(event) => setDecisionNote(event.target.value)}
                            placeholder={decision.kind === 'approve' ? 'e.g. Verified the OR with the cashier' : 'e.g. No matching OR in the cashier log'}
                            className={fieldClass}
                          />
                        </label>
                        <div className="mt-3 flex justify-end gap-2">
                          <button type="button" onClick={() => setDecision(null)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                          <button
                            type="submit"
                            disabled={isBusy || (decision.kind === 'reject' && !decisionNote.trim())}
                            className={`rounded-xl px-3.5 py-2 text-xs font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${decision.kind === 'approve' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                          >
                            {isBusy ? 'Saving…' : decision.kind === 'approve' ? details.approveLabel : 'Decline request'}
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                )
              })}
              {!isLoading && !requests.length && (
                <li className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs font-semibold text-slate-400">Nothing is waiting for approval.</li>
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="lost-review-title">
            <h2 id="lost-review-title" className="text-sm font-black text-slate-900">Lost items awaiting settlement ({accountabilities.length})</h2>
            <p className="mt-1 text-xs text-slate-500">Waive one only when the school decides the employee does not have to pay or replace it.</p>
            <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {accountabilities.map((entry) => (
                <li key={entry.returnId} className="p-4 text-xs">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-extrabold text-slate-800">
                        {entry.itemName}
                        <span className="font-semibold text-slate-500"> · {entry.quantity} {entry.unitOfMeasure}{entry.tagCode ? ` · ${entry.tagCode}` : ''}</span>
                      </p>
                      <p className="mt-0.5 text-[0.68rem] text-slate-500">{entry.employeeName} ({entry.employeeCode}) · reported {formatDateTime(entry.reportedAt)}</p>
                      {entry.approvalAction && (
                        <p className="mt-1.5 inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[0.62rem] font-extrabold text-amber-800 ring-1 ring-amber-200">
                          GSO asked to settle as {entry.approvalAction.toLowerCase()}, see above
                        </p>
                      )}
                    </div>
                    {waiveTarget !== entry.returnId && (
                      <button type="button" onClick={() => { setWaiveTarget(entry.returnId); setWaiveNote(''); setDecision(null) }} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50">Waive</button>
                    )}
                  </div>
                  {waiveTarget === entry.returnId && (
                    <form onSubmit={handleWaive} className="mt-3 rounded-xl border border-rose-100 bg-rose-50/50 p-3.5">
                      <label className="block">
                        <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Who approved the waiver, and why</span>
                        <input autoFocus required maxLength={1000} value={waiveNote} onChange={(event) => setWaiveNote(event.target.value)} placeholder="e.g. Approved by the director, memo 2026-14" className={fieldClass} />
                      </label>
                      <div className="mt-3 flex justify-end gap-2">
                        <button type="button" onClick={() => setWaiveTarget(null)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                        <button type="submit" disabled={isBusy || !waiveNote.trim()} className="rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">{isBusy ? 'Saving…' : 'Confirm waiver'}</button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
              {!isLoading && !accountabilities.length && <li className="p-4 text-center text-xs font-semibold text-slate-400">No lost items are waiting for settlement.</li>}
            </ul>
          </section>
        </div>
      </section>
    </main>
  )
}
