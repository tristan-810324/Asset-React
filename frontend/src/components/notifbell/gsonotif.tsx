import { useEffect, useRef } from 'react'

export type GsoNotification = {
  id: string
  title: string
  message: string
  createdAt: string
  read: boolean
}

type GsoNotifProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  notifications?: GsoNotification[]
}

export default function GsoNotif({ open, onOpenChange, notifications = [] }: GsoNotifProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const unreadCount = notifications.filter((notification) => !notification.read).length

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
          className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-900/20 sm:w-96"
        >
          <div className="flex items-start justify-between border-b border-slate-100 px-4 py-4">
            <div>
              <h2 className="text-sm font-black">Notifications</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'You are all caught up.'}
              </p>
            </div>
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

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                    <path d="M10 21h4" />
                  </svg>
                </span>
                <p className="mt-3 text-xs font-extrabold text-slate-700">No notifications yet</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Inventory, return, and request updates will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((notification) => (
                  <li key={notification.id} className="flex gap-3 px-4 py-3.5">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read ? 'bg-slate-200' : 'bg-blue-600'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold text-slate-800">{notification.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{notification.message}</p>
                      <p className="mt-1.5 text-[0.62rem] font-semibold text-slate-400">{notification.createdAt}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
