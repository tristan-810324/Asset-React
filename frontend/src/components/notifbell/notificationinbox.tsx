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

// The requester-style timeline card: one row per notice, with its time on the right and actions in the footer.
function TimelineRow({ row, onRead }: { row: ServerNotification; onRead: (id: ServerNotification['id']) => void }) {
  const unread = !row.readAt
  return (
    <li className={`rounded-xl border p-2.5 shadow-sm transition sm:border-2 sm:p-4 ${unread ? 'border-blue-200 bg-blue-50/40' : 'border-slate-300/80 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[0.8rem] font-black text-slate-900 sm:text-sm">{row.title}</p>
        <time dateTime={row.createdAt} className="shrink-0 text-[0.6rem] font-semibold text-slate-400 sm:text-[0.62rem]">
          <span className="sm:hidden">{new Date(row.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          <span className="hidden sm:inline">{new Date(row.createdAt).toLocaleString('en-PH')}</span>
        </time>
      </div>
      <p title={row.message} className="mt-1 line-clamp-1 text-[0.7rem] leading-relaxed text-slate-600 sm:line-clamp-2 sm:text-xs">{row.message}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 sm:mt-3 sm:pt-3">
        <p className="text-[0.62rem] font-medium text-slate-400"><span className="hidden sm:inline">{notificationModuleFor(row.type)}</span>{unread && <span className="font-extrabold text-blue-700 sm:ml-2">New</span>}</p>
        {(row.href || unread) && (
          <div className="flex items-center gap-2">
            {unread && <button type="button" onClick={() => onRead(row.id)} className="rounded-lg border-2 border-slate-300 bg-white px-2.5 py-1 text-[0.6rem] font-extrabold text-slate-700 hover:bg-slate-50 sm:px-3 sm:py-1.5 sm:text-[0.65rem]">Mark as read</button>}
            {row.href && <a href={row.href} onClick={() => { if (unread) onRead(row.id) }} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-[0.6rem] font-extrabold text-white shadow-sm transition hover:bg-blue-700 sm:px-3 sm:py-1.5 sm:text-[0.65rem]">Open <span aria-hidden="true">→</span></a>}
          </div>
        )}
      </div>
    </li>
  )
}

// One inbox for every GSO role. Items are removed automatically once the work they describe is done.
// variant="timeline" is the look used on the GSO Head page; the default inbox stays as it is for GSO Staff.
export default function NotificationInbox({ eyebrow, description, variant = 'inbox' }: { eyebrow: string; description: string; variant?: 'inbox' | 'timeline' }) {
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

  if (variant === 'timeline') {
    return (
      <div className="mx-auto max-w-5xl">
        <section className="relative overflow-hidden rounded-2xl bg-[#09244a] px-4 py-5 text-white shadow-xl shadow-blue-950/15 sm:rounded-3xl sm:px-7 sm:py-7">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-300" /> {eyebrow}
              </span>
              <h1 className="mt-2 text-xl font-black tracking-tight sm:mt-3 sm:text-3xl">Notifications</h1>
              <p className="mt-2 hidden text-xs font-medium leading-relaxed text-blue-100 sm:block sm:text-sm">{description}</p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="rounded-xl bg-white px-3 py-2 text-[0.7rem] font-extrabold text-blue-900 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-blue-200 sm:px-4 sm:py-2.5 sm:text-xs"
            >
              Mark all as read
            </button>
          </div>
        </section>

        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}

        <section className="mt-4 overflow-hidden rounded-2xl border border-slate-300/80 bg-white shadow-md sm:border-2 shadow-slate-300/35 ring-1 ring-slate-900/5 sm:mt-6" aria-labelledby="notification-list-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-3 py-3 sm:px-5 sm:py-4">
            <div>
              <h2 id="notification-list-title" className="text-sm font-black text-slate-900">Activity timeline</h2>
              <p className="mt-1 text-[0.68rem] font-medium text-slate-500">{loading ? 'Loading…' : `${unreadCount} unread`}</p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <label className="sr-only" htmlFor="notification-search">Search notifications</label>
              <input
                id="notification-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search"
                className="h-8 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:h-9 sm:w-56 sm:flex-none"
              />
              <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Show notifications">
                {([
                  { value: 'all', label: `All ${rows.length}` },
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
          </div>

          <div className="px-2.5 py-2 sm:px-5">
            {loading ? (
              <div className="grid min-h-48 place-items-center text-sm font-bold text-slate-400">Loading notifications…</div>
            ) : visibleRows.length > 0 ? (
              <ol className="inventory-list-scrollbar max-h-88 space-y-1.5 overflow-y-auto px-1 py-1 sm:max-h-120 sm:space-y-2.5">
                {visibleRows.map((row) => <TimelineRow key={row.id} row={row} onRead={markRead} />)}
              </ol>
            ) : (
              <div className="grid min-h-48 place-items-center py-8 text-center">
                <div>
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-lg font-black text-blue-700">↻</span>
                  <h3 className="mt-3 text-sm font-extrabold text-slate-700">{emptyTitle}</h3>
                  <p className="mt-1 text-xs text-slate-500">{emptyText}</p>
                  {(filter === 'unread' || search.trim()) && (
                    <button type="button" onClick={() => { setFilter('all'); setSearch('') }} className="mt-3 text-xs font-extrabold text-blue-700 hover:text-blue-900">Show all</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    )
  }

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
