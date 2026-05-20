import { useState, useEffect, useRef } from 'react'
import { Bell, X, Check, Rows3, Rows2, HelpCircle } from 'lucide-react'
import type { Notification } from '../lib/apiNotifications'
import {
  fetchMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from '../lib/apiNotifications'
import { useUIPrefs } from '../contexts/UIPrefsContext'
import ThemeToggle from './ThemeToggle'

export function Navbar() {
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const notificationWrapRef = useRef<HTMLDivElement | null>(null)
  const { density, toggleDensity } = useUIPrefs()

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const notifs = await fetchMyNotifications()
        const filtered = notifs.filter((n) => n.type.startsWith('leave_') || n.type.startsWith('schedule_'))
        setNotifications(filtered)
        setUnreadCount(filtered.filter((n) => !n.is_read).length)
      } catch (err) {
        console.error('Failed to fetch notifications:', err)
      }
    }

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!showNotifications) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!notificationWrapRef.current) return
      const target = event.target as Node
      if (!notificationWrapRef.current.contains(target)) {
        setShowNotifications(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowNotifications(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showNotifications])

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await markNotificationAsRead(notificationId)
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  const handleDelete = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId)
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
      const deleted = notifications.find((n) => n.id === notificationId)
      if (deleted && !deleted.is_read) {
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch (err) {
      console.error('Failed to delete notification:', err)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      setLoading(true)
      await markAllNotificationsAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (err) {
      console.error('Failed to mark all as read:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-white/80 backdrop-blur-sm border-b border-surface-200/70 px-4 sm:px-6 py-3 sticky top-0 z-30 dark:bg-surface-900/80 dark:border-surface-800">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-sm group transition-transform hover:scale-105">
          <span className="text-white text-xs font-bold tracking-tight">H</span>
        </div>
        <div className="text-sm sm:text-base font-semibold text-surface-900 dark:text-surface-50 tracking-tight font-display">HARMONY</div>
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <button
          type="button"
          onClick={toggleDensity}
          className="btn-icon text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:text-surface-900 dark:text-surface-50 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 dark:hover:text-surface-50 dark:hover:bg-surface-800"
          aria-label={density === 'comfortable' ? 'Switch to compact density' : 'Switch to comfortable density'}
          title={density === 'comfortable' ? 'Compact rows' : 'Comfortable rows'}
        >
          {density === 'comfortable' ? <Rows3 size={18} /> : <Rows2 size={18} />}
        </button>
        <button
          type="button"
          onClick={() => {
            // Trigger the global "?" handler
            const evt = new KeyboardEvent('keydown', { key: '?', bubbles: true })
            window.dispatchEvent(evt)
          }}
          className="hidden sm:inline-flex btn-icon text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:text-surface-900 dark:text-surface-50 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 dark:hover:text-surface-50 dark:hover:bg-surface-800"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <HelpCircle size={18} />
        </button>

      <div ref={notificationWrapRef} className="relative">
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative btn-icon text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:text-surface-900 dark:text-surface-50 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 dark:hover:text-surface-50 dark:hover:bg-surface-800"
          aria-label="Notifications"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full ring-2 ring-white dark:ring-surface-900 tabular-nums">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {showNotifications && (
          <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-1.5rem))] sm:w-96 bg-white dark:bg-surface-900 rounded-2xl shadow-xl border border-surface-200 dark:border-surface-700 z-50 max-h-[20rem] sm:max-h-[28rem] overflow-hidden flex flex-col dark:border-surface-800">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-800">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="badge-brand text-[10px]">{unreadCount} new</span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  disabled={loading}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <Bell size={20} />
                  </div>
                  <p className="empty-state-title">No notifications</p>
                  <p className="empty-state-description">You're all caught up.</p>
                </div>
              ) : (
                <div className="divide-y divide-surface-100 dark:divide-surface-800">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => { if (!notif.is_read) handleMarkAsRead(notif.id) }}
                      className={`px-4 py-3 hover:bg-surface-50 dark:hover:bg-surface-800 dark:bg-surface-900 dark:hover:bg-surface-800 transition-colors cursor-pointer ${
                        !notif.is_read ? 'bg-brand-50/40 dark:bg-brand-900/20' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {!notif.is_read && (
                              <span className="inline-block w-1.5 h-1.5 bg-brand-500 rounded-full shrink-0" />
                            )}
                            <h4 className="text-sm font-semibold text-surface-900 dark:text-surface-50 truncate">{notif.title}</h4>
                          </div>
                          <p className="text-xs text-surface-600 dark:text-surface-300 mt-1 leading-relaxed">{notif.message}</p>
                          <p className="text-[11px] text-surface-400 dark:text-surface-500 dark:text-surface-400 mt-1.5">{formatDate(notif.created_at)}</p>
                        </div>

                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {!notif.is_read && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMarkAsRead(notif.id) }}
                              className="p-1.5 rounded-md text-surface-400 dark:text-surface-500 hover:text-brand-600 hover:bg-brand-50 dark:hover:text-brand-300 dark:hover:bg-brand-900/40 transition-colors"
                              title="Mark as read"
                            >
                              <Check size={14} />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(notif.id) }}
                            className="p-1.5 rounded-md text-surface-400 dark:text-surface-500 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-300 dark:hover:bg-red-900/30 transition-colors"
                            title="Delete"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
