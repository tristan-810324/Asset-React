export type NotificationModule = 'Requests' | 'Inventory' | 'Issuance' | 'Returns' | 'Maintenance' | 'System'
export type NotificationPriority = 'Urgent' | 'Normal' | 'Low'

export type NotificationRecord = {
  id: string
  module: NotificationModule
  title: string
  message: string
  createdAt: string
  priority: NotificationPriority
  read: boolean
  archived: boolean
  actionLabel: string
  href: string
}

const storageKey = 'gso-notifications-page-preview-v1'
const updateEventName = 'gso-notifications-updated'

export const notificationModules: NotificationModule[] = ['Requests', 'Inventory', 'Issuance', 'Returns', 'Maintenance', 'System']

type StoredNotificationRecord = Omit<NotificationRecord, 'archived'> & { archived?: boolean }

function isNotificationRecord(value: unknown): value is StoredNotificationRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<NotificationRecord>
  return typeof record.id === 'string'
    && typeof record.title === 'string'
    && typeof record.message === 'string'
    && typeof record.createdAt === 'string'
    && typeof record.read === 'boolean'
    && (record.archived === undefined || typeof record.archived === 'boolean')
    && notificationModules.includes(record.module as NotificationModule)
    && ['Urgent', 'Normal', 'Low'].includes(record.priority || '')
    && typeof record.actionLabel === 'string'
    && typeof record.href === 'string'
}

export function readGsoNotifications(): NotificationRecord[] | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = window.localStorage.getItem(storageKey)
    if (!saved) return null
    const parsed: unknown = JSON.parse(saved)
    return Array.isArray(parsed) && parsed.every(isNotificationRecord)
      ? parsed.map((record) => ({ ...record, archived: record.archived === true }))
      : null
  } catch {
    return null
  }
}

export function publishGsoNotifications(notifications: NotificationRecord[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(notifications))
  } catch {
    // Keep the current page usable if local storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(updateEventName, { detail: notifications }))
}

export function addGsoNotification(
  notification: Pick<NotificationRecord, 'module' | 'title' | 'message' | 'actionLabel' | 'href'>
    & Partial<Pick<NotificationRecord, 'priority'>>,
) {
  const nextNotification: NotificationRecord = {
    ...notification,
    id: `gso-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    priority: notification.priority || 'Normal',
    read: false,
    archived: false,
  }
  const current = readGsoNotifications() || []
  publishGsoNotifications([nextNotification, ...current])
  return nextNotification
}

export function subscribeToGsoNotifications(onChange: (notifications: NotificationRecord[]) => void) {
  if (typeof window === 'undefined') return () => undefined

  const handleUpdate: EventListener = (event) => {
    if (event instanceof CustomEvent && Array.isArray(event.detail) && event.detail.every(isNotificationRecord)) {
      onChange(event.detail.map((record) => ({ ...record, archived: record.archived === true })))
      return
    }
    const saved = readGsoNotifications()
    if (saved) onChange(saved)
  }

  window.addEventListener(updateEventName, handleUpdate)
  window.addEventListener('storage', handleUpdate)
  return () => {
    window.removeEventListener(updateEventName, handleUpdate)
    window.removeEventListener('storage', handleUpdate)
  }
}
