import { useEffect, useMemo, useState } from 'react'
import {
  listServerNotifications,
  markAllServerNotificationsRead,
  markServerNotificationRead,
  notificationModuleFor,
  type ServerNotification,
} from '../../auth/notificationsApi'

type InboxFilter = 'all' | 'unread'

const moduleTone: Record<string, string> = {
  Requests: 'bg-blue-50 text-blue-700',
  Issuance: 'bg-emerald-50 text-emerald-700',
  Returns: 'bg-amber-50 text-amber-800',
  Inventory: 'bg-violet-50 text-violet-700',
  System: 'bg-slate-100 text-slate-600',
}

function timeAgo(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function NotificationRow({ row, onRead }: { row: ServerNotification; onRead: (id: ServerNotification['id']) => void }) {
  const unread = !row.readAt
  const moduleName = notificationModuleFor(row.type)
  return (
    <li className={`flex gap-3 px-4 py-4 transition hover:bg-blue-50/50 sm:px-5 ${unread ? 'bg-blue-50/60' : 'bg-white'}`}>
      <span aria-label={unread ? 'Unread' : 'Read'} className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${unread ? 'bg-blue-600' : 'bg-slate-200'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`text-sm ${unread ? 'font-black text-slate-950' : 'font-bold text-slate-600'}`}>{row.title}</h3>
          <span className={`rounded-md px-2 py-0.5 text-[0.66rem] font-extrabold ${moduleTone[moduleName] || moduleTone.System}`}>{moduleName}</span>
        </div>
        <p className={`mt-1 text-sm leading-6 ${unread ? 'text-slate-700' : 'text-slate-500'}`}>{row.message}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-400">
          <time dateTime={row.createdAt}>{timeAgo(row.createdAt)}</time>
          {unread && <button type="button" onClick={() => onRead(row.id)} className="font-extrabold text-slate-500 hover:text-slate-800">Mark as read</button>}
          {row.href && (
            <a href={row.href} onClick={() => { if (unread) onRead(row.id) }} className="font-extrabold text-blue-700 hover:text-blue-900">
              Open <span aria-hidden="true">→</span>
            </a>
          )}
        </div>
      </div>
    </li>
  )
}

// One inbox for every GSO role. Items are removed automatically once the work they describe is done.
export default function NotificationInbox({ eyebrow, description }: { eyebrow: string; description: string }) {
  const [rows, setRows] = useState<ServerNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    const refresh = () => listServerNotifications()
      .then((list) => {
        if (!active) return
        setRows(list)
        setError('')
      })
      .catch(() => {
        if (active) setError('Hindi ma-load ang notifications. Subukan ulit sa ilang sandali.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    void refresh()
    const interval = window.setInterval(() => void refresh(), 30_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  const unreadCount = rows.filter((row) => !row.readAt).length
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => (filter === 'all' || !row.readAt)
      && (!query || `${row.title} ${row.message}`.toLowerCase().includes(query)))
  }, [rows, filter, search])

  function markRead(id: ServerNotification['id']) {
    const readAt = new Date().toISOString()
    setRows((current) => current.map((row) => (row.id === id ? { ...row, readAt: row.readAt || readAt } : row)))
    void markServerNotificationRead(id).catch(() => undefined)
  }

  function markAllRead() {
    const readAt = new Date().toISOString()
    setRows((current) => current.map((row) => (row.readAt ? row : { ...row, readAt })))
    void markAllServerNotificationsRead().catch(() => undefined)
  }

  const emptyTitle = search.trim() ? 'Nothing matches your search' : filter === 'unread' ? 'You are all caught up' : 'No notifications yet'
  const emptyText = search.trim()
    ? 'Try a different word, or show all notifications.'
    : filter === 'unread' ? 'New updates will appear here as soon as they happen.' : 'Updates about your work will appear here.'

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.4),transparent_30%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.18),transparent_36%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.16em] text-blue-200">{eyebrow}</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Notifications</h1>
            <p className="mt-1 text-sm font-medium text-blue-100">{description}</p>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="rounded-xl bg-[#155eef] px-4 py-2.5 text-sm font-extrabold text-white shadow-sm shadow-blue-900/15 transition hover:bg-[#0d4dcc] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
          >
            Mark all as read
          </button>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="notification-list-title">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="notification-list-title" className="text-lg font-black text-slate-900">Inbox</h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-blue-700">{rows.length}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{unreadCount} unread</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="notification-search">Search notifications</label>
            <input
              id="notification-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notifications"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-64"
            />
            <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Show notifications">
              {([
                { value: 'all', label: 'All', count: rows.length },
                { value: 'unread', label: 'Unread', count: unreadCount },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${filter === option.value ? 'bg-[#155eef] text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-blue-700'}`}
                >
                  {option.label}{option.count > 0 ? ` ${option.count}` : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-xs font-bold text-rose-700">{error}</p>}

        {loading ? (
          <div className="grid min-h-40 place-items-center text-sm font-bold text-slate-400">Loading notifications…</div>
        ) : visibleRows.length > 0 ? (
          <ul className="inventory-list-scrollbar max-h-136 divide-y divide-slate-100 overflow-y-auto">
            {visibleRows.map((row) => <NotificationRow key={row.id} row={row} onRead={markRead} />)}
          </ul>
        ) : (
          <div className="px-5 py-12 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
            </span>
            <h3 className="mt-3 text-sm font-extrabold text-slate-800">{emptyTitle}</h3>
            <p className="mt-1 text-sm text-slate-500">{emptyText}</p>
            {(filter === 'unread' || search.trim()) && (
              <button type="button" onClick={() => { setFilter('all'); setSearch('') }} className="mt-3 text-sm font-extrabold text-blue-700 hover:text-blue-900">Show all notifications</button>
            )}
          </div>
        )}
      </section>
    </>
  )
}
