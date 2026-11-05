import { useEffect, useMemo, useState } from 'react'
import RequesterLayout from './requesterlayout'
import {
  listMyIssuanceActivity,
  listMyRequests,
  REQUEST_TYPE_LABELS,
  type RequesterIssuanceApproval,
  type ServiceRequest,
} from './requesterApi'

type ActivityEvent = {
  key: string
  at: string
  title: string
  details: string
  source: string
  href?: string
  tone: 'blue' | 'green' | 'amber' | 'rose'
}

function formatBorrowSchedule(value: string | null | undefined) {
  if (!value) return 'Not set'
  const includesTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  const date = new Date(includesTime ? `${value}:00+08:00` : `${value}T00:00:00+08:00`)
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    ...(includesTime ? { timeStyle: 'short' as const } : {}),
    timeZone: 'Asia/Manila',
  }).format(date)
}

function issuanceActivity(batch: RequesterIssuanceApproval): ActivityEvent {
  const isPerUnit = batch.items.length > 0 && batch.items.every((item) => item.trackingMode === 'individual')
  const isConsumable = batch.items.length > 0 && batch.items.every((item) => item.trackingMode === 'quantity' && item.issueBehavior === 'consumable')
  const isReusableBorrow = batch.items.length > 0 && batch.items.every((item) => item.trackingMode === 'quantity' && item.issueBehavior === 'returnable')
  const items = batch.items.map((item) => `${item.quantity} ${item.unitOfMeasure} ${item.itemName}`).join(', ')
  const title = isConsumable && batch.status === 'Issued'
    ? 'Consumable stock issued · no action needed'
    : isPerUnit && batch.status === 'Pending'
      ? 'Per-unit asset awaiting handover acknowledgment'
      : isPerUnit && batch.status === 'Issued'
        ? 'Per-unit custody acknowledged'
        : isReusableBorrow && batch.items.every((item) => item.status === 'Returned')
          ? 'Reusable-stock return recorded'
          : isReusableBorrow && batch.status === 'Issued'
            ? 'Face-to-face reusable-stock borrowing recorded'
        : `Issuance status: ${batch.status}`
  const detailParts = [items, batch.decisionNote].filter(Boolean)
  batch.items.filter((item) => item.notes).forEach((item) => detailParts.push(`${item.itemName}: ${item.notes}`))
  batch.items.flatMap((item) => item.tags || []).forEach((tag) => detailParts.push(`Unit ${tag.unitNumber} barcode ${tag.tagCode}`))
  if (batch.borrowUseDate) {
    detailParts.push(`Borrow ${formatBorrowSchedule(batch.borrowUseAt || batch.borrowUseDate)} · return by ${formatBorrowSchedule(batch.expectedReturnAt || batch.expectedReturnDate)}`)
    if (batch.usePurpose) detailParts.push(`Event: ${batch.usePurpose}`)
    if (batch.useLocation) detailParts.push(`Location: ${batch.useLocation}`)
  }
  return {
    key: `issuance-${batch.id}`,
    at: batch.decidedAt || batch.requestedAt,
    title,
    details: detailParts.join(' · '),
    source: 'GSO item activity',
    href: isPerUnit && batch.status === 'Pending' ? '/requester' : undefined,
    tone: isConsumable || isReusableBorrow && batch.items.every((item) => item.status === 'Returned') ? 'green' : isPerUnit && batch.status === 'Pending' ? 'amber' : isReusableBorrow ? 'amber' : 'blue',
  }
}

