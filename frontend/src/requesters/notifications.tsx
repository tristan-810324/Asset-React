import { useEffect, useMemo, useState } from 'react'
import RequesterLayout from './requesterlayout'
import {
  listMyIssuanceActivity,
  listMyRequests,
  REQUEST_TYPE_LABELS,
  type RequesterIssuanceApproval,
  type ServiceRequest,
} from './requesterApi'
import {
  listServerNotifications,
  markAllServerNotificationsRead,
  markServerNotificationRead,
  type ServerNotification,
} from '../auth/notificationsApi'

type ActivityEvent = {
  key: string
  at: string
  title: string
  details: string
  source: string
  href?: string
  tone: 'blue' | 'green' | 'amber' | 'rose'
  // The in-app notice behind this entry. Entries without one are records, so they have no read state.
  noticeId?: ServerNotification['id']
  unread?: boolean
}

const toneClasses = {
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-800',
  rose: 'bg-rose-50 text-rose-700',
}

const toneIcons = { blue: '↻', green: '✓', amber: '!', rose: '×' }

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
      ? 'Individually tracked item being prepared for pickup'
      : isPerUnit && batch.status === 'Issued'
        ? 'Individually tracked items ready for pickup'
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
    href: undefined,
    tone: isConsumable || isReusableBorrow && batch.items.every((item) => item.status === 'Returned') ? 'green' : isPerUnit && batch.status === 'Pending' ? 'amber' : isReusableBorrow ? 'amber' : 'blue',
  }
}

