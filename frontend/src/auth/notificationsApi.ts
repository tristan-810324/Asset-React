import { apiRequest } from './authApi'

export type ServerNotification = {
  id: string | number
  type: string
  title: string
  message: string
  href: string
  dedupeKey: string
  createdAt: string
  readAt: string | null
  resolvedAt: string | null
}

const changedEvent = 'asset-notifications-changed'

// Lets the bell and the inbox stay in step: marking one as read refreshes the other.
export function onNotificationsChanged(listener: () => void) {
  window.addEventListener(changedEvent, listener)
  return () => window.removeEventListener(changedEvent, listener)
}

function announceChange<T>(result: T) {
  window.dispatchEvent(new Event(changedEvent))
  return result
}

// Groups the backend notification types under the names shown in the inbox.
export function notificationModuleFor(type: string) {
  if (type === 'PURCHASE_REQUISITION' || type === 'REQUEST') return 'Requests'
  if (type === 'ISSUANCE') return 'Issuance'
  if (type === 'RETURN' || type === 'OVERDUE') return 'Returns'
  if (type === 'LOW_STOCK') return 'Inventory'
  return 'System'
}

export async function listServerNotifications() {
  const result = await apiRequest<{ notifications: ServerNotification[] }>('/notifications/mine')
  return result.notifications
}

export function markServerNotificationRead(id: string | number) {
  return apiRequest<{ markedRead: true }>(`/notifications/mine/${encodeURIComponent(String(id))}/read`, { method: 'POST' }).then(announceChange)
}

export function markAllServerNotificationsRead() {
  return apiRequest<{ markedRead: true }>('/notifications/mine/read-all', { method: 'POST' }).then(announceChange)
}
