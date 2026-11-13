// Connected step paths. Borrowings, requests, and issuance records all use this one look, so every lifecycle in
// the app reads the same way: circles joined by a line, the current step highlighted, finished steps checked.

type Progress = { steps: readonly string[]; current: number; ended?: string }

const borrowingSteps = ['Requested', 'Approved', 'Borrowed', 'Returned'] as const
const standardSteps = ['Requested', 'Approved', 'Completed'] as const
const workSteps = ['Requested', 'Approved', 'In Progress', 'Completed'] as const
const issuanceSteps = ['Pending', 'Issued', 'Returned'] as const

const requestEndings: Record<string, string | undefined> = { Rejected: 'Declined by GSO', Cancelled: 'Cancelled' }
const issuanceEndings: Record<string, string | undefined> = { Lost: 'Reported lost', Consumed: 'Consumed', Rejected: 'Rejected' }

// Status → step index. A status that is not listed is still on the first step.
const stepLookup = (table: Record<string, number | undefined>) => (status: string) => table[status] ?? 0

// Older "Ready for Pickup" borrowings count as approved.
const borrowingStepFor = stepLookup({ Approved: 1, 'Ready for Pickup': 1, Issued: 2, 'Return Requested': 2, Returned: 3, 'For Repair': 3, Closed: 3 })
const standardStepFor = stepLookup({ Approved: 1, Completed: 2, Closed: 2 })
const workStepFor = stepLookup({ Approved: 1, 'In Progress': 2, Completed: 3, Closed: 3 })
const issuanceStepFor = stepLookup({ 'Pending acknowledgment': 0, Issued: 1, Overdue: 1, 'Partially returned': 1, Returned: 2 })

function progressOf(steps: readonly string[], stepFor: (status: string) => number, status: string, endings: Record<string, string | undefined>): Progress {
  const ended = endings[status]
  return ended ? { steps, current: 0, ended } : { steps, current: stepFor(status) }
}

// Which path a request type uses. Purchase requisitions have per-line routes, so they have no single path yet.
function progressFor(requestType: string, status: string): Progress | null {
  if (requestType === 'BORROWING') return progressOf(borrowingSteps, borrowingStepFor, status, requestEndings)
  if (requestType === 'FACILITY_USE' || requestType === 'ISSUANCE_REQUEST') return progressOf(standardSteps, standardStepFor, status, requestEndings)
  if (requestType === 'JOB_REQUEST' || requestType === 'LOSS_DAMAGE_REPORT') return progressOf(workSteps, workStepFor, status, requestEndings)
  return null
}

// compact is for card lists: smaller circles and a shorter path, so the cards stay light.
export function ProgressPath({ steps, current, ended, compact = false }: Progress & { compact?: boolean }) {
  if (ended) {
    const negative = /declined|rejected|lost|cancel/i.test(ended)
    return <p className={`mt-3 rounded-xl border px-3 py-2 text-xs font-bold ${negative ? 'border-rose-100 bg-rose-50/70 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{ended}</p>
  }

  const circleSize = compact ? 'h-4 w-4 border text-[0.5rem]' : 'h-6 w-6 border-2 text-[0.6rem]'
  const ring = compact ? 'ring-2' : 'ring-4'
  const labelSize = compact ? 'text-[0.5rem]' : 'text-[0.6rem]'
  const connectorSize = compact ? 'mx-1 mt-2 h-px' : 'mx-1.5 mt-3 h-0.5'

  return (
    <ol aria-label="Progress" className={`flex items-start ${compact ? 'mt-2 max-w-sm' : 'mt-3'}`}>
      {steps.map((step, index) => {
        const done = index < current || (index === current && current === steps.length - 1)
        const active = index === current && !done
        return (
          <li key={step} className="flex min-w-0 flex-1 items-start last:flex-none">
            <div className="flex shrink-0 flex-col items-center gap-1">
              <span className={`grid place-items-center rounded-full font-black ${circleSize} ${done ? 'border-emerald-500 bg-emerald-500 text-white' : active ? `border-blue-600 bg-white text-blue-700 ${ring} ring-blue-100` : 'border-slate-300 bg-white text-slate-400'}`}>{done ? '✓' : index + 1}</span>
              <span className={`whitespace-nowrap font-extrabold ${labelSize} ${done || active ? 'text-slate-800' : 'text-slate-400'}`}>{step}</span>
            </div>
            {index < steps.length - 1 && <span aria-hidden="true" className={`${connectorSize} min-w-4 flex-1 rounded-full ${index < current ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
          </li>
        )
      })}
    </ol>
  )
}

// The path for any request type that has one; renders nothing for the rest.
export function RequestProgressPath({ requestType, status, compact }: { requestType: string; status: string; compact?: boolean }) {
  const progress = progressFor(requestType, status)
  return progress ? <ProgressPath {...progress} compact={compact} /> : null
}

// The progress card at the top of a request's details.
export function RequestProgressSection({ requestType, status }: { requestType: string; status: string }) {
  const progress = progressFor(requestType, status)
  if (!progress) return null
  return (
    <section className="mt-5 rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-5">
      <h2 className="text-sm font-black text-slate-900">{requestType === 'BORROWING' ? 'Borrowing progress' : 'Progress'}</h2>
      <ProgressPath {...progress} />
    </section>
  )
}

export function BorrowingPath({ status, compact }: { status: string; compact?: boolean }) {
  return <RequestProgressPath requestType="BORROWING" status={status} compact={compact} />
}

// An issuance record: pending acknowledgment, then issued, then returned.
export function IssuanceProgressPath({ status }: { status: string }) {
  return <ProgressPath {...progressOf(issuanceSteps, issuanceStepFor, status, issuanceEndings)} />
}
