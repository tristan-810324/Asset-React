import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'

type NotificationModule = 'Requests' | 'Inventory' | 'Issuance' | 'Returns' | 'Maintenance' | 'System'
type NotificationPriority = 'Urgent' | 'Normal' | 'Low'
type NotificationStatusFilter = 'All' | 'Unread' | 'Read'
type NotificationRecord = {
  id: string
  module: NotificationModule
  title: string
  message: string
  createdAt: string
  priority: NotificationPriority
  read: boolean
  actionLabel: string
  href: string
}
type IconName = 'arrow' | 'bell' | 'box' | 'check' | 'clock' | 'close' | 'clipboard' | 'inbox' | 'search' | 'system' | 'tool' | 'return'

const modules: NotificationModule[] = ['Requests', 'Inventory', 'Issuance', 'Returns', 'Maintenance', 'System']
const storageKey = 'gso-notifications-page-preview-v1'

const iconPaths: Record<IconName, ReactNode> = {
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  box: <><path d="m12 3 8.25 4.5v9L12 21l-8.25-4.5v-9L12 3z" /><path d="m3.75 7.5 8.25 4.5 8.25-4.5M12 21v-9" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.25V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v.75M8.5 10h7M8.5 14h7M8.5 18h4" /></>,
  inbox: <><path d="M4 4h16l1 11h-5l-2 3h-4l-2-3H3L4 4Z" /><path d="M3.5 15h4.75l2 3h3.5l2-3h4.75" /></>,
  search: <><circle cx="10.75" cy="10.75" r="5.75" /><path d="m15.1 15.1 4.15 4.15" /></>,
  system: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  tool: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z" />,
  return: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 1 1 0 12h-2" /></>,
}

const moduleStyles: Record<NotificationModule, { icon: IconName; iconTone: string; badgeTone: string; barTone: string }> = {
  Requests: { icon: 'clipboard', iconTone: 'bg-violet-50 text-violet-700', badgeTone: 'bg-violet-50 text-violet-700', barTone: 'bg-violet-500' },
  Inventory: { icon: 'box', iconTone: 'bg-blue-50 text-blue-700', badgeTone: 'bg-blue-50 text-blue-700', barTone: 'bg-blue-500' },
  Issuance: { icon: 'clipboard', iconTone: 'bg-sky-50 text-sky-700', badgeTone: 'bg-sky-50 text-sky-700', barTone: 'bg-sky-500' },
  Returns: { icon: 'return', iconTone: 'bg-emerald-50 text-emerald-700', badgeTone: 'bg-emerald-50 text-emerald-700', barTone: 'bg-emerald-500' },
  Maintenance: { icon: 'tool', iconTone: 'bg-amber-50 text-amber-700', badgeTone: 'bg-amber-50 text-amber-700', barTone: 'bg-amber-500' },
  System: { icon: 'system', iconTone: 'bg-slate-100 text-slate-600', badgeTone: 'bg-slate-100 text-slate-600', barTone: 'bg-slate-400' },
}

function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {iconPaths[name]}
    </svg>
  )
}

function createPreviewNotifications(): NotificationRecord[] {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
  return [
    {
      id: 'preview-request-1', module: 'Requests', title: 'Borrowing request needs your review',
      message: 'A new request for a projector and presentation remote is waiting for approval.',
      createdAt: ago(12), priority: 'Urgent', read: false, actionLabel: 'Review request', href: '/gso/requests-borrowing',
    },
    {
      id: 'preview-inventory-1', module: 'Inventory', title: 'Inventory item added to the catalog',
      message: 'A new item record was added. Review its item name, description, quantity, and acquisition details.',
      createdAt: ago(47), priority: 'Normal', read: false, actionLabel: 'Open inventory', href: '/gso/items',
    },
    {
      id: 'preview-maintenance-1', module: 'Maintenance', title: 'Asset flagged for repair',
      message: 'An item was reported with a condition that needs maintenance follow-up.',
      createdAt: ago(155), priority: 'Urgent', read: false, actionLabel: 'View repair list', href: '/gso/to-be-repaired',
    },
    {
      id: 'preview-return-1', module: 'Returns', title: 'Item return confirmed',
      message: 'A returned item has been recorded and is ready for an inventory condition check.',
      createdAt: ago(1_380), priority: 'Normal', read: true, actionLabel: 'View returns', href: '/gso/return-items',
    },
    {
      id: 'preview-issuance-1', module: 'Issuance', title: 'Issuance acknowledgment received',
      message: 'An employee confirmed receipt of an issued asset. The activity is available in the issuance record.',
      createdAt: ago(1_620), priority: 'Low', read: true, actionLabel: 'Open issuance', href: '/gso/issuance',
    },
    {
      id: 'preview-system-1', module: 'System', title: 'Daily inventory summary is ready',
      message: 'The latest inventory overview is available in the GSO command center.',
      createdAt: ago(5_760), priority: 'Low', read: true, actionLabel: 'View overview', href: '/gso',
    },
  ]
}

