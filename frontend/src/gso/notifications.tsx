import { useEffect, useMemo, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import {
  publishGsoNotifications,
  readGsoNotifications,
  subscribeToGsoNotifications,
  type NotificationRecord,
} from './notificationStore'

type NotificationFilter = 'All' | 'Unread' | 'Archived'

function withoutPreviewNotifications(notifications: NotificationRecord[]) {
  return notifications.filter((notification) => !notification.id.startsWith('preview-'))
}

function loadNotifications() {
  const saved = readGsoNotifications() ?? []
  return withoutPreviewNotifications(saved)
}

function notificationTime(value: string) {
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return ''

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp.getTime()) / 60_000))
  if (elapsedMinutes < 1) return 'Just now'
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`

  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(timestamp)
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>(loadNotifications)
  const [filter, setFilter] = useState<NotificationFilter>('All')
  const [search, setSearch] = useState('')
  const activeNotifications = notifications.filter((notification) => !notification.archived)
  const unreadCount = activeNotifications.filter((notification) => !notification.read).length
  const archivedCount = notifications.length - activeNotifications.length

  useEffect(() => {
    return subscribeToGsoNotifications((next) => {
      setNotifications(withoutPreviewNotifications(next))
    })
  }, [])

  const visibleNotifications = useMemo(() => {
    const query = search.trim().toLowerCase()
    return notifications
      .filter((notification) => filter === 'Archived'
        ? notification.archived
        : !notification.archived && (filter === 'All' || !notification.read))
      .filter((notification) => !query || `${notification.title} ${notification.message} ${notification.module}`.toLowerCase().includes(query))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
  }, [filter, notifications, search])

  function updateReadState(id: string, read: boolean) {
    const updated = notifications.map((notification) => notification.id === id ? { ...notification, read } : notification)
    setNotifications(updated)
    publishGsoNotifications(updated)
  }

  function markAllAsRead() {
    const updated = notifications.map((notification) => notification.archived ? notification : { ...notification, read: true })
    setNotifications(updated)
    publishGsoNotifications(updated)
  }

  function setArchivedState(id: string, archived: boolean) {
    const updated = notifications.map((notification) => notification.id === id ? { ...notification, archived } : notification)
    setNotifications(updated)
    publishGsoNotifications(updated)
  }

  return (
    <GsoPageFrame activePage="Notifications" searchPlaceholder="Search notifications">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.4),transparent_30%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.18),transparent_36%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.16em] text-blue-200">GSO workspace</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Notifications</h1>
            <p className="mt-1 text-sm font-medium text-blue-100">Updates about requests, inventory, and GSO activity.</p>
          </div>
          {filter !== 'Archived' && <button
            type="button"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="rounded-xl bg-[#155eef] px-4 py-2.5 text-sm font-extrabold text-white shadow-sm shadow-blue-900/15 transition hover:bg-[#0d4dcc] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
          >
            Mark all as read
          </button>}
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="notification-list-title">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="notification-list-title" className="text-lg font-black text-slate-900">{filter === 'Archived' ? 'Archived notifications' : 'Inbox'}</h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-blue-700">{filter === 'Archived' ? archivedCount : activeNotifications.length}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{filter === 'Archived' ? `${archivedCount} archived` : `${unreadCount} unread`}</p>
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
            <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Filter notifications">
              {([
                { value: 'All', label: 'All', count: activeNotifications.length },
                { value: 'Unread', label: 'Unread', count: unreadCount },
                { value: 'Archived', label: 'Archived', count: archivedCount },
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

        {visibleNotifications.length > 0 ? (
          <div className="inventory-list-scrollbar max-h-72 divide-y divide-slate-100 overflow-y-scroll overscroll-contain">
            {visibleNotifications.map((notification) => (
              <article key={notification.id} className={`flex flex-col gap-3 px-4 py-3 transition hover:bg-blue-50/50 sm:flex-row sm:items-start sm:px-5 ${!notification.read ? 'bg-blue-50/60' : 'bg-white'}`}>
                <span aria-label={notification.read ? 'Read' : 'Unread'} className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${notification.read ? 'bg-slate-200' : 'bg-blue-600'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className={`text-sm font-extrabold ${notification.read ? 'text-slate-700' : 'text-slate-950'}`}>{notification.title}</h3>
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[0.68rem] font-extrabold text-blue-700">{notification.module}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{notification.message}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-400">
                    <time dateTime={notification.createdAt}>{notificationTime(notification.createdAt)}</time>
                    {notification.href && <a href={notification.href} onClick={() => updateReadState(notification.id, true)} className="font-extrabold text-blue-700 hover:text-blue-900">{notification.actionLabel} <span aria-hidden="true">→</span></a>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 self-start sm:ml-2">
                  <button
                    type="button"
                    onClick={() => updateReadState(notification.id, !notification.read)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-white hover:text-blue-700"
                  >
                    Mark as {notification.read ? 'unread' : 'read'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setArchivedState(notification.id, !notification.archived)}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-extrabold text-blue-700 transition hover:bg-blue-100"
                  >
                    {notification.archived ? 'Restore' : 'Archive'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <h3 className="text-sm font-extrabold text-slate-800">{filter === 'Archived' ? archivedCount === 0 ? 'No archived notifications' : 'No matching archived notifications' : activeNotifications.length === 0 ? 'No notifications yet' : 'No matching notifications'}</h3>
            <p className="mt-1 text-sm text-slate-500">{filter === 'Archived' ? archivedCount === 0 ? 'Archived notifications will stay here until you restore them.' : 'Try another search or return to the inbox.' : activeNotifications.length === 0 ? 'New GSO updates will appear here.' : 'Try a different search or show all notifications.'}</p>
            {filter !== 'All' && activeNotifications.length > 0 && visibleNotifications.length === 0 && (
              <button type="button" onClick={() => setFilter('All')} className="mt-3 text-sm font-extrabold text-blue-700 hover:text-blue-900">Show all notifications</button>
            )}
          </div>
        )}
      </section>
    </GsoPageFrame>
  )
}
