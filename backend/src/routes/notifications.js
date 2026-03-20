import express from 'express'
import pool from '../config/db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = express.Router()

router.use(authMiddleware)

// Get all notifications for logged-in user
router.get('/my-notifications', async (req, res) => {
  try {
    const userId = req.user.id
    const result = await pool.query(
      `SELECT id, type, title, message, data, is_read, created_at
       FROM notifications
       WHERE user_id = $1
         AND (type LIKE 'leave_%' OR type LIKE 'schedule_%')
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    )
    res.json(result.rows)
  } catch (err) {
    console.error('Failed to fetch notifications:', err)
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
})

// Get unread notifications count
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.id
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM notifications
       WHERE user_id = $1
         AND is_read = FALSE
         AND (type LIKE 'leave_%' OR type LIKE 'schedule_%')`,
      [userId]
    )
    res.json({ unreadCount: parseInt(result.rows[0].count, 10) })
  } catch (err) {
    console.error('Failed to fetch unread count:', err)
    res.status(500).json({ error: 'Failed to fetch unread count' })
  }
})

// Mark notification as read
router.put('/:notificationId/read', async (req, res) => {
  try {
    const userId = req.user.id
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.notificationId, userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' })
    }
    res.json(result.rows[0])
  } catch (err) {
    console.error('Failed to mark notification as read:', err)
    res.status(500).json({ error: 'Failed to update notification' })
  }
})

// Mark all notifications as read
router.put('/read-all', async (req, res) => {
  try {
    const userId = req.user.id
    await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, updated_at = NOW()
       WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('Failed to mark all notifications as read:', err)
    res.status(500).json({ error: 'Failed to update notifications' })
  }
})

// Delete notification
router.delete('/:notificationId', async (req, res) => {
  try {
    const userId = req.user.id
    const result = await pool.query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.notificationId, userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' })
    }
    res.json({ success: true })
  } catch (err) {
    console.error('Failed to delete notification:', err)
    res.status(500).json({ error: 'Failed to delete notification' })
  }
})

// Internal: Create notification (called from admin routes, not exposed to clients)
export async function createNotification(userId, type, title, message, data = null) {
  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, type, title, message, data ? JSON.stringify(data) : null]
    )
    return result.rows[0]
  } catch (err) {
    if (err?.code === '42703') {
      const fallback = await pool.query(
        `INSERT INTO notifications (user_id, type, title, message)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, type, title, message]
      )
      return fallback.rows[0]
    }
    console.error('Failed to create notification:', err)
    return null
  }
}

export default router
