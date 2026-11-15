import { useEffect, useState } from 'react'
import { listServiceWorkOrders, type ServiceWorkOrder, type ServiceWorkSummary } from '../gso/serviceWorkboardApi'

function Icon({ name, className = 'h-4 w-4' }: { name: 'tool' | 'arrow' | 'warning'; className?: string }) {
  const paths = {
    tool: <path d="M14.7 6.3a5.3 5.3 0 0 0-7.4 7.4l-5.1 5.1a2.1 2.1 0 0 0 3 3l5.1-5.1a5.3 5.3 0 0 0 7.4-7.4l-3.1 3.1-3-3z" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    warning: <><path d="m12 3 9 16H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></>,
  }
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

const boxClass = 'rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5'

// The Computer Lab Support card. The IT Staff dashboard and the IT Admin dashboard both show it,
// so each one passes the link to its own support queue page.
export default function ComputerLabSupportPanel({ queueHref }: { queueHref: string }) {
  const [summary, setSummary] = useState<ServiceWorkSummary | null>(null)
  const [jobs, setJobs] = useState<ServiceWorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true
    void listServiceWorkOrders({ team: 'ITSS', limit: 4 })
      .then(({ summary: nextSummary, workOrders }) => {
        if (!active) return
        setSummary(nextSummary)
        setJobs(workOrders)
      })
      .catch((error) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Computer lab jobs could not be loaded.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // "In progress" has no tab of its own on the workboard, so it opens the queue without a filter.
  const metrics = [
    { label: 'New', value: summary?.new ?? 0, tone: 'text-blue-700', href: `${queueHref}?queue=new` },
    { label: 'In progress', value: summary?.inProgress ?? 0, tone: 'text-violet-700', href: queueHref },
    { label: 'Overdue', value: summary?.overdue ?? 0, tone: 'text-rose-700', href: `${queueHref}?queue=overdue` },
  ]

  return (
    <section className={`overflow-hidden ${boxClass}`} aria-labelledby="computer-lab-support-title">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700"><Icon name="tool" /></span>
          <div>
            <h2 id="computer-lab-support-title" className="text-sm font-black tracking-tight text-slate-900">Computer Lab Support</h2>
            <p className="mt-0.5 text-[0.68rem] font-medium text-slate-500">Jobs routed to ITSS Support</p>
          </div>
        </div>
        <a href={queueHref} className="inline-flex min-h-9 items-center justify-center gap-1.5 self-start rounded-xl border border-slate-300 bg-white px-3 py-2 text-[0.68rem] font-extrabold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 sm:self-auto">
          Open queue <Icon name="arrow" className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {metrics.map((metric) => (
          <a key={metric.label} href={metric.href} className="group flex items-center justify-between px-5 py-3.5 transition hover:bg-slate-50 sm:block sm:px-5 sm:py-4">
            <span className="text-[0.6rem] font-extrabold uppercase tracking-widest text-slate-500">{metric.label}</span>
            <span className={`mt-0.5 block text-xl font-black tabular-nums sm:mt-1 sm:text-2xl ${metric.tone}`}>{metric.value}</span>
          </a>
        ))}
      </div>

      {loadError && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-xs font-semibold text-rose-700">{loadError}</p>}
      {loading && !loadError && <p className="border-t border-slate-100 px-5 py-4 text-xs font-semibold text-slate-400">Loading computer lab jobs...</p>}
      {!loading && !loadError && jobs.length === 0 && <p className="border-t border-slate-100 px-5 py-4 text-xs font-semibold text-slate-500">No open computer lab jobs right now.</p>}
      {jobs.length > 0 && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {jobs.map((job) => (
            <a key={job.id} href={`${queueHref}?request=${encodeURIComponent(job.id)}`} className="group flex items-center gap-3 px-5 py-3 transition hover:bg-blue-50/50 sm:px-6">
              <span className={`h-2 w-2 shrink-0 rounded-full ${job.isOverdue ? 'bg-rose-500' : job.priority === 'Urgent' ? 'bg-amber-500' : 'bg-blue-500'}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-extrabold text-slate-800">{job.title || 'Service request'}</span>
                <span className="mt-0.5 block truncate text-[0.62rem] font-semibold text-slate-500">{job.referenceNo} · {job.location || 'Location not set'}</span>
              </span>
              <span className={`flex shrink-0 items-center gap-1 text-[0.62rem] font-extrabold ${job.isOverdue ? 'text-rose-700' : 'text-slate-500'}`}>
                {job.isOverdue && <Icon name="warning" className="h-3 w-3" />}
                {job.deadlineLabel || 'Open'}
              </span>
              <Icon name="arrow" className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700" />
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
