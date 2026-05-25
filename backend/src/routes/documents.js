import { Router } from 'express'
import { query } from '../config/db.js'
import { authMiddleware, requireAdmin } from '../middleware/auth.js'
import path from 'path'
import fs from 'fs'

const router = Router()
router.use(authMiddleware)

const UPLOAD_DIR = '/home/newjoinee/HRMS/uploads'

// Ensure upload directory exists
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
} catch (_) { /* may already exist or may fail on dev machines – uploads will fail gracefully */ }

// POST /api/documents/upload
// Accepts JSON: { entityType, entityId, fileName, mimeType, data (base64) }
router.post('/upload', async (req, res) => {
  try {
    const { entityType, entityId, fileName, mimeType, data } = req.body

    if (!entityType || !entityId || !fileName || !data) {
      return res.status(400).json({ error: 'Bad request', message: 'entityType, entityId, fileName, and data (base64) are required' })
    }

    // 22MAY2026 client video: account/client documents are needed too.
    const validEntityTypes = ['employee', 'leave', 'payroll_input', 'account']
    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({ error: 'Bad request', message: `entityType must be one of: ${validEntityTypes.join(', ')}` })
    }

    // Decode base64 data
    const buffer = Buffer.from(data, 'base64')
    const fileSize = buffer.length

    // Limit file size to 25 MB
    if (fileSize > 25 * 1024 * 1024) {
      return res.status(400).json({ error: 'Bad request', message: 'File size must not exceed 25 MB' })
    }

    // Insert record first to get the UUID
    const result = await query(
      `INSERT INTO documents (entity_type, entity_id, file_name, original_name, mime_type, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, entity_type, entity_id, file_name, original_name, mime_type, file_size, uploaded_by, created_at`,
      [entityType, entityId, '', fileName, mimeType || 'application/octet-stream', fileSize, req.user.id]
    )
    const doc = result.rows[0]

    // Save file to disk using the UUID as filename, preserving extension
    const ext = path.extname(fileName) || ''
    const diskName = `${doc.id}${ext}`
    const filePath = path.join(UPLOAD_DIR, diskName)

    fs.writeFileSync(filePath, buffer)

    // Update the file_name column with the disk name
    await query('UPDATE documents SET file_name = $1 WHERE id = $2', [diskName, doc.id])

    res.status(201).json({
      id: doc.id,
      entityType: doc.entity_type,
      entityId: doc.entity_id,
      fileName: diskName,
      originalName: doc.original_name,
      mimeType: doc.mime_type,
      fileSize: doc.file_size,
      uploadedBy: doc.uploaded_by,
      createdAt: doc.created_at,
    })
  } catch (err) {
    console.error('Document upload error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 22MAY2026 video follow-up: download must be declared BEFORE
// /:entityType/:entityId because Express matches in declaration order — the
// list route was swallowing /download/<uuid> as entityType=download and
// returning [], causing the client-reported "download error".
//
// GET /api/documents/download/:id — Download a file
router.get('/download/:id', async (req, res) => {
  try {
    const { id } = req.params

    const result = await query(
      'SELECT id, file_name, original_name, mime_type FROM documents WHERE id = $1',
      [id]
    )
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Not found', message: 'Document not found' })
    }

    const doc = result.rows[0]
    const filePath = path.join(UPLOAD_DIR, doc.file_name)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Not found', message: 'File not found on disk' })
    }

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`)

    const stream = fs.createReadStream(filePath)
    stream.pipe(res)
  } catch (err) {
    console.error('Document download error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/documents/:entityType/:entityId — List documents for an entity
router.get('/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params

    const result = await query(
      `SELECT d.id, d.entity_type, d.entity_id, d.file_name, d.original_name, d.mime_type, d.file_size,
              d.uploaded_by, u.name AS uploaded_by_name, d.created_at
       FROM documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.entity_type = $1 AND d.entity_id = $2
       ORDER BY d.created_at DESC`,
      [entityType, entityId]
    )

    res.json(result.rows.map(r => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      fileName: r.file_name,
      originalName: r.original_name,
      mimeType: r.mime_type,
      fileSize: r.file_size,
      uploadedBy: r.uploaded_by,
      uploadedByName: r.uploaded_by_name || null,
      createdAt: r.created_at,
    })))
  } catch (err) {
    console.error('List documents error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/documents/:id — Delete a document (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const result = await query(
      'SELECT id, file_name FROM documents WHERE id = $1',
      [id]
    )
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Not found', message: 'Document not found' })
    }

    const doc = result.rows[0]
    const filePath = path.join(UPLOAD_DIR, doc.file_name)

    // Remove file from disk
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (fsErr) {
      console.warn('Could not delete file from disk:', fsErr.message)
    }

    // Remove DB record
    await query('DELETE FROM documents WHERE id = $1', [id])

    res.json({ ok: true, message: 'Document deleted' })
  } catch (err) {
    console.error('Document delete error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
