import { useEffect, useRef, useState } from 'react'
import {
  listServerNotifications,
  markAllServerNotificationsRead,
  markServerNotificationRead,
  notificationModuleFor,
  onNotificationsChanged,
  type ServerNotification,
} from '../../auth/notificationsApi'

type GsoNotifProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  notificationCenterHref?: string
  notificationCenterLabel?: string
}

function notificationDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

// The bell shows the newest unread items first; the full inbox lists everything.
export default function GsoNotif({
  open,
  onOpenChange,
  notificationCenterHref = '/gso/notifications',
  notificationCenterLabel = 'Open all notifications',
}: GsoNotifProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<ServerNotification[]>([])
  const unreadCount = notifications.filter((notification) => !notification.readAt).length
  const latestNotifications = notifications.slice(0, 6)

  useEffect(() => {
    let active = true
    const refresh = () => listServerNotifications()
      .then((rows) => {
        if (active) setNotifications(rows)
      })
      .catch(() => undefined)
    void refresh()
    const interval = window.setInterval(() => void refresh(), 30_000)
    const stopListening = onNotificationsChanged(() => void refresh())
    return () => {
      active = false
      window.clearInterval(interval)
      stopListening()
    }
  }, [])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onOpenChange(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onOpenChange])

  const markAsRead = (id: ServerNotification['id']) => {
    const readAt = new Date().toISOString()
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, readAt: item.readAt || readAt } : item)))
    void markServerNotificationRead(id).catch(() => undefined)
  }

  const markAllAsRead = () => {
    const readAt = new Date().toISOString()
    setNotifications((current) => current.map((item) => (item.readAt ? item : { ...item, readAt })))
    void markAllServerNotificationsRead().catch(() => undefined)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100"
        aria-label={unreadCount > 0 ? `View notifications, ${unreadCount} unread` : 'View notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="gso-notifications-panel"
      >
        <svg aria-hidden="true" className="h-[1.1rem] w-[1.1rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[0.55rem] font-black text-white ring-2 ring-[#f4f7fb]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          id="gso-notifications-panel"
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-900/20"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
            <div>
              <h2 className="text-sm font-black text-slate-900">Notifications</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {unreadCount > 0 ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'You are all caught up.'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button type="button" onClick={markAllAsRead} className="rounded-lg px-2 py-1.5 text-[0.65rem] font-extrabold text-blue-700 transition hover:bg-blue-50">
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close notifications"
              >
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="max-h-[65vh] overflow-y-auto">
            {latestNotifications.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                    <path d="M10 21h4" />
                  </svg>
                </span>
                <p className="mt-3 text-sm font-extrabold text-slate-700">No notifications yet</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Updates about requests, returns, and issuances will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {latestNotifications.map((notification) => {
                  const unread = !notification.readAt
                  return (
                    <li key={notification.id} className={`flex gap-3 px-4 py-3.5 ${unread ? 'bg-blue-50/50' : 'bg-white'}`}>
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-blue-600' : 'bg-slate-200'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold leading-5 text-slate-800">{notification.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600">{notification.message}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <time className="text-[0.65rem] font-semibold text-slate-400" dateTime={notification.createdAt}>{notificationDate(notification.createdAt)}</time>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.6rem] font-extrabold text-slate-500">{notificationModuleFor(notification.type)}</span>
                          </span>
                          <div className="flex items-center gap-2">
                            {unread && (
                              <button type="button" onClick={() => markAsRead(notification.id)} className="text-[0.65rem] font-extrabold text-slate-500 hover:text-slate-800">
                                Mark read
                              </button>
                            )}
                            {notification.href && (
                              <a href={notification.href} onClick={() => { if (unread) markAsRead(notification.id) }} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[0.65rem] font-extrabold text-white transition hover:bg-blue-700">
                                Open
                                <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <a href={notificationCenterHref} onClick={() => onOpenChange(false)} className="flex min-h-11 items-center justify-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs font-extrabold text-blue-700 transition hover:bg-blue-50">
            {notificationCenterLabel}
            <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
          </a>
        </section>
      )}
    </div>
  )
}
