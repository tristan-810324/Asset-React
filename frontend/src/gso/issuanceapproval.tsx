import { useEffect, useState } from 'react'
import { ApiError } from '../auth/authApi'
import { getIssuanceApproval, submitIssuanceDecision, type ApprovalIssuance } from './issuancesApi'

type Decision = 'approve' | 'reject'

export default function IssuanceApproval() {
  const [token, setToken] = useState('')
  const [decision, setDecision] = useState<Decision>('approve')
  const [issuance, setIssuance] = useState<ApprovalIssuance | null>(null)
  const [resultStatus, setResultStatus] = useState('')
  const [pageError, setPageError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const requestToken = query.get('token') || ''
    const requestedDecision = query.get('action')
    setToken(requestToken)
    setDecision(requestedDecision === 'reject' ? 'reject' : 'approve')

    if (!requestToken) {
      setPageError('The approval link is missing its private token. Open the link from the employee email again.')
      setIsLoading(false)
      return
    }

    let active = true
    void getIssuanceApproval(requestToken)
      .then((record) => {
        if (active) {
          setIssuance(record)
          if (record.status !== 'Pending') setResultStatus(record.status)
        }
      })
      .catch((error: unknown) => {
        if (active) setPageError(error instanceof Error ? error.message : 'Unable to load the approval request.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => { active = false }
  }, [])

  const handleDecision = async () => {
    setIsSubmitting(true)
    setPageError('')
    try {
      const result = await submitIssuanceDecision(token, decision)
      setResultStatus(result.status)
    } catch (error) {
      setPageError(error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Unable to submit your decision.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const requestExpired = issuance?.status === 'Pending' && new Date(issuance.expiresAt).getTime() <= Date.now()
  const isFinal = resultStatus !== '' || requestExpired

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-10 font-['Plus_Jakarta_Sans'] text-slate-900">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-9">
        <div className="mb-7 border-b border-slate-100 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">A.SSET · GSO</p>
          <h1 className="mt-2 text-xl font-black">Equipment Issuance Approval</h1>
          <p className="mt-1 text-sm text-slate-500">Review the request sent to your employee email address.</p>
        </div>

        {isLoading ? (
          <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-500">Loading approval request…</p>
        ) : pageError && !issuance ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-700">{pageError}</p>
        ) : issuance ? (
          <>
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
              <div>
                <span className="text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-400">Employee</span>
                <p className="mt-1 text-sm font-bold text-slate-800">{issuance.employeeName} <span className="font-medium text-slate-500">({issuance.employeeCode})</span></p>
              </div>
              <div>
                <span className="text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-400">Inventory item</span>
                <p className="mt-1 text-sm font-bold text-slate-800">{issuance.itemName}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">{issuance.itemCode} · Condition: {issuance.condition}</p>
              </div>
              <div>
                <span className="text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-400">Request status</span>
                <p className="mt-1 text-sm font-bold text-blue-700">{resultStatus || (requestExpired ? 'Expired' : issuance.status === 'Pending' ? 'Pending Approval' : issuance.status)}</p>
              </div>
            </div>

            {pageError && (
              <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{pageError}</p>
            )}

            {isFinal ? (
              <div className="mt-5 rounded-xl bg-blue-50 px-4 py-4 text-sm font-semibold text-blue-800">
                {requestExpired
                  ? 'This request has expired. The inventory item is available for GSO to issue again.'
                  : resultStatus === 'Issued'
                    ? 'You approved the request. The item is now assigned to you.'
                    : resultStatus === 'Rejected'
                      ? 'You rejected the request. The item has been released back to GSO inventory.'
                      : `This request has already been resolved (${resultStatus}).`}
              </div>
            ) : issuance.status === 'Pending' ? (
              <>
                <p className="mt-5 text-sm leading-6 text-slate-600">
                  {decision === 'approve'
                    ? 'Approving will assign this item to you and update the inventory record.'
                    : 'Rejecting will cancel this request and release the item back to GSO inventory.'}
                </p>
                <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setDecision((current) => current === 'approve' ? 'reject' : 'approve')}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {decision === 'approve' ? 'Choose Reject' : 'Choose Approve'}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void handleDecision()}
                    className={`rounded-xl px-5 py-2.5 text-sm font-extrabold text-white shadow-md disabled:cursor-wait disabled:opacity-70 ${decision === 'approve' ? 'bg-blue-600 shadow-blue-600/20 hover:bg-blue-700' : 'bg-rose-600 shadow-rose-600/20 hover:bg-rose-700'}`}
                  >
                    {isSubmitting ? 'Submitting…' : `Confirm ${decision === 'approve' ? 'Approval' : 'Rejection'}`}
                  </button>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  )
}