export default function RequesterNotifications() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [issuanceBatches, setIssuanceBatches] = useState<RequesterIssuanceApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([listMyRequests(), listMyIssuanceActivity()])
      .then(([requestRows, batches]) => {
        if (!active) return
        setRequests(requestRows)
        setIssuanceBatches(batches)
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang notifications.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const events = useMemo(() => {
    const requestEvents: ActivityEvent[] = requests.flatMap((request) => request.history.map((event) => ({
      key: `request-${request.id}-${event.id}`,
      at: event.changedAt,
      title: event.status,
      details: event.note || `Your request status is now ${event.status}.`,
      source: `${request.referenceNo} · ${REQUEST_TYPE_LABELS[request.requestType]}`,
      href: `/requester/requests/${request.id}`,
      tone: event.status === 'Rejected' ? 'rose' : event.status === 'Approved' || event.status === 'Returned' ? 'green' : event.status === 'Needs Information' ? 'amber' : 'blue',
    })))
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const returnReminders: ActivityEvent[] = requests
      .filter((request) => request.requestType === 'BORROWING' && ['Issued', 'Return Requested'].includes(request.status))
      .flatMap((request) => {
        const dueDate = request.assets.find((asset) => asset.dueDate)?.dueDate || request.formData.returnDate || null
        if (!dueDate) return []
        const due = new Date(`${dueDate}T00:00:00`)
        const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / 86_400_000)
        if (daysUntilDue > 3) return []
        return [{
          key: `return-reminder-${request.id}`,
          at: new Date().toISOString(),
          title: daysUntilDue < 0 ? 'Reusable stock overdue · return needed' : daysUntilDue === 0 ? 'Reusable stock due today' : `Reusable stock due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`,
          details: `${request.title} · return by ${new Date(`${dueDate}T00:00:00`).toLocaleDateString('en-PH')}.`,
          source: `${request.referenceNo} · return reminder`,
          href: `/requester/requests/${request.id}`,
          tone: daysUntilDue < 0 ? 'rose' as const : 'amber' as const,
        }]
      })
    const gsoBorrowingReminders: ActivityEvent[] = issuanceBatches
      .filter((batch) => batch.status === 'Issued'
        && batch.items.some((item) => item.trackingMode === 'quantity'
          && item.issueBehavior === 'returnable'
          && item.status !== 'Returned'
          && Number(item.quantity) - Number(item.returnedQuantity || 0) > 0))
      .flatMap((batch) => {
        const dueValue = batch.expectedReturnAt || batch.expectedReturnDate
        if (!dueValue) return []
        const includesTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueValue)
        const dueAt = new Date(includesTime ? `${dueValue}:00+08:00` : `${dueValue}T00:00:00+08:00`)
        const hoursUntilDue = (dueAt.getTime() - Date.now()) / 3_600_000
        if (hoursUntilDue > 72) return []
        const daysUntilDue = Math.ceil(hoursUntilDue / 24)
        return [{
          key: `gso-return-reminder-${batch.id}`,
          at: new Date().toISOString(),
          title: hoursUntilDue < 0 ? 'GSO reusable stock overdue · return needed' : hoursUntilDue <= 24 ? 'GSO reusable stock due soon' : `GSO reusable stock due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`,
          details: `${batch.items.filter((item) => item.issueBehavior === 'returnable').map((item) => `${Math.max(Number(item.quantity) - Number(item.returnedQuantity || 0), 0)} ${item.unitOfMeasure} ${item.itemName}`).join(', ')} · return by ${formatBorrowSchedule(dueValue)}${batch.useLocation ? ` · ${batch.useLocation}` : ''}.`,
          source: `Request #${batch.id} · return reminder`,
          href: '/requester',
          tone: hoursUntilDue < 0 ? 'rose' as const : 'amber' as const,
        }]
      })
    return [...requestEvents, ...issuanceBatches.map(issuanceActivity), ...returnReminders, ...gsoBorrowingReminders]
      .sort((first, second) => new Date(second.at).getTime() - new Date(first.at).getTime())
  }, [requests, issuanceBatches])

  const toneClasses = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    rose: 'bg-rose-50 text-rose-700',
  }

  return <RequesterLayout title="Notifications" subtitle="Request decisions, item distributions, and return reminders in one timeline.">
    <div className="mx-auto max-w-5xl">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7"><div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" /><div className="relative"><span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Account activity</span><h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Notifications</h1><p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">Consumable distributions are listed for your records. Only confirm a per-unit asset after you receive it.</p></div></section>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/55 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-4"><div><h2 className="text-sm font-black text-slate-900">Activity timeline</h2><p className="mt-1 text-[0.68rem] font-medium text-slate-500">Request decisions and GSO item records are combined here.</p></div><span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">{loading ? 'Loading' : `${events.length} notifications`}</span></div>
        {loading ? <div className="grid min-h-48 place-items-center text-sm font-bold text-slate-400">Loading notifications...</div> : events.length === 0 ? <div className="grid min-h-48 place-items-center text-center"><div><span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-lg font-black text-blue-700">↻</span><h2 className="mt-3 text-sm font-extrabold text-slate-700">No notifications yet</h2><p className="mt-1 text-xs text-slate-500">GSO request and item notices will appear here.</p></div></div> : <ol className="space-y-0">{events.map((event) => <li key={event.key} className="relative flex gap-3 border-b border-slate-100 py-4 first:pt-1 last:border-0"><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ${toneClasses[event.tone]}`}>{event.tone === 'rose' ? '×' : event.tone === 'green' ? '✓' : event.tone === 'amber' ? '!' : '↻'}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-slate-800">{event.title}</p><time className="text-[0.62rem] font-semibold text-slate-400">{new Date(event.at).toLocaleString('en-PH')}</time></div><p className="mt-1 text-xs leading-relaxed text-slate-600">{event.details}</p><p className="mt-1 text-[0.62rem] font-bold text-slate-400">{event.source}</p>{event.href && <a href={event.href} className="mt-2 inline-block text-[0.65rem] font-extrabold text-blue-700 hover:underline">{event.title.includes('acknowledgment') ? 'Confirm receipt' : 'Open request'} →</a>}</div></li>)}</ol>}
      </section>
    </div>
  </RequesterLayout>
}