export default function RequesterNotifications() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [issuanceBatches, setIssuanceBatches] = useState<RequesterIssuanceApproval[]>([])
  const [serverNotifications, setServerNotifications] = useState<ServerNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(Date.now())
    updateCurrentTime()
    const interval = window.setInterval(updateCurrentTime, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([listMyRequests(), listMyIssuanceActivity(), listServerNotifications().catch(() => [])])
      .then(([requestRows, batches, notifications]) => {
        if (!active) return
        setRequests(requestRows)
        setIssuanceBatches(batches)
        setServerNotifications(notifications)
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Hindi ma-load ang notifications.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const events = useMemo(() => {
    const now = currentTime
    // A notice that is shown inside a request or issuance entry is not listed again on its own.
    const shown = new Set<string>()
    const findNotice = (...prefixes: string[]) => serverNotifications.find((notice) => !shown.has(String(notice.id))
      && prefixes.some((prefix) => notice.dedupeKey.startsWith(prefix)))
    const withNotice = (event: ActivityEvent, notice: ServerNotification | undefined): ActivityEvent => {
      if (!notice) return event
      shown.add(String(notice.id))
      return { ...event, title: notice.title, details: notice.message, noticeId: notice.id, unread: !notice.readAt }
    }

    const requestEvents: ActivityEvent[] = requests.flatMap((request) => request.history.map((event) => withNotice({
      key: `request-${request.id}-${event.id}`,
      at: event.changedAt,
      title: event.status,
      details: event.note || `Your request status is now ${event.status}.`,
      source: `${request.referenceNo} · ${REQUEST_TYPE_LABELS[request.requestType]}`,
      href: `/requester/requests/${request.id}`,
      tone: event.status === 'Rejected' ? 'rose' : event.status === 'Approved' || event.status === 'Returned' ? 'green' : event.status === 'Needs Information' ? 'amber' : 'blue',
    }, findNotice(`requester-status:${request.id}:${event.status}:`, `purchase-requester:${request.id}:${event.status}:`))))

    const issuanceEvents: ActivityEvent[] = issuanceBatches.map((batch) => withNotice(issuanceActivity(batch), findNotice(`requester-issue:${batch.id}:`)))

    // Notices that belong to nothing above, such as return receipts and purchase updates.
    const noticeEvents: ActivityEvent[] = serverNotifications
      .filter((notice) => !shown.has(String(notice.id)))
      .map((notice) => {
        const requestId = notice.href.match(/\/requester\/requests\/(\d+)/)?.[1]
        const request = requests.find((row) => row.id === requestId)
        const rejected = /declined|rejected/i.test(notice.title)
        const approved = /approved|received|completed|released|confirmed|recorded/i.test(notice.title)
        return {
          key: `notice-${notice.id}`,
          at: notice.createdAt,
          title: notice.title,
          details: notice.message,
          source: request ? `${request.referenceNo} · ${REQUEST_TYPE_LABELS[request.requestType]}` : 'GSO update',
          href: notice.href || undefined,
          tone: rejected ? 'rose' : approved ? 'green' : /information|lost|overdue|repair|review/i.test(notice.title) ? 'amber' : 'blue',
          noticeId: notice.id,
          unread: !notice.readAt,
        }
      })

    const today = new Date(now ?? 0)
    today.setHours(0, 0, 0, 0)
    const returnReminders: ActivityEvent[] = requests
      .filter((request) => request.requestType === 'BORROWING' && ['Issued', 'Return Requested'].includes(request.status))
      .flatMap((request) => {
        if (now === null) return []
        const dueDate = request.assets.find((asset) => asset.dueDate)?.dueDate || request.formData.returnDate || null
        if (!dueDate) return []
        const due = new Date(`${dueDate}T00:00:00`)
        const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / 86_400_000)
        if (daysUntilDue > 3) return []
        return [{
          key: `return-reminder-${request.id}`,
          at: new Date(now).toISOString(),
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
        if (now === null) return []
        const dueValue = batch.expectedReturnAt || batch.expectedReturnDate
        if (!dueValue) return []
        const includesTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueValue)
        const dueAt = new Date(includesTime ? `${dueValue}:00+08:00` : `${dueValue}T00:00:00+08:00`)
        const hoursUntilDue = (dueAt.getTime() - now) / 3_600_000
        if (hoursUntilDue > 72) return []
        const daysUntilDue = Math.ceil(hoursUntilDue / 24)
        return [{
          key: `gso-return-reminder-${batch.id}`,
          at: new Date(now).toISOString(),
          title: hoursUntilDue < 0 ? 'GSO reusable stock overdue · return needed' : hoursUntilDue <= 24 ? 'GSO reusable stock due soon' : `GSO reusable stock due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`,
          details: `${batch.items.filter((item) => item.issueBehavior === 'returnable').map((item) => `${Math.max(Number(item.quantity) - Number(item.returnedQuantity || 0), 0)} ${item.unitOfMeasure} ${item.itemName}`).join(', ')} · return by ${formatBorrowSchedule(dueValue)}${batch.useLocation ? ` · ${batch.useLocation}` : ''}.`,
          source: `Request #${batch.id} · return reminder`,
          href: '/requester',
          tone: hoursUntilDue < 0 ? 'rose' as const : 'amber' as const,
        }]
      })

    return [...noticeEvents, ...requestEvents, ...issuanceEvents, ...returnReminders, ...gsoBorrowingReminders]
      .sort((first, second) => new Date(second.at).getTime() - new Date(first.at).getTime())
  }, [currentTime, requests, issuanceBatches, serverNotifications])

  const unreadCount = events.filter((event) => event.unread).length
  const visibleEvents = filter === 'unread' ? events.filter((event) => event.unread) : events

  function markRead(noticeId: ServerNotification['id']) {
    const readAt = new Date().toISOString()
    setServerNotifications((current) => current.map((notice) => (String(notice.id) === String(noticeId) && !notice.readAt ? { ...notice, readAt } : notice)))
    void markServerNotificationRead(noticeId).catch(() => undefined)
  }

  function markAllRead() {
    const readAt = new Date().toISOString()
    setServerNotifications((current) => current.map((notice) => (notice.readAt ? notice : { ...notice, readAt })))
    void markAllServerNotificationsRead().catch(() => undefined)
  }

  return <RequesterLayout title="Notifications" subtitle="Request decisions, item distributions, and return reminders in one timeline.">
    <div className="mx-auto max-w-5xl">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Account activity
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Notifications</h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">Updates about your requests and items. Confirm an item only after you have received it.</p>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-blue-900 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-blue-200"
          >
            Mark all as read
          </button>
        </div>
      </section>

      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-sm font-black text-slate-900">Activity timeline</h2>
            <p className="mt-1 text-[0.68rem] font-medium text-slate-500">{loading ? 'Loading…' : `${unreadCount} unread`}</p>
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Show notifications">
            {([
              { value: 'all', label: `All ${events.length}` },
              { value: 'unread', label: `Unread ${unreadCount}` },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${filter === option.value ? 'bg-[#155eef] text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-blue-700'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-2 sm:px-5">
          {loading ? (
            <div className="grid min-h-48 place-items-center text-sm font-bold text-slate-400">Loading notifications...</div>
          ) : visibleEvents.length === 0 ? (
            <div className="grid min-h-48 place-items-center py-8 text-center">
              <div>
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-lg font-black text-blue-700">↻</span>
                <h2 className="mt-3 text-sm font-extrabold text-slate-700">{filter === 'unread' ? 'You are all caught up' : 'No notifications yet'}</h2>
                <p className="mt-1 text-xs text-slate-500">{filter === 'unread' ? 'New updates from GSO will appear here.' : 'GSO request and item notices will appear here.'}</p>
                {filter === 'unread' && <button type="button" onClick={() => setFilter('all')} className="mt-3 text-xs font-extrabold text-blue-700 hover:text-blue-900">Show all</button>}
              </div>
            </div>
          ) : (
            <ol>
              {visibleEvents.map((event) => {
                const noticeId = event.noticeId
                const unread = Boolean(event.unread)
                return (
                  <li key={event.key} className={`relative flex gap-3 border-b border-slate-100 py-4 last:border-0 ${unread ? 'bg-blue-50/50 px-3 sm:px-4' : ''}`}>
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ${toneClasses[event.tone]}`}>{toneIcons[event.tone]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={`text-xs ${unread ? 'font-black text-slate-900' : 'font-extrabold text-slate-700'}`}>
                          {unread && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-600 align-middle" aria-label="Unread" />}
                          {event.title}
                        </p>
                        <time className="text-[0.62rem] font-semibold text-slate-400">{new Date(event.at).toLocaleString('en-PH')}</time>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{event.details}</p>
                      <p className="mt-1 text-[0.62rem] font-bold text-slate-400">{event.source}</p>
                      {(event.href || (unread && noticeId !== undefined)) && (
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          {unread && noticeId !== undefined && (
                            <button type="button" onClick={() => markRead(noticeId)} className="text-[0.65rem] font-extrabold text-slate-500 hover:text-slate-800">Mark as read</button>
                          )}
                          {event.href && (
                            <a href={event.href} onClick={() => { if (unread && noticeId !== undefined) markRead(noticeId) }} className="text-[0.65rem] font-extrabold text-blue-700 hover:underline">Open →</a>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  </RequesterLayout>
}
