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

export async function listServerNotifications() {
  const result = await apiRequest<{ notifications: ServerNotification[] }>('/notifications/mine')
  return result.notifications
}

export function markServerNotificationRead(id: string | number) {
  return apiRequest<{ markedRead: true }>(`/notifications/mine/${encodeURIComponent(String(id))}/read`, { method: 'POST' })
}

export function markAllServerNotificationsRead() {
  return apiRequest<{ markedRead: true }>('/notifications/mine/read-all', { method: 'POST' })
}
