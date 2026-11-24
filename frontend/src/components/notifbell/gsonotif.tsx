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

// Same module colours as the notification inbox page, so a notice looks the same everywhere.
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
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(date)
}

// The bell lists every notice. The list scrolls inside a fixed height that fits about two cards,
// so the panel stays compact and the peeking third card shows there is more below.
export default function GsoNotif({
  open,
  onOpenChange,
  notificationCenterHref = '/gso/notifications',
  notificationCenterLabel = 'Open all notifications',
}: GsoNotifProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<ServerNotification[]>([])
  const unreadCount = notifications.filter((notification) => !notification.readAt).length

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
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-300 bg-white text-slate-600 shadow-[0_2px_8px_-2px_rgba(37,99,235,0.2)] transition hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100"
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
          className="fixed left-3 right-3 top-17 z-50 rounded-2xl border border-sky-200/80 bg-white text-slate-900 shadow-[0_0_0_1px_rgba(37,99,235,0.08),0_8px_20px_-6px_rgba(37,99,235,0.22),0_24px_56px_-12px_rgba(37,99,235,0.2)] sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[min(24rem,calc(100vw-2rem))]"
        >
          <span aria-hidden="true" className="absolute -top-[7px] right-[13px] hidden h-3.5 w-3.5 rotate-45 rounded-[3px] border-l border-t border-sky-200/80 bg-white sm:block" />

          <div className="flex items-center justify-between gap-3 rounded-t-2xl border-b border-slate-100 bg-white px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-900">Notifications</h2>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[0.65rem] font-extrabold text-white">{unreadCount} new</span>
                )}
              </div>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {unreadCount > 0 ? 'You have unread updates' : 'You are all caught up'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {unreadCount > 0 && (
                <button type="button" onClick={markAllAsRead} className="rounded-lg px-2 py-1.5 text-xs font-extrabold text-blue-700 transition hover:bg-blue-50">
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

          <div className="inventory-list-scrollbar max-h-[18.5rem] overflow-y-auto overscroll-contain bg-slate-100/70 p-2.5">
            {notifications.length === 0 ? (
              <div className="px-5 py-10 text-center">
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
              <ul className="space-y-2">
                {notifications.map((notification) => {
                  const unread = !notification.readAt
                  const moduleName = notificationModuleFor(notification.type)
                  return (
                    <li
                      key={notification.id}
                      className={`rounded-xl border p-3 transition hover:-translate-y-px ${unread ? 'border-blue-300 bg-blue-50/60 shadow-[0_4px_14px_-4px_rgba(37,99,235,0.3)]' : 'border-slate-300 bg-white shadow-[0_3px_10px_-4px_rgba(15,23,42,0.2)]'}`}
                    >
                      <div className="flex gap-2.5">
                        <span aria-label={unread ? 'Unread' : 'Read'} className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-blue-600' : 'bg-slate-200'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`line-clamp-1 text-[0.8rem] leading-5 ${unread ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>{notification.title}</p>
                            <time dateTime={notification.createdAt} className="shrink-0 pt-0.5 text-[0.65rem] font-semibold text-slate-400">{timeAgo(notification.createdAt)}</time>
                          </div>
                          <p title={notification.message} className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">{notification.message}</p>
                          <div className="mt-2.5 flex items-center justify-between gap-2">
                            <span className={`rounded-md px-1.5 py-0.5 text-[0.62rem] font-extrabold ${moduleTone[moduleName] || moduleTone.System}`}>{moduleName}</span>
                            <div className="flex items-center gap-1.5">
                              {unread && (
                                <button type="button" onClick={() => markAsRead(notification.id)} className="rounded-lg px-2 py-1 text-[0.65rem] font-extrabold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
                                  Mark read
                                </button>
                              )}
                              {notification.href && (
                                <a
                                  href={notification.href}
                                  onClick={() => { if (unread) markAsRead(notification.id) }}
                                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[0.65rem] font-extrabold text-white shadow-sm transition hover:bg-blue-700"
                                >
                                  Open
                                  <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <a
            href={notificationCenterHref}
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center gap-2 rounded-b-2xl border-t border-slate-100 bg-white px-4 py-3 text-xs font-extrabold text-blue-700 transition hover:bg-blue-50"
          >
            {notificationCenterLabel}
            <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
          </a>
        </section>
      )}
    </div>
  )
}
