import { api } from './api'

export interface Notification {
  id: string
  type: 'schedule_assigned' | 'schedule_updated' | string
  title: string
  message: string
  data: Record<string, any> | null
  is_read: boolean
  created_at: string
}

export async function fetchMyNotifications(): Promise<Notification[]> {
  return api<Notification[]>('/api/notifications/my-notifications')
}

export async function fetchUnreadCount(): Promise<number> {
  const data = await api<{ unreadCount: number }>('/api/notifications/unread-count')
  return data.unreadCount
}

export async function markNotificationAsRead(notificationId: string): Promise<Notification> {
  return api<Notification>(`/api/notifications/${notificationId}/read`, {
    method: 'PUT',
  })
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await api('/api/notifications/read-all', {
    method: 'PUT',
  })
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await api(`/api/notifications/${notificationId}`, {
    method: 'DELETE',
  })
}