function isNotificationRecord(value: unknown): value is NotificationRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<NotificationRecord>
  return typeof record.id === 'string'
    && typeof record.title === 'string'
    && typeof record.message === 'string'
    && typeof record.createdAt === 'string'
    && typeof record.read === 'boolean'
    && modules.includes(record.module as NotificationModule)
    && ['Urgent', 'Normal', 'Low'].includes(record.priority || '')
    && typeof record.actionLabel === 'string'
    && typeof record.href === 'string'
}

function loadNotifications(): NotificationRecord[] {
  const preview = createPreviewNotifications()
  if (typeof window === 'undefined') return preview
  try {
    const saved = window.localStorage.getItem(storageKey)
    if (!saved) return preview
    const parsed: unknown = JSON.parse(saved)
    return Array.isArray(parsed) && parsed.every(isNotificationRecord) ? parsed : preview
  } catch {
    return preview
  }
}

function relativeTime(value: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (elapsedMinutes < 1) return 'Just now'
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`
  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays === 1) return 'Yesterday'
  if (elapsedDays < 7) return `${elapsedDays}d ago`
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function dateGroup(value: string) {
  const target = new Date(value)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  if (targetDay === today) return 'Today'
  if (targetDay === today - 86_400_000) return 'Yesterday'
  return 'Earlier'
}

function priorityStyle(priority: NotificationPriority) {
  if (priority === 'Urgent') return 'bg-rose-50 text-rose-700 ring-rose-100'
  if (priority === 'Normal') return 'bg-blue-50 text-blue-700 ring-blue-100'
  return 'bg-slate-100 text-slate-600 ring-slate-200'
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>(loadNotifications)
  const [statusFilter, setStatusFilter] = useState<NotificationStatusFilter>('All')
  const [moduleFilter, setModuleFilter] = useState<NotificationModule | 'All modules'>('All modules')
  const [priorityFilter, setPriorityFilter] = useState<NotificationPriority | 'All priorities'>('All priorities')
  const [searchQuery, setSearchQuery] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(notifications))
    } catch {
      // Keep the page usable when browser storage is unavailable.
    }
  }, [notifications])

  const unreadCount = notifications.filter((notification) => !notification.read).length
  const todayCount = notifications.filter((notification) => dateGroup(notification.createdAt) === 'Today').length
  const moduleCounts = useMemo(() => modules.map((module) => ({
    module,
    count: notifications.filter((notification) => notification.module === module).length,
  })), [notifications])
  const maxModuleCount = Math.max(1, ...moduleCounts.map((entry) => entry.count))
  const filteredNotifications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return notifications
      .filter((notification) => {
        const matchesStatus = statusFilter === 'All'
          || (statusFilter === 'Unread' ? !notification.read : notification.read)
        const matchesModule = moduleFilter === 'All modules' || notification.module === moduleFilter
        const matchesPriority = priorityFilter === 'All priorities' || notification.priority === priorityFilter
        const matchesSearch = !query || `${notification.title} ${notification.message} ${notification.module}`.toLowerCase().includes(query)
        return matchesStatus && matchesModule && matchesPriority && matchesSearch
      })
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
  }, [moduleFilter, notifications, priorityFilter, searchQuery, statusFilter])
  const groupedNotifications = useMemo(() => {
    const groups: Record<'Today' | 'Yesterday' | 'Earlier', NotificationRecord[]> = {
      Today: [], Yesterday: [], Earlier: [],
    }
    filteredNotifications.forEach((notification) => groups[dateGroup(notification.createdAt)].push(notification))
    return (['Today', 'Yesterday', 'Earlier'] as const).filter((group) => groups[group].length > 0)
      .map((group) => ({ label: group, notifications: groups[group] }))
  }, [filteredNotifications])

  const updateReadState = (id: string, read: boolean) => {
    setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, read } : notification))
    setFeedback(read ? 'Notification marked as read.' : 'Notification marked as unread.')
  }

  const handleMarkAllRead = () => {
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })))
    setFeedback('All notifications marked as read.')
  }

  const handleDismiss = (id: string) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id))
    setFeedback('Notification dismissed from this inbox.')
  }

  const handleRestorePreview = () => {
    setNotifications(createPreviewNotifications())
    setFeedback('Preview notifications restored.')
  }

  const hasFilters = Boolean(searchQuery || moduleFilter !== 'All modules' || priorityFilter !== 'All priorities')
  const clearFilters = () => {
    setSearchQuery('')
    setModuleFilter('All modules')
    setPriorityFilter('All priorities')
  }

  return (
    <GsoPageFrame activePage="Notifications" searchPlaceholder="Search notifications">
      <section className="relative isolate overflow-hidden rounded-[28px] border border-[#183b63] bg-[#071d3b] px-5 py-6 text-white shadow-[0_24px_55px_-30px_rgba(7,29,59,0.72)] sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_20%,rgba(56,146,255,0.34),transparent_34%),radial-gradient(ellipse_at_70%_110%,rgba(34,211,238,0.16),transparent_40%)]" />
        <div aria-hidden="true" className="absolute -right-12 -top-28 h-72 w-72 rounded-full border border-white/6ight-16 sm:-top-40 sm:h-96 sm:w-96" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/15 bg-sky-300/8 px-3 py-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-sky-100">
              <Icon name="bell" className="h-3.5 w-3.5" /> GSO / Notification center
            </span>
            <h1 className="mt-4 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Notifications</h1>
            <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-blue-100/85">
              Requests, inventory changes, and follow-ups in one clear view.
            </p>
          </div>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white px-4 py-2.5 text-xs font-extrabold text-[#08244a] shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
          >
            <Icon name="check" className="h-4 w-4" /> Mark all as read
          </button>
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Notification summary">
        <SummaryCard label="Total notifications" value={notifications.length} detail="In your inbox" icon="inbox" tone="blue" />
        <SummaryCard label="Unread" value={unreadCount} detail="Needs your attention" icon="bell" tone="violet" />
        <SummaryCard label="Received today" value={todayCount} detail="Across all modules" icon="system" tone="emerald" />
      </section>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(230px,0.7fr)]">
        <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_16px_45px_-34px_rgba(15,23,42,0.42)]" aria-labelledby="notification-list-title">
          <div className="border-b border-slate-100 p-4 sm:p-5">
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="notification-list-title" className="text-base font-black tracking-tight text-slate-950">Your inbox</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.62rem] font-extrabold text-slate-500">{filteredNotifications.length} updates</span>
                </div>
                <p className="mt-1 text-xs font-medium text-slate-500">Find an update or narrow the feed by module and priority.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_auto_auto]">
                <label className="relative min-w-0">
                  <span className="sr-only">Search notifications</span>
                  <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search notifications"
                    className="h-10 w-full rounded-xl border border-slate-200/90 bg-slate-50/70 pl-10 pr-3 text-xs font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100/80"
                  />
                </label>
                <label>
                  <span className="sr-only">Filter by module</span>
                  <select
                    value={moduleFilter}
                    onChange={(event) => setModuleFilter(event.target.value as NotificationModule | 'All modules')}
                    className="h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3 text-xs font-bold text-slate-600 outline-none transition hover:border-slate-300 focus:border-blue-300 focus:ring-4 focus:ring-blue-100/80 sm:w-auto"
                  >
                    <option>All modules</option>
                    {modules.map((module) => <option key={module}>{module}</option>)}
                  </select>
                </label>
                <label>
                  <span className="sr-only">Filter by priority</span>
                  <select
                    value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value as NotificationPriority | 'All priorities')}
                    className="h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3 text-xs font-bold text-slate-600 outline-none transition hover:border-slate-300 focus:border-blue-300 focus:ring-4 focus:ring-blue-100/80 sm:w-auto"
                  >
                    <option>All priorities</option>
                    <option>Urgent</option>
                    <option>Normal</option>
                    <option>Low</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100/80 p-1" role="tablist" aria-label="Filter notification status">
                {(['All', 'Unread', 'Read'] as const).map((filter) => {
                  const count = filter === 'All'
                    ? notifications.length
                    : notifications.filter((notification) => filter === 'Unread' ? !notification.read : notification.read).length
                  const active = statusFilter === filter
                  return (
                    <button
                      key={filter}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setStatusFilter(filter)}
                      className={`rounded-lg px-3 py-2 text-[0.68rem] font-extrabold transition ${active ? 'bg-white text-slate-950 shadow-sm shadow-slate-900/10' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      {filter} <span className={active ? 'ml-1 text-blue-700' : 'ml-1 text-slate-400'}>{count}</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[0.68rem] font-semibold text-slate-400">Showing {filteredNotifications.length}</span>
                {hasFilters && (
                  <button type="button" onClick={clearFilters} className="rounded-lg px-2 py-1.5 text-[0.68rem] font-extrabold text-blue-700 transition hover:bg-blue-50 hover:text-blue-900">
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {feedback && <p role="status" className="border-b border-blue-100 bg-blue-50/70 px-4 py-2 text-[0.68rem] font-bold text-blue-800">{feedback}</p>}

          <div className="inventory-list-scrollbar max-h-144 space-y-4 overflow-auto overscroll-contain border-t border-slate-100 p-3 sm:p-4">
            {groupedNotifications.length > 0 ? groupedNotifications.map((group) => (
              <section key={group.label} aria-label={`${group.label} notifications`}>
                <div className="sticky top-0 z-10 mb-2 flex items-center gap-2 bg-white/95 py-1.5 backdrop-blur">
                  <h3 className="rounded-md bg-slate-100 px-2 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.13em] text-slate-500">{group.label}</h3>
                  <span className="h-px flex-1 bg-slate-100" />
                  <span className="rounded-full bg-slate-50 px-2 py-1 text-[0.6rem] font-bold text-slate-400">{group.notifications.length}</span>
                </div>
                <div className="space-y-2.5">
                  {group.notifications.map((notification) => {
                    const appearance = moduleStyles[notification.module]
                    return (
                      <article
                        key={notification.id}
                        className={`relative overflow-hidden rounded-2xl border p-3.5 transition duration-200 hover:-translate-y-px sm:p-4 ${notification.read ? 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/4' : 'border-blue-200/80 bg-linear-to-br from-blue-50/80 via-white to-white shadow-sm shadow-blue-950/4 hover:border-blue-300'}`}
                      >
                        {!notification.read && <span aria-hidden="true" className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-blue-500" />}
                        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-3 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ring-black/3 sm:h-11 sm:w-11 ${appearance.iconTone}`}>
                            <Icon name={appearance.icon} className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className={`text-[0.8rem] font-extrabold leading-5 ${notification.read ? 'text-slate-700' : 'text-slate-950'}`}>{notification.title}</h4>
                              <span className={`rounded-full px-2 py-0.5 text-[0.58rem] font-extrabold ring-1 ring-inset ${priorityStyle(notification.priority)}`}>{notification.priority}</span>
                              {!notification.read && <span className="inline-flex items-center gap-1 rounded-full bg-blue-100/80 px-2 py-0.5 text-[0.56rem] font-extrabold uppercase tracking-wide text-blue-700"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" />New</span>}
                            </div>
                            <p className="mt-1.5 text-xs leading-5 text-slate-600">{notification.message}</p>
                            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                              <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[0.6rem] font-extrabold ${appearance.badgeTone}`}>
                                <Icon name={appearance.icon} className="h-3 w-3" />{notification.module}
                              </span>
                              <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-semibold text-slate-400">
                                <Icon name="clock" className="h-3 w-3" />{relativeTime(notification.createdAt)}
                              </span>
                            </div>
                          </div>
                          <div className="col-span-2 flex flex-wrap items-center gap-1.5 border-t border-slate-200/70 pt-2.5 xl:col-span-1 xl:flex-col xl:items-stretch xl:justify-center xl:border-l xl:border-t-0 xl:pl-3.5 xl:pt-0">
                              <a href={notification.href} onClick={() => updateReadState(notification.id, true)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[#155eef] px-3 py-2 text-[0.65rem] font-extrabold text-white shadow-sm shadow-blue-900/15 transition hover:bg-[#0d4dcc]">
                                {notification.actionLabel}<Icon name="arrow" className="h-3 w-3" />
                              </a>
                              <button type="button" onClick={() => updateReadState(notification.id, !notification.read)} className="min-h-8 rounded-lg px-2 py-1.5 text-[0.62rem] font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
                                Mark as {notification.read ? 'unread' : 'read'}
                              </button>
                              <button type="button" onClick={() => handleDismiss(notification.id)} className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg px-2 py-1.5 text-[0.62rem] font-bold text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 xl:ml-0 xl:justify-center" aria-label={`Dismiss: ${notification.title}`}>
                                <Icon name="close" className="h-3.5 w-3.5" /> <span className="xl:hidden">Dismiss</span>
                              </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )) : (
              <div className="rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center">
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon name="inbox" className="h-4 w-4" /></span>
                <h3 className="mt-2.5 text-sm font-extrabold text-slate-800">No notifications match these filters</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Try another module or status, or restore the preview notifications.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {hasFilters && <button type="button" onClick={clearFilters} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Clear filters</button>}
                  {notifications.length === 0 && <button type="button" onClick={handleRestorePreview} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-blue-700">Restore preview</button>}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside>
          <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_16px_45px_-34px_rgba(15,23,42,0.42)] sm:p-5" aria-labelledby="module-activity-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">Sources</p>
                <h2 id="module-activity-title" className="mt-1 text-base font-black tracking-tight text-slate-950">Activity by module</h2>
                <p className="mt-1 text-xs font-medium text-slate-500">Select a source to filter the feed.</p>
              </div>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-500">{moduleFilter === 'All modules' ? 'All' : 'Filtered'}</span>
            </div>
            <div className="mt-4 space-y-1.5">
              {moduleCounts.map(({ module, count }) => {
                const appearance = moduleStyles[module]
                const selected = moduleFilter === module
                return (
                  <button
                    key={module}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setModuleFilter(selected ? 'All modules' : module)}
                    className={`group w-full rounded-xl border p-2.5 text-left transition duration-150 ${selected ? 'border-blue-200 bg-blue-50/70 shadow-sm shadow-blue-900/4' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${appearance.iconTone}`}>
                        <Icon name={appearance.icon} className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-[0.68rem] font-extrabold transition ${selected ? 'text-blue-900' : 'text-slate-600 group-hover:text-slate-900'}`}>{module}</span>
                          <span className={`grid h-6 min-w-6 place-items-center rounded-md px-1 text-[0.6rem] font-extrabold ${selected ? 'bg-white text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                        </span>
                        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100">
                          <span className={`block h-full rounded-full transition-all duration-300 ${appearance.barTone}`} style={{ width: `${Math.max(count > 0 ? 9 : 0, count / maxModuleCount * 100)}%` }} />
                        </span>
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </aside>
      </div>
    </GsoPageFrame>
  )
}

function SummaryCard({ label, value, detail, icon, tone }: { label: string; value: number; detail: string; icon: IconName; tone: 'blue' | 'violet' | 'emerald' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  }
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_32px_-27px_rgba(15,23,42,0.4)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_35px_-27px_rgba(15,23,42,0.3)] sm:p-5">
      <div className="absolute -right-6 -top-8 h-20 w-20 rounded-full bg-slate-100/70 blur-2xl transition group-hover:bg-blue-100/70" />
      <div className="relative flex items-start justify-between gap-2.5">
        <div>
          <p className="text-xs font-bold text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">{value}</p>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-xl ring-1 ring-inset ${tones[tone]}`}><Icon name={icon} className="h-[1.1rem] w-[1.1rem]" /></span>
      </div>
      <p className="relative mt-2 text-[0.68rem] font-semibold text-slate-400">{detail}</p>
    </article>
  )
}
